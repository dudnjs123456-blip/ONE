'use client';

import { useEffect, useRef, useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import { CHAT_MAX, type ChatLine } from '@/game/city/chat';

/** 오래된 말은 이만큼 지나면 흐려진다 (입력창을 열면 다시 다 보인다) */
const FADE_MS = 30_000;

/**
 * 동네 채팅창: "/" 키나 💬 버튼으로 입력, Enter 로 보내기, Esc 로 닫기.
 * 같은 마을에 접속한 사람에게 전달되고 말한 사람 머리 위에 말풍선이 뜬다.
 */
export default function ChatBox({ world, touch = false }: { world: CityWorld; touch?: boolean }) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const seen = useRef(-1);

  // 채팅 기록은 0.2초마다 확인 (바뀌었을 때만 다시 그린다)
  useEffect(() => {
    const id = window.setInterval(() => {
      if (world.chatVersion !== seen.current) {
        seen.current = world.chatVersion;
        setLines(world.chatLog.slice(-12));
      }
      setNow(Date.now());
    }, 200);
    return () => window.clearInterval(id);
  }, [world]);

  // "/" 로 입력창 열기 (다른 글자 입력 중이면 무시)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.code === 'Slash' && !e.repeat) {
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

  const shown = open ? lines : lines.slice(touch ? -3 : -6).filter((l) => now - l.at < FADE_MS);
  const online = world.remotes.size + 1;

  return (
    <div className={`absolute z-20 text-xs text-white ${touch ? 'right-4 top-48 w-64' : 'bottom-40 left-4 w-80'}`}>
      {shown.length > 0 && (
        <div className={`mb-1 space-y-0.5 rounded-lg px-2 py-1.5 ${open ? 'max-h-52 overflow-y-auto bg-black/65' : 'bg-black/45'}`}>
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
            placeholder={`동네 사람들에게 (${online}명 접속)`}
            className="min-w-0 flex-1 rounded border border-white/25 bg-black/70 px-2 py-1.5 outline-none focus:border-amber-300"
          />
          <button className="rounded bg-amber-500 px-2.5 font-bold text-black">보내기</button>
        </form>
      ) : (
        <button onClick={() => setOpen(true)} className="rounded-full bg-black/50 px-3 py-1 text-white/80 hover:bg-black/70">
          💬 채팅{!touch && ' ( / )'} · {online}명
        </button>
      )}
      {err && <div className="mt-1 text-amber-300">{err}</div>}
    </div>
  );
}
