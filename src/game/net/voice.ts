import type { RealtimeChannel } from '@supabase/supabase-js';
import type { CityWorld } from '../city/cityWorld';
import type { Account } from './auth';
import { getSupabase } from './supabase';

/**
 * 음성 대화 (WebRTC). 소리는 서버를 거치지 않고 사람끼리 직접 주고받는다.
 * 연결 상대를 찾고 연결 정보(offer·answer·ICE)를 주고받는 일만 Supabase Realtime 채널 'voice:main' 으로 한다.
 *
 * - 근거리 음성: 같은 곳(roomKey)에서 가까운 사람(최대 6명)과 자동 연결. 거리에 따라 크게·작게, 좌우 방향도 들린다.
 *   둘 중 한 명이라도 마이크를 켜 둬야 연결한다 (둘 다 꺼져 있으면 연결할 이유가 없다).
 * - 전화: 접속한 사람에게 걸고, 받으면 거리·장소와 상관없이 끊을 때까지 계속 연결된다.
 *
 * 한계: 중계(TURN) 서버 없이 STUN 만 쓴다. 회사·학교 망이나 일부 휴대폰 데이터망끼리는 연결이 안 될 수 있다.
 */

/** 이 거리(m) 안이면 연결, 아래 거리를 넘으면 끊는다 (경계에서 붙었다 끊겼다 하지 않게) */
const NEAR_M = 14;
const FAR_M = 20;
/** 소리가 다 들리는 거리 / 안 들리게 되는 거리 */
const FULL_M = 2;
const SILENT_M = 16;
/** 동시에 연결하는 가까운 사람 수 */
const MAX_NEAR = 6;
/** 전화가 울리는 시간 */
const RING_MS = 30000;
const TICK_MS = 250;
/** 말하는 중으로 보는 소리 크기 (0~1) */
const SPEAK_LEVEL = 0.035;

const ICE: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

interface VoiceMeta {
  name: string;
  mic: boolean;
  /** 통화 중인 상대 id (통화 중이 아니면 null) */
  call: string | null;
}

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  sender: RTCRtpSender | null;
  audio: HTMLAudioElement | null;
  source: MediaStreamAudioSourceNode | null;
  analyser: AnalyserNode | null;
  gain: GainNode | null;
  pan: StereoPannerNode | null;
  pendingIce: RTCIceCandidateInit[];
  level: number;
}

type Sig =
  | { kind: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; ice: RTCIceCandidateInit }
  | { kind: 'bye' };

type CallMsg = { kind: 'ring' | 'accept' | 'decline' | 'busy' | 'hangup' | 'cancel'; cid: string; name: string };

export type CallState =
  | { phase: 'idle' }
  | { phase: 'outgoing'; with: string; name: string; cid: string; since: number }
  | { phase: 'incoming'; with: string; name: string; cid: string; since: number }
  | { phase: 'connected'; with: string; name: string; cid: string; since: number };

export interface VoiceContact {
  id: string;
  name: string;
  /** 다른 사람과 통화 중 */
  busy: boolean;
}

export interface VoiceNear {
  id: string;
  name: string;
  speaking: boolean;
  muted: boolean;
  /** 실제로 소리가 연결됐는지 */
  connected: boolean;
}

export interface VoiceSnapshot {
  online: boolean;
  micOn: boolean;
  micBusy: boolean;
  micError: string | null;
  meSpeaking: boolean;
  near: VoiceNear[];
  contacts: VoiceContact[];
  call: CallState;
  /** 잠깐 보여 줄 안내 (예: 상대가 받지 않았어요) */
  notice: string | null;
}

export class VoiceLink {
  private ch: RealtimeChannel | null = null;
  private online = false;
  private metas = new Map<string, VoiceMeta>();
  private peers = new Map<string, Peer>();
  private muted = new Set<string>();
  private ctx: AudioContext | null = null;
  private mic: MediaStream | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micOn = false;
  private micBusy = false;
  private micError: string | null = null;
  private meLevel = 0;
  private call: CallState = { phase: 'idle' };
  private notice: { text: string; until: number } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ring: { osc: OscillatorNode; gain: GainNode; stop: () => void } | null = null;
  private listeners = new Set<() => void>();
  private snap: VoiceSnapshot | null = null;
  private lastTracked = '';

  constructor(
    private world: CityWorld,
    private acc: Account,
  ) {}

  private get me() {
    return this.acc.userId;
  }

