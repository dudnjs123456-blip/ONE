'use client';

import { useEffect, useState } from 'react';
import type { MatchMode } from '@/game/core/match';
import { loadLegacyProfile, loadProfile, loadStoredProfile, newProfile, saveProfile, setProfileAccount, type PlayerProfile } from '@/game/core/profile';
import { currentAccount, signOut, type Account } from '@/game/net/auth';
import LoginScreen from './LoginScreen';
import KeySettings from './KeySettings';
import { bindLabel } from '@/game/core/keybinds';
import { preloadVrm } from '@/game/render/vrmCharacter';
import { PLAYER_LOOK } from '@/game/render/looks';
import { BOSSES, type BossDef } from '@/game/data/bosses';
import { PLAYER_MOVE_LIST } from '@/game/data/moves';
import { cloudSave, type SyncState } from '@/game/net/cloudSave';
import { expToNext } from '@/game/data/progression';
import BossSelect from './BossSelect';
import BossView from './BossView';
import CityView from './CityView';
import FieldView from './FieldView';
import GameView from './GameView';

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
  const [keys, setKeys] = useState(false);
  // 프로필은 하위 화면(필드/보스)이 직접 수정하고, 화면을 나올 때 저장 + 다시 그린다
  const [profile, setProfile] = useState<PlayerProfile>(newProfile);

  const [sync, setSync] = useState<SyncState>(cloudSave.state);
  // 접속 흐름: 확인 중 → (서버가 있으면) 로그인 → 게임
  const [gate, setGate] = useState<'checking' | 'login' | 'ready'>('checking');
  const [account, setAccount] = useState<Account | null>(null);

  /** 로그인한 계정의 기록을 서버에서 받아 와 그대로 시작 */
  const enter = async (acc: Account) => {
    setGate('checking');
    setProfileAccount(acc.userId);
    const p = await cloudSave.initAccount(acc, loadStoredProfile(), loadLegacyProfile());
    saveProfile(p);
    setProfile({ ...p });
    setAccount(acc);
    setGate('ready');
  };

  useEffect(() => {
    // 주인공 모델은 메뉴에 있을 때 미리 받아 둔다
    if (PLAYER_LOOK.kind === 'vrm') preloadVrm(PLAYER_LOOK.url);
    const off = cloudSave.subscribe(setSync);
    const flush = () => void cloudSave.flush();
    window.addEventListener('pagehide', flush);
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
    };
  }, []);

  const logout = async () => {
    saveProfile(profile);
    await cloudSave.reset();
    await signOut();
    setProfileAccount(null);
    setAccount(null);
    setProfile(newProfile());
    setScreen({ kind: 'menu' });
    setGate('login');
  };

  if (gate === 'login') return <LoginScreen onLogin={(acc) => void enter(acc)} />;
  if (gate === 'checking')
    return <main className="flex min-h-screen items-center justify-center bg-black text-white/60">불러오는 중…</main>;

  const go = (next: Screen) => {
    saveProfile(profile);
    setProfile({ ...profile });
    setScreen(next);
  };
  const menu = () => go({ kind: 'menu' });

  switch (screen.kind) {
    case 'field':
      return <FieldView profile={profile} onExit={menu} />;
    case 'city':
      return <CityView profile={profile} account={account} onExit={menu} />;
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
      return <GameView key={screen.mode} mode={screen.mode} onExit={menu} />;
  }

  const bossesCleared = BOSSES.filter((b) => profile.bossClears[b.id]).length;

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-[#0b0d17] to-black px-6 py-12 text-white">
      {keys && <KeySettings onClose={() => setKeys(false)} />}
      <div className="mx-auto max-w-4xl">
        <h1 className="text-center text-6xl font-black italic tracking-tight text-amber-300">IRON FIST</h1>
        <p className="mt-2 text-center text-white/50">웹 3D 격투 RPG 프로토타입</p>

        {/* 내 캐릭터 */}
        <div className="mx-auto mt-8 flex max-w-md items-center gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-2xl font-black text-amber-300">Lv.{profile.level}</div>
          <div className="flex-1">
            <div className="h-1.5 overflow-hidden rounded bg-black/60">
              <div className="h-full bg-lime-400" style={{ width: `${(profile.exp / expToNext(profile.level)) * 100}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-xs text-white/60">
              <span>{profile.gold.toLocaleString()} G</span>
              <span>처치 {profile.kills}</span>
              <span>
                보스 {bossesCleared}/{BOSSES.length}
              </span>
            </div>
          </div>
          <SyncBadge sync={sync} />
          {account && (
            <button onClick={() => void logout()} title="로그아웃" className="whitespace-nowrap text-[11px] text-white/60 hover:text-white">
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
            className="text-[11px] text-white/40 hover:text-white/80"
          >
            초기화
          </button>
        </div>

        <h2 className="mb-3 mt-10 text-sm font-bold tracking-widest text-white/50">라이프</h2>
        <button
          onClick={() => go({ kind: 'city' })}
          className="w-full rounded-lg border border-sky-300/25 bg-gradient-to-r from-sky-400/10 to-amber-300/10 p-5 text-left transition hover:border-sky-300"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold">서울 · 내 집</span>
            <span className="rounded bg-black/40 px-2 py-0.5 text-xs font-bold text-sky-300">NEW</span>
          </div>
          <div className="mt-1 text-sm text-white/60">한강이 보이는 동네를 걷고, 내 원룸에서 쉬기 · 주변 이벤트는 곧 추가</div>
        </button>

        <h2 className="mb-3 mt-8 text-sm font-bold tracking-widest text-white/50">RPG</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {RPG_MODES.map((m) => (
            <button
              key={m.label}
              onClick={() => go(m.screen)}
              className="rounded-lg border border-amber-300/20 bg-amber-300/5 p-5 text-left transition hover:border-amber-300 hover:bg-amber-300/10"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">{m.label}</span>
                <span className="rounded bg-black/40 px-2 py-0.5 text-xs font-bold text-amber-300">{m.tag}</span>
              </div>
              <div className="mt-1 text-sm text-white/60">{m.desc}</div>
            </button>
          ))}
        </div>

        <h2 className="mb-3 mt-8 text-sm font-bold tracking-widest text-white/50">대전</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {VERSUS_MODES.map((m) => (
            <button
              key={m.mode}
              onClick={() => go({ kind: 'match', mode: m.mode })}
              className="rounded-lg border border-white/15 bg-white/5 p-5 text-left transition hover:border-amber-300 hover:bg-white/10"
            >
              <div className="text-xl font-bold">{m.label}</div>
              <div className="mt-1 text-sm text-white/60">{m.desc}</div>
            </button>
          ))}
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <section className="rounded-lg border border-white/10 bg-white/5 p-5 text-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">조작</h2>
              <button onClick={() => setKeys(true)} className="rounded bg-white/10 px-3 py-1 text-xs hover:bg-white/20">
                ⌨️ 키 설정
              </button>
            </div>
            <table className="w-full">
              <thead className="text-white/50">
                <tr><th className="text-left font-normal"></th><th className="text-left font-normal">P1</th><th className="text-left font-normal">P2</th></tr>
              </thead>
              <tbody className="font-mono">
                <tr><td className="font-sans text-white/70">이동</td><td>{bindLabel('up')} {bindLabel('left')} {bindLabel('down')} {bindLabel('right')}</td><td>Num 8 4 5 6</td></tr>
                <tr><td className="font-sans text-white/70">1 왼팔 / 2 오른팔</td><td>{bindLabel('b1')} / {bindLabel('b2')}</td><td>Num7 / Num9</td></tr>
                <tr><td className="font-sans text-white/70">3 왼다리 / 4 오른다리</td><td>{bindLabel('b3')} / {bindLabel('b4')}</td><td>Num1 / Num3</td></tr>
                <tr><td className="font-sans text-white/70">점프</td><td>{bindLabel('jump')}</td><td>Num0</td></tr>
              </tbody>
            </table>
            <ul className="mt-4 space-y-1 text-white/70">
              <li>· 뒤로 / 가만히 있기 = 상·중단 가드, 앉기(아래·아래뒤) = 하단 가드</li>
              <li>· 앞앞 대시, 뒤뒤 백대시</li>
              <li>· 위 톡 = 화면 안쪽 횡이동, 아래 톡 = 바깥쪽 횡이동</li>
              <li>· 점프 — 하단 공격을 뛰어넘는다</li>
              <li>· Ctrl+휠 줌 (Ctrl+0 원래대로)</li>
              <li>· Esc 일시정지, ` 판정 표시</li>
            </ul>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 text-sm">
            <h2 className="mb-3 text-lg font-bold">기술표</h2>
            <table className="w-full">
              <tbody>
                {PLAYER_MOVE_LIST.map((m) => (
                  <tr key={m.id} className="border-t border-white/5">
                    <td className="py-1 pr-2 font-mono text-amber-300">{m.notation}</td>
                    <td className="py-1 pr-2">{m.name}</td>
                    <td className="py-1 pr-2 text-white/60">{LEVEL_LABEL[m.level]}</td>
                    <td className="py-1 font-mono text-white/60">i{m.startup}</td>
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
