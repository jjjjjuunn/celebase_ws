# 음식 사진 생성 가이드 — gpt-image-2 (Celebase Recipe Photography)

> 담당: 팀원 / 작성: 2026-06 / 대상: `recipes.image_url` 채울 음식 사진 300장.
> 머신용 전체 리스트 = **`docs/food-photo-shotlist.csv`** (300행: meal_type · celebrity_slug · title · key_ingredients · description).
> 출처: `db/seeds/data/*.json` 의 `recipes[]` (라이브 시드와 동일). 동일 title+재료 중복 1건 제거 후 300개.

---

## 0. TL;DR
- **300장**(breakfast 68 · lunch 69 · snack 69 · dinner 70 · smoothie 24)을 **하나의 고정 스타일 프롬프트**로 일관되게 생성.
- **구도 = 90° 정탑다운(오버헤드)** for 276개(접시·볼). **스무디 24개만 ~35° 정면**(PO 확정, §1).
- 프롬프트는 **`{DISH}` 와 `{KEY_INGREDIENTS}` 두 슬롯만 교체**, 나머지(스타일·구도·톤)는 byte 단위로 동일하게 유지 → 그게 일관성의 핵심.
- gpt-image-2: **size `1536x1024`(3:2 가로), quality `high`, n=1**.
- 톤 = News 히어로 사진과 같은 세계(따뜻한 자연광·매트 세라믹/리넨·sage/clay/cream earthy 팔레트). 사람/손/얼굴/글자/로고 **금지**(법무 §6).

---

## 1. 구도 결정 — "위에서 딱 내려다보기" 에 대한 내 의견

**결론: 사용자 직감(90° 오버헤드, 재료가 한 번에 다 보이게)에 동의합니다.** 이 카탈로그엔 그게 정답입니다. 근거:

1. **음식 종류가 오버헤드에 최적.** 300개 중 대다수가 bowl·plate·hash·salad·porridge·rice bowl·stir-fry·curry·donburi — 표면에 재료가 펼쳐지는 "납작·플레이팅" 음식입니다. 푸드 포토 정설상 *오버헤드는 평평하게 펼쳐진 음식에 가장 강하고, 모든 디테일을 한 프레임에 담는다* (pizza·bowl·brunch spread 류).
2. **300장 일관성이 최우선.** 각도를 하나(90°)로 고정하면 perspective 변수가 사라져 그리드/피드가 정렬돼 보입니다. 카탈로그는 "각 접시의 최적 각도"보다 **균일함**이 더 가치 있습니다.
3. **크롭에 강함.** 우리 앱은 같은 이미지를 **가로 와이드 밴드(상세, ~2:1)** 와 **정사각형에 가까운 Meal Plan 카드**에 `cover` 로 같이 씁니다. 중앙 정렬 오버헤드는 어느 비율로 잘라도 가운데가 살아 크롭이 안전합니다(45°는 배경·지평선 관리가 까다로워 크롭이 더 위험).
4. **폰 광각 왜곡 회피.** 45° 근접은 가장자리가 휘어 덜 먹음직스러워지는 함정이 있는데, 정탑다운은 그게 없습니다.

**예외 — 음료(스무디 24개) [PO 확정].** 정설상 *키(높이)가 매력인 음식·음료는 90°에서 납작해 보여 피하라*고 합니다. 우리 카탈로그에서 여기 해당하는 건 사실상 **스무디 24개**뿐(나머지는 접시·볼). → **결정: 스무디 24개는 약 35° straight-on(정면)** 으로 글라스·레이어가 보이게, **나머지 276개(접시·볼)는 90° 오버헤드.** meal_type 으로 분기:
- `meal_type == smoothie` (24개) → §3 **스무디 변형 프롬프트**.
- 그 외(276개) → §3 **마스터 프롬프트(90° 오버헤드)**.

> 트레이드오프 인지: 그리드에 스무디만 다른 각도가 섞이지만, 음료 매력을 우선해 PO가 (B)로 확정. 톤(빛·소품·팔레트)은 두 프롬프트 모두 동일하게 유지하므로 같은 세트로 읽힙니다.