  start() {
    const sb = getSupabase();
    if (!sb || typeof RTCPeerConnection === 'undefined') return;
    const ch = sb.channel('voice:main', { config: { presence: { key: this.me }, broadcast: { self: false } } });
    this.ch = ch;
    ch.on('presence', { event: 'sync' }, () => this.onPresence())
      .on('broadcast', { event: 'sig' }, ({ payload }) => {
        const m = payload as { from: string; to: string; s: Sig };
        if (m && m.to === this.me && typeof m.from === 'string' && m.s) void this.onSignal(m.from, m.s);
      })
      .on('broadcast', { event: 'call' }, ({ payload }) => {
        const m = payload as { from: string; to: string; c: CallMsg };
        if (m && m.to === this.me && typeof m.from === 'string' && m.c) this.onCall(m.from, m.c);
      })
      .subscribe((st) => {
        if (st === 'SUBSCRIBED') {
          this.online = true;
          this.track();
        } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') this.online = false;
        this.emit();
      });
    // 브라우저는 사용자가 한 번 누르거나 키를 쳐야 소리를 낼 수 있다
    window.addEventListener('pointerdown', this.unlock);
    window.addEventListener('keydown', this.unlock);
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    window.removeEventListener('pointerdown', this.unlock);
    window.removeEventListener('keydown', this.unlock);
    if (this.call.phase !== 'idle') this.sendCall(this.call.with, this.call.phase === 'connected' ? 'hangup' : this.call.phase === 'incoming' ? 'decline' : 'cancel', this.call.cid);
    this.stopRing();
    for (const id of [...this.peers.keys()]) this.closePeer(id, false);
    this.stopMic();
    const ch = this.ch;
    this.ch = null;
    if (ch) {
      void ch.untrack();
      void getSupabase()?.removeChannel(ch);
    }
    void this.ctx?.close();
    this.ctx = null;
    this.online = false;
  }

  // ───────────────────────── 화면에서 부르는 것 ─────────────────────────

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  snapshot(): VoiceSnapshot {
    if (!this.snap) this.snap = this.buildSnapshot();
    return this.snap;
  }

  /** V 키 · 마이크 버튼 */
  async toggleMic() {
    if (this.micOn) {
      this.stopMic();
      this.micOn = false;
      this.track();
      this.emit();
      return;
    }
    await this.startMic();
  }

  toggleMute(id: string) {
    if (this.muted.has(id)) this.muted.delete(id);
    else this.muted.add(id);
    this.emit();
  }

  placeCall(to: string) {
    if (this.call.phase !== 'idle' || to === this.me) return;
    const meta = this.metas.get(to);
    if (!meta) return;
    const cid = `${this.me}-${Date.now()}`;
    this.call = { phase: 'outgoing', with: to, name: meta.name, cid, since: Date.now() };
    this.sendCall(to, 'ring', cid);
    this.startRing('back');
    this.track();
    this.emit();
    // 통화하려면 마이크가 필요하니 미리 켠다 (권한 창이 먼저 뜬다)
    if (!this.micOn) void this.startMic();
  }

  acceptCall() {
    const c = this.call;
    if (c.phase !== 'incoming') return;
    this.sendCall(c.with, 'accept', c.cid);
    this.call = { phase: 'connected', with: c.with, name: c.name, cid: c.cid, since: Date.now() };
    this.stopRing();
    this.unlock();
    if (!this.micOn) void this.startMic();
    this.track();
    this.emit();
  }

  /** 거절 · 취소 · 끊기 */
  endCall() {
    const c = this.call;
    if (c.phase === 'idle') return;
    this.sendCall(c.with, c.phase === 'incoming' ? 'decline' : c.phase === 'outgoing' ? 'cancel' : 'hangup', c.cid);
    this.finishCall(c.phase === 'connected' ? '통화를 끊었어요' : null);
  }

  // ───────────────────────── 내부: 상태 알리기 ─────────────────────────

  private emit() {
    this.snap = null;
    for (const fn of this.listeners) fn();
  }

