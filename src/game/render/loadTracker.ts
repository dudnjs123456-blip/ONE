/**
 * 모델·애니메이션 불러오기 추적: 로딩 화면이 "몇 개 중 몇 개 받았나"를 보여 주고,
 * 전부 받을 때까지 기다릴 수 있게 한다 (게임 시작 뒤에 하나씩 나타나며 버벅이지 않게).
 */
const pending = new Set<Promise<unknown>>();
let total = 0;
let done = 0;

/** 불러오기 하나를 추적에 올린다 (그대로 돌려준다) */
export function track<T>(p: Promise<T>): Promise<T> {
  total++;
  pending.add(p);
  const finish = () => {
    done++;
    pending.delete(p);
  };
  p.then(finish, finish);
  return p;
}

export function loadProgress() {
  return { done, total };
}

/** 지금 받고 있는 것 + 그 결과로 이어서 받기 시작한 것까지 모두 끝날 때까지 */
export async function allLoaded() {
  while (pending.size) {
    await Promise.allSettled([...pending]);
    // 받은 뒤 이어지는 처리(다음 모델 요청 등)가 등록될 틈
    await new Promise((r) => setTimeout(r, 0));
  }
}
