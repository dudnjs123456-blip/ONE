'use client';

import { useEffect, useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import { MAX_PETS, PET_BY_ID, PET_GOODS, PET_SHOP_NAME, PET_SPECIES, coatOf, petMood, type OwnedPet } from '@/game/data/pets';

type Tab = 'adopt' | 'goods' | 'mine';

/**
 * 펫샵(가게 앞에서 E) · 내 펫 돌보기(K).
 *  - 분양: 오늘 들어온 아이들(가게 놀이터에 있는 아이)만. 안 들어온 종은 품절
 *  - 용품: 사료 · 간식 · 장난감 · 샴푸 (인벤토리에 쌓인다)
 *  - 내 아이들: 밥 · 간식 · 놀아주기 · 목욕 · 쓰다듬기 · 산책 친구 고르기 · 이름 바꾸기
 */
export default function PetPanel({ world, mode, pick, onClose }: { world: CityWorld; mode: 'shop' | 'care'; /** 놀이터에서 고른 아이 (입고 id) */ pick?: string | null; onClose: () => void }) {
  const care = world.pets;
  const pr = world.profile;
  const [tab, setTab] = useState<Tab>(mode === 'shop' ? (pick || !care.list.length ? 'adopt' : 'goods') : 'mine');
  const [msg, setMsg] = useState(mode === 'shop' ? '어서 오세요~ 멍냥 펫샵이에요! 🐾' : care.list.length ? '오늘은 뭘 해줄까?' : '아직 키우는 아이가 없어요. 행복빌라 옆 펫샵에 가 보세요');
  const [picking, setPicking] = useState<string | null>(pick ?? null);
  const stock = world.pen?.animals.map((a) => a.stock) ?? [];
  const soldOut = PET_SPECIES.filter((sp) => !stock.some((s) => s.species === sp.id));
  const [name, setName] = useState('');
  const [, redraw] = useState(0);
  // 수치가 실시간으로 바뀌니 1초마다 다시 그린다
  useEffect(() => {
    const t = setInterval(() => redraw((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const run = (r: { message: string }) => {
    setMsg(r.message);
    redraw((n) => n + 1);
  };

  const tabs: [Tab, string][] = mode === 'shop' ? [['adopt', `🐶 오늘 들어온 아이들 (${stock.length})`], ['goods', '🥣 용품'], ['mine', `🏠 내 아이들 (${care.list.length})`]] : [['mine', `🏠 내 아이들 (${care.list.length})`]];

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl border border-emerald-300/30 bg-zinc-900/95 text-white shadow-2xl backdrop-blur">
        <div className="flex items-center gap-3 border-b border-white/10 p-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-300/15 text-3xl">{mode === 'shop' ? '👩‍⚕️' : '🐾'}</div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-emerald-200/80">{mode === 'shop' ? `${PET_SHOP_NAME} · 사장님 하늘` : '내 펫 돌보기'}</div>
            <div className="mt-0.5 truncate text-base">“{msg}”</div>
          </div>
          <div className="shrink-0 text-right text-sm text-amber-300">{pr.gold.toLocaleString()} G</div>
          <button onClick={onClose} className="rounded px-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label="닫기">
            ✕ <span className="text-[10px]">(Esc)</span>
          </button>
        </div>
        {tabs.length > 1 && (
          <div className="flex gap-1 border-b border-white/10 px-4 pt-3">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`rounded-t-lg px-4 py-2 text-sm font-bold ${tab === id ? 'bg-emerald-400/20 text-emerald-200' : 'text-white/60 hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'adopt' && (
            <>
              <div className="mb-3 text-xs text-white/55">
                원룸이라 {MAX_PETS}마리까지 키울 수 있어요 · 지금 {care.list.length}마리
              </div>
              {stock.length === 0 && (
                <div className="mb-3 rounded-lg bg-white/5 py-6 text-center text-sm text-white/60">
                  오늘 들어온 아이들은 모두 새 가족을 찾아갔어요 🐾
                  <br />
                  내일 새 아이들이 들어와요
                </div>
              )}
              <ul className="grid gap-2 sm:grid-cols-2">
                {stock.map((st) => {
                  const sp = PET_BY_ID[st.species];
                  if (!sp) return null;
                  const coat = coatOf(sp, st.coat).name;
                  const afford = pr.gold >= sp.price;
                  const open = picking === st.id;
                  return (
                    <li key={st.id} className={`rounded-lg border px-3 py-2 ${open ? 'border-emerald-300 bg-emerald-400/10' : 'border-white/10 bg-white/5'}`}>
                      <button
                        onClick={() => {
                          setPicking(open ? null : st.id);
                          setName('');
                        }}
                        className="flex w-full items-center gap-3 text-left"
                      >
                        <span className="text-3xl">{sp.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex justify-between font-bold">
                            <span>
                              {sp.name}
                              {coat && <span className="ml-1 text-xs font-normal text-white/60">({coat})</span>}
                            </span>
                            <span className={afford ? 'text-amber-300' : 'text-red-300/80'}>{sp.price.toLocaleString()}G</span>
                          </span>
                          <span className="block text-xs text-white/55">{sp.desc}</span>
                          <span className="mt-0.5 block text-[11px] text-emerald-200/70">{sp.walks ? '🚶 산책 친구 가능' : '🏠 집에서만 지내요'}</span>
                        </span>
                      </button>
                      {open && (
                        <form
                          className="mt-2 flex gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const r = world.adoptStock(st.id, name);
                            run(r);
                            if (r.ok) {
                              setPicking(null);
                              setTab('mine');
                            }
                          }}
                        >
                          <input
                            autoFocus
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={10}
                            placeholder={`이름 (예: ${sp.body === 'cat' ? '나비' : sp.body === 'dog' ? '초코' : '콩이'})`}
                            className="min-w-0 flex-1 rounded bg-black/40 px-2 py-1.5 text-sm outline-none ring-1 ring-white/15 focus:ring-emerald-300"
                          />
                          <button disabled={!afford || care.list.length >= MAX_PETS} className="rounded bg-emerald-400 px-3 py-1.5 text-sm font-bold text-black disabled:opacity-40">
                            분양받기
                          </button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
              {soldOut.length > 0 && (
                <div className="mt-4">
                  <div className="mb-1.5 text-xs text-white/45">오늘 입고 없음 (품절 · 날마다 새로 들어와요)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {soldOut.map((sp) => (
                      <span key={sp.id} className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/40 line-through">
                        {sp.icon} {sp.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'goods' && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {PET_GOODS.map((g) => (
                <li key={g.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <span className="text-3xl">{g.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between font-bold">
                      <span>{g.name}</span>
                      <span className="text-amber-300">{g.price}G</span>
                    </div>
                    <div className="text-xs text-white/55">{g.desc}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs">
                      <span className={world.goodsLeft(g.id) > 0 ? 'text-emerald-200/80' : 'text-red-300/80'}>{world.goodsLeft(g.id) > 0 ? `진열 ${world.goodsLeft(g.id)}개` : '오늘 품절'}</span>
                      <span className="text-white/50">· 가진 것 {pr.inventory[g.id] ?? 0}개</span>
                      <span className="flex-1" />
                      {[1, 3].map((n) => (
                        <button
                          key={n}
                          onClick={() => run(world.buyPetGood(g.id, n))}
                          disabled={pr.gold < g.price * n || world.goodsLeft(g.id) < n}
                          className="rounded bg-white/10 px-2 py-0.5 font-bold hover:bg-emerald-400/30 disabled:opacity-40"
                        >
                          ×{n}
                        </button>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {tab === 'mine' &&
            (care.list.length === 0 ? (
              <div className="py-10 text-center text-sm text-white/55">
                아직 키우는 아이가 없어요 🐾
                <br />
                행복빌라 바로 옆 <b className="text-emerald-300">{PET_SHOP_NAME}</b>에서 분양받을 수 있어요
              </div>
            ) : (
              <ul className="grid gap-3">
                {care.list.map((p) => (
                  <PetCard key={p.id} pet={p} world={world} onResult={run} />
                ))}
              </ul>
            ))}
        </div>
      </div>
    </div>
  );
}

function PetCard({ pet, world, onResult }: { pet: OwnedPet; world: CityWorld; onResult: (r: { message: string }) => void }) {
  const care = world.pets;
  const sp = PET_BY_ID[pet.species];
  const mood = petMood(pet);
  const [renaming, setRenaming] = useState(false);
  const [nm, setNm] = useState(pet.name);
  const [bye, setBye] = useState(false);
  const days = Math.floor((Date.now() - pet.adoptedAt) / 86400000) + 1;
  const walking = care.walking?.id === pet.id;
  const inv = world.profile.inventory;
  if (!sp) return null;
  return (
    <li className={`rounded-xl border p-3 ${walking ? 'border-emerald-300/60 bg-emerald-400/10' : 'border-white/10 bg-white/5'}`}>
      <div className="flex items-start gap-3">
        <div className="text-4xl">{sp.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {renaming ? (
              <form
                className="flex gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  care.rename(pet.id, nm);
                  setRenaming(false);
                  onResult({ message: `이제 이름은 ${nm.trim() || pet.name}!` });
                }}
              >
                <input autoFocus value={nm} maxLength={10} onChange={(e) => setNm(e.target.value)} className="w-28 rounded bg-black/40 px-2 py-0.5 text-sm outline-none ring-1 ring-emerald-300" />
                <button className="rounded bg-emerald-400 px-2 text-xs font-bold text-black">확인</button>
              </form>
            ) : (
              <>
                <span className="text-lg font-black">{pet.name}</span>
                <button onClick={() => setRenaming(true)} className="text-xs text-white/40 hover:text-white" title="이름 바꾸기">
                  ✏️
                </button>
              </>
            )}
            <span className="text-xs text-white/50">
              {sp.name} · 함께한 지 {days}일째
            </span>
            {walking && <span className="rounded-full bg-emerald-400/80 px-2 py-0.5 text-[10px] font-bold text-black">산책 중</span>}
          </div>
          <div className="mt-0.5 text-sm">
            {mood.face} {mood.text}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
            <Bar label="배부름" value={100 - pet.hunger} color="bg-amber-400" />
            <Bar label="기분" value={pet.joy} color="bg-pink-400" />
            <Bar label="청결" value={pet.clean} color="bg-sky-400" />
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        <Act onClick={() => onResult(care.pat(pet.id))}>🤚 쓰다듬기</Act>
        <Act onClick={() => onResult(care.use(pet.id, 'pet-food'))} n={inv['pet-food'] ?? 0}>
          🥣 사료
        </Act>
        <Act onClick={() => onResult(care.use(pet.id, 'pet-treat'))} n={inv['pet-treat'] ?? 0}>
          🦴 간식
        </Act>
        <Act onClick={() => onResult(care.use(pet.id, 'pet-toy'))} n={inv['pet-toy'] ?? 0}>
          🧸 놀아주기
        </Act>
        <Act onClick={() => onResult(care.use(pet.id, 'pet-shampoo'))} n={inv['pet-shampoo'] ?? 0}>
          🧴 목욕
        </Act>
        <span className="flex-1" />
        {sp.walks && (
          <Act onClick={() => onResult(care.setWalking(walking ? null : pet.id))} accent>
            {walking ? '🏠 집에 두기' : '🚶 산책 친구로'}
          </Act>
        )}
        {bye ? (
          <>
            <Act onClick={() => onResult(care.release(pet.id))} danger>
              정말 보낼래요
            </Act>
            <Act onClick={() => setBye(false)}>취소</Act>
          </>
        ) : (
          <Act onClick={() => setBye(true)}>💌 입양 보내기</Act>
        )}
      </div>
    </li>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex justify-between text-white/60">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(v)}</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full ${v < 25 ? 'bg-red-400' : color}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

function Act({ onClick, children, n, accent, danger }: { onClick: () => void; children: React.ReactNode; n?: number; accent?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 font-bold transition ${
        danger ? 'bg-red-500/80 text-white hover:bg-red-500' : accent ? 'bg-emerald-400/80 text-black hover:bg-emerald-400' : 'bg-white/10 hover:bg-white/20'
      }`}
    >
      {children}
      {n !== undefined && <span className="ml-1 text-white/50">×{n}</span>}
    </button>
  );
}
