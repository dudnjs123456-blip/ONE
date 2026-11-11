'use client';

import { useEffect, useRef, useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import { applyReply, ask, bondOf, giftFlower, greeting, type ChatLine } from '@/game/city/npcChat';
import { FLOWER_GIFTS, ITEMS } from '@/game/data/items';
import { EMOTION_FACE, TALK_NPCS, type NpcEmotion, type PlayerMood } from '@/game/data/npcs';
import { BODY_TYPES } from '@/game/render/looks';
import { PLAYER_PORTRAITS } from '@/game/data/portraits';

/** 한 글자씩 찍히는 속도 (ms) */
const TYPE_MS = 28;

interface Shown {
  who: 'npc' | 'me';
  text: string;
}

/**
 * 대화형 NPC 창 (게임 대사창 방식): 아래 대사창에 지금 말하는 사람의 이름표와 대사가 한 줄씩 찍히고,
 * 오른쪽 아래에는 내 캐릭터 상반신이 서 있다. 대답은 서버(/api/npc-chat)의 AI 가 만들고,
 * 호감도·기억·선물은 게임에 반영된다.
 */
export default function NpcChatPanel({ world, npcId, onClose }: { world: CityWorld; npcId: string; onClose: () => void }) {
  const npc = TALK_NPCS[npcId];
  const body = world.profile.body ?? '';
  const myName = BODY_TYPES.find((b) => b.id === body)?.label ?? '나';
  const portraits = PLAYER_PORTRAITS[body];

  const [lines, setLines] = useState<ChatLine[]>(() => [{ role: 'assistant', content: greeting(world, npcId) }]);
  const [shown, setShown] = useState<Shown>(() => ({ who: 'npc', text: lines[0].content }));
  const [typed, setTyped] = useState(0);
  const [emotion, setEmotion] = useState<NpcEmotion>('평온');
  const [mood, setMood] = useState<PlayerMood>('기본');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [affinity, setAffinity] = useState(() => bondOf(world, npcId).affinity);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const portrait = portraits ? (portraits[mood] ?? portraits['기본']) : null;
  const typing = typed < shown.text.length;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 대사가 바뀌면 처음부터 한 글자씩 찍는다
  useEffect(() => {
    setTyped(0);
    const id = window.setInterval(() => {
      setTyped((n) => {
        if (n >= shown.text.length) {
          window.clearInterval(id);
          return n;
        }
        return n + 1;
      });
    }, TYPE_MS);
    return () => window.clearInterval(id);
  }, [shown]);

  useEffect(() => {
    if (showLog) logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [showLog, lines]);

  const skip = () => setTyped(shown.text.length);

  const send = async (said: string) => {
    const msg = said.trim().slice(0, 200);
    if (!msg || busy) return;
    setText('');
    setNote(null);
    const next: ChatLine[] = [...lines, { role: 'user', content: msg }];
    setLines(next);
    setShown({ who: 'me', text: msg });
    setBusy(true);
    const r = await ask(world, npcId, next);
    const n = applyReply(world, npcId, r);
    setLines((l) => [...l, { role: 'assistant', content: r.reply }]);
    setShown({ who: 'npc', text: r.reply });
    setEmotion(r.emotion);
    setMood(r.playerMood ?? '기본');
    setOffline(!!r.offline);
    setAffinity(bondOf(world, npcId).affinity);
    if (n) {
      setNote(n);
      world.say(n, 4);
    }
    setBusy(false);
    inputRef.current?.focus();
  };

  const npcFace = busy ? '🤔' : emotion === '평온' ? npc.face : EMOTION_FACE[emotion];
  const meTalking = shown.who === 'me';

  return (
    // 입력하는 글자가 게임 조작(이동·점프·단축키)으로 새지 않게 여기서 막는다
    <div
      className="absolute inset-x-0 bottom-0 flex justify-center px-3 pb-3 sm:px-6 sm:pb-5"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <style>{'@keyframes portrait-in{from{opacity:.5;transform:translateY(10px)}to{opacity:1;transform:none}}@keyframes dots{0%,80%,100%{opacity:.2}40%{opacity:1}}'}</style>
      <div className="relative w-full max-w-3xl">
        {/* 내 캐릭터 상반신: 대사창 오른쪽 위에 걸쳐 선다. 상대가 말할 땐 살짝 어둡게 */}
        {portrait && (
          <div
            className="pointer-events-none absolute bottom-[calc(100%-1.5rem)] right-2 aspect-[4/5] w-[38vw] max-w-[300px] overflow-hidden sm:right-6"
            style={{ maskImage: 'linear-gradient(to bottom, black 78%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, black 78%, transparent)' }}
          >
            <img
              key={portrait + mood}
              src={portrait}
              alt=""
              draggable={false}
              className="absolute left-0 top-0 w-full select-none drop-shadow-[0_6px_18px_rgba(0,0,0,0.5)] transition-[filter] duration-300"
              style={{ animation: 'portrait-in 0.3s ease-out', filter: meTalking ? 'none' : 'brightness(0.72) saturate(0.85)' }}
            />
          </div>
        )}

        {/* 대화 기록 (지나간 대사 다시 보기) */}
        {showLog && (
          <div ref={logRef} className="absolute bottom-full left-0 mb-2 max-h-[45vh] w-full space-y-1.5 overflow-y-auto rounded-xl border border-white/15 bg-zinc-950/95 p-3 text-sm text-white shadow-2xl">
            {lines.map((l, i) => (
              <div key={i}>
                <span className={`mr-2 font-bold ${l.role === 'user' ? 'text-sky-300' : 'text-amber-200'}`}>{l.role === 'user' ? myName : npc.callName}</span>
                <span className="text-white/85">{l.content}</span>
              </div>
            ))}
          </div>
        )}

        {/* 선물 받음 등 알림 */}
        {note && !showLog && (
          <div className="absolute bottom-full left-0 mb-2 rounded-lg bg-black/70 px-3 py-1.5 text-xs text-amber-200">{note}</div>
        )}

        <div className="relative z-10 rounded-2xl border border-amber-100/25 bg-zinc-950/90 text-white shadow-2xl backdrop-blur">
          {/* 지금 말하는 사람 이름표: 상대는 왼쪽, 나는 오른쪽 */}
          <div
            className={`absolute -top-4 flex items-center gap-1.5 rounded-lg border px-3 py-1 text-sm font-bold shadow-lg ${
              meTalking ? 'right-4 border-sky-300/50 bg-sky-900 text-sky-100' : 'left-4 border-amber-200/50 bg-amber-900 text-amber-100'
            }`}
          >
            {!meTalking && <span className="text-lg leading-none">{npcFace}</span>}
            {meTalking ? myName : npc.title}
            {!meTalking && <span className="ml-1 text-xs font-normal text-pink-200" title="호감도">♥ {affinity}</span>}
          </div>

          {/* 대사: 한 글자씩 찍히고, 누르면 바로 끝까지 */}
          <div onClick={skip} className={`min-h-[5rem] cursor-pointer px-5 pb-2 pt-6 text-base leading-relaxed sm:text-lg ${meTalking ? 'pr-5 text-sky-50 sm:pr-8' : ''}`}>
            {shown.text.slice(0, typed)}
            {typing && <span className="ml-0.5 animate-pulse">▍</span>}
            {!typing && busy && (
              <div className="mt-1 text-sm text-white/50">
                {npc.callName}
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{ animation: `dots 1.2s ${i * 0.2}s infinite` }}>
                    .
                  </span>
                ))}
              </div>
            )}
            {!typing && !busy && <span className="ml-1 inline-block animate-bounce text-xs text-amber-200/70">▼</span>}
          </div>

          {/* 내 차례: 추천 대사 · 꽃 선물 · 직접 입력 */}
          <div className="flex flex-wrap gap-1.5 px-4 pb-2">
            {Object.keys(FLOWER_GIFTS)
              .filter((id) => (world.profile.inventory[id] ?? 0) > 0)
              .map((id) => (
                <button
                  key={id}
                  disabled={busy}
                  onClick={() => {
                    const why = giftFlower(world, npcId, id);
                    if (why) {
                      setNote(why);
                      return;
                    }
                    setAffinity(bondOf(world, npcId).affinity);
                    void send(`(${ITEMS[id].name}을 건넨다) ${npc.flowerLine}`).then(() =>
                      setNote(`${ITEMS[id].icon} ${ITEMS[id].name}을(를) 드렸다 · 호감도 +${FLOWER_GIFTS[id]}`),
                    );
                  }}
                  className="rounded-full border border-pink-300/50 bg-pink-500/15 px-2.5 py-1 text-xs text-pink-100 hover:bg-pink-500/30 disabled:opacity-40"
                >
                  {ITEMS[id].icon} {ITEMS[id].name} 선물 ({world.profile.inventory[id]})
                </button>
              ))}
            {npc.suggestions.map((s) => (
              <button key={s} disabled={busy} onClick={() => send(s)} className="rounded-full border border-white/15 px-2.5 py-1 text-xs hover:bg-white/10 disabled:opacity-40">
                {s}
              </button>
            ))}
            {offline && <span className="self-center text-[11px] text-amber-300/80">오프라인 대사</span>}
          </div>
          <form
            className="flex gap-2 border-t border-white/10 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              // 대사가 아직 찍히는 중에 빈 칸으로 Enter → 끝까지 넘기기
              if (!text.trim()) {
                skip();
                return;
              }
              void send(text);
            }}
          >
            <input
              ref={inputRef}
              value={text}
              maxLength={200}
              onChange={(e) => setText(e.target.value)}
              placeholder={busy ? `${npc.callName}의 대답을 기다리는 중…` : `${npc.callName}에게 할 말 (Enter 보내기)`}
              className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm outline-none placeholder:text-white/40 focus:bg-white/15"
            />
            <button disabled={busy || !text.trim()} className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-black hover:bg-amber-300 disabled:opacity-40">
              말하기
            </button>
            <button type="button" title="대화 기록" onClick={() => setShowLog((v) => !v)} className={`rounded-lg px-2.5 text-sm hover:bg-white/20 ${showLog ? 'bg-white/25' : 'bg-white/10'}`}>
              📜
            </button>
            <button type="button" title="닫기 (Esc)" onClick={onClose} className="rounded-lg bg-white/10 px-2.5 text-sm hover:bg-white/20">
              ✕
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
