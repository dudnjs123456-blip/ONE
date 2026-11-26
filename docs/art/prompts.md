# 프롬프트 틀: 차원의 밤 배경

기준 그림 두 장을 만든 프롬프트(`art/library/bg/*/prompt.txt`)에서 잘 먹힌 문장만 남긴 틀.
**[장면]** 과 **[빛]** 만 바꿔 넣는다. 나머지는 그대로 둔다 (그래야 화풍이 일정하다).

## Firefly 설정
1. 모델: **Gemini Flash** (기준 그림과 같은 모델)
2. 비율: **가로로 가장 넓은 것** (21:9 근처)
3. **참고 그림(스타일 참조)에 기준 그림을 넣는다**: 숲·실내 느낌이면 `forest-pano`, 탁 트인 풍경이면 `cliff-vista` 원본
4. 한 번에 여러 장 뽑아서 다운로드 → Claude 에게 "뽑았어"

## 틀
```
Painted anime background art for a video game, ultra wide panorama, night.
[장면: 무엇이 보이는지. 가까운 것 → 먼 것 순서로, 겹겹이 멀어지게]
[빛: 달빛 방향 + 작은 포인트 빛]
[게임용 조건 — 캐릭터가 서는 장면일 때만: The bottom third of the image fades smoothly into flat even fog color (#1b2a3d) with no ground details, so it can blend into a game scene.]
No people, no creatures, no text.
Palette: deep navy, blue-teal, cold silver moonlight[, + 작은 포인트 색].
Soft painterly anime background style, clean, high detail, atmospheric depth, matching the painterly style and colors of the reference image.
```

규칙:
- 특정 작가·작품 이름은 쓰지 않는다 (예전 숲 프롬프트엔 있었지만 틀에서는 뺐다)
- 따뜻한 색은 "small warm orange lights" 처럼 **작게** 라고 꼭 붙인다
- 한 장에 장소 하나. 이야기(인물·사건)는 넣지 않는다

## 바로 쓸 수 있는 예 (경계 마을 주변)

### 1. 북문 밖 들판 (고블린 의뢰 장소) — 참고 그림: cliff-vista
```
Painted anime background art for a video game, ultra wide panorama, night.
Outside the north gate of a small walled fantasy village: a wide gently rolling meadow of tall silvery grass, a narrow dirt road winding away into the distance, scattered dark boulders and a few lonely crooked trees as near silhouettes, the dark edge of a misty pine forest far behind, layered hills fading into blue haze.
Soft pale moonlight from the upper left, a few tiny glowing cyan spores drifting over the grass.
The bottom third of the image fades smoothly into flat even fog color (#1b2a3d) with no ground details, so it can blend into a game scene.
No people, no creatures, no text.
Palette: deep navy, blue-teal, cold silver moonlight.
Soft painterly anime background style, clean, high detail, atmospheric depth, matching the painterly style and colors of the reference image.
```

### 2. 안개 숲 깊은 곳 (그림자의 영역) — 참고 그림: forest-pano
```
Painted anime background art for a video game, ultra wide panorama, night.
Deep inside an ancient misty pine forest: enormous old trunks covered in moss as dark near silhouettes, twisted roots, hanging moss, farther trees paler and paler until they dissolve into thick blue-teal fog, a faint clearing in the middle distance.
Thin cold moonlight rays slanting down from the upper left through gaps in the canopy, a few tiny glowing cyan spores and small softly glowing mushrooms.
The bottom third of the image fades smoothly into flat even fog color (#1b2a3d) with no ground details, so it can blend into a game scene.
No people, no creatures, no text.
Palette: deep navy, blue-teal, cold silver moonlight.
Soft painterly anime background style, clean, high detail, atmospheric depth, matching the painterly style and colors of the reference image.
```

### 3. 경계 마을 전경 (언덕 위에서) — 참고 그림: cliff-vista
```
Painted anime background art for a video game, ultra wide panorama, night.
Seen from a grassy hill: a small cozy medieval fantasy village inside a ring of stone walls in a misty valley, wooden houses with small warm orange window lights, a stone well and a tall inn in the middle, a faint shimmering crack of pale light in the sky far beyond the village, layered mountains fading into blue haze.
A huge pale silver moon on the upper right with a soft halo, a starry deep navy sky.
No people, no creatures, no text.
Palette: deep navy, blue-grey, cold silver moonlight, with small warm orange village lights.
Soft painterly anime background style, clean, high detail, atmospheric depth, matching the painterly style and colors of the reference image.
```

## 뽑은 뒤 (Claude 가 한다)
1. `node scripts/art.mjs scan` → 새 그림마다 숫자 기준 점수
2. 합격한 것 중 눈으로 골라 → `node scripts/art.mjs add <그림> --kind bg --id <이름> --prompt-file <프롬프트> --ref <참고 그림 id> --caption "<학습용 설명>"`
3. 게임에 넣을 것은 `--to public/.../<이름>.webp`
4. 쓴 프롬프트는 보관함 `prompt.txt` 에 같이 남는다 → 다음에 같은 걸 다시 뽑을 수 있다