> 참고: 우리 News 히어로 사진(예: Jennifer Aniston plate)은 *약 30° 앵글의 라이프스타일 씬*입니다. 레시피 카탈로그는 그것과 **다른 각도(오버헤드)** 여도 괜찮습니다 — 에디토리얼 히어로 vs 깔끔한 카탈로그라는 역할 차이. **대신 톤(빛·소품·팔레트)은 같은 세계로 맞춰** 같은 브랜드로 읽히게 합니다(§2).

---

## 2. 브랜드 톤 (고정 — 모든 컷 공통)
News/ClaimDetail 사진과 같은 아트디렉션으로 묶습니다:
- **빛**: 한쪽에서 들어오는 부드러운 자연광, 은은한 소프트 섀도. 하드 플래시·HDR 금지.
- **소품/배경**: 매트 스톤웨어 볼/세라믹 접시, 페일 오크 우드 또는 리넨 표면. earthy·muted.
- **팔레트**: sage green · clay · oatmeal · cream (theme.news 팔레트와 정렬). 네온·과채도 금지.
- **스타일링**: 미니멀·의도적. 접시 옆에 핵심 재료 몇 개나 허브 한 줄기 정도, 어수선함 없음, 넉넉한 여백.
- **금지**: 사람·손·얼굴·글자·라벨·로고·워터마크(§6 법무).

---

## 3. 마스터 프롬프트 (복붙용 — `{DISH}` 와 `{KEY_INGREDIENTS}` 만 교체)

```text
A single serving of {DISH}, made with {KEY_INGREDIENTS}, freshly prepared and naturally plated.

Shot from directly overhead (90-degree top-down flat lay), perfectly centered, the whole
dish and all of its main ingredients clearly visible in one frame, with generous empty
negative space around the dish.

Served in a matte stoneware bowl or on a ceramic plate, set on a warm natural surface —
pale oak wood or soft linen — in muted earthy tones (sage green, clay, oatmeal, cream).

Soft diffused natural daylight from one side, gentle soft shadows, calm editorial wellness
mood. Muted, desaturated earthy color palette — no bright, neon, or oversaturated colors.

Minimal intentional styling: a few of the raw key ingredients or a small herb sprig placed
beside the dish for context, nothing cluttered.

Photorealistic high-end food photography, sharp focus, natural food textures, appetizing and
fresh, subtle fine film grain. No people, no hands, no faces, no text, no labels, no logos,
no watermarks, no cutlery brand marks.
```

**Avoid (negative 의도 — gpt-image-2 는 별도 negative 필드가 없으니 위 문장 끝에 한 줄로 덧붙여도 됨):**
`Avoid: plastic or CGI look, harsh flash, heavy HDR, dark underexposed shadows, clutter, busy background, multiple competing dishes, garish saturated colors.`

### 스무디 변형 (meal_type == smoothie, 24개 — PO 확정)
마스터 프롬프트에서 **구도·vessel 두 문장만 교체**하고 나머지(톤·빛·팔레트·금지)는 동일하게 유지:
- 구도 문장 → `Shot slightly above eye level (about 35-degree straight-on angle), the tall clear glass and its layers clearly visible, centered, with generous negative space around the glass.`
- vessel 문장 → `Served in a tall clear glass on a warm natural surface — pale oak wood or soft linen — in muted earthy tones, a few of the key ingredients (berries, seeds, granola) placed beside the glass.`

### 채워 넣은 예시 (shotlist 에서 그대로)
1. **Almond Butter Quinoa Bowl with Blueberries** / `{KEY_INGREDIENTS}` = `Quinoa, Almond Butter, Blueberries, Almonds, Honey`
2. **Smoked Salmon and Egg Plate** / `Eggs, Smoked Salmon, Avocado, Cherry Tomatoes, Extra Virgin Olive Oil`
3. **Teriyaki Tofu Rice Bowl** / `Tofu, Rice, Teriyaki, Edamame, Sesame, Scallion`

> `{KEY_INGREDIENTS}` 는 shotlist CSV 의 `key_ingredients`(상위 6개) 를 콤마로 연결해 넣으면 됩니다. 재료를 명시하면 gpt-image-2 가 "그 음식에 맞는 구성"을 훨씬 정확히 그립니다.

