'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { MatchMode } from '@/game/core/match';
import { loadLegacyProfile, loadProfile, loadStoredProfile, newProfile, saveProfile, setProfileAccount, type PlayerProfile } from '@/game/core/profile';
import { currentAccount, signOut, type Account } from '@/game/net/auth';
import LoginScreen from './LoginScreen';
import GameTitle from './GameTitle';
import SkyClouds from './SkyClouds';
import KeySettings from './KeySettings';
import TouchGuide from './TouchGuide';
import { notationArrows } from '@/game/data/notation';
import { bindLabel } from '@/game/core/keybinds';
import { BOSSES, type BossDef } from '@/game/data/bosses';
import { PLAYER_MOVE_LIST, playerStartup } from '@/game/data/moves';
import { cloudSave, type SyncState } from '@/game/net/cloudSave';
import { sessionLock } from '@/game/net/sessionLock';
import { expToNext } from '@/game/data/progression';
import BossSelect from './BossSelect';
import type { PcGame } from './PcRoomPanel';
import { loadRecord, loadStreak, rankOf } from '@/game/core/cpuRecord';

// 게임 화면들은 들어갈 때 불러온다 (첫 화면·로그인을 빨리 띄우려고 — 3D·서울 코드가 크다)
const loadingScreen = () => <div className="flex h-screen w-screen items-center justify-center bg-black text-sm text-white/60">불러오는 중…</div>;
const BossView = dynamic(() => import('./BossView'), { ssr: false, loading: loadingScreen });
const CityView = dynamic(() => import('./CityView'), { ssr: false, loading: loadingScreen });
const FieldView = dynamic(() => import('./FieldView'), { ssr: false, loading: loadingScreen });
const GameView = dynamic(() => import('./GameView'), { ssr: false, loading: loadingScreen });

/**
 * 메뉴가 뜬 뒤 브라우저가 한가할 때 게임 화면 코드를 미리 받아 둔다
 * (첫 화면은 가볍게, 모드에 들어갈 땐 기다리지 않게). 실패해도 들어갈 때 다시 받으니 무시.
 */
function prefetchScreens() {
  const run = () => {
    for (const load of [() => import('./GameView'), () => import('./FieldView'), () => import('./BossView'), () => import('./CityView')]) {
      load().catch(() => {});
    }
  };
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 4000 });
  else window.setTimeout(run, 1500);
}

/** 캐릭터 모델 미리 받기 (3D 코드도 이때 같이 받아 둔다) */
function preloadModel(pick: (looks: typeof import('@/game/render/looks')) => string | null) {
  void Promise.all([import('@/game/render/vrmCharacter'), import('@/game/render/looks')]).then(([vrm, looks]) => {
    const url = pick(looks);
    if (url) vrm.preloadVrm(url);
  });
}

type Screen =
  | { kind: 'menu' }
  | { kind: 'field' }
  | { kind: 'city' }
  | { kind: 'bossSelect' }
  | { kind: 'boss'; boss: BossDef; attempt: number }
  | { kind: 'match'; mode: MatchMode };

const RPG_MODES: { screen: Screen; label: string; desc: string; tag: string }[] = [
  { screen: { kind: 'field' }, label: '필드 사냥', desc: '몬스터 사냥 · 자동사냥 · 레벨업', tag: 'AUTO' },
  { screen: { kind: 'bossSelect' }, label: '보스 레이드', desc: '강력한 보스와 1:1 · 직접 조작', tag: '수동' },
];

const VERSUS_MODES: { mode: MatchMode; label: string; desc: string }[] = [
  { mode: 'cpu', label: 'VS CPU', desc: '컴퓨터와 3판 2선승' },
  { mode: 'versus', label: '2P 대전', desc: '한 키보드로 둘이서' },
  { mode: 'training', label: '연습 모드', desc: '허수아비 + 프레임 데이터' },
];

const LEVEL_LABEL = { high: '상단', mid: '중단', low: '하단' } as const;

