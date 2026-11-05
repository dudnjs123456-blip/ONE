import {
  MAX_PETS,
  PET_BY_ID,
  PET_GOOD_BY_ID,
  agePet,
  catchUpPets,
  newPet,
  type OwnedPet,
  type PetState,
} from '../data/pets';
import { saveProfile, type PlayerProfile } from '../core/profile';

/**
 * 내 애완동물 돌보기 (펫샵 분양 · 밥 · 놀아주기 · 목욕 · 산책).
 *  - 집(내 집)에선 키우는 아이들이 모두 방 안을 돌아다닌다
 *  - '산책 친구' 로 고른 한 마리는 밖에서도 나를 졸졸 따라온다 (새는 어깨 위에서 날갯짓)
 *  - 실제 시간이 흐르면 배고파지고 지저분해지고 심심해진다 (게임을 끈 동안은 절반 속도)
 */

/** 화면에 그릴 펫 하나의 위치·자세 */
export interface PetPose {
  pet: OwnedPet;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** 0~1 걷는 정도 */
  moving: number;
}

export interface PetStepContext {
  frame: number;
  location: string;
  /** 남의 집에 놀러 간 중이면 그 친구 id */
  homeOwner: string | null;
  px: number;
  pz: number;
  /** 플레이어가 보는 방향 */
  fx: number;
  fz: number;
  /** 집 안: 가구 등으로 막혀 있나 */
  blockedAtHome: (x: number, z: number) => boolean;
  homeRoom: { x0: number; x1: number; z0: number; z1: number };
  /** 벽·가구·건물·차도에 막히게 (밀어낸 위치) */
  collide: (x: number, z: number) => { x: number; z: number };
}

interface Motion {
  x: number;
  z: number;
  y: number;
  yaw: number;
  moving: number;
  /** 집 안에서 걸어가는 목표 / 다음 출발까지 남은 프레임 */
  tx: number;
  tz: number;
  wait: number;
  /** 지금 어느 장소에 있나 (장소가 바뀌면 새로 자리 잡는다) */
  at: string;
  /** 막혀서 못 움직인 프레임 수 */
  stuck: number;
}

const PAT_COOLDOWN = 20 * 60;
const HUNGRY = 80;

export class PetCare {
  private motion = new Map<string, Motion>();
  private patAt = new Map<string, number>();
  private warned = new Set<string>();
  private rnd = Math.random;

  constructor(
    private profile: PlayerProfile,
    private say: (text: string, seconds?: number) => void,
    private speech: (s: { x: number; z: number; text: string; color?: string }) => void,
  ) {
    catchUpPets(profile.pets, Date.now());
  }

  get state(): PetState {
    this.profile.pets ??= { list: [], walking: null };
    return this.profile.pets;
  }

  get list(): OwnedPet[] {
    return this.profile.pets?.list ?? [];
  }

  get walking(): OwnedPet | null {
    const id = this.profile.pets?.walking;
    return id ? (this.list.find((p) => p.id === id) ?? null) : null;
  }

  /** 지금 화면에 보일 펫들 */
  poses: PetPose[] = [];

  // ───────────── 매 프레임 ─────────────