---

## 4. gpt-image-2 파라미터
| 항목 | 값 | 이유 |
|---|---|---|
| size | **`1536x1024`** (3:2 가로) | 상세 와이드 밴드에 맞고, 정사각 카드로 center-crop 해도 안전 |
| quality | **`high`** | 음식 디테일·텍스처 (대략 high ≈ $0.16/장, 300장 ≈ $50 안팎) |
| n | **1** | 1장 생성 → 사람 QA → 실패 시 재생성 |
| 출력 | PNG/WebP → **WebP 변환**(~1500px wide) | 앱 번들/CDN(인프라 이미지 규칙: WebP 우선) |

- gpt-image-2 는 1:3~3:1 비율, 최대 2K~4K, prompt 최대 32k자 지원. 우리는 3:2 한 사이즈로 통일.

---

## 5. 워크플로 (팀원용)
1. **소스 = `docs/food-photo-shotlist.csv`** (300행).
2. 각 행에서 마스터 프롬프트의 `{DISH}`=`title`, `{KEY_INGREDIENTS}`=`key_ingredients` 채움. **나머지 텍스트는 절대 바꾸지 말 것**(일관성).
3. **파일럿 먼저**: meal_type 골고루 8~10장 생성 → 룩 컨펌(사용자/PO) → 스타일 블록 **확정(freeze)** → 나머지 일괄.
4. gpt-image-2 생성(size/quality 위 표).
5. **사람 QA**: 먹음직스러운가 / 재료가 맞는가 / earthy 팔레트인가 / 글자·사람·로고 없는가. 실패 → **스타일 블록은 그대로 두고** `{DISH}`/`{KEY_INGREDIENTS}` 표현만 다듬어 재생성.
6. 후처리: 필요시 중앙 크롭, WebP 변환(~1500px).
7. **업로드 = 승인된 S3 에셋 호스트**(§6 CL-IMAGE-HOST) → 해당 레시피의 `recipes.image_url` 세팅. 매핑은 `celebrity_slug` + `title` → DB `recipe.id`. 파일명 제안: `{celebrity_slug}__{slug(title)}.webp`.
8. 앱은 `MealPhoto`(cover)가 상세 밴드/Meal Plan 카드에 **자동 렌더** — 코드 변경 0(이번 에디토리얼 재구성이 photo-additive 로 설계됨).

---

## 6. 콘텐츠/법무 가드 (필수 — `.claude/rules/domain/content-legal.md`)
- **CL-IMAGE (BLOCK)**: AI 이미지는 **오브제/음식만**. 사람·손·얼굴·**셀럽 얼굴/유사인물**·브랜드 로고·글자 **생성 금지**. (마스터 프롬프트가 이미 명시 — 유지 필수.)
- **CL-IMAGE-HOST (BLOCK)**: 발행 `image_url` 의 호스트는 **신뢰 S3 allowlist(`ASSET_HOST_ALLOW`)** 에 일치해야 함. 외부 URL 직접 핫링크 금지.
- 이미지에 효능/의료 카피(예: "detox", "cures") 텍스트 금지 — 애초에 글자 자체를 넣지 않음.

---

## 7. 일관성 팁 (300장이 한 세트로 보이게)
- 스타일 블록을 **byte 단위로 동일하게** — 바꾸는 건 `{DISH}`/`{KEY_INGREDIENTS}` 둘뿐.
- gpt-image-2 는 안정적 seed 고정이 어려움 → 일관성은 **동일 스타일 블록 + 고정 각도(90°) + 고정 팔레트**에서 나옴.
- 파일럿 컨펌 전에 300장 다 뽑지 말 것(룩 확정 후 일괄).
- 같은 셀럽/끼니 묶음을 연속으로 뽑으면 미세 톤 드리프트 점검이 쉬움.

---

## 부록 — 전체 음식 리스트
머신 가독 전체 목록은 **`docs/food-photo-shotlist.csv`** 참조(300행). 컬럼: `meal_type, celebrity_slug, title, key_ingredients, description`. meal_type → title 순 정렬.
