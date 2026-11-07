'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { VoiceLink, VoiceSnapshot } from '@/game/net/voice';

const EMPTY: VoiceSnapshot = {
  online: false,
  micOn: false,
  micBusy: false,
  micError: null,
  meSpeaking: false,
  near: [],
  contacts: [],
  call: { phase: 'idle' },
  notice: null,
};

function useVoice(voice: VoiceLink | null): VoiceSnapshot {
  return useSyncExternalStore(
    (fn) => (voice ? voice.subscribe(fn) : () => undefined),
    () => (voice ? voice.snapshot() : EMPTY),
    () => EMPTY,
  );
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * 음성 대화 화면: 마이크 켜기/끄기(V) · 근처에서 말하는 사람 · 📱 전화(걸기·받기·끊기).
 * PC 는 오른쪽 아래, 폰·태블릿은 왼쪽 가운데에 둥근 버튼으로.
 */
export default function VoicePanel({ voice, touch }: { voice: VoiceLink | null; touch: boolean }) {
  const v = useVoice(voice);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const call = v.call;

  // 통화 시간 표시용 시계
  useEffect(() => {
    if (call.phase === 'idle') return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [call.phase]);

  // 전화가 오면 휴대폰 화면을 띄운다
  useEffect(() => {
    if (call.phase === 'incoming') setPhoneOpen(true);
  }, [call.phase]);

  if (!voice) return null;

  const btn = 'pointer-events-auto flex items-center justify-center rounded-full border shadow-lg backdrop-blur-sm transition active:scale-95';
  const size = touch ? 'h-12 w-12 text-xl' : 'h-11 w-11 text-lg';
  const speakingNear = v.near.filter((n) => n.speaking);

  return (
    <div
      className={`pointer-events-none absolute z-30 flex select-none gap-2 text-white ${
        touch ? 'left-3 top-1/2 -translate-y-1/2 flex-col items-start' : 'bottom-24 right-4 flex-col items-end'
      }`}
    >
      {/* 근처에서 말하는 사람 · 통화 중 표시 */}
      {(speakingNear.length > 0 || call.phase === 'connected') && (
        <div className="space-y-1 rounded-xl border border-white/10 bg-black/55 px-3 py-2 text-xs backdrop-blur-sm">
          {call.phase === 'connected' && (
            <div className="font-bold text-emerald-300">
              📞 {call.name} · {mmss(now - call.since)}
            </div>
          )}
          {speakingNear.map((n) => (
            <div key={n.id} className="text-sky-200">
              🔊 {n.name}
            </div>
          ))}
        </div>
      )}

      {v.notice && <div className="max-w-[16rem] rounded-lg bg-black/70 px-3 py-1.5 text-xs text-amber-200">{v.notice}</div>}
      {v.micError && <div className="max-w-[16rem] rounded-lg bg-red-950/80 px-3 py-1.5 text-xs text-red-200">{v.micError}</div>}

      <div className={`flex gap-2 ${touch ? 'flex-col' : ''}`}>
        <button
          type="button"
          onClick={() => void voice.toggleMic()}
          title={touch ? undefined : `음성 대화 ${v.micOn ? '끄기' : '켜기'} (V)`}
          aria-label={`마이크 ${v.micOn ? '끄기' : '켜기'}`}
          className={`${btn} ${size} ${
            v.micOn
              ? `border-emerald-300/70 bg-emerald-600/70 ${v.meSpeaking ? 'ring-4 ring-emerald-300/50' : ''}`
              : 'border-white/25 bg-black/55'
          }`}
        >
          {v.micBusy ? '…' : v.micOn ? '🎙️' : '🔇'}
          {!touch && <span className="ml-0.5 text-[10px] font-bold text-white/70">V</span>}
        </button>
        <button
          type="button"
          onClick={() => setPhoneOpen((o) => !o)}
          aria-label="휴대폰"
          className={`${btn} ${size} ${
            call.phase === 'incoming' ? 'animate-bounce border-emerald-300/80 bg-emerald-600/80' : call.phase !== 'idle' ? 'border-emerald-300/70 bg-emerald-700/60' : 'border-white/25 bg-black/55'
          }`}
        >
          📱
        </button>
      </div>

      {phoneOpen && (
        <Phone
          v={v}
          now={now}
          touch={touch}
          onClose={() => setPhoneOpen(false)}
          onCall={(id) => voice.placeCall(id)}
          onAccept={() => voice.acceptCall()}
          onEnd={() => voice.endCall()}
          onMic={() => void voice.toggleMic()}
          onMute={(id) => voice.toggleMute(id)}
        />
      )}
    </div>
  );
}

function Phone({
  v,
  now,
  touch,
  onClose,
  onCall,
  onAccept,
  onEnd,
  onMic,
  onMute,
}: {
  v: VoiceSnapshot;
  now: number;
  touch: boolean;
  onClose: () => void;
  onCall: (id: string) => void;
  onAccept: () => void;
  onEnd: () => void;
  onMic: () => void;
  onMute: (id: string) => void;
}) {
  const call = v.call;
  return (
    <div
      className={`pointer-events-auto w-64 overflow-hidden rounded-[1.6rem] border-4 border-zinc-700 bg-zinc-950/95 shadow-2xl ${
        touch ? 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2' : 'absolute bottom-0 right-16'
      }`}
    >
      <div className="flex items-center justify-between bg-zinc-900 px-4 py-2 text-xs text-white/70">
        <span>📱 휴대폰</span>
        <button type="button" onClick={onClose} className="rounded px-1.5 text-base leading-none text-white/60 hover:text-white" aria-label="휴대폰 닫기">
          ×
        </button>
      </div>

      {call.phase === 'idle' ? (
        <div className="p-3">
          <div className="mb-2 text-xs font-bold text-white/60">접속한 이웃에게 전화 걸기</div>
          {!v.online && <div className="py-6 text-center text-xs text-white/50">연결 중…</div>}
          {v.online && v.contacts.length === 0 && <div className="py-6 text-center text-xs text-white/50">지금 접속한 이웃이 없어요</div>}
          <ul className="max-h-60 space-y-1 overflow-y-auto">
            {v.contacts.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                <span className="truncate">{c.name}</span>
                <button
                  type="button"
                  disabled={c.busy}
                  onClick={() => onCall(c.id)}
                  className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold disabled:bg-zinc-700 disabled:text-white/40"
                >
                  {c.busy ? '통화 중' : '📞 전화'}
                </button>
              </li>
            ))}
          </ul>
          {v.near.length > 0 && (
            <>
              <div className="mb-1 mt-3 text-xs font-bold text-white/60">근처 음성 (눌러서 음소거)</div>
              <ul className="space-y-1">
                {v.near.map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => onMute(n.id)} className="flex w-full items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-xs">
                      <span className="truncate">
                        {n.speaking ? '🔊' : n.connected ? '🔈' : '⏳'} {n.name}
                      </span>
                      <span className={n.muted ? 'text-red-300' : 'text-white/40'}>{n.muted ? '음소거됨' : '듣는 중'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-white/40">
            V 키(또는 🎙️)로 마이크를 켜면 가까운 이웃과 음성으로 대화해요. 스피커로 들으면 소리가 울릴 수 있어 이어폰을 권해요.
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 text-3xl">👤</div>
          <div className="text-lg font-bold">{call.name}</div>
          <div className="text-sm text-white/60">
            {call.phase === 'outgoing' && '전화 거는 중…'}
            {call.phase === 'incoming' && '전화가 왔어요'}
            {call.phase === 'connected' && `통화 중 ${Math.floor(Math.max(0, now - call.since) / 60000)}:${String(Math.floor(Math.max(0, now - call.since) / 1000) % 60).padStart(2, '0')}`}
          </div>
          {call.phase === 'connected' && (
            <button
              type="button"
              onClick={onMic}
              className={`rounded-full px-4 py-1.5 text-xs font-bold ${v.micOn ? 'bg-white/15' : 'bg-red-700/80'}`}
            >
              {v.micOn ? '🎙️ 내 마이크 켜짐 (V)' : '🔇 내 마이크 꺼짐 (V)'}
            </button>
          )}
          <div className="mt-2 flex gap-6">
            {call.phase === 'incoming' && (
              <button type="button" onClick={onAccept} className="h-14 w-14 rounded-full bg-emerald-600 text-2xl shadow-lg" aria-label="전화 받기">
                📞
              </button>
            )}
            <button type="button" onClick={onEnd} className="h-14 w-14 rounded-full bg-red-600 text-2xl shadow-lg" aria-label={call.phase === 'incoming' ? '거절' : '끊기'}>
              ☎️
            </button>
          </div>
          {v.notice && <div className="text-xs text-amber-200">{v.notice}</div>}
        </div>
      )}
    </div>
  );
}