  step(c: PetStepContext) {
    const list = this.list;
    if (!list.length) {
      this.poses = [];
      return;
    }
    // 1초마다 실제 시간만큼 수치 변화
    if (c.frame % 60 === 0) {
      const now = Date.now();
      for (const p of list) {
        // 같이 산책 중이면 덜 심심하지만 더 배고프다
        const out = this.walking === p && c.location !== 'home';
        agePet(p, (1 / 3600) * (out ? 1.4 : 1));
        if (out) p.joy = Math.min(100, p.joy + 10 / 60);
        p.updatedAt = now;
        if (p.hunger > HUNGRY && !this.warned.has(p.id)) {
          this.warned.add(p.id);
          this.say(`${PET_BY_ID[p.species]?.icon ?? '🐾'} ${p.name}이(가) 배고파해요 — 사료를 주세요 (K)`, 3.5);
        }
        if (p.hunger < HUNGRY - 10) this.warned.delete(p.id);
      }
    }

    const atMyHome = c.location === 'home' && !c.homeOwner;
    const walker = this.walking;
    const shown = atMyHome ? list : walker && PET_BY_ID[walker.species]?.walks ? [walker] : [];
    const poses: PetPose[] = [];
    for (const p of shown) {
      const sp = PET_BY_ID[p.species];
      if (!sp) continue;
      let m = this.motion.get(p.id);
      const follow = !atMyHome || p === walker;
      if (!m || m.at !== c.location) {
        // 장소가 바뀌었다: 따라오는 아이는 내 뒤에, 집 아이들은 빈 자리에
        const spot = follow ? { x: c.px - c.fx * 0.8, z: c.pz - c.fz * 0.8 } : this.freeSpot(c);
        m = { x: spot.x, z: spot.z, y: 0, yaw: this.rnd() * Math.PI * 2, moving: 0, tx: spot.x, tz: spot.z, wait: 60 + this.rnd() * 240, at: c.location, stuck: 0 };
        this.motion.set(p.id, m);
      }
      const bird = sp.body === 'bird';
      if (follow) {
        // 내 뒤 살짝 오른쪽 (여러 마리여도 겹치지 않게 조금씩 다르게)
        const rx = c.fz;
        const rz = -c.fx;
        const side = bird ? 0.22 : 0.55;
        const back = bird ? 0.05 : 0.9;
        m.tx = c.px - c.fx * back + rx * side;
        m.tz = c.pz - c.fz * back + rz * side;
      } else if (m.wait > 0) {
        m.wait--;
      } else if (Math.hypot(m.tx - m.x, m.tz - m.z) < 0.1) {
        const s = this.freeSpot(c);
        m.tx = s.x;
        m.tz = s.z;
        m.wait = 120 + this.rnd() * 360;
      }
      const dx = m.tx - m.x;
      const dz = m.tz - m.z;
      const d = Math.hypot(dx, dz);
      // 멀어지면 뛰어서 따라붙고, 너무 멀면(문을 지나갔다 등) 바로 옆으로
      if (follow && (d > 10 || m.stuck > 120)) {
        // 너무 멀거나 한참 막혀 있으면 주인 곁으로
        const c2 = c.collide(m.tx, m.tz);
        m.x = c2.x;
        m.z = c2.z;
        m.stuck = 0;
      } else {
        const base = (follow ? 0.05 : 0.018) * sp.speed;
        const speed = follow ? base * (d > 2.5 ? 2.6 : d > 1.2 ? 1.6 : 1) : base;
        const stopAt = follow ? (bird ? 0.02 : 0.35) : 0.05;
        if (d > stopAt && (follow || m.wait <= 0)) {
          const k = Math.min(d, speed) / d;
          // 벽·가구·건물은 뚫고 지나가지 못한다
          const c2 = c.collide(m.x + dx * k, m.z + dz * k);
          // 가구에 막혀 거의 못 움직이면: 집에선 다른 곳으로, 따라갈 땐 잠시 뒤 주인 곁으로
          const moved = Math.hypot(c2.x - m.x, c2.z - m.z);
          m.stuck = moved < speed * 0.25 ? m.stuck + 1 : 0;
          if (!follow && m.stuck > 40) {
            m.stuck = 0;
            m.wait = 30;
            const s = this.freeSpot(c);
            m.tx = s.x;
            m.tz = s.z;
          }
          m.x = c2.x;
          m.z = c2.z;
          const want = Math.atan2(dx, dz);
          m.yaw += Math.atan2(Math.sin(want - m.yaw), Math.cos(want - m.yaw)) * 0.2;
          m.moving = Math.min(1, m.moving + 0.15);
        } else {
          m.moving = Math.max(0, m.moving - 0.1);
          if (follow && !bird) {
            // 멈추면 주인 쪽을 본다
            const want = Math.atan2(c.px - m.x, c.pz - m.z);
            m.yaw += Math.atan2(Math.sin(want - m.yaw), Math.cos(want - m.yaw)) * 0.08;
          }
        }
      }
      // 새: 따라다닐 땐 어깨 높이로 날고, 집에선 바닥을 콩콩
      const wantY = bird && follow ? 1.45 : 0;
      m.y += (wantY - m.y) * 0.1;
      if (bird && follow) m.moving = Math.max(m.moving, d > 0.15 ? 1 : 0.15);
      poses.push({ pet: p, x: m.x, y: m.y, z: m.z, yaw: m.yaw, moving: m.moving });
    }
    this.poses = poses;
  }

  /** 집 안의 빈 바닥 한 곳 */
  private freeSpot(c: PetStepContext) {
    const r = c.homeRoom;
    for (let k = 0; k < 40; k++) {
      const x = r.x0 + 0.5 + this.rnd() * (r.x1 - r.x0 - 1);
      const z = r.z0 + 0.5 + this.rnd() * (r.z1 - r.z0 - 1);
      if (!c.blockedAtHome(x, z)) return { x, z };
    }
    return { x: 0, z: 1 };
  }

  // ───────────── 펫샵 · 돌보기 (UI 에서 부른다) ─────────────

  adopt(speciesId: string, name: string, coat = 0): { ok: boolean; message: string } {
    const sp = PET_BY_ID[speciesId];
    if (!sp) return { ok: false, message: '없는 아이예요' };
    const st = this.state;
    if (st.list.length >= MAX_PETS) return { ok: false, message: `원룸이라 ${MAX_PETS}마리까지만 키울 수 있어요` };
    if (this.profile.gold < sp.price) return { ok: false, message: `분양비가 모자라요 (${sp.price.toLocaleString()}G)` };
    const nm = name.trim().slice(0, 10) || sp.name;
    this.profile.gold -= sp.price;
    const p = newPet(sp.id, nm, Date.now(), coat);
    st.list.push(p);
    // 처음 데려온 아이는 바로 산책 친구로
    if (!st.walking && sp.walks) st.walking = p.id;
    saveProfile(this.profile);
    return { ok: true, message: `${sp.icon} ${nm}이(가) 가족이 되었어요! 잘 부탁해요` };
  }

