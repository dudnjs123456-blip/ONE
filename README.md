# IRON FIST — 웹 3D 격투 게임 프로토타입

철권 스타일(3D 축 이동, 상·중·하단, 프레임 데이터, 띄우기 콤보)의 웹 격투 게임 기반 코드.
Next.js 15 (App Router) + three.js + TypeScript.

배포: https://tekken-web-five.vercel.app · 개발 기록: [DEVLOG.md](DEVLOG.md)

```bash
npm run dev        # http://localhost:3000
npm run test:all   # 시뮬 테스트 전부 (아래 묶음들) — 배포 전에 항상
npm run test:sim   # 1:1 엔진 검증 (프레임 이득, 띄우기, 횡이동 회피 등)
npm run test:cpu   # CPU 난이도 (어려움 > 보통 > 쉬움)
npm run test:training # 연습 허수아비·잡기·잡기 풀기·레이지·최대 콤보
npm run test:touch # 화면 터치 버튼 입력
npm run test:field # 필드 자동사냥 시뮬레이션 (npm run test:field -- 10 → 10분)
npm run test:boss  # 보스 패턴·아머·분노·보상 + 권장 레벨 봇 승률

# 폰 화면 스크린샷 + 페이지 오류 수집 (헤드리스 Chrome, PHONE=portrait|desktop 가능)
node --experimental-websocket scripts/phone-shot.mjs <url> out.png [steps.json]
```

## 모드

| 섹션 | 모드 | 조작 |
|---|---|---|
| 라이프 | 서울 · 내 집 — 한강 동네 생활, 일자리·낚시·펫·카지노, 친구와 같은 마을 | 수동 (걷기/달리기, E 상호작용) |
| RPG | 필드 사냥 — 몬스터 4종(Lv.1~9), 경험치·골드, 레벨업. 자동사냥은 레벨에 맞는 사냥감을 고름 | 자동사냥 (Z로 수동 전환) |
| RPG | 보스 레이드 — 보스 4종(Lv.3/6/10/14), 아머·연타·분노 페이즈, 최초 클리어 보너스, 최단 기록, "추천" 표시 | 수동 |
| 대전 | VS CPU(쉬움/보통/어려움, 전적·승리 골드·첫 승리 ×3) / 2P / 연습(허수아비 행동 5종, 연습 과제 6개) | 수동 |

모든 모드는 폰에서 화면 터치 버튼으로도 할 수 있다 (터치 기기에서 자동으로 나타남).
폰 세로 화면도 배치·카메라 시야를 맞춰 두었고, "홈 화면에 추가"하면 전체화면·가로 앱처럼 열린다 (`app/manifest.ts`).
게임 화면 코드는 들어갈 때 불러오고(첫 화면 JS 압축 약 230KB), 메뉴가 뜬 뒤 쉬는 시간에 미리 받아 둔다.
효과음·배경 음악은 음원 파일 없이 Web Audio 로 합성한다 (`render/sfx.ts`, `render/bgm.ts`).

레벨·경험치·골드는 `core/profile.ts` 의 프로필 하나를 필드와 보스가 같이 쓰고, 브라우저 localStorage 에 저장된다.
서울 라이프에서 작은은발소녀를 고르면 `R` 은빛 날라차기, `X` 은빛 회오리 차기 스킬을 사용할 수 있다. 길거리 행인에게 맞히면 기존 전투 규칙(피격·신고·경찰)을 따른다.

## 클라우드 저장 (Supabase)

`.env.local` 이 없으면 브라우저(localStorage)에만 저장된다. 연결하려면:

