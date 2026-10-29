/**
 * 행복빌라 층별 데이터: 층마다 사는 사람, 현관 앞 물건, 문 색, 게시판 글.
 * 복도 모양은 모든 층이 같고, 이 데이터로 층마다 다르게 보이고 다른 이야기를 한다.
 * 친구나 내가 사는 집이면 그 집은 주민 대신 우리 집으로 보인다.
 */

/** 현관 앞에 놓인 물건 (복도 장면에서 그린다) */
export type DoorDeco = 'shoes' | 'umbrella' | 'stroller' | 'bike' | 'plant' | 'boxes' | 'trash' | 'none';

export interface VillaUnit {
  /** 사는 사람 (현관 표지에 쓰는 짧은 이름) */
  resident: string;
  /** 문 앞에서 E 를 누르면 나오는 말들 (번갈아 나온다) */
  notes: string[];
  /** 현관문 색 */
  door: number;
  deco: DoorDeco;
}

export interface VillaFloor {
  floor: number;
  /** 복도 게시판에 붙은 글 */
  notice: string;
  /** 복도 벽 색 (층마다 살짝 다르게) */
  wall: number;
  /** 바닥 색 */
  floorColor: number;
  /** 01호, 02호, 03호 */
  units: [VillaUnit, VillaUnit, VillaUnit];
}

const FLOORS: VillaFloor[] = [
  {
    floor: 2,
    notice: '분리수거는 화·금 저녁 8시 이후에 내놓아 주세요',
    wall: 0xeee8dd,
    floorColor: 0xb7ab98,
    units: [
      { resident: '김순자 할머니', notes: ['TV 소리가 크게 들린다… 아침 드라마를 보시나 보다', '문 앞에 신문이 쌓여 있다', '된장찌개 냄새가 난다'], door: 0x5b3d2b, deco: 'plant' },
      { resident: '이민호 (대학생)', notes: ['기타 치는 소리가 들린다', '택배 상자가 문 앞에 쌓여 있다', '조용하다… 수업 갔나 보다'], door: 0x3d4a5b, deco: 'boxes' },
      { resident: '박씨네 (신혼부부)', notes: ['웃음소리가 들린다', '현관에 커플 운동화가 나란히 있다', '고양이 우는 소리가 난다'], door: 0x6b2f2f, deco: 'shoes' },
    ],
  },
  {
    floor: 3,
    notice: '3층 복도 전등 교체 완료 — 관리실',
    wall: 0xe9e4d6,
    floorColor: 0xad9f8a,
    units: [
      { resident: '최 사장님', notes: ['통화하는 소리가 들린다… "그래서 납품은 언제?"', '골프채 가방이 문 옆에 기대 있다', '조용하다'], door: 0x2f3b2f, deco: 'umbrella' },
      { resident: '정하윤 (직장인)', notes: ['요가 음악이 흘러나온다', '조용하다… 야근 중인가 보다', '현관에 우산이 세 개나 걸려 있다'], door: 0x5b3d2b, deco: 'umbrella' },
      { resident: '한씨네 (아이 둘)', notes: ['아이들 뛰는 소리가 쿵쿵 들린다', '"숙제 다 했어?" 하는 소리가 들린다', '유모차가 문 앞에 접혀 있다'], door: 0x4a3b6b, deco: 'stroller' },
    ],
  },
  {
    floor: 4,
    notice: '4층 자전거는 복도가 아니라 1층 거치대에 세워 주세요!',
    wall: 0xe4e8e2,
    floorColor: 0xa9a294,
    units: [
      { resident: '오태식 (택배 기사)', notes: ['코 고는 소리가 들린다… 새벽 배송 끝나고 자나 보다', '현관에 장갑이 걸려 있다', '조용하다'], door: 0x5b4a2b, deco: 'bike' },
      { resident: '윤 작가', notes: ['키보드 두드리는 소리가 끊임없이 들린다', '커피 냄새가 난다', '"마감이 내일이라고?!" 하는 소리가 들렸다'], door: 0x2b4a5b, deco: 'trash' },
      { resident: '빈집', notes: ['비어 있는 집이다. 문에 "임대 문의" 종이가 붙어 있다'], door: 0x6d6d6d, deco: 'none' },
    ],
  },
  {
    floor: 5,
    notice: '옥상 출입은 관리실에 문의하세요',
    wall: 0xece2da,
    floorColor: 0xb3a28f,
    units: [
      { resident: '강 노인회장님', notes: ['바둑 두는 소리가 딱, 딱 들린다', '화분이 현관 앞에 줄지어 있다', '"경비 양반 수고하네" 하는 소리가 들린 것 같다'], door: 0x5b3d2b, deco: 'plant' },
      { resident: '서지민 (유튜버)', notes: ['"구독과 좋아요!" 하는 소리가 들린다', '조명 장비 상자가 문 앞에 있다', '조용하다… 편집 중인가 보다'], door: 0x1f1f2b, deco: 'boxes' },
      { resident: '문씨네', notes: ['청소기 돌리는 소리가 난다', '김치 냄새가 난다', '조용하다'], door: 0x6b4a2f, deco: 'shoes' },
    ],
  },
];

/** f층 데이터 (6층 이상은 2층부터 돌려 쓴다) */
export function villaFloor(f: number): VillaFloor {
  const hit = FLOORS.find((x) => x.floor === f);
  if (hit) return hit;
  const base = FLOORS[(f - 2) % FLOORS.length];
  return { ...base, floor: f };
}

/** 호수 → 층과 문 번호 (예: '302' → 3층, 1번 문) */
export function unitPlace(unit: string): { floor: number; door: number } {
  const floor = Number(unit.slice(0, -2)) || 2;
  const door = Math.max(0, Math.min(2, Number(unit.slice(-1)) - 1 || 0));
  return { floor, door };
}
