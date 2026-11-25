'use client';

import { useEffect, useState } from 'react';
import { saveProfile, type PlayerProfile } from '@/game/core/profile';
import { clearDimensionPlace } from '@/game/core/lastScreen';
import { STORY_ENTRIES, hasStoryBackup, isMaster, jumpToStory, restoreStory } from '@/game/story/master';
import { toggleTestCompanion } from '@/game/data/companions';

/** 접속 버튼을 누른 뒤 창이 하얗게 번지며 사라지는 시간 (ms) */
const FADE_MS = 900;
/** 설치 막대가 다 차는 시간 (ms) */
const INSTALL_MS = 2600;

/** 처음 켰을 때의 순서: 커뮤니티 인기글 → 설치 → 캐릭터 이름 → 접속 확인 (그다음부턴 바로 실행 화면 'run') */
type Step = 'board' | 'install' | 'name' | 'run';

/** 인터넷 게임 커뮤니티에 올라온 DIMENSION 글들 (소문은 인터넷에서만 돈다 — 뉴스·TV 에는 나오지 않는다) */
const POSTS: { title: string; who: string; when: string; views: string; replies: string[] }[] = [
  {
    title: 'DIMENSION 해 본 사람? 이거 진짜 뭐임',
    who: '새벽세시',
    when: '3분 전',
    views: '2.4만',
    replies: ['그래픽이 아니라 진짜 공기 냄새가 남 ㄷㄷ', 'VR 안 껴도 됨. 그냥 모니터로 하는데 들어가 있음', '광고인 줄 알았는데 해 보니까 인정'],
  },
  {
    title: '켜고 나서 시간 순삭됨… 근데 기억이 잘 안 남',
    who: '퇴근하고롤',
    when: '12분 전',
    views: '8,912',
    replies: ['ㅇㅇ 나도 재밌었던 건 확실한데 뭘 했는지가 흐릿함', '자고 일어났더니 온몸이 쑤시던데 이것 때문인가 ㅋㅋ', '몰입감이 그 정도라는 거지'],
  },
  {
    title: '근데 제작사 어디임? 검색해도 안 나옴',
    who: '의심병환자',
    when: '27분 전',
    views: '5,301',
    replies: ['무료에 광고도 없고 결제도 없음. 이상하긴 함', '인디 아님? 어차피 재밌으면 됐지', '스토어에도 없고 공식 사이트도 없는데 다운로드만 1,000만 ㄷㄷ'],
  },
];

/**
 * 서울 내 집 컴퓨터 (E). 요즘 인터넷에서 난리 난 게임 DIMENSION 을 깔아 실행한다.
 * 처음엔 평범한 게임처럼 보인다: 커뮤니티 글 → 설치 → (내 이름이 이미 적힌) 캐릭터 이름 → 접속.
 * 그다음부턴 바로 실행 화면.
 */
