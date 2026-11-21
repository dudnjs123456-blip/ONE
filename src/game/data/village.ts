/**
 * 다른 차원의 "경계 마을": 서울 집 컴퓨터로 접속하면 가장 먼저 도착하는 곳.
 * 사냥터(필드) 남쪽에 붙어 있고, 북쪽 문 하나로만 사냥터와 이어진다. 몬스터는 마을에 들어오지 못한다.
 * 좌표는 필드와 같은 월드 좌표 (화면 안쪽 = -z = 북쪽 = 사냥터).
 */
export const VILLAGE = {
  name: '경계 마을',
  /** 마을 담장 안 (x0~x1, z0~z1) */
  x0: -13,
  x1: 13,
  z0: 24,
  z1: 40,
  /** 북쪽 문 반폭 (x 가 -gate~gate 인 곳으로만 드나든다) */
  gate: 2.5,
} as const;

/** 접속 포탈 (서울 집 컴퓨터와 이어진 곳) */
export const VILLAGE_PORTAL = { x: 0, z: 39 } as const;
/** 접속하거나 쓰러졌다 깨어나는 자리 (포탈 앞, 사냥터 쪽을 본다) */
export const VILLAGE_SPAWN = { x: 0, z: 34.2 } as const;
/** 북쪽 문 바깥 (자동사냥이 마을을 나설 때 지나가는 곳) */
export const VILLAGE_GATE_OUT = { x: 0, z: 20.5 } as const;
/** NPC 에게 말을 걸 수 있는 거리 */
export const TALK_RANGE = 2.2;

export interface VillageNpcDef {
  id: string;
  name: string;
  /** 이름표 위 직함 */
  title: string;
  x: number;
  z: number;
  /** 바라보는 방향 */
  fx: number;
  fz: number;
  /** 사람 모델 옷 (personView PERSON_SKINS) */
  skin: string;
  tint?: number;
  /** 처음 만났을 때 대사 (한 줄씩 넘긴다) */
  first: string[];
  /** 다시 말을 걸면 */
  again: string[];
  /** 대화 끝에 해 주는 일 */
  service?: 'rest';
}

