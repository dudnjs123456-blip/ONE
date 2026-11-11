import { audioBus } from './sfx';
import type { SeatPose } from '../city/themePark';

/**
 * 놀이기구 소리 (음원 없이 합성): 바람 소리 · 레일 굉음 · 체인 리프트 딸깍 · 정상의 심장 소리 · 사람들 비명.
 * 탈 때만 켜지고, 내리면 서서히 꺼진다.
 */
export class RideAudio {
  private wind: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private rumble: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private clickAt = 0;
  private beatAt = 0;
  private screamed = false;
  private lastPhase = '';
  private lastTag = '';
  private prevSpeed = 0;

  private ensure() {
    const bus = audioBus();
    if (!bus) return null;
    const { ctx, out, noise } = bus;
    if (!this.wind) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 600;
      filter.Q.value = 0.6;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(out);
      src.start();
      this.wind = { src, gain, filter };
    }
    if (!this.rumble) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.playbackRate.value = 0.5;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 140;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(lp).connect(gain).connect(out);
      src.start();
      this.rumble = { src, gain };
    }
    return bus;
  }

  /** 매 프레임: 탄 놀이기구(kind)와 좌석 상태. 안 타고 있으면 pose = null */
  update(kind: string | null, pose: SeatPose | null, nowSec: number) {
    if (!pose || !kind) {
      this.fadeOut();
      this.screamed = false;
      this.lastPhase = '';
      return;
    }
    const bus = this.ensure();
    if (!bus) return;
    const { ctx } = bus;
    const v = pose.speed;
    const t = ctx.currentTime;
    // 바람: 속도² 에 비례, 빠를수록 높은 소리
    const w = Math.min(1, (v / 26) ** 2);
    this.wind!.gain.gain.setTargetAtTime(w, t, 0.08);
    this.wind!.filter.frequency.setTargetAtTime(380 + v * 45, t, 0.1);
    // 레일 굉음: 롤러코스터만 (터널 안은 울려서 더 크게)
    const rr = kind === 'coaster' ? Math.min(0.8, (v / 28) * 0.55 * (pose.tunnel ? 1.8 : 1)) : kind === 'drop' && pose.phase === 'brake' ? 0.7 : 0;
    this.rumble!.gain.gain.setTargetAtTime(rr, t, 0.06);
    // 체인 리프트: 올라가는 동안 딸깍딸깍 (0.5m 마다)
    if (kind === 'coaster' && pose.tag === 'lift' && v > 0.3 && nowSec >= this.clickAt) {
      this.click(0.35);
      this.clickAt = nowSec + 0.5 / Math.max(0.5, v);
    }
    // 정상에서 멈추거나 자이로드롭 꼭대기에서 기다리는 동안: 쿵… 쿵… 심장 소리
    const waiting = (kind === 'coaster' && pose.tag === 'hold') || (kind === 'drop' && pose.phase === 'top');
    if (waiting && nowSec >= this.beatAt) {
      this.thump(0.9);
      window.setTimeout(() => this.thump(0.6), 230);
      this.beatAt = nowSec + 0.75;
    }
    // 브레이크 / 정상 브레이크가 잡힐 때 칙—
    if ((pose.tag === 'brake' || pose.tag === 'trim') && this.lastTag !== pose.tag && v > 6) this.hiss(0.6);
    if (kind === 'drop' && pose.phase === 'brake' && this.lastPhase !== 'brake') this.hiss(0.9);
    // 비명: 롤러코스터 첫 낙하 · 자이로드롭 낙하 · 바이킹 꼭대기에서 떨어질 때
    const falling = (kind === 'coaster' && v > 14 && this.prevSpeed <= 14) || (kind === 'drop' && pose.phase === 'fall' && this.lastPhase !== 'fall');
    if (falling && !this.screamed) {
      this.scream();
      this.screamed = true;
    }
    if (kind === 'viking' && v > 9 && this.prevSpeed <= 9 && Math.random() < 0.35) this.scream(0.4);
    this.lastPhase = pose.phase ?? '';
    this.lastTag = pose.tag ?? '';
    this.prevSpeed = v;
  }

  private fadeOut() {
    // 아직 소리를 만든 적이 없으면 오디오를 건드리지 않는다 (매 프레임 오디오 장치를 깨우지 않게)
    if (!this.wind && !this.rumble) return;
    const bus = audioBus();
    if (!bus) return;
    const t = bus.ctx.currentTime;
    this.wind?.gain.gain.setTargetAtTime(0, t, 0.3);
    this.rumble?.gain.gain.setTargetAtTime(0, t, 0.3);
  }

  private click(vol: number) {
    const bus = audioBus();
    if (!bus) return;
    const { ctx, out, noise } = bus;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 2400;
    hp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(hp).connect(g).connect(out);
    src.start(t, Math.random() * 0.5, 0.06);
  }

  private thump(vol: number) {
    const bus = audioBus();
    if (!bus) return;
    const { ctx, out } = bus;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.25);
  }

  private hiss(vol: number) {
    const bus = audioBus();
    if (!bus) return;
    const { ctx, out, noise } = bus;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 3000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * 0.5, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    src.connect(f).connect(g).connect(out);
    src.start(t, 0, 1.2);
  }

  /** 여러 사람이 동시에 지르는 비명 ("꺄아아—"): 톱니파 + 모음 필터, 음이 떨리며 내려간다 */
  private scream(vol = 0.55) {
    const bus = audioBus();
    if (!bus) return;
    const { ctx, out } = bus;
    const t = ctx.currentTime;
    const mix = ctx.createGain();
    mix.gain.setValueAtTime(0.0001, t);
    mix.gain.exponentialRampToValueAtTime(vol * 0.22, t + 0.12);
    mix.gain.setValueAtTime(vol * 0.22, t + 1.4);
    mix.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    // '아' 모음 (포먼트 두 개)
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 900;
    f1.Q.value = 4;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 1500;
    f2.Q.value = 5;
    const vox = ctx.createGain();
    vox.connect(f1).connect(mix);
    vox.connect(f2).connect(mix);
    mix.connect(out);
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const base = 560 + Math.random() * 380;
      o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * 1.15, t + 0.25);
      o.frequency.linearRampToValueAtTime(base * 0.8, t + 2.5);
      const vib = ctx.createOscillator();
      vib.frequency.value = 6 + Math.random() * 3;
      const vg = ctx.createGain();
      vg.gain.value = base * 0.03;
      vib.connect(vg).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.25;
      o.connect(g).connect(vox);
      o.start(t + i * 0.07);
      vib.start(t);
      o.stop(t + 2.7);
      vib.stop(t + 2.7);
    }
  }

  dispose() {
    this.wind?.src.stop();
    this.rumble?.src.stop();
    this.wind = null;
    this.rumble = null;
  }
}
