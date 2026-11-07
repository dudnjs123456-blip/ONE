'use client';

import { useEffect, useRef, useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import { CHAT_MAX, EMOTES, type ChatLine } from '@/game/city/chat';

/** 오래된 말은 이만큼 지나면 흐려진다 (입력창을 열면 다시 다 보인다) */
const FADE_MS = 30_000;

/**
 * 동네 채팅창: Enter(또는 "/")·💬 버튼으로 열고, Enter 로 보내기 (빈 칸이면 닫기), Esc 로 닫기.
 * 같은 마을에 접속한 사람에게 전달되고 말한 사람 머리 위에 말풍선이 뜬다.
 */
export default function ChatBox({ world, touch = false }: { world: CityWorld; touch?: boolean }) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  /** 감정 표현 고르기 줄 */
  const [emotes, setEmotes] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const seen = useRef(-1);

  // 채팅 기록은 0.2초마다 확인 (바뀌었을 때만 다시 그린다)
  useEffect(() => {
    const id = window.setInterval(() => {
      if (world.chatVersion !== seen.current) {
        seen.current = world.chatVersion;
        setLines(world.chatLog.slice(-20));
      }
      setNow(Date.now());
    }, 200);
    return () => window.clearInterval(id);
  }, [world]);

  // Enter 나 "/" 로 입력창 열기 (다른 글자 입력 중이면 무시)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if ((e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Slash') && !e.repeat) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = () => {
    // 빈 칸에서 Enter = 그냥 닫기 (게임으로 돌아가기)
    if (!text.trim()) {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    const why = world.postChat(text);
    if (why) {
      setErr(why);
      window.setTimeout(() => setErr(null), 2000);
      return;
    }
    setText('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const shown = open ? lines : lines.slice(touch ? -4 : -8).filter((l) => now - l.at < FADE_MS);
  const online = world.remotes.size + 1;

  return (
    <div className={`absolute z-20 text-white ${touch ? 'right-4 top-48 w-72 text-xs' : 'bottom-40 left-4 w-[28rem] text-sm'}`}>
      {shown.length > 0 && (
        <div className={`mb-1.5 space-y-1 rounded-xl border border-white/10 px-3 py-2 backdrop-blur-sm ${open ? 'max-h-72 overflow-y-auto bg-black/70' : 'bg-black/45'}`}>
          {shown.map((l, i) => (
            <div key={`${l.at}-${i}`} className="break-words leading-snug" style={{ opacity: open ? 1 : Math.max(0.35, 1 - (now - l.at) / FADE_MS) }}>
              <span className={`font-bold ${l.me ? 'text-amber-300' : 'text-sky-300'}`}>{l.name}</span>
              <span className="text-white/90">: {l.text}</span>
            </div>
          ))}
        </div>
      )}
      {open ? (
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            ref={inputRef}
            value={text}
            maxLength={CHAT_MAX}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setOpen(false);
                inputRef.current?.blur();
              }
            }}
            onBlur={() => !text && setOpen(false)}
            placeholder={`동네 사람들에게 · ${online}명 접속 (Enter 보내기 · Esc 닫기)`}
            className="min-w-0 flex-1 rounded-lg border border-white/25 bg-black/75 px-3 py-2 outline-none placeholder:text-white/40 focus:border-amber-300"
          />
          <button className="rounded-lg bg-amber-500 px-3 font-bold text-black hover:bg-amber-400">보내기</button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setOpen(true)} className="rounded-full bg-black/50 px-3 py-1 text-white/80 hover:bg-black/70">
            💬 채팅{!touch && ' (Enter)'} · {online}명
          </button>
          <button
            onClick={() => setEmotes((v) => !v)}
            title="감정 표현 (머리 위에 떠올라요)"
            className={`rounded-full px-2.5 py-1 hover:bg-black/70 ${emotes ? 'bg-amber-500/80 text-black' : 'bg-black/50'}`}
          >
            😊
          </button>
          {emotes && (
            <div className="flex gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5">
              {EMOTES.map((e) => (
                <button key={e} onClick={() => world.postEmote(e)} className="rounded-full px-1 text-lg leading-7 transition hover:scale-125 active:scale-95">
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {err && <div className="mt-1 text-amber-300">{err}</div>}
    </div>
  );
}
