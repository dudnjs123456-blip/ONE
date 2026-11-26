# 작은은발소녀 — 캐릭터 기준서

모든 계정의 기본 캐릭터 (2026-11-26~). 3D 모델은 `public/models/a3.vrm` (사용자가 VRoid 로 만든 캐릭터).
2D 그림은 전부 Firefly(Gemini Flash)에 **기준 그림을 참고로 넣고** 표정·자세만 바꿔 뽑았다.

## 절대 바뀌면 안 되는 것 (그림마다 확인)
| 부분 | 모습 |
|---|---|
| 머리 | 길고 곧은 백금발, 일자 앞머리, 오른쪽에 꽃 모양 머리핀 + 비취색 술 장식 |
| 눈 | 장밋빛 분홍 눈동자 |
| 장신구 | 금색 꽃 귀걸이, 금 팔찌 |
| 옷 | 어깨 없는 남색 원피스(금색 소용돌이 자수) · 허리에 금색 공단 리본 + 흰 꽃 · 회색 망사 속치마 |
| 신발 | 남색 발목 끈 굽 신발 |
| 그림체 | 애니메이션 일러스트, 깨끗한 선, 부드러운 셀 채색, 배경 없음 |

## 지금 있는 그림 (게임: public/portraits/smallSilverGirl/)
- 표정 전신 9종: default · smile · cry · angry · surprised · shy · wink · sleepy · think (+ hurt)
- 장면 표정 18종 × 2 (전신 face-*, 상반신 bust-*): awe · cheer · confident · curious · determined · doubt · gentle · laugh · panic · pout · rage · relief · scared · shocked · sob · startled · think2 · tired
- 기술 컷인 3종: cutin-back · cutin-fly · cutin-tornado
- 그림마다 학습용 설명: `meta.json` 의 captions (그림을 직접 보고 맞춰 씀)
- 되찾은 원본 프롬프트: `prompts/*.txt`, 원본 PNG: `originals/`

## 새 표정 뽑는 법 (지금 바로 되는 방법: Firefly)
1. Firefly · 모델 **Gemini Flash** · 참고 그림에 `public/portraits/smallSilverGirl/default.png` (전신) 를 넣는다
2. 아래 틀에서 [표정]·[자세]만 바꿔 넣는다

```
Make her [표정: 눈·눈썹·입 모양을 구체적으로], and change her pose to match: [자세: 두 손·고개·다리를 구체적으로].
Keep the same character design exactly: same face, same rose-pink eyes, same long straight platinum blonde hair with bangs, same flower hairpin with jade tassel, same gold flower earrings, same gold bracelet, same strapless navy dress with gold embroidery, same gold satin sash with white flower, same grey tulle underskirt, same navy ankle-strap heels, with identical details and colors.
Same anime illustration style and coloring, full body, plain flat light gray background, no text.
```

예) 기대에 찬 표정:
`Make her excited and hopeful: sparkling wide pink eyes, a bright open smile, and change her pose to match: both fists held up near her chin, rising onto her tiptoes, leaning slightly forward.`

3. 다운로드 → Claude 에게 "뽑았어" → 위 표와 나란히 놓고 확인 → 배경 지우기·크기 맞춰 게임에 넣고 `meta.json` captions 에 설명 추가

## 내 PC 모델로 그리기 (준비 중)
`node scripts/art.mjs dataset` → `art/dataset/character/smallSilverGirl/` (그림 + 설명 .txt, 학습 도구가 읽는 모양).
이 묶음으로 캐릭터 LoRA 를 학습하면, 트리거 낱말 `irf_ssg` + 표정 설명만으로 새 표정을 직접 뽑을 수 있다.
학습 전 확인: Firefly(Gemini) 결과물을 학습에 써도 되는지 (docs/art/style-bible.md 참고).
권리가 확실한 재료: VRoid 모델(a3.vrm)을 게임에서 여러 각도·표정으로 찍은 그림.