  private buildSnapshot(): VoiceSnapshot {
    const near: VoiceNear[] = [];
    for (const p of this.peers.values()) {
      if (this.call.phase === 'connected' && this.call.with === p.id) continue;
      near.push({
        id: p.id,
        name: this.metas.get(p.id)?.name ?? '이웃',
        speaking: p.level > SPEAK_LEVEL && !this.muted.has(p.id),
        muted: this.muted.has(p.id),
        connected: p.pc.connectionState === 'connected',
      });
    }
    const contacts = [...this.metas.entries()]
      .filter(([id]) => id !== this.me)
      .map(([id, m]) => ({ id, name: m.name, busy: !!m.call && m.call !== this.me }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const notice = this.notice && this.notice.until > Date.now() ? this.notice.text : null;
    return {
      online: this.online,
      micOn: this.micOn,
      micBusy: this.micBusy,
      micError: this.micError,
      meSpeaking: this.micOn && this.meLevel > SPEAK_LEVEL,
      near,
      contacts,
      call: this.call,
      notice,
    };
  }

  private say(text: string) {
    this.notice = { text, until: Date.now() + 4000 };
  }

  // ───────────────────────── 내부: 마이크 ─────────────────────────

  private unlock = () => {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  };

  private async startMic() {
    if (this.micBusy) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.micError = '이 브라우저에서는 마이크를 쓸 수 없어요';
      this.emit();
      return;
    }
    this.micBusy = true;
    this.micError = null;
    this.emit();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.mic = stream;
      this.micOn = true;
      this.unlock();
      if (this.ctx) {
        const src = this.ctx.createMediaStreamSource(stream);
        this.micAnalyser = this.ctx.createAnalyser();
        this.micAnalyser.fftSize = 512;
        src.connect(this.micAnalyser);
      }
      const track = stream.getAudioTracks()[0] ?? null;
      for (const p of this.peers.values()) void p.sender?.replaceTrack(track);
    } catch (e) {
      const name = (e as { name?: string })?.name;
      this.micError = name === 'NotAllowedError' ? '마이크 권한이 막혀 있어요 (주소창 왼쪽 자물쇠에서 허용)' : '마이크를 찾지 못했어요';
    } finally {
      this.micBusy = false;
      this.track();
      this.emit();
    }
  }

  /** 마이크를 끄면 장치도 놓아준다 (브라우저의 녹음 표시가 꺼진다) */
  private stopMic() {
    for (const p of this.peers.values()) void p.sender?.replaceTrack(null);
    for (const t of this.mic?.getTracks() ?? []) t.stop();
    this.mic = null;
    this.micAnalyser?.disconnect();
    this.micAnalyser = null;
    this.meLevel = 0;
  }

  // ───────────────────────── 내부: 접속 정보 ─────────────────────────

  private track() {
    const ch = this.ch;
    if (!ch || !this.online) return;
    const meta: VoiceMeta = {
      name: this.acc.username,
      mic: this.micOn,
      call: this.call.phase === 'idle' ? null : this.call.with,
    };
    const key = JSON.stringify(meta);
    if (key === this.lastTracked) return;
    this.lastTracked = key;
    void ch.track(meta);
  }

  private onPresence() {
    const ch = this.ch;
    if (!ch) return;
    const state = ch.presenceState<VoiceMeta>();
    this.metas.clear();
    for (const [id, metas] of Object.entries(state)) {
      const m = metas[metas.length - 1];
      if (!m || typeof m.name !== 'string') continue;
      this.metas.set(id, { name: m.name, mic: !!m.mic, call: typeof m.call === 'string' ? m.call : null });
    }
    // 통화 상대가 나가면 통화 끝
    if (this.call.phase !== 'idle' && !this.metas.has(this.call.with)) this.finishCall('상대가 접속을 끊었어요');
    this.emit();
  }

  // ───────────────────────── 내부: 전화 ─────────────────────────

  private sendCall(to: string, kind: CallMsg['kind'], cid: string) {
    void this.ch?.send({ type: 'broadcast', event: 'call', payload: { from: this.me, to, c: { kind, cid, name: this.acc.username } } });
  }

  private onCall(from: string, c: CallMsg) {
    const cur = this.call;
    if (c.kind === 'ring') {
      if (cur.phase !== 'idle') {
        this.sendCall(from, 'busy', c.cid);
        return;
      }
      const name = typeof c.name === 'string' ? c.name.slice(0, 20) : '이웃';
      this.call = { phase: 'incoming', with: from, name, cid: c.cid, since: Date.now() };
      this.startRing('ring');
      this.track();
      this.emit();
      return;
    }
    if (cur.phase === 'idle' || cur.with !== from || cur.cid !== c.cid) return;
    if (c.kind === 'accept' && cur.phase === 'outgoing') {
      this.call = { ...cur, phase: 'connected', since: Date.now() };
      this.stopRing();
      this.track();
      this.emit();
    } else if (c.kind === 'decline') this.finishCall(`${cur.name}님이 전화를 받지 않았어요`);
    else if (c.kind === 'busy') this.finishCall(`${cur.name}님은 통화 중이에요`);
    else if (c.kind === 'cancel') this.finishCall(`${cur.name}님의 전화를 놓쳤어요`);
    else if (c.kind === 'hangup') this.finishCall(`${cur.name}님이 전화를 끊었어요`);
  }

