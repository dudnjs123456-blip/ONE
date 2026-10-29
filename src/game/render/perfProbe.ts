import { onProfileSaved } from '../core/profile';
import { loadProgress } from './loadTracker';

/** 이보다 오래 걸린 프레임을 '끊김'으로 기록한다 (60fps 한 프레임 = 16.7ms) */
const SPIKE_MS = 50;
const KEEP = 6;
const WINDOW_MS = 60_000;

interface Spike {
  at: number;
  ms: number;
  logic: number;
  draw: number;
  why: string[];
}

interface FrameInfo {
  /** 이전 프레임부터 지난 시간 */
  interval: number;
  /** 게임 로직(world.step) 시간 / 그리기(renderer.sync) 시간 */
  logic: number;
  draw: number;
  steps: number;
  location: string;
  stats: { programs: number; textures: number; geometries: number; quality: number };
}

/**
 * 끊김 측정기 (F3): 오래 걸린 프레임마다 그 순간에 있었던 일을 같이 적어 둔다.
 * 항상 기록하므로, 끊긴 뒤에 F3 을 눌러도 직전 기록이 보인다. 핑은 F3 이 켜져 있을 때만 잰다.
 */
export class PerfProbe {
  private spikes: Spike[] = [];
  private recent: number[] = [];
  private prev: FrameInfo['stats'] | null = null;
  private prevLoc = '';
  private prevHeap = 0;
  private prevLoaded = 0;
  private saved = false;
  private hiddenSince = false;
  private intervals: number[] = [];
  private ping = { web: null as number | null, db: null as number | null, err: '' };
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private offSave = onProfileSaved(() => (this.saved = true));
  private onVis = () => {
    if (document.hidden) this.hiddenSince = true;
  };

  constructor() {
    document.addEventListener('visibilitychange', this.onVis);
  }

  frame(f: FrameInfo, now: number) {
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
    const loaded = loadProgress().done;
    this.intervals.push(f.interval);
    if (this.intervals.length > 300) this.intervals.shift();

    if (f.interval >= SPIKE_MS && this.prev) {
      const why: string[] = [];
      const s = f.stats;
      if (this.hiddenSince || f.interval > 1000) why.push('탭이 가려졌다 돌아옴');
      if (s.programs > this.prev.programs) why.push(`셰이더 새로 만듦 +${s.programs - this.prev.programs}`);
      if (s.textures > this.prev.textures) why.push(`텍스처 올림 +${s.textures - this.prev.textures}`);
      if (s.geometries > this.prev.geometries + 3) why.push(`모델 추가 +${s.geometries - this.prev.geometries}`);
      if (s.quality !== this.prev.quality) why.push(`화질 변경 ${this.prev.quality}→${s.quality}`);
      if (f.location !== this.prevLoc) why.push('장소 이동');
      if (loaded > this.prevLoaded) why.push('파일 받기 끝남');
      if (this.saved) why.push('저장');
      if (this.prevHeap && heap < this.prevHeap - 3 * 1048576) why.push(`메모리 정리 ${((this.prevHeap - heap) / 1048576).toFixed(0)}MB`);
      if (f.logic > 12) why.push(`게임 로직 느림 (${f.steps}스텝)`);
      if (f.draw > 25) why.push('그리기 느림');
      if (!why.length) why.push('원인 표시 없음 (브라우저·그래픽 카드 쪽)');
      this.spikes.push({ at: now, ms: f.interval, logic: f.logic, draw: f.draw, why });
      if (this.spikes.length > KEEP) this.spikes.shift();
      this.recent.push(now);
    }
    while (this.recent.length && now - this.recent[0] > WINDOW_MS) this.recent.shift();
    this.prev = { ...f.stats };
    this.prevLoc = f.location;
    this.prevHeap = heap;
    this.prevLoaded = loaded;
    this.saved = false;
    this.hiddenSince = false;
  }

  /** F3 을 켜고 끌 때: 켜져 있는 동안만 5초마다 핑을 잰다 */
  setPinging(on: boolean) {
    if (on && !this.pingTimer) {
      void this.measurePing();
      this.pingTimer = setInterval(() => void this.measurePing(), 5000);
    } else if (!on && this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  text(now: number): string {
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const avg = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
    const p99 = sorted.length ? sorted[Math.floor(sorted.length * 0.99)] : 0;
    const fmt = (v: number | null) => (v === null ? '…' : `${Math.round(v)}ms`);
    const lines = [
      `핑  사이트 ${fmt(this.ping.web)}  ·  Supabase ${fmt(this.ping.db)}${this.ping.err ? `  (${this.ping.err})` : ''}`,
      `프레임 평균 ${avg.toFixed(1)}ms · 느린 1% ${p99.toFixed(0)}ms · 최근 1분 끊김 ${this.recent.length}번`,
    ];
    if (this.spikes.length) lines.push('— 최근 끊김 (50ms 이상) —');
    for (const s of [...this.spikes].reverse()) {
      const ago = Math.round((now - s.at) / 1000);
      lines.push(`${ago}초 전 ${Math.round(s.ms)}ms (로직 ${s.logic.toFixed(0)} · 그리기 ${s.draw.toFixed(0)}) ${s.why.join(', ')}`);
    }
    return lines.join('\n');
  }

  dispose() {
    this.setPinging(false);
    this.offSave();
    document.removeEventListener('visibilitychange', this.onVis);
  }

  private async measurePing() {
    // 가장 작은 요청 두 개의 왕복 시간: 이 사이트(Vercel)와 Supabase 서버
    const time = async (url: string, init?: RequestInit) => {
      const t0 = performance.now();
      await fetch(url, { cache: 'no-store', ...init });
      return performance.now() - t0;
    };
    try {
      this.ping.web = await time(`/favicon.ico?ping=${Date.now()}`, { method: 'HEAD' });
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (url && key) this.ping.db = await time(`${url}/auth/v1/health`, { headers: { apikey: key } });
      this.ping.err = '';
    } catch {
      this.ping.err = '연결 실패';
    }
  }
}