1. [supabase.com](https://supabase.com) 에서 프로젝트 생성 (Region: **Northeast Asia (Seoul)**)
2. Authentication → Sign In / Providers → **Email** 켜기, **Confirm email** 끄기 (게임 아이디를 내부 이메일로 바꿔 로그인)
3. SQL Editor 에 `supabase/setup_all.sql` 붙여넣고 Run (스키마가 바뀌면 이 파일도 갱신해서 다시 Run)
4. `.env.example` 을 `.env.local` 로 복사하고 Project URL · anon(publishable) 키 입력
5. `node scripts/supabase-check.mjs` — 실제로 로그인·저장·읽기·권한 차단을 확인
6. `npm run dev` 재시작 → 메인 메뉴 프로필 옆에 "● 클라우드 저장됨"

로그인 화면에서 아이디·비밀번호로 가입/로그인한다. 처음 로그인하면 이 브라우저의 기존 기록이 서버로 올라간다. 지금은 클라이언트가 직접 쓰는 단계라
조작이 가능하므로, 게임 서버(검증)가 생기면 쓰기 권한을 서버로 옮긴다.

## 구조

```
src/game/
  core/            순수 게임 로직 (DOM·three.js 의존 없음, 결정론적)
    constants.ts   속도·프레임·체력 등 튜닝 값
    input.ts       키보드 → 캐릭터 기준 넘패드 방향(1~9) + 버튼 1~4
    controllers.ts 입력 공급자: 키보드 / CPU / 허수아비
    fighter.ts     캐릭터 상태 머신 (이동, 대시, 횡이동, 공격, 피격, 공중, 다운)
    combat.ts      히트 판정·적용 (모든 모드 공용)
    arena.ts       1:1 원형 경기장 공용: 카메라 축, 좌우 판정, 밀어내기
    match.ts       대전: 라운드, 타이머
    field.ts       RPG 필드: 다수 몬스터, 스폰, 몬스터 AI, 보상
    fieldControllers.ts  자동사냥 AI / 필드 수동 조작
    boss.ts        보스 레이드: 보스 AI, 분노 페이즈, 클리어 보상
    profile.ts     레벨·경험치·골드 (필드와 보스 공유, 저장)
  city/            서울 라이프
    cityMap.ts     도시 배치 (도로·블록·건물·간판·상호작용 지점), 같은 seed 면 같은 도시
    cityWorld.ts   걷기·충돌·집 출입·행인·차·시간 흐름
  net/             Supabase 연동 (아이디 로그인, 프로필 클라우드 저장, 마을 멀티플레이)
  data/moves.ts    기술 데이터 (발생/지속/후딜, 가드·히트 이득, 판정 범위, 스트링, 보스 기술)
  data/monsters.ts 필드 몬스터·스폰 위치
  data/bosses.ts   보스 능력치·패턴·보상
  data/progression.ts 레벨별 필요 경험치·능력치
  render/          three.js — Match 상태를 읽어서 그리기만 함
    renderer.ts    스테이지, 카메라, 히트 이펙트, 판정 박스 표시
    cityRenderer.ts 서울 도시·원룸 장면, 낮밤, 가리는 건물 반투명 처리
    vrmCharacter.ts VRM 캐릭터 + 모션캡처 클립 혼합
    clips.ts       모션캡처 클립 재생 (public/anims/ual.json, CC0)
    mannequin.ts   박스 캐릭터 + 절차적 포즈 (나중에 GLTF로 교체)
src/components/    React: 메뉴, 게임 루프, HUD
```

### 핵심 설계

- **고정 타임스텝**: 로직은 항상 1/60초 단위로 진행. 렌더는 별도.
- **결정론적 엔진**: 같은 입력 → 같은 결과. 리플레이·롤백 넷코드를 붙일 수 있는 전제.
- **프레임 데이터 우선**: 기술은 `onBlock / onHit` 이득으로 정의하고, 경직 시간은 거기서 역산.
  (`npm run test:sim` 이 잽 가드 +1 / 히트 +8 을 실제로 측정해서 확인)
- **3D 축**: 캐릭터는 자동으로 서로를 바라보고, 카메라는 두 사람을 잇는 축에 수직.
  공격 중엔 방향이 고정되므로 횡이동하면 직선기가 빗나감. 기술별 `tracking` 으로 호밍 조절.

## 조작

| | P1 | P2 |
|---|---|---|
| 이동 | 방향키 | Num 8 4 5 6 |
| 1 왼팔 / 2 오른팔 | Q / W | Num7 / Num9 |
| 3 왼다리 / 4 오른다리 | A / S | Num1 / Num3 |
| 점프 | 스페이스 | Num0 |

뒤/중립 = 상·중단 가드, 아래(뒤) = 하단 가드 · 앞앞 대시 · 뒤뒤 백대시 · 위/아래 톡 = 횡이동(누르고 있으면 횡보) · Esc 일시정지 · ` 판정 표시

- **잡기** →+1+3: 가드 불가, 앉으면 피함. 잡히는 순간 1·2 를 누르면 **잡기 풀기**
- **레이지**: 대전에서 체력 20% 이하면 공격력 +10%
- **벽꽝**: 세게 밀려나다 경기장 끝(반투명 벽)에 부딪히면 벽에 붙어 경직 → 추가 콤보 기회
- **반격 판정**: 기술표 ⚠ 는 손해 숫자가 아니라 엔진으로 실제 막혀 봤을 때 반격당하는 기술 (`core/punishCheck.ts`).
  멀리 밀어내는 기술은 손해가 커도 안전하다. 발생 프레임은 대전 템포 보정 후 실제 값
- 키는 메인 메뉴 → 키 설정에서 바꿀 수 있다

## 다음 단계 아이디어

- 캐릭터 모델: GLTF + 애니메이션 믹서 (Mixamo 등) 로 `Mannequin` 교체
- 벽 근처 전용 기술(벽 타기 등)
- 캐릭터별 기술표 분리 (`data/characters/*.ts`)
- 온라인 대전: 결정론 엔진 위에 롤백 넷코드 (WebRTC)
