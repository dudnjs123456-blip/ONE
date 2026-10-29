'use client';

import { useEffect, useRef, useState } from 'react';
import { FRAME_MS } from '@/game/core/constants';
import type { PlayerProfile } from '@/game/core/profile';
import { CityWorld, type CityInput } from '@/game/city/cityWorld';
import { P1_KEYS } from '@/game/core/input';
import { bindCodes, bindLabel, type BindAction } from '@/game/core/keybinds';
import KeySettings from './KeySettings';
import type { Buttons } from '@/game/core/types';
import { makeClock } from '@/game/render/clock';
import { CityRenderer } from '@/game/render/cityRenderer';
import { loadProgress } from '@/game/render/loadTracker';
import InventoryPanel from './InventoryPanel';
import { LifeBars } from './LifeBar';
import CityMapOverlay from './CityMapOverlay';
import JobPanel from './JobPanel';
import CalendarPanel from './CalendarPanel';
import GearPanel from './GearPanel';
import CasinoPanel from './CasinoPanel';
import { shortDay } from '@/game/city/calendar';
import ShopDialog from './ShopDialog';
import NpcChatPanel from './NpcChatPanel';
import { PerfProbe } from '@/game/render/perfProbe';
import { TownLink } from '@/game/net/town';
import type { Account } from '@/game/net/auth';
import { attachZoomControls } from './zoomControls';

interface CityHud {
  location: 'city' | 'home' | 'lobby' | 'corridor';
  floor: number;
  clock: string;
  day: number;
  daylight: number;
  prompt: string | null;
  toast: string | null;
  police: string | null;
  caught: boolean;
  gold: number;
  hp: number;
  maxHp: number;
  downed: boolean;
  /** 덤비는 행인 수 */
  attackers: number;
  fatigue: number;
  hungerRate: number;
  care: string | null;
  hunger: number;
  /** 대화 중인 가게 간판 (없으면 null) */
  dialog: string | null;
  /** 이야기 중인 대화형 NPC id (없으면 null) */
  npcChat: string | null;
  /** 엘리베이터 층 고르기 (열려 있으면 꼭대기 층 수, 지금 층, 내 집 층) */
  elevator: { top: number; here: number; mine: number } | null;
  /** 창밖 내다보는 중 */
  lookOut: boolean;
  /** 지금 장소 이름 (내 집 호수·친구 집 포함) */
  place: string;
  /** 마을 접속 상태 (로그인 안 했으면 null) */
  online: { status: string; friends: string[]; ping: number | null } | null;
  /** 근무 현황 (근무 중이 아니면 null) */
  job: { name: string; left: string; checked: number; pay: number; alert: string | null; auto: boolean; fighting: boolean; autoPatrol: boolean; hunt: boolean } | null;
  payslip: string | null;
  jobPanelRequest: boolean;
  /** 잠자는 단계와 밤 진행도 */
  sleep: 'walk' | 'lie' | 'sleep' | 'wake' | null;
  night: number;
}

// 키는 키 설정(keybinds)을 따른다 — 기본: 방향키 이동, Q W A S 공격, 스페이스 점프, Shift 달리기, E 상호작용
const has = (action: BindAction, code: string) => bindCodes(action).includes(code);
/** 이동 키 → 방향 */
function moveOf(code: string): [number, number] | null {
  if (has('up', code)) return [0, -1];
  if (has('down', code)) return [0, 1];
  if (has('left', code)) return [-1, 0];
  if (has('right', code)) return [1, 0];
  return null;
}

/** 키보드 → 도시 입력. 카메라가 북쪽을 보고 있으므로 화면 위 = -z */
class CityKeyboard {
  private down = new Set<string>();
  private pressed = false;
  /** 대각선에서 키 하나를 먼저 뗐을 때 잠깐 대각선을 유지 (멈출 때 방향이 꺾이지 않게) */
  private lastDiag: { x: number; z: number } | null = null;
  private diagGrace = 0;
  private onDown = (e: KeyboardEvent) => {
    if (moveOf(e.code) || has('interact', e.code) || has('jump', e.code)) e.preventDefault();
    if (has('interact', e.code) && !e.repeat) this.pressed = true;
    this.down.add(e.code);
  };
  private onUp = (e: KeyboardEvent) => {
    // 점프 키를 뗄 때 브라우저 기본 동작(스페이스 = 눌린 버튼 다시 클릭, Alt = 메뉴)을 막는다
    if (has('jump', e.code)) e.preventDefault();
    this.down.delete(e.code);
  };
  private onBlur = () => this.down.clear();