  buyGood(goodId: string, n = 1): { ok: boolean; message: string } {
    const g = PET_GOOD_BY_ID[goodId];
    if (!g) return { ok: false, message: '없는 상품이에요' };
    const cost = g.price * n;
    if (this.profile.gold < cost) return { ok: false, message: `돈이 모자라요 (${cost}G)` };
    this.profile.gold -= cost;
    this.profile.inventory[g.id] = (this.profile.inventory[g.id] ?? 0) + n;
    saveProfile(this.profile);
    return { ok: true, message: `${g.icon} ${g.name} ${n}개를 샀어요` };
  }

  /** 용품 쓰기 (사료 주기 · 간식 · 장난감 · 목욕) */
  use(petId: string, goodId: string): { ok: boolean; message: string } {
    const p = this.list.find((q) => q.id === petId);
    const g = PET_GOOD_BY_ID[goodId];
    if (!p || !g) return { ok: false, message: '…' };
    const have = this.profile.inventory[g.id] ?? 0;
    if (have <= 0) return { ok: false, message: `${g.name}이(가) 없어요 — 펫샵에서 사 오세요` };
    if (g.hunger && p.hunger < 5 && !g.joy) return { ok: false, message: `${p.name}은(는) 배가 불러요` };
    this.profile.inventory[g.id] = have - 1;
    if (g.hunger) p.hunger = Math.max(0, p.hunger - g.hunger);
    if (g.joy) p.joy = Math.max(0, Math.min(100, p.joy + g.joy));
    if (g.clean) p.clean = Math.min(100, p.clean + g.clean);
    this.cheer(p, g.clean ? '🫧' : g.hunger ? '😋' : '💕');
    saveProfile(this.profile);
    const verb = g.clean ? '목욕시켰어요' : g.id === 'pet-toy' ? '장난감으로 놀아줬어요' : g.id === 'pet-food' ? '사료를 줬어요' : '간식을 줬어요';
    return { ok: true, message: `${p.name}에게 ${verb}` };
  }

  /** 쓰다듬기 (공짜, 20초에 한 번 기분 +8) */
  pat(petId: string): { ok: boolean; message: string } {
    const p = this.list.find((q) => q.id === petId);
    if (!p) return { ok: false, message: '…' };
    const now = performance.now();
    const last = this.patAt.get(p.id) ?? -Infinity;
    this.cheer(p, '💕');
    if (now - last < (PAT_COOLDOWN / 60) * 1000) return { ok: true, message: `${p.name}이(가) 손에 얼굴을 비빈다` };
    this.patAt.set(p.id, now);
    p.joy = Math.min(100, p.joy + 8);
    saveProfile(this.profile);
    return { ok: true, message: `${p.name}을(를) 쓰다듬었어요 (기분 +8)` };
  }

  setWalking(petId: string | null): { ok: boolean; message: string } {
    const st = this.state;
    if (petId === null) {
      st.walking = null;
      saveProfile(this.profile);
      return { ok: true, message: '산책 친구를 집에 두고 다녀요' };
    }
    const p = st.list.find((q) => q.id === petId);
    const sp = p && PET_BY_ID[p.species];
    if (!p || !sp) return { ok: false, message: '…' };
    if (!sp.walks) return { ok: false, message: `${sp.name}은(는) 집에서만 지내는 게 좋아요` };
    st.walking = p.id;
    this.motion.delete(p.id);
    saveProfile(this.profile);
    return { ok: true, message: `${p.name}와(과) 함께 다녀요` };
  }

  rename(petId: string, name: string) {
    const p = this.list.find((q) => q.id === petId);
    const nm = name.trim().slice(0, 10);
    if (!p || !nm) return;
    p.name = nm;
    saveProfile(this.profile);
  }

  /** 다른 가족에게 입양 보내기 */
  release(petId: string): { ok: boolean; message: string } {
    const st = this.state;
    const p = st.list.find((q) => q.id === petId);
    if (!p) return { ok: false, message: '…' };
    st.list = st.list.filter((q) => q !== p);
    if (st.walking === p.id) st.walking = null;
    this.motion.delete(p.id);
    saveProfile(this.profile);
    return { ok: true, message: `${p.name}은(는) 좋은 가족에게 갔어요. 잘 지내렴…` };
  }

  /** 펫 머리 위에 하트 등 */
  private cheer(p: OwnedPet, text: string) {
    const pose = this.poses.find((q) => q.pet === p);
    if (pose) this.speech({ x: pose.x, z: pose.z, text, color: '#ff9ec7' });
  }
}