export default function HomePcPanel({ profile, playerName, userId = null, onConnect, onClose }: { profile: PlayerProfile; playerName?: string | null; userId?: string | null; onConnect: () => void; onClose: () => void }) {
  const visits = profile.dimension?.visits ?? 0;
  const first = visits === 0 && !profile.dimension?.prologue;
  const [step, setStep] = useState<Step>(first ? 'board' : 'run');
  const [open, setOpen] = useState(0);
  const [going, setGoing] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [agree, setAgree] = useState(false);
  const name = playerName || '플레이어';
  const master = isMaster(playerName);
  const [masterOpen, setMasterOpen] = useState(false);
  const [masterMsg, setMasterMsg] = useState<string | null>(null);

  useEffect(() => {
    if (step !== 'install' || !agree) return;
    const id = window.setTimeout(() => setInstalled(true), INSTALL_MS);
    return () => window.clearTimeout(id);
  }, [step, agree]);

  const connect = () => {
    if (going) return;
    setGoing(true);
    window.setTimeout(onConnect, FADE_MS);
  };

  /** 마스터: 고른 장면부터 다시 (진행한 뒤에도 언제든). 차원 안 자리 기억은 지워 포탈 앞에서 시작 */
  const pickStory = (id: string, label: string) => {
    if (going) return;
    if (!window.confirm(`「${label}」부터 다시 볼까요?
지금 이야기 진행은 처음 한 번 백업해 두고, 나중에 되돌릴 수 있어요.`)) return;
    if (!jumpToStory(profile, id)) return;
    saveProfile(profile);
    clearDimensionPlace(userId);
    connect();
  };
  const restore = () => {
    if (!restoreStory(profile)) return;
    saveProfile(profile);
    clearDimensionPlace(userId);
    setMasterMsg('원래 이야기 진행으로 되돌렸어요');
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-3" onClick={going ? undefined : onClose}>
      <div
        className={`max-h-full w-full max-w-lg overflow-y-auto rounded-xl border border-violet-300/30 bg-[#0d0a24]/95 text-white shadow-[0_0_40px_rgba(139,92,246,0.35)] ${going ? 'pc-fade' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 창 제목줄 */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
          <div className="font-mono text-sm font-bold text-violet-200">🖥️ 내 컴퓨터{step === 'board' ? ' · 게임 커뮤니티' : ''}</div>
          <button onClick={onClose} disabled={going} className="rounded bg-white/10 px-3 py-1 text-sm hover:bg-white/20 disabled:opacity-40">
            끄기
          </button>
        </div>

        {step === 'board' && (
          // 인터넷 게임 커뮤니티 인기글: 다들 DIMENSION 얘기뿐 (이야기의 시작)
          <div className="p-4">
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-white/60">
              <span className="rounded bg-rose-500 px-1.5 py-0.5 font-black text-white">HOT</span>
              <span>게임 갤러리 · 실시간 인기글</span>
            </div>
            <ul className="space-y-2">
              {POSTS.map((p, i) => (
                <li key={p.title} className="rounded-lg border border-white/10 bg-black/30">
                  <button onClick={() => setOpen(i)} className="w-full px-3 py-2 text-left">
                    <div className="text-sm font-bold text-white/90">
                      {p.title} <span className="text-rose-300">[{p.replies.length * 37 + 12}]</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-white/40">
                      {p.who} · {p.when} · 조회 {p.views}
                    </div>
                  </button>
                  {open === i && (
                    <ul className="space-y-1 px-3 pb-2 text-xs leading-5 text-white/75">
                      {p.replies.map((r) => (
                        <li key={r} className="rounded bg-white/5 px-2 py-1">
                          💬 {r}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-3 rounded-lg border border-cyan-300/20 bg-black/40 p-3">
              <div className="font-mono text-xl font-black tracking-[0.3em] text-cyan-300">DIMENSION</div>
              <div className="mt-0.5 text-xs text-white/50">무료 · 제작사 정보 없음 · 다운로드 1,000만+</div>
            </div>
            <button onClick={() => setStep('install')} className="mt-3 w-full rounded-lg bg-violet-500/30 py-2 text-sm font-bold hover:bg-violet-500/50">
              ⬇ 나도 깔아 보기 ▸
            </button>
          </div>
        )}

        {step === 'install' && (
          // 평범한 게임 설치 화면: 약관 동의 → 설치 막대
          <div className="p-4">
            <div className="font-mono text-lg font-black tracking-widest text-cyan-300">DIMENSION 설치</div>
            <div className="mt-3 h-32 overflow-y-auto rounded border border-white/10 bg-black/40 p-3 text-[11px] leading-5 text-white/55">
              <p className="font-bold text-white/70">이용 약관</p>
              <p>1. 본 게임은 무료로 제공됩니다.</p>
              <p>2. 이용자는 게임을 건전하게 즐겨야 합니다.</p>
              <p>3. 접속 중 이용자가 보고 듣고 느끼는 모든 것은 이용자 본인의 경험으로 남습니다.</p>
              <p>4. 접속은 이용자가 원할 때 언제든 끝낼 수 있습니다.</p>
              <p>5. 그 밖의 사항은 접속한 곳의 법을 따릅니다.</p>
            </div>
            {!agree ? (
              <button onClick={() => setAgree(true)} className="mt-3 w-full rounded-lg bg-violet-500/30 py-2 text-sm font-bold hover:bg-violet-500/50">
                ☑ 동의하고 설치
              </button>
            ) : (
              <div className="mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="pc-install-bar h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-300" />
                </div>
                <div className="mt-1 text-xs text-white/50">{installed ? '설치 완료!' : '설치하는 중…'}</div>
                <button
                  onClick={() => setStep('name')}
                  disabled={!installed}
                  className="mt-3 w-full rounded-lg bg-violet-500/30 py-2 text-sm font-bold hover:bg-violet-500/50 disabled:opacity-40"
                >
                  실행 ▸
                </button>
              </div>
            )}
          </div>
        )}

        {step === 'name' && (
          // 캐릭터 이름: 입력하려고 보니 내 이름이 이미 적혀 있다 (첫 번째 작은 위화감)
          <div className="p-4 text-center">
            <div className="font-mono text-2xl font-black tracking-[0.3em] text-cyan-300">DIMENSION</div>
            <div className="mt-4 text-left text-xs text-white/60">캐릭터 이름</div>
            <div className="mt-1 rounded border border-cyan-300/40 bg-black/50 px-3 py-2 text-left font-bold text-white">{name}</div>
            <div className="mt-1 text-left text-[11px] text-white/40">※ 이미 입력되어 있습니다. …계정이 연동됐나?</div>
            <div className="mt-5 text-sm font-bold text-white/85">이 세계에 접속하시겠습니까?</div>
            <div className="mt-3 flex gap-2">
              <button onClick={onClose} disabled={going} className="flex-1 rounded-lg bg-white/10 py-2 text-sm hover:bg-white/20 disabled:opacity-40">
                나중에
              </button>
              <button
                onClick={connect}
                disabled={going}
                className="flex-1 rounded-lg bg-gradient-to-r from-violet-500 to-cyan-500 py-2 font-black tracking-wider hover:brightness-110 disabled:opacity-70"
              >
                {going ? '접속 중…' : '예'}
              </button>
            </div>
          </div>
        )}

        {step === 'run' && (
          <div className="p-4">
            <div className="rounded-lg border border-cyan-300/20 bg-black/40 p-4 text-center">
              <div className="font-mono text-xl font-black tracking-widest text-cyan-300">DIMENSION.exe</div>
              <div className="mt-1 text-xs text-white/50">{visits > 0 ? `접속 기록 ${visits}회` : '처음 실행'}</div>
              <ul className="mt-3 space-y-1 text-left text-xs leading-5 text-white/70">
                <li>· {profile.dimension?.prologue ? '접속하면 경계 마을 포탈 앞에 도착해요' : '처음 실행하면 이야기가 시작돼요'}</li>
                <li>· 같은 차원에 접속한 사람들은 모두 같은 몬스터를 보고 같이 싸워요</li>
                <li>· 접속해 있는 동안 서울에서는 내 모습이 사라져요</li>
                <li>· 자동사냥(Z)으로 쉬지 않고 사냥할 수 있어요</li>
                <li>· 로그아웃하면 다시 이 컴퓨터 앞으로 돌아와요</li>
              </ul>
              <button
                onClick={connect}
                disabled={going}
                className="mt-4 w-full rounded-lg bg-gradient-to-r from-violet-500 to-cyan-500 py-2.5 font-black tracking-wider hover:brightness-110 disabled:opacity-70"
              >
                {going ? '접속 중…' : '🌀 접속하기'}
              </button>
            </div>
            <button onClick={() => setStep('board')} className="mt-2 w-full text-xs text-white/45 hover:text-white/80">
              커뮤니티 글 다시 보기
            </button>
            {master && (
              <div className="mt-3 rounded-lg border border-amber-300/40 bg-amber-500/10 p-3 text-left">
                <button onClick={() => setMasterOpen((v) => !v)} className="flex w-full items-center justify-between text-sm font-bold text-amber-200">
                  <span>🛠 마스터 · 장면 골라 보기</span>
                  <span className="text-xs text-amber-200/60">{masterOpen ? '접기 ▴' : '펼치기 ▾'}</span>
                </button>
                {masterOpen && (
                  <div className="mt-2 space-y-3">
                    <div className="text-[11px] leading-4 text-white/55">고르면 그 장면부터 바로 접속해요. 진행한 뒤에도 언제든 다시 고를 수 있어요. (내 저장만 바뀌어요)</div>
                    {(['프롤로그', '0장', '1장'] as const).map((ch) => (
                      <div key={ch}>
                        <div className="mb-1 text-xs font-bold text-white/80">{ch}</div>
                        <div className="grid grid-cols-1 gap-1">
                          {STORY_ENTRIES.filter((e) => e.chapter === ch).map((e) => (
                            <button
                              key={e.id}
                              disabled={going}
                              onClick={() => pickStory(e.id, `${e.chapter} ${e.label}`)}
                              className="rounded bg-white/10 px-2 py-1.5 text-left text-xs hover:bg-amber-400/30 disabled:opacity-40"
                            >
                              {e.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div className="text-xs text-white/40">2장 — 준비 중 (줄거리: docs/story/chapter2-outline.md)</div>
                    <div>
                      <div className="mb-1 text-xs font-bold text-white/80">태그 전투 확인</div>
                      <button
                        disabled={going}
                        onClick={() => {
                          const on = toggleTestCompanion(profile);
                          saveProfile(profile);
                          setMasterMsg(on ? '시험 동료를 파티에 넣었어요 — 차원에서 Tab 으로 교대, 쓰러지면 저절로 교대' : '시험 동료를 파티에서 뺐어요');
                        }}
                        className="w-full rounded bg-white/10 px-2 py-1.5 text-left text-xs hover:bg-sky-400/30 disabled:opacity-40"
                      >
                        {(profile.dimension?.party ?? []).includes('tester') ? '시험 동료 빼기' : '시험 동료 넣기 (Tab 교대 시험)'}
                      </button>
                    </div>
                    {hasStoryBackup(profile) && (
                      <button onClick={restore} className="w-full rounded bg-white/15 py-1.5 text-xs font-bold hover:bg-white/25">
                        ↩ 원래 이야기 진행으로 되돌리기
                      </button>
                    )}
                    {masterMsg && <div className="text-xs text-emerald-300">{masterMsg}</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
