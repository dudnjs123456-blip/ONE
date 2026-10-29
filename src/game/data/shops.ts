/** 음식점 메뉴 하나. hunger/fatigue 는 줄여주는 양 (0~100 수치 기준) */
export interface MenuItem {
  id: string;
  name: string;
  icon: string;
  price: number;
  hunger: number;
  fatigue?: number;
  desc: string;
}

/** 대화할 수 있는 음식점. sign 은 도시 간판 글자와 같다 (data 연결 키) */
export interface ShopDef {
  sign: string;
  keeper: string;
  /** 주인 이모지 */
  face: string;
  greetings: string[];
  recommend: string;
  gossip: string[];
  thanks: string[];
  menu: MenuItem[];
}

const shop = (s: ShopDef) => s;

export const SHOPS: Record<string, ShopDef> = Object.fromEntries(
  [
    shop({
      sign: '편의점 24', keeper: '알바생 지훈', face: '🧑‍💼',
      greetings: ['어서 오세요~ 편의점 24입니다.', '(이어폰을 빼며) 아, 네! 어서 오세요.'],
      recommend: '야식이면 컵라면이죠. 피곤하시면 에너지드링크도 있어요.',
      gossip: ['요즘 밤에 손님이 별로 없어서 심심해요.', '저기 한강공원에서 버스킹 하는 사람이 있대요.'],
      thanks: ['감사합니다~ 영수증 버려드릴까요?', '또 오세요!'],
      menu: [
        { id: 'kimbap-tri', name: '삼각김밥', icon: '🍙', price: 15, hunger: 15, desc: '참치마요. 국룰.' },
        { id: 'cupramen', name: '컵라면', icon: '🍜', price: 25, hunger: 25, desc: '물 붓고 3분.' },
        { id: 'dosirak', name: '편의점 도시락', icon: '🍱', price: 45, hunger: 45, desc: '반찬이 여섯 가지.' },
        { id: 'banana-milk', name: '바나나우유', icon: '🥛', price: 15, hunger: 8, desc: '달달하다.' },
        { id: 'energy', name: '에너지드링크', icon: '⚡', price: 20, hunger: 3, fatigue: 15, desc: '잠이 확 깬다.' },
      ],
    }),
    shop({
      sign: '카페 모먼트', keeper: '사장님 수아', face: '👩‍🍳',
      greetings: ['어서 오세요, 카페 모먼트예요 ☕', '오늘도 오셨네요! 반가워요.'],
      recommend: '피곤해 보이시는데… 아메리카노 샷 추가 어떠세요?',
      gossip: ['요즘 근처에 새 아파트 입주가 시작됐대요.', '단골 손님이 그러는데 남산타워 야경이 요즘 최고래요.'],
      thanks: ['맛있게 드세요!', '좋은 하루 보내세요~'],
      menu: [
        { id: 'americano', name: '아메리카노', icon: '☕', price: 30, hunger: 2, fatigue: 20, desc: '진하게 내렸어요.' },
        { id: 'latte', name: '카페라떼', icon: '🥛', price: 35, hunger: 6, fatigue: 15, desc: '고소한 우유 거품.' },
        { id: 'croffle', name: '크로플', icon: '🧇', price: 40, hunger: 20, desc: '바삭한 크루아상 와플.' },
      ],
    }),
    shop({
      sign: '황금치킨', keeper: '치킨집 사장님', face: '👨‍🍳',
      greetings: ['어이구 어서 와요! 오늘 닭 좋아요!', '황금치킨입니다~ 포장? 드시고 가요?'],
      recommend: '반반 무 많이! 아니 우리는 양념이 진짜예요.',
      gossip: ['어제 축구 봤어요? 동네가 들썩였잖아요.', '배달 기사님들이 요즘 바빠서 정신이 없대요.'],
      thanks: ['맛있게 드시고 또 와요!', '콜라는 서비스!'],
      menu: [
        { id: 'fried-half', name: '후라이드 반마리', icon: '🍗', price: 75, hunger: 50, desc: '겉바속촉.' },
        { id: 'yangnyeom', name: '양념치킨', icon: '🍗', price: 90, hunger: 60, desc: '달콤매콤 비법 소스.' },
        { id: 'coke', name: '콜라', icon: '🥤', price: 10, hunger: 3, desc: '치킨엔 콜라.' },
      ],
    }),
    shop({
      sign: '분식천국', keeper: '분식집 이모', face: '👵',
      greetings: ['아이고 학생 왔어? 배고프지?', '어서 와~ 김밥 금방 말아줄게.'],
      recommend: '라면에 김밥 하나 시켜. 그게 제일 든든해.',
      gossip: ['옆 건물 미용실 사장님이 이번에 결혼한대.', '요즘 애들은 마라탕만 먹더라~'],
      thanks: ['많이 먹어~ 단무지 더 줄까?', '또 와~'],
      menu: [
        { id: 'kimbap', name: '김밥', icon: '🍙', price: 20, hunger: 25, desc: '이모가 말아준 김밥.' },
        { id: 'ramen', name: '라면', icon: '🍜', price: 25, hunger: 30, desc: '계란 하나 풀어서.' },
        { id: 'tteokbokki-b', name: '떡볶이', icon: '🌶️', price: 30, hunger: 30, desc: '국물 떡볶이.' },
        { id: 'sundae', name: '순대', icon: '🌭', price: 30, hunger: 30, desc: '간 많이.' },
      ],
    }),
    shop({
      sign: '베이커리', keeper: '제빵사 민지', face: '👩‍🍳',
      greetings: ['갓 구운 빵 나왔어요~', '어서 오세요! 오늘 소금빵 금방 나왔어요.'],
      recommend: '소금빵이요! 오늘 진짜 잘 구워졌어요.',
      gossip: ['아침마다 줄 서는 손님이 있는데 항상 크림빵만 사가요.', '저 앞 공원 분수가 밤에 불이 들어와서 예뻐요.'],
      thanks: ['맛있게 드세요~', '봉투 필요하세요?'],
      menu: [
        { id: 'saltbread', name: '소금빵', icon: '🥐', price: 20, hunger: 15, desc: '버터 향이 가득.' },
        { id: 'creambread', name: '크림빵', icon: '🍞', price: 20, hunger: 15, desc: '커스터드 듬뿍.' },
        { id: 'sandwich', name: '샌드위치', icon: '🥪', price: 40, hunger: 35, desc: '햄치즈에 양상추.' },
      ],
    }),
    shop({
      sign: '고깃집', keeper: '고깃집 사장님', face: '🧔',
      greetings: ['어서 오세요! 몇 분이세요? 한 분? 앉으세요!', '고기 들어왔습니다~ 오늘 삼겹살 좋아요.'],
      recommend: '삼겹살 2인분에 된장찌개, 마무리는 냉면. 이게 정석이죠.',
      gossip: ['회식 손님이 요즘 확 줄었어요.', '저기 오피스 빌딩 사람들이 점심에 다 여기 와요.'],
      thanks: ['잘 먹었어요? 또 오세요!', '사탕 하나 가져가요~'],
      menu: [
        { id: 'samgyeop', name: '삼겹살 2인분', icon: '🥓', price: 150, hunger: 80, desc: '혼자서 2인분, 가능.' },
        { id: 'naengmyeon', name: '물냉면', icon: '🍜', price: 50, hunger: 40, desc: '살얼음 동동.' },
        { id: 'doenjang', name: '된장찌개', icon: '🍲', price: 40, hunger: 35, desc: '공깃밥 포함.' },
      ],
    }),
    shop({
      sign: '마라탕', keeper: '마라탕 사장님', face: '🧑‍🍳',
      greetings: ['어서 오세요~ 재료 담아오시면 돼요!', '맵기 몇 단계로 해드릴까요?'],
      recommend: '처음이면 2단계! 꿔바로우는 무조건 같이 드세요.',
      gossip: ['근처 학생들이 시험 끝나면 다 여기 와요.', '배달 리뷰에 "마라 중독"이라고 써주셨더라고요 ㅎㅎ'],
      thanks: ['맛있게 드세요!', '다음엔 3단계 도전?'],
      menu: [
        { id: 'malatang', name: '마라탕', icon: '🍲', price: 60, hunger: 50, desc: '얼얼하고 화끈.' },
        { id: 'guobaorou', name: '꿔바로우', icon: '🍖', price: 75, hunger: 45, desc: '바삭 쫀득 찹쌀 탕수육.' },
      ],
    }),
    shop({
      sign: '떡볶이', keeper: '떡볶이 할머니', face: '👵',
      greetings: ['어서 와요~ 떡볶이 맵게 해줄까?', '왔어? 오늘 튀김 막 튀겼어.'],
      recommend: '떡볶이에 튀김 찍어 먹어. 어묵 국물은 공짜야.',
      gossip: ['여기서 40년 장사했는데 동네가 많이 변했지.', '한강 다리 위에서 해 지는 거 한번 봐. 참 예뻐.'],
      thanks: ['맛있게 먹어~', '또 와요, 학생!'],
      menu: [
        { id: 'tteokbokki', name: '떡볶이', icon: '🌶️', price: 25, hunger: 30, desc: '할머니표 매콤 떡볶이.' },
        { id: 'twigim', name: '모둠 튀김', icon: '🍤', price: 20, hunger: 15, desc: '김말이, 오징어, 고구마.' },
        { id: 'eomuk', name: '어묵', icon: '🍢', price: 10, hunger: 8, desc: '국물은 무한리필.' },
      ],
    }),
  ].map((s) => [s.sign, s]),
);