export default function Game() {
  const [screen, setScreen] = useState<Screen>({ kind: 'menu' });
  /** PC방(서울)에서 시작한 게임인가: 끝나면 메뉴 대신 서울로 */
  const [fromCity, setFromCity] = useState(false);
  const [keys, setKeys] = useState(false);
  // 프로필은 하위 화면(필드/보스)이 직접 수정하고, 화면을 나올 때 저장 + 다시 그린다
  const [profile, setProfile] = useState<PlayerProfile>(newProfile);
  /** VS CPU 카드의 랭크 한 줄 (브라우저 저장소도 읽으므로 화면이 뜬 뒤에 계산) */
  const [cpuInfo, setCpuInfo] = useState<string | null>(null);
  useEffect(() => {
    const rk = rankOf(loadRecord(profile));
    const best = loadStreak(profile).best;
    setCpuInfo(`${rk.icon} ${rk.name} · ${rk.points}점${best > 0 ? ` · 최고 ${best}연승` : ''}`);
  }, [profile]);

  const [sync, setSync] = useState<SyncState>(cloudSave.state);
  // 접속 흐름: 확인 중 → (서버가 있으면) 로그인 → 게임
  // busy = 같은 아이디로 다른 창이 접속 중, kicked = 다른 창이 '여기서 접속하기' 로 이 창을 끊음
  const [gate, setGate] = useState<'checking' | 'login' | 'ready' | 'busy' | 'kicked'>('checking');
  const [account, setAccount] = useState<Account | null>(null);
  const [pending, setPending] = useState<Account | null>(null);

  /**
   * 로그인한 계정의 기록을 서버에서 받아 와 그대로 시작.
   * 한 아이디는 한 창에서만: 다른 창이 접속 중이면 막는다 (force = 그 창을 끊고 여기서)
   */
  const enter = async (acc: Account, force = false) => {
    setGate('checking');
    const lock = await sessionLock.claim(acc);
    if (lock === 'busy') {
      if (!force) {
        setPending(acc);
        setGate('busy');
        return;
      }
      await sessionLock.takeOver();
    }
    setProfileAccount(acc.userId);
    const p = await cloudSave.initAccount(acc, loadStoredProfile(), loadLegacyProfile());
    saveProfile(p);
    // 고른 몸(남자·여자) 모델도 미리 받아 둔다
    preloadModel((l) => l.bodyUrl(p.body));
    setProfile({ ...p });
    setAccount(acc);
    setGate('ready');
  };

  useEffect(() => {
    // 주인공 모델은 메뉴에 있을 때 미리 받아 둔다
    preloadModel((l) => (l.PLAYER_LOOK.kind === 'vrm' ? l.PLAYER_LOOK.url : null));
    prefetchScreens();
    const off = cloudSave.subscribe(setSync);
    const flush = () => {
      void cloudSave.flush();
      void sessionLock.release();
    };
    window.addEventListener('pagehide', flush);
    // 다른 창에서 같은 아이디로 '여기서 접속하기' 를 누르면: 기록을 저장하고 이 창은 멈춘다
    sessionLock.onKicked = async () => {
      await cloudSave.flush();
      setScreen({ kind: 'menu' });
      setGate('kicked');
    };
    if (!cloudSave.enabled) {
      // 서버 설정이 없으면 (개발용) 로그인 없이 이 브라우저 기록으로
      setProfile(loadProfile());
      setGate('ready');
    } else {
      // 이미 로그인돼 있으면 (새로고침) 바로 이어서, 아니면 로그인 화면
      void currentAccount().then((acc) => (acc ? enter(acc) : setGate('login')));
    }
    return () => {
      off();
      window.removeEventListener('pagehide', flush);
      sessionLock.onKicked = null;
    };
  }, []);

  const logout = async () => {
    saveProfile(profile);
    await cloudSave.reset();
    await sessionLock.release();
    await signOut();
    setProfileAccount(null);
    setAccount(null);
    setProfile(newProfile());
    setScreen({ kind: 'menu' });
    setGate('login');
  };

  if (gate === 'login') return <LoginScreen onLogin={(acc) => void enter(acc)} />;
  if (gate === 'busy' || gate === 'kicked') {
    const acc = gate === 'busy' ? pending : account;
    return (
      <main className="tg-sky flex items-center justify-center p-6">
        <div className="tg-card max-w-md p-6 text-center">
          <div className="mb-2 text-3xl">{gate === 'busy' ? '🔒' : '🔌'}</div>
          <div className="mb-2 text-lg font-bold">{gate === 'busy' ? '이미 다른 창에서 접속 중이에요' : '다른 창에서 접속해서 여기는 끊겼어요'}</div>
          <div className="tg-muted mb-5 text-sm">
            한 아이디는 한 곳에서만 접속할 수 있어요{acc ? ` (${acc.username})` : ''}.
            <br />
            {gate === 'busy' ? '다른 창을 닫고 다시 시도하거나, 여기서 접속하면 다른 창은 끊겨요.' : '여기서 다시 접속하면 다른 창이 끊겨요.'}
          </div>
          <div className="flex flex-col gap-2">
            {gate === 'busy' && acc && (
              <button onClick={() => void enter(acc)} className="rounded-full bg-white/15 py-2 text-sm font-bold hover:bg-white/25">
                다시 시도
              </button>
            )}
            {acc && (
              <button onClick={() => void enter(acc, true)} className="tg-cta text-sm">
                여기서 접속하기 (다른 창은 끊겨요)
              </button>
            )}
            <button onClick={() => void logout()} className="rounded-lg py-2 text-xs text-white/50 hover:text-white">
              로그아웃
            </button>
          </div>
        </div>
      </main>
    );
  }
  if (gate === 'checking')
    return <main className="tg-sky tg-muted flex items-center justify-center">불러오는 중… ✨</main>;

  const go = (next: Screen) => {
    saveProfile(profile);
    setProfile({ ...profile });
    setScreen(next);
  };
  // PC방에서 시작한 게임이면 끝난 뒤 서울로 돌아간다
  const menu = () => {
    if (fromCity) {
      setFromCity(false);
      go({ kind: 'city' });
    } else go({ kind: 'menu' });
  };
  const playFromCity = (g: PcGame) => {
    setFromCity(true);
    go(g === 'cpu' ? { kind: 'match', mode: 'cpu' } : g === 'training' ? { kind: 'match', mode: 'training' } : g === 'boss' ? { kind: 'bossSelect' } : { kind: 'field' });
  };

  switch (screen.kind) {
    case 'field':
      return <FieldView profile={profile} onExit={menu} />;
    case 'city':
      return <CityView profile={profile} account={account} onExit={menu} onPlay={playFromCity} />;
    case 'bossSelect':
      return <BossSelect profile={profile} onSelect={(boss) => go({ kind: 'boss', boss, attempt: 0 })} onBack={menu} />;
    case 'boss':
      return (
        <BossView
          key={screen.attempt}
          boss={screen.boss}
          profile={profile}
          onRetry={() => go({ ...screen, attempt: screen.attempt + 1 })}
          onExit={() => go({ kind: 'bossSelect' })}
        />
      );
    case 'match':
      return <GameView key={screen.mode} mode={screen.mode} onExit={menu} profile={profile} />;
  }

  const bossesCleared = BOSSES.filter((b) => profile.bossClears[b.id]).length;

  return (
    <main className="tg-sky px-6 py-12">
      <SkyClouds />
      {keys && <KeySettings onClose={() => setKeys(false)} />}
      <div className="relative z-10 mx-auto max-w-4xl">
        <h1>
          <GameTitle size="lg" />
        </h1>
        <p className="tg-subtitle mt-5 text-center">✨ 같이 살고, 같이 싸우는 서울 이야기 ✨</p>

        {/* 내 캐릭터 */}
        <div className="tg-card mx-auto mt-8 flex max-w-xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
          <div className="tg-title text-3xl">Lv.{profile.level}</div>
          <div className="min-w-[12rem] flex-1">
            <div className="tg-bar">
              <div style={{ width: `${(profile.exp / expToNext(profile.level)) * 100}%` }} />
            </div>
            <div className="tg-muted mt-1.5 flex justify-between gap-3 whitespace-nowrap text-xs">
              <span>🪙 {profile.gold.toLocaleString()} G</span>
              <span>⚔️ 처치 {profile.kills}</span>
              <span>
                👑 보스 {bossesCleared}/{BOSSES.length}
              </span>
            </div>
          </div>
          <SyncBadge sync={sync} />
          {account && (
            <button onClick={() => void logout()} title="로그아웃" className="tg-muted whitespace-nowrap text-[11px] hover:text-white">
              👤 {account.username} · 로그아웃
            </button>
          )}
          <button
            onClick={() => {
              if (!confirm('레벨·골드·보스 기록을 모두 초기화할까요?')) return;
              const fresh = newProfile();
              saveProfile(fresh);
              setProfile(fresh);
            }}
            className="text-[11px] text-white/45 hover:text-white/80"
          >
            초기화
          </button>
        </div>

        <h2 className="tg-section">🏠 라이프</h2>
        <button
          onClick={() => go({ kind: 'city' })}
          className="tg-card tg-btn tg-tint-sky"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold">서울 · 내 집</span>
            <span className="tg-pill">NEW ✨</span>
          </div>
          <div className="tg-muted mt-1 text-sm">한강 동네에서 살기 · 일자리 · 낚시 · 펫 · 카지노 · 코인노래방 · 친구와 같은 동네에서 만나기</div>
        </button>

        <h2 className="tg-section">🗡️ RPG</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {RPG_MODES.map((m) => (
            <button
              key={m.label}
              onClick={() => go(m.screen)}
              className="tg-card tg-btn tg-tint-lemon"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">{m.label}</span>
                <span className="tg-pill">{m.tag}</span>
              </div>
              <div className="tg-muted mt-1 text-sm">{m.desc}</div>
              {/* 내 진행 상황 */}
              <div className="tg-accent mt-2 text-xs font-bold">
                {m.screen.kind === 'field'
                  ? `누적 처치 ${profile.kills.toLocaleString()}마리`
                  : `클리어 ${BOSSES.filter((b) => profile.bossClears[b.id]).length}/${BOSSES.length} 보스`}
              </div>
            </button>
          ))}
        </div>

        <h2 className="tg-section">🥊 대전</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {VERSUS_MODES.map((m) => (
            <button
              key={m.mode}
              onClick={() => go({ kind: 'match', mode: m.mode })}
              className="tg-card tg-btn tg-tint-pink"
            >
              <div className="text-xl font-bold">{m.label}</div>
              <div className="tg-muted mt-1 text-sm">{m.desc}</div>
              {m.mode === 'cpu' && cpuInfo && <div className="tg-accent mt-2 text-xs font-bold">{cpuInfo}</div>}
            </button>
          ))}
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <section className="tg-card p-5 text-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">🎮 조작</h2>
              <button onClick={() => setKeys(true)} className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold hover:bg-white/25">
                ⌨️ 키 설정
              </button>
            </div>
            <TouchGuide />
            <table className="w-full">
              <thead className="tg-muted">
                <tr><th className="text-left font-normal"></th><th className="text-left font-normal">P1</th><th className="text-left font-normal">P2</th></tr>
              </thead>
              <tbody className="font-mono">
                <tr><td className="font-sans text-white/70">이동</td><td>{bindLabel('up')} {bindLabel('left')} {bindLabel('down')} {bindLabel('right')}</td><td>Num 8 4 5 6</td></tr>
                <tr><td className="font-sans text-white/70">1 왼팔 / 2 오른팔</td><td>{bindLabel('b1')} / {bindLabel('b2')}</td><td>Num7 / Num9</td></tr>
                <tr><td className="font-sans text-white/70">3 왼다리 / 4 오른다리</td><td>{bindLabel('b3')} / {bindLabel('b4')}</td><td>Num1 / Num3</td></tr>
                <tr><td className="font-sans text-white/70">점프</td><td>{bindLabel('jump')}</td><td>Num0</td></tr>
              </tbody>
            </table>
            <ul className="tg-muted mt-4 space-y-1">
              <li>· 뒤로 / 가만히 있기 = 상·중단 가드, 앉기(아래·아래뒤) = 하단 가드</li>
              <li>· 앞앞 대시, 뒤뒤 백대시</li>
              <li>· 위 톡 = 화면 안쪽 횡이동, 아래 톡 = 바깥쪽 횡이동 (누르고 있으면 계속 옆으로 걷는 횡보)</li>
              <li>· 점프 — 하단 공격을 뛰어넘는다</li>
              <li>· Ctrl+휠 줌 (Ctrl+0 원래대로)</li>
              <li>· Esc 일시정지, ` 판정 표시</li>
              <li>· 🎮 게임패드: 방향 패드·왼쪽 스틱 이동, X=1 · Y=2 · A=3 · B=4, RB 점프, Start 일시정지 · 필드: LB 앉기, Back 자동사냥 (2P 대전은 두 번째 패드)</li>
            </ul>
          </section>

          <section className="tg-card p-5 text-sm">
            <h2 className="mb-3 text-lg font-bold">📜 기술표</h2>
            <table className="w-full">
              <tbody>
                {PLAYER_MOVE_LIST.map((m) => (
                  <tr key={m.id} className="border-t border-white/10">
                    <td className="whitespace-nowrap py-1 pr-2 font-mono text-pink-200">{notationArrows(m.notation)}</td>
                    <td className="py-1 pr-2">{m.name}</td>
                    <td className="whitespace-nowrap py-1 pr-2 text-white/60">{LEVEL_LABEL[m.level]}</td>
                    <td className="whitespace-nowrap py-1 font-mono text-white/60">{playerStartup(m)}F</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </main>
  );
}

const SYNC_LABEL: Record<SyncState['status'], [string, string]> = {
  offline: ['오프라인', 'text-white/40'],
  connecting: ['연결 중', 'text-amber-300'],
  synced: ['클라우드 저장됨', 'text-emerald-300'],
  saving: ['저장 중', 'text-sky-300'],
  error: ['저장 오류', 'text-red-400'],
};

function SyncBadge({ sync }: { sync: SyncState }) {
  const [label, color] = SYNC_LABEL[sync.status];
  const title =
    sync.status === 'offline'
      ? '.env.local 에 Supabase 설정이 없어 이 브라우저에만 저장됩니다'
      : sync.error ?? (sync.userId ? `계정 ${sync.userId}` : '');
  return (
    <span title={title} className={`whitespace-nowrap text-[11px] ${color}`}>
      ● {label}
    </span>
  );
}
