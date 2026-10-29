/** 인벤토리 아이템 (행인이 떨어뜨리는 소지품 등) */
export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 되팔 때 값 (나중에 상점용) */
  value: number;
}

export const ITEMS: Record<string, ItemDef> = {
  tcard: { id: 'tcard', name: '교통카드', icon: '💳', desc: '잔액은 얼마 안 남았다.', value: 8 },
  coupon: { id: 'coupon', name: '편의점 쿠폰', icon: '🎟️', desc: '삼각김밥 1+1 쿠폰.', value: 3 },
  gum: { id: 'gum', name: '껌', icon: '🍬', desc: '민트맛. 반쯤 남았다.', value: 1 },
  earbuds: { id: 'earbuds', name: '무선 이어폰', icon: '🎧', desc: '한쪽만 있다.', value: 25 },
  lotto: { id: 'lotto', name: '로또 용지', icon: '🎫', desc: '이번 주 추첨분. 맞았을까?', value: 2 },
  battery: { id: 'battery', name: '보조배터리', icon: '🔋', desc: '30% 충전돼 있다.', value: 12 },
  receipt: { id: 'receipt', name: '영수증', icon: '🧾', desc: '치킨 두 마리, 콜라 1.25L.', value: 0 },
  keyring: { id: 'keyring', name: '열쇠고리', icon: '🔑', desc: '귀여운 캐릭터 열쇠고리.', value: 5 },
};

export const ITEM_IDS = Object.keys(ITEMS);