export const VILLAGE_NPCS: VillageNpcDef[] = [
  {
    id: 'noa',
    name: '노아',
    title: '포탈 안내인',
    x: 1.8,
    z: 35.3,
    fx: -0.6,
    fz: -0.8,
    skin: 'cyborgFemaleA',
    first: [
      '어서 와요, "저편" 사람. 달래 언니가 벼랑 밑에서 업어 왔다는 게 당신이군요.',
      '당신이 켠 그 게임, DIMENSION… 그건 게임이 아니에요. 이 세계로 들어오는 문이에요.',
      '여긴 경계 마을이에요. 당신이 사는 서울과, 몬스터들이 넘어오는 차원 틈 사이에 걸쳐 있는 마을이죠.',
      '처음엔 다들 아무 데나 떨어져요. 그래도 이제 걱정 마요. 뒤에 있는 포탈이 당신 집 컴퓨터랑 이어져 있거든요.',
      '로그아웃하면 언제든 컴퓨터 앞으로 돌아갈 수 있고, 다시 켜면 이 포탈 앞으로 오게 될 거예요.',
      '마을 안은 안전해요. 몬스터는 담장을 넘지 못하거든요. 우선 촌장님께 인사드려 봐요. 동쪽 큰 집이에요.',
    ],
    again: ['포탈은 늘 열려 있어요. 지치면 서울에서 푹 쉬고 와요.', '쓰러져도 걱정 마요. 이 포탈 앞에서 다시 눈을 뜨게 될 테니까.'],
  },
  {
    id: 'maru',
    name: '마루',
    title: '촌장',
    x: 8.5,
    z: 30.2,
    fx: -1,
    fz: 0,
    skin: 'survivorFemaleA',
    tint: 0xd9cfc0,
    first: [
      '오, 저편에서 온 손님이구먼. 반갑네. 이 마을 촌장 마루라네.',
      '이 세계는 원래 서울을 비추는 거울 같은 곳이었지. 조용하고, 아무 일도 없던 곳이야.',
      '그런데 얼마 전 북쪽에 차원 틈이 벌어지고부터 고블린, 산적, 오우거, 흑기사까지 쏟아져 나오기 시작했어.',
      '그 무렵부터 저편 사람들이 하늘에서 떨어지기 시작했지. 다들 "디멘션"이라는 게임을 켰다고 하더군.',
      '그 게임을 누가 만들었는지는… 우리도 모른다네. 다만 자네들 주먹만은 몬스터에게 통하지.',
      '부탁하네. 북쪽 문 밖 몬스터들을 막아 주게. 자네 혼자가 아니야. 저편 사람들이 같이 싸우고 있으니까.',
    ],
    again: ['틈 너머에 무엇이 있는지는 아무도 모르네. 언젠가 자네가 알아내 주겠지.', '안개 숲의 이름 없는 그림자… 그것만큼은 자네 주먹도 통하지 않았다지? 그 정체를 아는 이는 아무도 없다네.', '마을 사람들에게도 인사해 두게. 다들 저편 사람을 반가워한다네.'],
  },
  {
    id: 'bawi',
    name: '바위',
    title: '북문 문지기',
    x: 4.2,
    z: 25.2,
    fx: -0.5,
    fz: -0.85,
    skin: 'survivorMaleB',
    tint: 0xb9c4d6,
    first: [
      '사냥 나가나? 그럼 이것만 알아 둬.',
      '문 바로 앞엔 고블린. 약하지만 떼로 다녀. 조금 더 가면 산적들이 먼저 덤벼들지.',
      '사냥터 구석엔 오우거랑 흑기사가 버티고 있어. 레벨 낮을 땐 가까이 가지 마.',
      '자동사냥(Z)을 켜면 알아서 문을 나가 사냥을 시작해. 힘들면 언제든 문 안으로 도망쳐 와. 놈들은 여길 못 넘어오니까.',
    ],
    again: ['오늘도 무사히 돌아와.', '흑기사는 Lv.9 쯤은 돼야 상대할 만해.'],
  },
  {
    id: 'dallae',
    name: '달래',
    title: '여관 주인',
    x: -8.4,
    z: 30.6,
    fx: 1,
    fz: 0,
    skin: 'humanFemaleA',
    tint: 0xffe2c8,
    first: [
      '어머, 새 얼굴이네! 여긴 "달빛 여관"이야.',
      '사냥하다 다치면 언제든 들러. 따뜻한 차 한 잔이면 금방 기운이 날 거야.',
      '자, 한 잔 마시고 가.',
    ],
    again: ['또 다쳐서 왔구나? 앉아, 차 내올게.'],
    service: 'rest',
  },
  {
    id: 'kong',
    name: '콩이',
    title: '마을 아이',
    x: -3.2,
    z: 31.4,
    fx: 0.6,
    fz: 0.8,
    skin: 'skaterMaleA',
    tint: 0xffd27a,
    first: [
      '우와! 저편 사람이다! 진짜 포탈에서 나왔어?',
      '저편 세계엔 하늘까지 닿는 건물이 있다는 게 진짜야? 서울이라는 데?',
      '나도 언젠가 포탈 너머에 가 보고 싶어. 그러려면 몬스터가 없어져야 한대.',
    ],
    again: ['형아(누나) 오늘은 몇 마리 잡았어?', '우물 아래에서 이상한 빛이 나는 걸 봤어… 아무한테도 말하지 마!'],
  },
];

/** 마을 건물 (가운데 x, z · 가로 w · 세로 d). 들어갈 수 없다 */
export interface VillageHouse {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  /** 문이 난 쪽 */
  door: 'east' | 'west' | 'north' | 'south';
  /** 지붕 색 */
  roof: number;
  sign?: string;
}

export const VILLAGE_HOUSES: VillageHouse[] = [
  { id: 'inn', x: -10.6, z: 30.6, w: 3.6, d: 4.4, door: 'east', roof: 0x7a3b5c, sign: '달빛 여관' },
  { id: 'chief', x: 10.8, z: 30.2, w: 3.6, d: 4.0, door: 'west', roof: 0x3b5c7a, sign: '촌장 집' },
  { id: 'houseA', x: -9.6, z: 37.2, w: 3.4, d: 2.8, door: 'east', roof: 0x5c4a7a },
  { id: 'houseB', x: 9.6, z: 37.2, w: 3.4, d: 2.8, door: 'west', roof: 0x4a6a5c },
  { id: 'shed', x: -9.8, z: 25.9, w: 2.6, d: 2.2, door: 'east', roof: 0x6a5a3c },
  { id: 'well', x: -5.2, z: 30.2, w: 1.4, d: 1.4, door: 'north', roof: 0 },
];