  private finishCall(text: string | null) {
    this.call = { phase: 'idle' };
    this.stopRing();
    if (text) this.say(text);
    this.track();
    this.emit();
  }

  /** ring: 걸려 온 전화 벨소리 · back: 거는 중 신호음 */
  private startRing(kind: 'ring' | 'back') {
    this.stopRing();
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = kind === 'ring' ? 880 : 440;
    gain.gain.value = 0;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    const vol = kind === 'ring' ? 0.08 : 0.05;
    // 울림 1초 · 쉼 2초 (벨은 0.4초씩 두 번)
    const beat = () => {
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      if (kind === 'ring') {
        gain.gain.setValueAtTime(vol, t);
        gain.gain.setValueAtTime(0, t + 0.4);
        gain.gain.setValueAtTime(vol, t + 0.6);
        gain.gain.setValueAtTime(0, t + 1.0);
      } else {
        gain.gain.setValueAtTime(vol, t);
        gain.gain.setValueAtTime(0, t + 1.0);
      }
    };
    beat();
    const iv = setInterval(beat, 3000);
    this.ring = {
      osc,
      gain,
      stop: () => {
        clearInterval(iv);
        try {
          osc.stop();
        } catch {
          // 이미 멈춤
        }
        osc.disconnect();
        gain.disconnect();
      },
    };
  }

  private stopRing() {
    this.ring?.stop();
    this.ring = null;
  }

  // ───────────────────────── 내부: 연결 관리 ─────────────────────────

  private tick() {
    const c = this.call;
    // 30초 동안 안 받으면 끊는다
    if ((c.phase === 'outgoing' || c.phase === 'incoming') && Date.now() - c.since > RING_MS) {
      if (c.phase === 'outgoing') {
        this.sendCall(c.with, 'cancel', c.cid);
        this.finishCall(`${c.name}님이 전화를 받지 않았어요`);
      } else this.finishCall(`${c.name}님의 전화를 놓쳤어요`);
    }

    const wanted = this.wantedPeers();
    for (const id of [...this.peers.keys()]) if (!wanted.has(id)) this.closePeer(id, true);
    // 연결은 id 가 작은 쪽이 먼저 건다 (양쪽이 동시에 걸어 엉키지 않게)
    for (const id of wanted) if (!this.peers.has(id) && this.me < id) void this.openPeer(id);

    this.updateAudio();
    // 말하는 표시가 바뀌었을 수 있으니 화면에 알린다
    this.emit();
  }

  /** 지금 연결해 둘 사람: 통화 상대 + 같은 곳에서 가까운 사람(마이크 켠 쪽이 있을 때) */
  private wantedPeers(): Set<string> {
    const out = new Set<string>();
    const c = this.call;
    if (c.phase === 'connected') out.add(c.with);
    const w = this.world;
    const p = w.player;
    const room = w.roomKey;
    const cands: { id: string; d: number }[] = [];
    for (const r of w.remotes.values()) {
      if (!r.target || r.room !== room) continue;
      const meta = this.metas.get(r.id);
      if (!meta || (!meta.mic && !this.micOn)) continue;
      const d = Math.hypot(r.target.x - p.x, r.target.z - p.z);
      if (d < (this.peers.has(r.id) ? FAR_M : NEAR_M)) cands.push({ id: r.id, d });
    }
    cands.sort((a, b) => a.d - b.d);
    for (const k of cands.slice(0, MAX_NEAR)) out.add(k.id);
    return out;
  }