  attach() {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }
  detach() {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }
  read(): CityInput {
    let x = 0;
    let z = 0;
    for (const k of this.down) {
      const m = moveOf(k);
      if (m) {
        x += m[0];
        z += m[1];
      }
    }
    const interact = this.pressed;
    this.pressed = false;
    // 대각선 → 한 방향: 두 키를 정확히 동시에 떼기는 어렵다. 6프레임 동안은 대각선으로 본다
    if (x && z) {
      this.lastDiag = { x, z };
      this.diagGrace = 6;
    } else if ((x || z) && this.lastDiag && this.diagGrace > 0 && (x === 0 || x === this.lastDiag.x) && (z === 0 || z === this.lastDiag.z)) {
      this.diagGrace--;
      x = this.lastDiag.x;
      z = this.lastDiag.z;
    } else {
      this.diagGrace = 0;
      if (!x && !z) this.lastDiag = null;
    }
    return {
      move: x || z ? { x, z } : null,
      run: bindCodes('run').some((k) => this.down.has(k)),
      crouch: bindCodes('run').some((k) => this.down.has(k)),
      buttons: P1_KEYS.buttons.map((k) => this.down.has(k)) as Buttons,
      jump: bindCodes('jump').some((k) => this.down.has(k)),
      down: bindCodes('down').some((k) => this.down.has(k)),
      interact,
    };
  }
}

