'use client';

import { useEffect, useRef, useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import { applyReply, ask, bondOf, greeting, type ChatLine } from '@/game/city/npcChat';
import { EMOTION_FACE, TALK_NPCS, type NpcEmotion } from '@/game/data/npcs';

/**
 * 대화형 NPC 창: 자유롭게 입력하거나 추천 질문을 눌러 이야기한다.
 * 대답은 서버(/api/npc-chat)의 AI 가 만들고, 호감도·기억·선물은 게임에 반영된다.
 */
export default function NpcChatPanel({ world, npcId, onClose }: { world: CityWorld; npcId: string; onClose: () => void }) {
  const npc = TALK_NPCS[npcId];
  const [lines, setLines] = useState<ChatLine[]>(() => [{ role: 'assistant', content: greeting(world, npcId) }]);
  const [emotion, setEmotion] = useState<NpcEmotion>('평온');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [affinity, setAffinity] = useState(() => bondOf(world, npcId).affinity);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [lines, busy]);

  const send = async (said: string) => {
    const msg = said.trim().slice(0, 200);
    if (!msg || busy) return;
    setText('');
    // 첫 인사(assistant)는 게임이 띄운 것 — 서버가 user 로 시작하게 앞에서 잘라 낸다
    const next: ChatLine[] = [...lines, { role: 'user', content: msg }];
    setLines(next);
    setBusy(true);
    const r = await ask(world, npcId, next);
    const n = applyReply(world, npcId, r);
    setLines((l) => [...l, { role: 'assistant', content: r.reply }]);
    setEmotion(r.emotion);
    setOffline(!!r.offline);
    setAffinity(bondOf(world, npcId).affinity);
    if (n) {
      setNote(n);
      world.say(n, 4);
    }
    setBusy(false);
    inputRef.current?.focus();
  };

  return (
    // 입력하는 글자가 게임 조작(이동·점프·단축키)으로 새지 않게 여기서 막는다
    <div
      className="absolute inset-x-0 bottom-0 flex justify-center p-4"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="flex max-h-[70vh] w-full max-w-2xl flex-col rounded-2xl border border-emerald-200/30 bg-zinc-900/95 text-white shadow-2xl backdrop-blur">
        <div className="flex items-center gap-3 border-b border-white/10 p-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-200/10 text-3xl">{busy ? '🤔' : EMOTION_FACE[emotion]}</div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-emerald-200">{npc.title}</div>
            <div className="text-xs text-white/60">
              호감도 {affinity}/100{offline && <span className="ml-2 text-amber-300">· 오프라인 대사 (API 키 없음)</span>}
            </div>
          </div>
          <button onClick={onClose} className="rounded bg-white/10 px-3 py-1 text-xs hover:bg-white/20">
            Esc 닫기
          </button>
        </div>

        <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
          {lines.map((l, i) => (
            <div key={i} className={l.role === 'user' ? 'text-right' : ''}>
              <span className={`inline-block max-w-[85%] rounded-xl px-3 py-2 ${l.role === 'user' ? 'bg-sky-600/60' : 'bg-white/10'}`}>{l.content}</span>
            </div>
          ))}
          {busy && <div className="text-xs text-white/50">박 반장이 생각 중…</div>}
          {note && <div className="text-center text-xs text-amber-200">{note}</div>}
        </div>

        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {npc.suggestions.map((s) => (
            <button key={s} disabled={busy} onClick={() => send(s)} className="rounded-full border border-white/15 px-2.5 py-1 text-xs hover:bg-white/10 disabled:opacity-40">
              {s}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2 border-t border-white/10 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <input
            ref={inputRef}
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            placeholder="박 반장에게 하고 싶은 말 (Enter 보내기)"
            className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm outline-none placeholder:text-white/40 focus:bg-white/15"
          />
          <button disabled={busy || !text.trim()} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-black hover:bg-emerald-400 disabled:opacity-40">
            보내기
          </button>
        </form>
      </div>
    </div>
  );
}