  private newPeer(id: string): Peer {
    const pc = new RTCPeerConnection(ICE);
    const peer: Peer = { id, pc, sender: null, audio: null, source: null, analyser: null, gain: null, pan: null, pendingIce: [], level: 0 };
    pc.onicecandidate = (e) => {
      if (e.candidate) this.sendSig(id, { kind: 'ice', ice: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => this.attachAudio(peer, e.streams[0] ?? new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        this.closePeer(id, false);
        if (this.call.phase === 'connected' && this.call.with === id) this.say('음성 연결이 안 돼요 (네트워크가 막혀 있을 수 있어요)');
      }
      this.emit();
    };
    this.peers.set(id, peer);
    return peer;
  }

  private async openPeer(id: string) {
    const peer = this.newPeer(id);
    const tr = peer.pc.addTransceiver('audio', { direction: 'sendrecv' });
    peer.sender = tr.sender;
    const track = this.mic?.getAudioTracks()[0] ?? null;
    if (track) await tr.sender.replaceTrack(track);
    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.sendSig(id, { kind: 'offer', sdp: peer.pc.localDescription!.toJSON() });
    } catch {
      this.closePeer(id, false);
    }
  }

  private async onSignal(from: string, s: Sig) {
    try {
      if (s.kind === 'bye') {
        this.closePeer(from, false);
        return;
      }
      if (s.kind === 'offer') {
        // 다시 걸어 온 연결이면 예전 것을 버리고 새로 받는다
        if (this.peers.has(from)) this.closePeer(from, false);
        const peer = this.newPeer(from);
        await peer.pc.setRemoteDescription(s.sdp);
        const tr = peer.pc.getTransceivers()[0];
        if (tr) {
          tr.direction = 'sendrecv';
          peer.sender = tr.sender;
          const track = this.mic?.getAudioTracks()[0] ?? null;
          if (track) await tr.sender.replaceTrack(track);
        }
        await this.flushIce(peer);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.sendSig(from, { kind: 'answer', sdp: peer.pc.localDescription!.toJSON() });
        return;
      }
      const peer = this.peers.get(from);
      if (!peer) return;
      if (s.kind === 'answer') {
        if (peer.pc.signalingState !== 'have-local-offer') return;
        await peer.pc.setRemoteDescription(s.sdp);
        await this.flushIce(peer);
      } else if (s.kind === 'ice') {
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(s.ice);
        else peer.pendingIce.push(s.ice);
      }
    } catch {
      // 연결 정보가 꼬이면 이 연결만 버린다 (다음 틱에 다시 연결한다)
      this.closePeer(from, false);
    }
  }

  private async flushIce(peer: Peer) {
    for (const ice of peer.pendingIce.splice(0)) {
      try {
        await peer.pc.addIceCandidate(ice);
      } catch {
        // 무시
      }
    }
  }

  private sendSig(to: string, s: Sig) {
    void this.ch?.send({ type: 'broadcast', event: 'sig', payload: { from: this.me, to, s } });
  }

  private closePeer(id: string, tell: boolean) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    if (tell) this.sendSig(id, { kind: 'bye' });
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    peer.source?.disconnect();
    peer.analyser?.disconnect();
    peer.gain?.disconnect();
    peer.pan?.disconnect();
    if (peer.audio) {
      peer.audio.srcObject = null;
      peer.audio = null;
    }
  }

  /** 받은 소리: 크기(거리)와 좌우(방향)를 조절해서 스피커로 */
  private attachAudio(peer: Peer, stream: MediaStream) {
    if (peer.source) return;
    // 크롬은 원격 소리를 audio 요소에 붙여 둬야 Web Audio 로 흘러 들어온다 (요소 자체는 소리를 내지 않게 음소거)
    const el = new Audio();
    el.srcObject = stream;
    el.muted = true;
    void el.play().catch(() => undefined);
    peer.audio = el;
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return;
    peer.source = ctx.createMediaStreamSource(stream);
    peer.analyser = ctx.createAnalyser();
    peer.analyser.fftSize = 512;
    peer.gain = ctx.createGain();
    peer.gain.gain.value = 0;
    peer.pan = ctx.createStereoPanner();
    peer.source.connect(peer.analyser);
    peer.analyser.connect(peer.gain).connect(peer.pan).connect(ctx.destination);
  }

  private updateAudio() {
    const w = this.world;
    const p = w.player;
    const ctx = this.ctx;
    const buf = new Uint8Array(512);
    const levelOf = (a: AnalyserNode | null) => {
      if (!a) return 0;
      a.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < a.fftSize; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / a.fftSize);
    };
    this.meLevel = this.micOn ? levelOf(this.micAnalyser) : 0;
    for (const peer of this.peers.values()) {
      peer.level = levelOf(peer.analyser);
      if (!peer.gain || !peer.pan || !ctx) continue;
      let vol = 0;
      let pan = 0;
      const c = this.call;
      if (c.phase === 'connected' && c.with === peer.id) {
        vol = 1; // 전화: 거리와 상관없이 또렷하게
      } else {
        const r = w.remotes.get(peer.id);
        if (r?.target && r.room === w.roomKey) {
          const dx = r.target.x - p.x;
          const d = Math.hypot(dx, r.target.z - p.z);
          const t = Math.max(0, Math.min(1, (d - FULL_M) / (SILENT_M - FULL_M)));
          vol = Math.pow(1 - t, 1.6);
          // 카메라가 북쪽을 보므로 화면 오른쪽 = +x
          pan = Math.max(-0.8, Math.min(0.8, dx / 8));
        }
      }
      if (this.muted.has(peer.id)) vol = 0;
      peer.gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.1);
      peer.pan.pan.setTargetAtTime(pan, ctx.currentTime, 0.1);
    }
  }
}