/** 서울 라이프: 도시 + 내 집 (일상 모드) */
export default function CityView({ profile, account, onExit }: { profile: PlayerProfile; account: Account | null; onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<CityWorld | null>(null);
  const perfRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<CityHud | null>(null);
  const [menu, setMenu] = useState(false);
  const [inventory, setInventory] = useState(false);
  const [bigMap, setBigMap] = useState(false);
  const [jobs, setJobs] = useState(false);
  const [calendar, setCalendar] = useState(false);
  const [gear, setGear] = useState(false);
  const [casino, setCasino] = useState(false);
  const [keys, setKeys] = useState(false);
  /** 로딩 화면 (모델 받기 → 그래픽 준비). 끝나면 null */
  const [loading, setLoading] = useState<{ stage: 'models' | 'shaders'; done: number; total: number } | null>({ stage: 'models', done: 0, total: 0 });
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const bigMapRef = useRef(bigMap);
  bigMapRef.current = bigMap;
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const calRef = useRef(calendar);
  calRef.current = calendar;
  const gearRef = useRef(gear);
  gearRef.current = gear;
  const casinoRef = useRef(casino);
  casinoRef.current = casino;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const kb = new CityKeyboard();
    kb.attach();
    const world = new CityWorld({ read: () => (menuRef.current || bigMapRef.current || jobsRef.current || calRef.current || gearRef.current || casinoRef.current ? { move: null, run: false, interact: false } : kb.read()) }, profile);
    // 개발 중 화면 점검용 (배포판에는 없다)
    if (process.env.NODE_ENV === 'development') (window as unknown as { __city?: CityWorld }).__city = world;
    worldRef.current = world;
    const renderer = new CityRenderer(canvas, world);
    if (process.env.NODE_ENV === 'development') (window as unknown as { __cr?: CityRenderer }).__cr = renderer;
    const resize = () => renderer.resize(canvas.clientWidth, canvas.clientHeight);
    resize();
    window.addEventListener('resize', resize);
    const detachZoom = attachZoomControls(renderer, 0.15, 2.4);
    const probe = new PerfProbe();
    // 로그인했으면 마을에 접속해서 친구들과 같이 논다
    const link = account ? new TownLink(world, account) : null;
    link?.start();
    const onKey = (e: KeyboardEvent) => {
      // NPC 와 대화 중엔 글자를 입력하므로 게임 단축키를 막는다 (Esc 로만 닫기)
      if (world.npcChat) {
        if (e.code === 'Escape') world.closeNpcChat();
        return;
      }
      // 엘리베이터: 숫자 키로 층 고르기, Esc 로 내리지 않고 닫기
      if (world.elevatorOpen) {
        const n = /^(Digit|Numpad)(\d)$/.exec(e.code);
        if (n) world.rideElevator(Number(n[2]));
        else if (e.code === 'Escape') world.closeElevator();
        return;
      }
      // 창밖 내다보기: Esc 돌아오기, C 창문 닫고 돌아오기 (E 는 게임 입력으로 처리)
      if (world.lookingOut) {
        if (e.code === 'Escape') world.stopLookOut();
        else if (e.code === 'KeyC' && !e.repeat) world.stopLookOut(true);
        return;
      }
      if (e.code === 'KeyM' && !e.repeat && !world.dialog) setBigMap((v) => !v);
      if (e.code === 'Escape') {
        // 대화·지도부터 닫는다
        if (world.dialog) world.closeDialog();
        else if (bigMapRef.current) setBigMap(false);
        else if (jobsRef.current) setJobs(false);
        else if (calRef.current) setCalendar(false);
        else if (gearRef.current) setGear(false);
        else if (casinoRef.current) setCasino(false);
        else setMenu((m) => !m);
      }
      if (e.code === 'KeyI' && !e.repeat) setInventory((v) => !v);
      if (e.code === 'KeyJ' && !e.repeat && !world.dialog) setJobs((v) => !v);
      if (e.code === 'KeyG' && !e.repeat && world.job) world.job.toggleAuto();
      if (e.code === 'KeyP' && !e.repeat && world.job) world.job.toggleAutoPatrol();
      if (e.code === 'KeyT' && !e.repeat && !world.dialog) setGear((v) => !v);
      // F3: 성능 표시기 (FPS·그리기 횟수·메모리)
      if (e.code === 'F3') {
        e.preventDefault();
        if (!e.repeat) perfOn = !perfOn;
        probe.setPinging(perfOn);
        if (perfRef.current) perfRef.current.style.display = perfOn ? 'block' : 'none';
      }
    };
    window.addEventListener('keydown', onKey);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastKey = '';
    let lastHud = -Infinity;
    let perfOn = false;
    let lastPerf = 0;
    // 로딩 화면: 모델을 다 받고 그래픽(셰이더·텍스처)을 미리 준비한 뒤 시작한다. 그동안 게임 시간은 멈춰 있다
    let ready = false;
    let stage: 'models' | 'shaders' = 'models';
    let lastLoadUi = 0;
    let cancelled = false;
    // 서버에서 받으면 느린 인터넷에선 20초를 넘길 수 있다 — 덜 받은 채 시작하면 모델이 하나씩 뜰 때마다 멈칫하므로
    // 끝까지 기다리고, 받기가 아예 멈춘 경우에만 90초 뒤 그냥 시작한다
    void Promise.race([renderer.warmUp((st) => (stage = st)), new Promise((r) => setTimeout(r, 90000))]).then(() => {
      if (cancelled) return;
      ready = true;
      setLoading(null);
    });

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!ready) {
        last = now;
        if (now - lastLoadUi > 120) {
          lastLoadUi = now;
          setLoading({ stage, ...loadProgress() });
        }
        return;
      }
      const interval = now - last;
      const dt = Math.min(interval, 250) / 1000;
      acc += dt * 1000;
      last = now;
      let steps = 0;
      const t0 = performance.now();
      while (acc >= FRAME_MS && steps < 5) {
        world.step();
        acc -= FRAME_MS;
        steps++;
      }
      if (steps === 5) acc = 0;
      const t1 = performance.now();
      renderer.sync(world, makeClock(world.frame, acc / FRAME_MS, world.hitstop > 0, dt));
      const t2 = performance.now();
      link?.tick(now);
      const st = renderer.stats();
      probe.frame({ interval, logic: t1 - t0, draw: t2 - t1, steps, location: world.location, stats: st }, now);

      if (perfOn && now - lastPerf > 500 && perfRef.current) {
        lastPerf = now;
        const s = st;
        const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
        perfRef.current.textContent =
          `FPS ${s.fps.toFixed(0)}  화질 ${s.quality}/5\n` +
          `그리기 ${s.calls}회  삼각형 ${(s.tris / 1000).toFixed(0)}k\n` +
          `지오메트리 ${s.geometries}  텍스처 ${s.textures}  셰이더 ${s.programs}` +
          (mem ? `\nJS 메모리 ${(mem.usedJSHeapSize / 1048576).toFixed(0)}MB` : '') +
          `\n${probe.text(now)}`;
      }

      // 화면 위 글자(HUD)는 0.08초마다만 새로 만든다 (매 프레임 비교하던 것을 줄여서 가볍게)
      const hudDue = now - lastHud >= 80 || world.jobPanelRequest || world.calendarRequest || world.casinoRequest;
      const h: CityHud | null = !hudDue ? null : {
        location: world.location,
        floor: world.floor,
        clock: world.clock,
        day: world.day,
        daylight: Math.round(world.daylight * 10) / 10,
        prompt: world.promptLabel,
        job: world.job
          ? {
              name: `${world.job.job.icon} ${world.job.job.name}`,
              left: fmtFrames(world.job.remainingFrames),
              checked: world.job.checked,
              pay: world.job.earnedBase + world.job.bonus,
              alert: world.job.alert,
              auto: world.job.autoCheck,
              fighting: !!world.job.robber,
              autoPatrol: world.job.autoPatrol,
              hunt: !!world.job.hunt,
            }
          : null,
        payslip: world.payslip && world.frame < world.payslip.until ? world.payslip.text : null,
        jobPanelRequest: world.jobPanelRequest,
        toast: world.toast?.text ?? null,
        police: world.policeStatus,
        caught: world.caughtAt !== null,
        gold: profile.gold,
        hp: world.player.hp,
        maxHp: world.player.maxHp,
        downed: world.downedAt !== null,
        attackers: world.npcs.filter((n) => n.fight > 0).length,
        fatigue: Math.round(profile.life.fatigue),
        hunger: Math.round(profile.life.hunger),
        hungerRate: Math.round(world.hungerRate * 10) / 10,
        care: world.careLabel,
        dialog: world.dialog?.shop ?? null,
        npcChat: world.npcChat?.npc ?? null,
        elevator: world.elevatorOpen
          ? { top: world.villaFloors, here: world.location === 'lobby' ? 1 : world.floor, mine: Number(world.homeUnit.slice(0, -2)) || 0 }
          : null,
        lookOut: world.lookingOut,
        place: world.placeLabel,
        online: link ? { status: link.status, friends: link.friends, ping: link.ping === null ? null : Math.round(link.ping) } : null,
        sleep: world.sleepView?.phase ?? null,
        night: Math.round((world.sleepView?.night ?? 0) * 100) / 100,
      };
      if (world.jobPanelRequest) {
        world.jobPanelRequest = false;
        setJobs(true);
      }
      if (world.calendarRequest) {
        world.calendarRequest = false;
        setCalendar(true);
      }
      if (world.casinoRequest) {
        world.casinoRequest = false;
        setCasino(true);
      }
      if (h) {
        lastHud = now;
        const key = JSON.stringify(h);
        if (key !== lastKey) {
          lastKey = key;
          setHud(h);
        }
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      kb.detach();
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      detachZoom();
      link?.stop();
      probe.dispose();
      renderer.dispose();
      worldRef.current = null;
    };
  }, [profile, account]);

  const night = hud ? hud.daylight < 0.5 : false;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <canvas ref={canvasRef} className="block h-full w-full" />
      {loading && <LoadingScreen {...loading} />}
      <div
        ref={perfRef}
        style={{ display: 'none' }}
        className="pointer-events-none absolute bottom-2 right-2 z-50 whitespace-pre rounded bg-black/70 px-2 py-1 font-mono text-[11px] leading-tight text-lime-300"
      />

      {hud && (
        <div className="pointer-events-none absolute inset-0 select-none">
          {/* 위치 · 시간 · 돈 */}
          <div className="absolute left-4 top-4 rounded-lg border border-white/15 bg-black/45 px-4 py-3 backdrop-blur-sm">
            <div className="text-xs text-white/60">{hud.place}</div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-3xl font-black tabular-nums">{hud.clock}</span>
              <span className="text-sm">{night ? '🌙' : '☀️'}</span>
              <span className="text-xs text-white/60">{shortDay(hud.day)}</span>
            </div>
            <div className="mt-1 text-sm">
              <span className="text-amber-300">Lv.{profile.level}</span>
              <span className="ml-3 text-amber-200">{hud.gold.toLocaleString()} G</span>
            </div>
            <HpBar hp={hud.hp} maxHp={hud.maxHp} />
            <LifeBars fatigue={hud.fatigue} hunger={hud.hunger} hungerRate={hud.hungerRate} />
            {hud.online && <OnlineBadge online={hud.online} />}
          </div>

          <Minimap worldRef={worldRef} />

          {/* 상호작용 안내 */}
          {hud.prompt && (
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 rounded-full border border-amber-300/50 bg-black/60 px-5 py-2 text-sm">
              <kbd className="mr-2 rounded bg-amber-300 px-1.5 py-0.5 text-xs font-black text-black">E</kbd>
              {hud.prompt}
            </div>
          )}
          {hud.police && (
            <div className="absolute left-1/2 top-4 -translate-x-1/2 animate-pulse rounded-lg border border-red-400/60 bg-gradient-to-r from-red-900/80 to-blue-900/80 px-5 py-2 text-sm font-bold">
              {hud.police}
            </div>
          )}
          {hud.attackers > 0 && !hud.police && (
            <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-lg border border-orange-400/60 bg-orange-900/70 px-5 py-2 text-sm font-bold">
              😠 행인 {hud.attackers}명이 덤비고 있다! 맞서 싸우거나 {bindLabel('run')} 로 도망치자
            </div>
          )}
          {hud.downed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
              <div className="text-5xl font-black text-orange-300">💫 쓰러졌습니다</div>
              <div className="mt-3 text-white/80">잠시 후 집에서 깨어납니다…</div>
            </div>
          )}
          {hud.caught && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
              <div className="text-5xl font-black text-red-400">🚔 경찰에게 잡혔습니다</div>
              <div className="mt-3 text-white/80">잠시 후 집 앞에서 다시 시작합니다…</div>
            </div>
          )}
          <SleepOverlay hud={hud} />
          {hud.care && (
            <div className="absolute bottom-40 left-1/2 -translate-x-1/2 rounded-full border border-emerald-300/50 bg-emerald-900/70 px-5 py-2 text-sm font-bold">
              🤖 {hud.care}
            </div>
          )}
          {hud.job && (
            <div className="absolute left-4 top-[230px] w-64 rounded-lg border border-sky-400/40 bg-black/60 p-3 text-sm">
              <div className="flex justify-between font-bold">
                <span>{hud.job.name} 근무 중</span>
                <span className="tabular-nums text-sky-300">{hud.job.left}</span>
              </div>
              <div className="mt-1 text-xs text-white/70">
                확인 {hud.job.checked}명 · 번 돈 <span className="text-amber-200">{hud.job.pay}G</span>
              </div>
              <button
                onClick={() => worldRef.current?.job?.toggleAuto()}
                className={`pointer-events-auto mt-2 w-full rounded px-2 py-1 text-xs font-bold ${
                  hud.job.auto ? (hud.job.fighting ? 'bg-red-500/80 text-white' : 'bg-emerald-500/80 text-black') : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
              >
                {hud.job.auto ? (hud.job.fighting ? '🤖 자동 체크 일시정지 — 전투 중!' : '🤖 자동 체크 ON') : '🤖 자동 체크 OFF'} <span className="opacity-70">(G)</span>
              </button>
              <button
                onClick={() => worldRef.current?.job?.toggleAutoPatrol()}
                className={`pointer-events-auto mt-1 w-full rounded px-2 py-1 text-xs font-bold ${
                  hud.job.autoPatrol ? (hud.job.hunt ? 'animate-pulse bg-red-500/80 text-white' : 'bg-sky-500/80 text-black') : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
              >
                {hud.job.autoPatrol ? (hud.job.hunt ? '🔦 자동 순찰 멈춤 — 강도 수색!' : '🔦 자동 순찰 ON') : '🔦 자동 순찰 OFF'} <span className="opacity-70">(P)</span>
              </button>
              {hud.job.alert && <div className={`mt-1.5 animate-pulse text-xs font-bold ${hud.job.hunt ? 'text-red-300' : 'text-orange-300'}`}>{hud.job.alert}</div>}
            </div>
          )}
          {hud.job?.hunt && (
            <div className="pointer-events-none absolute inset-0 animate-pulse border-[6px] border-red-500/60" />
          )}
          {hud.payslip && (
            <div className="absolute left-1/2 top-40 -translate-x-1/2 rounded-lg border border-amber-300/50 bg-black/80 px-5 py-3 text-sm font-bold">
              {hud.payslip}
            </div>
          )}
          {hud.toast && (
            <div className="absolute left-1/2 top-24 -translate-x-1/2 rounded-lg bg-black/70 px-5 py-2.5 text-base font-bold shadow-lg">
              {hud.toast}
            </div>
          )}

          <div className="absolute bottom-4 left-4 rounded bg-black/45 px-3 py-2 text-xs leading-5 text-white/80">
            <div>
              방향키 걷기 (두 번 톡 = 대시, 대시 중 {bindLabel('b2')}/{bindLabel('b4')} = 대시기) · {bindLabel('run')} 달리기 · {bindLabel('jump')} 점프 · {bindLabel('interact')} 상호작용
            </div>
            <div>
              {bindLabel('b1')} 왼팔 · {bindLabel('b2')} 오른팔 · {bindLabel('b3')} 왼다리 · {bindLabel('b4')} 오른다리 ({bindLabel('run')} = 아래) · Esc 메뉴에서 키 설정
            </div>
            <div>싸울 때 ↓ 숙이기 (상단 공격 피하기)</div>
            <div>M 전체 지도 (누르면 자동 이동) · J 일자리 · T 장비 · I 인벤토리 · 휠 / Ctrl+휠 줌 (Ctrl+0 원래대로) · Esc 메뉴</div>
          </div>
        </div>
      )}

      {bigMap && worldRef.current && <CityMapOverlay world={worldRef.current} onClose={() => setBigMap(false)} />}
      {casino && worldRef.current && <CasinoPanel world={worldRef.current} onClose={() => setCasino(false)} />}
      {gear && worldRef.current && <GearPanel world={worldRef.current} onClose={() => setGear(false)} />}
      {calendar && worldRef.current && <CalendarPanel profile={profile} today={worldRef.current.day} onClose={() => setCalendar(false)} />}
      {jobs && worldRef.current && <JobPanel world={worldRef.current} onClose={() => setJobs(false)} />}
      {inventory && <InventoryPanel profile={profile} onClose={() => setInventory(false)} />}
      {hud?.npcChat && worldRef.current && (
        <NpcChatPanel key={hud.npcChat} world={worldRef.current} npcId={hud.npcChat} onClose={() => worldRef.current?.closeNpcChat()} />
      )}
      {hud?.lookOut && (
        <div className="pointer-events-auto absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-zinc-500/50 bg-zinc-900/80 px-5 py-2 text-sm text-zinc-100 shadow-xl">
          <span>🪟 창밖을 보는 중 · 방향키로 둘러보기</span>
          <button onClick={() => worldRef.current?.stopLookOut()} className="rounded-full bg-zinc-700 px-3 py-1 text-xs hover:bg-zinc-600">
            돌아오기 (E / Esc)
          </button>
          <button onClick={() => worldRef.current?.stopLookOut(true)} className="rounded-full bg-zinc-700 px-3 py-1 text-xs hover:bg-zinc-600">
            창문 닫기 (C)
          </button>
        </div>
      )}
      {hud?.elevator && worldRef.current && <ElevatorPanel {...hud.elevator} onPick={(f) => worldRef.current?.rideElevator(f)} onClose={() => worldRef.current?.closeElevator()} />}
      {hud?.dialog && worldRef.current && (
        <ShopDialog key={hud.dialog} world={worldRef.current} onClose={() => worldRef.current?.closeDialog()} />
      )}

      {keys && <KeySettings onClose={() => setKeys(false)} />}
      {menu && !keys && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex w-64 flex-col gap-3 rounded-lg border border-white/20 bg-zinc-900/90 p-6">
            <div className="mb-2 text-center text-xl font-bold">메뉴</div>
            <button onClick={() => setMenu(false)} className="rounded bg-amber-500 py-2 font-bold text-black hover:bg-amber-400">
              계속하기
            </button>
            <button onClick={() => setKeys(true)} className="rounded bg-white/10 py-2 hover:bg-white/20">
              ⌨️ 키 설정
            </button>
            <button onClick={onExit} className="rounded bg-white/10 py-2 hover:bg-white/20">
              메인 메뉴
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 오른쪽 위 미니맵: 도로·건물·한강을 한 번 그려두고, 플레이어 위치만 매 프레임 갱신 */
function Minimap({ worldRef }: { worldRef: React.RefObject<CityWorld | null> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const g = cv.getContext('2d')!;
    const W = cv.width;
    const H = cv.height;
    // 도시 범위 → 미니맵 좌표
    const X0 = -115;
    const X1 = 115;
    const Z0 = -85;
    const Z1 = 80;
    const sx = (x: number) => ((x - X0) / (X1 - X0)) * W;
    const sz = (z: number) => ((z - Z0) / (Z1 - Z0)) * H;
    let base: ImageData | null = null;
    let raf = 0;

    const drawBase = (w: CityWorld) => {
      const m = w.map;
      g.fillStyle = '#5d6b55';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#7fae63';
      g.fillRect(0, sz(m.parkZ[0]), W, sz(m.parkZ[1]) - sz(m.parkZ[0]));
      g.fillStyle = '#2f6f9f';
      g.fillRect(0, sz(m.riverZ), W, H);
      g.fillStyle = '#3a3d42';
      for (const r of m.roads) {
        if (r.axis === 'x') g.fillRect(0, sz(r.at - r.width / 2), W, Math.max(2, (r.width / (Z1 - Z0)) * H));
        else g.fillRect(sx(r.at - r.width / 2), 0, Math.max(2, (r.width / (X1 - X0)) * W), sz(r.to));
      }
      g.fillRect(sx(m.bridgeX - 4), sz(m.riverZ), Math.max(2, (8 / (X1 - X0)) * W), H);
      for (const b of m.buildings) {
        g.fillStyle = b.kind === 'home' ? '#ffb84d' : b.kind === 'shop' ? '#d0b48c' : '#c8c8c8';
        g.fillRect(sx(b.x - b.w / 2), sz(b.z - b.d / 2), (b.w / (X1 - X0)) * W, (b.d / (Z1 - Z0)) * H);
      }
      for (const t of m.trails) {
        g.strokeStyle = '#c0624a';
        g.lineWidth = 2;
        g.beginPath();
        t.path.forEach((pt, i) => (i ? g.lineTo(sx(pt.x), sz(pt.z)) : g.moveTo(sx(pt.x), sz(pt.z))));
        g.closePath();
        g.stroke();
        g.fillStyle = '#4f9ccf';
        g.beginPath();
        g.arc(sx(t.pond.x), sz(t.pond.z), 2.5, 0, Math.PI * 2);
        g.fill();
      }
      for (const p of m.pois) {
        if (p.kind === 'subway' || p.kind === 'bus') {
          g.fillStyle = p.kind === 'subway' ? '#2e9e4f' : '#2f6fd8';
          g.fillRect(sx(p.x) - 2, sz(p.z) - 2, 4, 4);
        }
      }
      base = g.getImageData(0, 0, W, H);
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const w = worldRef.current;
      if (!w) return;
      if (!base) drawBase(w);
      g.putImageData(base!, 0, 0);
      if (w.location !== 'city') {
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#ffd27a';
        g.font = 'bold 13px sans-serif';
        g.textAlign = 'center';
        g.fillText(w.location === 'home' ? '집 안' : w.location === 'lobby' ? '행복빌라 1층' : `행복빌라 ${w.floor}층`, W / 2, H / 2 + 4);
        return;
      }
      const p = w.player;
      g.fillStyle = '#ff4d4d';
      g.strokeStyle = '#fff';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(sx(p.x), sz(p.z), 4, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(sx(p.x), sz(p.z));
      g.lineTo(sx(p.x + p.fx * 6), sz(p.z + p.fz * 6));
      g.stroke();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [worldRef]);

  return (
    <div className="absolute right-4 top-4 overflow-hidden rounded-lg border border-white/20 bg-black/40">
      <canvas ref={ref} width={210} height={150} className="block" />
      <div className="px-2 py-0.5 text-[10px] text-white/60">● 나 &nbsp; ■ 내 집 &nbsp; ■ 지하철 &nbsp; ■ 버스</div>
    </div>
  );
}

/** 잠자는 동안: 위아래 검은 띠 + 빠르게 흐르는 시계 + 밤→아침 진행 막대 */
function SleepOverlay({ hud }: { hud: CityHud }) {
  const on = hud.sleep === 'sleep';
  const show = hud.sleep === 'lie' || hud.sleep === 'sleep' || hud.sleep === 'wake';
  if (!show) return null;
  return (
    <div className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${on ? 'opacity-100' : 'opacity-0'}`}>
      <div className="absolute inset-x-0 top-0 h-[11%] bg-black/90" />
      <div className="absolute inset-x-0 bottom-0 h-[11%] bg-black/90" />
      <div className="absolute left-1/2 top-[14%] -translate-x-1/2 text-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
        <div className="text-7xl font-black tabular-nums tracking-wider">{hud.clock}</div>
        <div className="mt-1 text-base text-white/80">{shortDay(hud.day)} · 쿨쿨 자는 중</div>
        <div className="mt-3 flex items-center justify-center gap-2 text-lg">
          <span>🌙</span>
          <div className="h-2 w-72 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-pink-300 to-amber-300" style={{ width: `${hud.night * 100}%` }} />
          </div>
          <span>☀️</span>
        </div>
      </div>
      <div className="absolute left-[56%] top-[40%] animate-bounce text-4xl font-black text-sky-200/90">
        Z<span className="text-2xl">z</span><span className="text-xl">z</span>
      </div>
    </div>
  );
}

/** 플레이어 체력: 레벨이 오를수록 최대치가 늘고, 쉬거나 자면 다시 찬다 */
function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const r = Math.max(0, hp) / maxHp;
  const color = r > 0.5 ? 'from-emerald-600 to-emerald-400' : r > 0.25 ? 'from-amber-600 to-amber-400' : 'from-red-700 to-red-500';
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[11px] text-white/70">
        <span className="font-bold text-white/90">HP</span>
        <span className="tabular-nums">
          {Math.max(0, hp)} / {maxHp}
        </span>
      </div>
      <div className="mt-0.5 h-3 w-48 overflow-hidden rounded-sm bg-black/60">
        <div className={`h-full bg-gradient-to-r ${color} transition-[width] duration-200 ${r <= 0.25 ? 'animate-pulse' : ''}`} style={{ width: `${r * 100}%` }} />
      </div>
    </div>
  );
}

function fmtFrames(frames: number) {
  const sec = Math.ceil(frames / 60);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** 처음 들어올 때 로딩 화면: 받은 개수와 준비 단계 */
function LoadingScreen({ stage, done, total }: { stage: 'models' | 'shaders'; done: number; total: number }) {
  // 모델 받기 90% + 그래픽 준비 10%
  const pct = stage === 'shaders' ? 95 : total ? Math.round((done / total) * 90) : 0;
  return (
    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-gradient-to-b from-zinc-950 via-[#0b0d17] to-black">
      <div className="text-3xl font-black tracking-widest text-white">서울 · 내 집</div>
      <div className="mt-2 text-sm text-white/50">{stage === 'models' ? `건물·사람·가구 불러오는 중… (${done}/${total})` : '그래픽 준비 중… (처음 한 번만 조금 걸려요)'}</div>
      <div className="mt-5 h-2 w-72 max-w-[80vw] overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-amber-300 transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** 마을 접속 상태: 접속한 친구 수·이름과 친구까지의 핑 */
function OnlineBadge({ online }: { online: NonNullable<CityHud['online']> }) {
  const { status, friends, ping } = online;
  const dot = status === 'online' ? '🟢' : status === 'connecting' ? '🟡' : '🔴';
  const label = status === 'online' ? (friends.length ? `친구 ${friends.length}명 접속` : '마을 접속 (혼자)') : status === 'connecting' ? '마을 접속 중…' : '마을 연결 끊김';
  const pingColor = ping === null ? '' : ping < 80 ? 'text-lime-300' : ping < 160 ? 'text-amber-300' : 'text-red-400';
  return (
    <div className="mt-2 border-t border-white/10 pt-1.5 text-xs">
      <div>
        {dot} {label}
        {ping !== null && <span className={`ml-2 font-bold tabular-nums ${pingColor}`}>핑 {ping}ms</span>}
      </div>
      {friends.length > 0 && <div className="mt-0.5 max-w-[220px] truncate text-white/60">{friends.join(', ')}</div>}
    </div>
  );
}

/** 엘리베이터 버튼판: 누르면 그 층으로 */
function ElevatorPanel({ top, here, mine, onPick, onClose }: { top: number; here: number; mine: number; onPick: (f: number) => void; onClose: () => void }) {
  const floors = Array.from({ length: top }, (_, i) => top - i);
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-56 rounded-xl border border-zinc-500/50 bg-zinc-800/95 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 text-center text-sm font-bold text-zinc-100">🛗 행복빌라 엘리베이터</div>
        <div className="mb-3 text-center text-xs text-zinc-400">지금 {here === 1 ? '1층 로비' : `${here}층`} · 숫자 키로도 고를 수 있어요</div>
        <div className="grid grid-cols-2 gap-2">
          {floors.map((f) => (
            <button
              key={f}
              disabled={f === here}
              onClick={() => onPick(f)}
              className={`rounded-full border py-2 text-sm font-bold transition ${
                f === here
                  ? 'cursor-default border-amber-400 bg-amber-400/20 text-amber-300'
                  : 'border-zinc-500 bg-zinc-700 text-zinc-100 hover:border-amber-300 hover:bg-zinc-600'
              }`}
            >
              {f === 1 ? '1 로비' : f}
              {f === mine && <span className="ml-1 text-xs">🏠</span>}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-3 w-full rounded bg-zinc-700 py-1.5 text-xs text-zinc-300 hover:bg-zinc-600">
          닫기 (Esc)
        </button>
      </div>
    </div>
  );
}
