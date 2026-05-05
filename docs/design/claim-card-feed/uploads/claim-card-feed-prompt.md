# Claude Design Input — CelebBase "Wellness Claims Feed" (Tab 1: Discover)

> **이 파일 하나만** Claude Design (Artifact / claude.ai) 에 첨부하면 충분하도록 자족적으로 작성됨.
> Source 문서: `DESIGN.md` (CelebBase Design System v1.0), `spec.md` §3.5 / §7.2 / §9.3.
> 작성일: 2026-05-04. 대상 PIVOT: PIVOT-2026-05 (셀럽 카드 → ClaimCard).

---

## 0. 한 문장 브리프

CelebBase Wellness 의 홈 탭 "Discover" 첫 화면은 **Wellness Claims Feed** 다 — 셀럽 한 명이 카드의 단위가 아니라, **셀럽이 한 발언/루틴 한 건**(LifestyleClaim) 이 카드 한 장이다. 각 카드는 **출처(URL)** 와 **신뢰등급(trust_grade A~D)** 을 표면에 노출한다. "Inspired Meal Plan" CTA 는 보조 경로다.

---

## 1. 브랜드 매니페스토 (요약)

CelebBase 는 **celebrity aspiration × clinical precision** 의 교차점에 있다. 비주얼은 다음 4가지를 동시에 만족해야 한다:

- 가계 CEO 가 식료품 예산을 맡길 만큼 **럭셔리**
- 바이오해커가 매크로를 맡길 만큼 **정밀**
- 인플루언서가 SNS 에 공유할 만큼 **따뜻**
- GLP-1 사용자가 근육 보존을 맡길 만큼 **의료적 신뢰감**

### Experience Pillars
1. **Premium Calm** — cinematic spacing, controlled typography, restrained color
2. **Guided Momentum** — 사용자는 다음 액션을 3초 안에 안다
3. **Explainable Personalization** — AI 변경마다 근거 라벨이 붙는다
4. **Conversion Without Pressure** — 화면당 1개의 dominant CTA

### Visual Signature
- **Display serif**: Fraunces (셀럽 이름·hero 텍스트) — editorial premium
- **Gold accent**: 브랜드의 단일 액션 컬러 (절제)
- **Whisper borders + pill tags** — 미세 디테일

### Non-Negotiables
1. WCAG 2.1 AA 이상
2. 영양/식단/건강 화면에는 health disclaimer 필수, 절대 `aria-hidden` 금지
3. **Theme token (`--cb-*`) 만 사용 — raw hex 금지**
4. 화면당 Primary CTA 최대 1개
5. 네트워크 의존 모듈은 skeleton loader 필수

---

## 2. 토큰 시스템 (이 토큰들만 사용)

> Claude Design 결과물은 **모든 색·간격·반경을 아래 CSS 변수로만 참조**한다. 새 색을 만들지 마라. raw hex 금지 — `--cb-*` 토큰을 통해서만.

```css
:root {
  /* ---- Brand (Gold) ---- */
  --cb-brand-50:  #FBF8F0;   /* subtle section bg */
  --cb-brand-100: #F5EDDA;   /* selected chip fill, source attribution chip bg */
  --cb-brand-500: #C9A84C;   /* decorative accent, active states (text must be dark) */
  --cb-brand-600: #8B6D2F;   /* PRIMARY CTA bg (white text, 6.2:1) */
  --cb-brand-700: #6B5420;   /* CTA pressed, source attribution text */

  /* ---- Neutral Spine (warm parchment) ---- */
  --cb-neutral-0:   #FAFAF8;  /* page background */
  --cb-neutral-50:  #F4F3F0;  /* card surfaces, input bg */
  --cb-neutral-100: #E8E6E1;  /* borders, dividers */
  --cb-neutral-200: #D0CEC8;  /* decorative borders */
  --cb-neutral-300: #A8A5A0;  /* disabled */
  --cb-neutral-400: #8A8780;  /* placeholder text */
  --cb-neutral-500: #6D6A64;  /* secondary labels, metadata, timestamps */
  --cb-neutral-600: #5A5750;  /* body text */
  --cb-neutral-700: #3D3B37;  /* emphasized body, sub-headings */
  --cb-neutral-900: #1A1917;  /* primary headings, hero text */
  /* NOTE: --cb-neutral-800 은 의도적으로 없음. 사용 금지. */

  /* ---- Semantic ---- */
  --cb-success-600: #0F7438;  --cb-success-100: #DDF3E6;  /* trust_grade A */
  --cb-info-600:    #1767B8;  --cb-info-100:    #D9EAFB;  /* trust_grade B, health disclaimer */
  --cb-warning-600: #A15900;  --cb-warning-100: #FDEBD5;  /* trust_grade D */
  --cb-danger-600:  #B4232C;  --cb-danger-100:  #FADADD;  /* allergen, destructive */

  /* ---- Persona Accents (claim_type chip 강조에만 한정 사용) ---- */
  --cb-accent-biohacker:    #0E8F9B;  /* teal-cyan */
  --cb-accent-glp1:         #7B5EA7;  /* muted purple */
  --cb-accent-aspirational: #D4654A;  /* warm terracotta */

  /* ---- Spacing (8px base, 4px sub) ---- */
  --cb-space-1: 4px;   --cb-space-2: 8px;   --cb-space-3: 12px;
  --cb-space-4: 16px;  --cb-space-5: 20px;  --cb-space-6: 24px;
  --cb-space-7: 32px;  --cb-space-8: 40px;  --cb-space-11: 64px;

  /* ---- Layout ---- */
  --cb-container-max: 1200px;
  --cb-gutter-mobile: 16px;
  --cb-gutter-tablet: 24px;
  --cb-gutter-desktop: 32px;

  /* ---- Radius ---- */
  --cb-radius-xs:  4px;   /* tight chips */
  --cb-radius-sm:  8px;   /* inputs, badges */
  --cb-radius-md:  12px;  /* standard content cards */
  --cb-radius-lg:  16px;  /* recipe cards, ClaimCard */
  --cb-radius-xl:  24px;  /* prominent panels */
  --cb-radius-2xl: 32px;  /* magazine-cover hero only */
  --cb-radius-pill: 9999px;

  /* ---- Shadow (light mode) ---- */
  --cb-shadow-1: 0 1px 3px rgba(26,25,23,0.06), 0 1px 2px rgba(26,25,23,0.04);
  --cb-shadow-2: 0 4px 12px rgba(26,25,23,0.10), 0 2px 4px rgba(26,25,23,0.06);
  --cb-shadow-3: 0 16px 40px rgba(26,25,23,0.15), 0 4px 12px rgba(26,25,23,0.08);
  --cb-shadow-brand: 0 8px 24px rgba(139,109,47,0.30);   /* Primary CTA only — max 1 per screen */
  --cb-shadow-focus: 0 0 0 3px rgba(139,109,47,0.40);

  /* ---- Borders (Claude-inspired whispers) ---- */
  --cb-border-default: 1px solid rgba(26,25,23,0.08);
  --cb-border-strong:  1px solid rgba(26,25,23,0.15);
  --cb-border-focus:   2px solid var(--cb-brand-600);

  /* ---- CTA text auto-flip ---- */
  --cb-cta-text: #FFFFFF;
}
```

---

## 3. Typography

| Token | Size / Weight | Font | 사용 |
|-------|---------------|------|------|
| `--cb-display-md` | 34px / 600 / lh 1.24 | **Fraunces** | 셀럽 이름 (hero only), 카드 안에서는 사용 금지 |
| `--cb-h1` | 28px / 700 | Plus Jakarta Sans | 화면 타이틀 ("Discover") |
| `--cb-h2` | 24px / 700 | Plus Jakarta Sans | 섹션 헤딩 |
| `--cb-h3` | 20px / 600 | Plus Jakarta Sans | 카드 헤드라인(claim headline) — **이게 ClaimCard 의 메인 텍스트** |
| `--cb-body-md` | 16px / 400 / lh 1.50 | Plus Jakarta Sans | 본문, body excerpt |
| `--cb-body-sm` | 14px / 400 / lh 1.50 | Plus Jakarta Sans | secondary description, disclaimer |
| `--cb-label-md` | 13px / 600 / 0.01em | Plus Jakarta Sans | chip label, claim_type 배지 |
| `--cb-label-sm` | 12px / 500 / 0.02em | Plus Jakarta Sans | 작은 메타, trust_grade 배지 안의 글자 |
| `--cb-caption` | 12px / 400 / lh 1.50 | Plus Jakarta Sans | timestamp, source 발행일 |

**Rules**
- Fraunces 는 ≥34px display 에서만 — 카드 본문 / 라벨 / 폼 / 표 금지.
- JetBrains Mono 는 숫자 metric 전용 (이번 화면에는 거의 등장 안 함).
- 최소 12px. 그 이하 금지.
- 카드 헤드라인은 **plain text** 로 렌더 — `<strong>` `<em>` `dangerouslySetInnerHTML` 금지 (보안 §9.3 #1).

---

## 4. 도메인 모델 — LifestyleClaim (이 데이터 구조를 그대로 카드에 매핑)

### 4.1 `claim_type` (7종)

| Value | 의미 | 권장 아이콘 (lucide) | 권장 chip 색 |
|-------|------|---------------------|-------------|
| `food` | 식단·음료·식품 | `utensils` | `--cb-brand-100` bg / `--cb-brand-700` text |
| `workout` | 운동·피트니스 | `dumbbell` | `--cb-accent-biohacker` 14% bg / `--cb-accent-biohacker` text |
| `sleep` | 수면 루틴 | `moon` | `--cb-accent-glp1` 14% bg / `--cb-accent-glp1` text |
| `beauty` | 스킨/헤어 | `sparkles` | `--cb-accent-aspirational` 14% bg / `--cb-accent-aspirational` text |
| `brand` | 사용 브랜드 | `tag` | `--cb-neutral-100` bg / `--cb-neutral-700` text |
| `philosophy` | 가치관·철학 | `quote` | `--cb-neutral-50` bg / `--cb-neutral-700` text |
| `supplement` | 영양제·보충제 | `pill` | `--cb-info-100` bg / `--cb-info-600` text |

### 4.2 `trust_grade` (배지)

| Grade | 의미 | 배지 시각 |
|-------|------|----------|
| **A** | 본인 공식 SNS·인터뷰 1차 인용 | `--cb-success-100` bg / `--cb-success-600` text + 체크 아이콘 |
| **B** | 검증 매체 직접 인터뷰 (Vogue, ELLE, People …) | `--cb-info-100` bg / `--cb-info-600` text |
| **C** | 브랜드 협업·보도자료 | `--cb-neutral-100` bg / `--cb-neutral-700` text |
| **D** | 2차 보도·간접 추정 (disclaimer 필수) | `--cb-warning-100` bg / `--cb-warning-600` text + ⚠ 아이콘 |

배지 모양: pill, padding `4px 10px`, label-sm, `Grade A` `Grade B` 같은 라벨로 표기. 색상 의존 금지(WCAG) — 등급 텍스트도 함께 표시.

### 4.3 카드의 핵심 필드

```ts
type LifestyleClaim = {
  id: string;
  celebrity: { name: string; thumb_url: string };     // 40px avatar + 이름
  claim_type: 'food'|'workout'|'sleep'|'beauty'|'brand'|'philosophy'|'supplement';
  trust_grade: 'A'|'B'|'C'|'D';                       // E 는 published 금지, 화면에 안 나옴
  headline: string;                                    // max 280자, plain text
  body: string | null;                                 // max 10000자, plain text, 카드에서는 3줄 truncate
  primary_source: {
    outlet: string;                                    // "Vogue", "Instagram"
    url: string;                                       // allowlist 도메인만
    published_date: string;                            // YYYY-MM-DD
  } | null;
  is_health_claim: boolean;                            // true 면 disclaimer 필수
  disclaimer_key: string | null;                       // D 등급이면 NOT NULL
  base_diet_id: string | null;                         // null 이 아닐 때만 "Inspired Meal Plan" CTA 노출
  published_at: string;                                // ISO 8601, "2일 전" 같은 상대시간으로 표기
  tags: string[];                                      // 카드 하단 옵션 (선택 노출)
};
```

---

## 5. 컴포넌트 스펙 — ClaimCard

### 5.1 Anatomy (위에서 아래)

```
┌──────────────────────────────────────────────────────┐
│  Row 1: claim_type chip   ·   trust_grade badge      │
│  ────────────────────────────────────────────────    │
│  Row 2: avatar(40px) + 셀럽이름 + "·" + 상대시간       │
│                                                      │
│  Row 3: headline  (h3, neutral-900, max 3줄 clamp)   │
│  Row 4: body excerpt  (body-md, neutral-600, 3줄)    │
│                                                      │
│  Row 5: 📎 outlet · 발행일 →   (caption, neutral-500) │
│                                                      │
│  Row 6 (조건부): ⚠ Health disclaimer banner          │
│                                                      │
│  Row 7: [Inspired Meal Plan]   ♡   ↗                 │
└──────────────────────────────────────────────────────┘
```

### 5.2 Sizing & Tokens

- Background: `--cb-neutral-0`
- Border: `--cb-border-default`
- Radius: `--cb-radius-lg` (16px)
- Shadow: `--cb-shadow-1`
- Padding: `--cb-space-5` (20px) all sides
- Inner row gap: `--cb-space-3` (12px)
- Avatar: 40px circle, `border-radius: 50%`, `object-fit: cover`
- Card max-width on desktop column: 480px

### 5.3 Header Row (claim_type + trust_grade)

- claim_type chip: pill, label-md, padding `4px 10px`, gap 6px (icon + text), 색은 §4.1 표
- trust_grade badge: pill, label-sm, padding `4px 10px`, **반드시 "Grade A" 같이 등급 텍스트 포함** — 색만으로 구분 금지
- 두 chip 사이 간격: `--cb-space-2` (8px)
- 두 chip 모두 `role` 시각 라벨일 뿐, focus 가능한 element 아님

### 5.4 Celebrity Row

- avatar 40px + name `--cb-h4` + `·` + relative time (`--cb-caption`, `--cb-neutral-500`)
- name 은 클릭 시 셀럽 상세로 이동 (스타일은 그저 텍스트, 호버 시 underline)

### 5.5 Headline + Body

- headline: `--cb-h3`, `--cb-neutral-900`, line-clamp 3
- body excerpt: `--cb-body-md`, `--cb-neutral-600`, line-clamp 3, 카드 안에서는 항상 truncate
- 마크다운/HTML 렌더 금지 — 텍스트 노드만

### 5.6 Source Row

- 형식: `📎 {outlet} · {published_date} →`
- `--cb-caption`, `--cb-neutral-500`
- 클릭 영역 전체가 외부 링크 (allowlist 도메인 — `vogue.com, elle.com, harpersbazaar.com, womenshealthmag.com, allure.com, people.com, instyle.com, glamour.com, nytimes.com, instagram.com, youtube.com, tiktok.com, x.com`)
- 외부 링크 아이콘 (lucide `external-link`) 또는 화살표
- `target="_blank"` + `rel="noopener noreferrer"` 표시
- `primary_source === null` 이면 이 행 자체를 렌더하지 않음 (그러나 published 카드는 항상 source 가 있는 것이 정상)

### 5.7 Health Disclaimer (조건부 — Row 6)

**노출 조건**: `is_health_claim === true` **또는** `trust_grade === 'D'`.

```
┌─ℹ─────────────────────────────────────────────────┐
│  의료적 조언이 아니며 개인 사례입니다.              │
│  특정 결과를 보장하지 않습니다.                     │
└────────────────────────────────────────────────────┘
```

- Background: `--cb-info-100`
- Left border: 3px solid `--cb-info-600`
- Icon: info-circle, `--cb-info-600`
- Text: `--cb-body-sm`, `--cb-neutral-600`
- Radius: `--cb-radius-sm`
- `role="note"` — **절대 `aria-hidden`, `display: none` 금지**
- `trust_grade === 'D'` 인 경우 disclaimer 텍스트 변형: "출처는 2차 보도이며 본인 발언이 아닐 수 있습니다."

### 5.8 CTA Row (Row 7)

- 좌: `[Inspired Meal Plan]` Primary CTA (gold)
  - `base_diet_id` 가 `null` 이면 **이 버튼 통째로 숨김** — 빈 자리 두지 마라
  - bg `--cb-brand-600`, text `var(--cb-cta-text)` (=#FFFFFF), label-lg, height 44px (카드 내부 mini variant), padding `12px 24px`, radius `--cb-radius-pill`, shadow `--cb-shadow-brand` **단, 카드 안에서는 그림자 생략 가능 (피드 화면당 brand shadow 1개 룰)**
- 우: ghost icon button × 2 — `♡ save`, `↗ share`
  - 사이즈 36px, 아이콘 `--cb-neutral-500`, hover 시 `--cb-neutral-900`
  - 시각적 비중 < CTA

### 5.9 카드 상태

- Default: shadow-1
- Hover (web only): translateY(-1px), shadow → shadow-2, 200ms ease
- Pressed (mobile): scale(0.99), shadow 유지
- Focus-visible (keyboard): outline `--cb-shadow-focus` 카드 전체에
- Loading skeleton: `--cb-skeleton-base #E8E1D8` / `--cb-skeleton-shimmer #F5EFE7`, 같은 anatomy 의 placeholder rect

---

## 6. 화면 — Tab 1: Discover (Wellness Claims Feed)

### 6.1 Layout (mobile 375px)

```
┌─────────────────────────────────────┐
│  Discover                           │ ← --cb-h1, padding-top 24px
├─────────────────────────────────────┤
│  🔍  Search celebrities, claims     │ ← search bar, --cb-neutral-50 bg
│                                     │   --cb-radius-pill, height 44px
├─────────────────────────────────────┤
│ [All][food][workout][sleep][beauty] │ ← chip rail, horizontal scroll
│      [brand][philosophy][supp.]     │   active chip: --cb-brand-100 bg
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │
│  │  ClaimCard                  │   │ ← 1-col, gap --cb-space-5 (20px)
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │  ClaimCard                  │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │  🔒 Unlock more — Premium   │   │ ← Free tier 게이트, 3장 후
│  └─────────────────────────────┘   │
│                                     │
│  ──── 로딩 중 ────                   │ ← skeleton x 2
└─────────────────────────────────────┘
   └ Bottom Tab Bar: Discover|My Plan|Track|Profile (72px)
```

### 6.2 Layout (desktop 1440px)

- container max-width: `--cb-container-max` (1200px), centered
- gutter: `--cb-gutter-desktop` (32px)
- ClaimCard grid: **2-col** at 768px+, **3-col** at 1280px+, gap 24px
- 좌측에 sticky filter sidebar 도입 가능 (선택) — claim_type 필터 + trust_grade 필터
- 상단에 "Trending Today" horizontal carousel 추가 가능 (5장, 선택)

### 6.3 Free tier 게이트

- 익명/Free 사용자는 카드 3장 노출 후 **🔒 Unlock more — Premium** 게이트 카드 표시
- 게이트 카드: `--cb-brand-50` bg, `--cb-border-default`, `--cb-radius-lg`, padding 32px, 중앙 정렬
- CTA: secondary 스타일 ("View plans") — 화면당 1 primary CTA 룰을 위해 secondary 권장

### 6.4 Skeleton

- 카드 2장 분량의 skeleton placeholder, shimmer animation `--cb-skeleton-shimmer` left-to-right 1.6s infinite

### 6.5 Empty State

- 필터 조합 결과 0건일 때:
  > "이 조합으로는 발견된 라이프스타일이 없어요. 필터를 줄여 보세요."
  - 일러스트 또는 아이콘 (큰 lucide `search-x`, `--cb-neutral-300`)
  - "Clear filters" ghost button

### 6.6 Error State

- 네트워크 오류:
  > "잠시 연결이 끊어졌어요. 다시 시도하시겠어요?"
  - "Retry" secondary button
  - `role="alert"` not for the whole region but for the message itself

---

## 7. Mock 데이터 (이 3장을 그대로 렌더해라)

```json
[
  {
    "id": "01HZ-A001",
    "celebrity": { "name": "Hailey Bieber", "thumb_url": "/mock/hailey.jpg" },
    "claim_type": "workout",
    "trust_grade": "A",
    "headline": "필라테스를 주 3회 한다 — 근력보다 자세를 위해서.",
    "body": "운동 후에는 단백질 셰이크 한 잔과 마그네슘 글리시네이트로 회복 루틴을 마무리한다.",
    "primary_source": {
      "outlet": "Vogue",
      "url": "https://vogue.com/article/hailey-bieber-pilates-routine",
      "published_date": "2025-11-12"
    },
    "is_health_claim": false,
    "disclaimer_key": null,
    "base_diet_id": "diet-001",
    "published_at": "2026-05-02T08:00:00Z",
    "tags": ["pilates", "recovery"]
  },
  {
    "id": "01HZ-A002",
    "celebrity": { "name": "Selena Gomez", "thumb_url": "/mock/selena.jpg" },
    "claim_type": "brand",
    "trust_grade": "B",
    "headline": "Rare Beauty 의 데일리 SPF 50 을 항상 써왔다고 인터뷰에서 밝혔다.",
    "body": "민감성 피부에 진정 효과를 주는 성분 위주로 직접 큐레이팅했다고 언급.",
    "primary_source": {
      "outlet": "ELLE",
      "url": "https://elle.com/beauty/selena-gomez-rare-beauty-spf-routine",
      "published_date": "2026-02-04"
    },
    "is_health_claim": false,
    "disclaimer_key": null,
    "base_diet_id": null,
    "published_at": "2026-04-28T10:30:00Z",
    "tags": ["spf", "skincare"]
  },
  {
    "id": "01HZ-A003",
    "celebrity": { "name": "Gwyneth Paltrow", "thumb_url": "/mock/gwyneth.jpg" },
    "claim_type": "food",
    "trust_grade": "D",
    "headline": "아침으로 본 브로스(bone broth) 를 즐겨 마신다고 알려져 있다.",
    "body": "여러 매체가 인용했지만 본인 직접 발언은 확인되지 않은 2차 보도이다.",
    "primary_source": {
      "outlet": "People",
      "url": "https://people.com/health/gwyneth-paltrow-bone-broth-routine",
      "published_date": "2025-09-21"
    },
    "is_health_claim": true,
    "disclaimer_key": "secondary_source_health",
    "base_diet_id": "diet-014",
    "published_at": "2026-04-25T14:00:00Z",
    "tags": ["broth", "morning-routine"]
  }
]
```

> **인덱스 0**: A 등급, base_diet 있음 → CTA 노출, disclaimer 없음
> **인덱스 1**: B 등급, base_diet 없음 → CTA 숨김, disclaimer 없음
> **인덱스 2**: D 등급 + is_health_claim=true → CTA 노출, **disclaimer 필수**

---

## 8. Deliverables (Claude Design 에 요청하는 것)

다음 4 개 artifact 를 분리된 HTML+CSS 로 만든다 (React 코드 아님 — 렌더 가능한 정적 마크업):

### 8.1 Artifact A — ClaimCard 단일 컴포넌트 카탈로그
- 한 페이지에 위 mock 3 장을 세로로 나열 (mobile 375px width 기준)
- 각 카드 **위**에 작은 라벨로 케이스 명시: "A1 — Grade A, with CTA, no disclaimer", "A2 — Grade B, no CTA", "A3 — Grade D + health claim → disclaimer"
- 마지막에 같은 anatomy 의 skeleton 카드 1 장

### 8.2 Artifact B — Tab 1 Discover 풀 화면 (mobile 375px)
- 헤더 "Discover" + search bar + chip rail + ClaimCard 3장 + Free tier 게이트 카드 + skeleton 2장
- bottom tab bar 포함 (Discover active 상태)

### 8.3 Artifact C — Tab 1 Discover 풀 화면 (desktop 1440px)
- 같은 콘텐츠, container 1200px, 2-col grid
- (선택) 좌측 sticky filter sidebar
- bottom tab bar 없음 — 대신 상단 nav

### 8.4 Artifact D — 카드 상태 그리드
- 동일 카드(A1 mock)의 5 상태를 격자로:
  default / hover / pressed / focus-visible / loading-skeleton

---

## 9. 강제 제약 (위반 시 reject)

1. **`--cb-*` 토큰만 사용**. raw hex 등장 시 invalid.
2. **CTA 는 카드당 최대 1개**, 화면당 brand-shadow gold CTA 는 최대 1개. 카드 안에서는 brand-shadow 생략 권장.
3. **headline / body 는 plain text** — 마크다운, HTML 태그, 이모지 인라인 강조 금지. 출처 인용 표기는 별도 source row 로만.
4. **trust_grade 는 색만으로 구분 금지** — "Grade A" 등 등급 텍스트 동반.
5. **Health disclaimer 는 `aria-hidden`, `display:none` 금지**. `role="note"`.
6. **외부 링크는 allowlist 도메인** (§5.6) 만. 다른 도메인 mock 금지.
7. **Fraunces 는 카드 안 사용 금지** — 셀럽 이름조차 카드 안에서는 Plus Jakarta Sans `--cb-h4`. Fraunces 는 hero/onboarding 전용.
8. **`--cb-neutral-800` 사용 금지** (스케일에 없음).
9. **그림자 ≤ 2 per viewport**. 데이터 카드 (metric) 는 flat (`--cb-shadow-0`).
10. **모든 인터랙티브 요소는 키보드 접근 가능**, focus-visible 시 `--cb-shadow-focus` 표시.
11. **상대시간 표기**: "2일 전", "5시간 전" 같은 한국어 상대 표기. ISO 원문은 `title` 속성으로만.
12. **이미지 alt 필수**: 셀럽 thumb 의 alt 는 `"{name} 프로필 사진"`. mock 이미지는 placeholder gradient 도 OK — 단 `alt` 는 항상 채워라.

---

## 10. 출력 형식

각 Artifact 는:

- **단일 HTML 파일**, `<style>` 태그 안에 모든 CSS 토큰을 `:root` 에 정의 (위 §2)
- 외부 폰트는 Google Fonts CDN 링크 (`<link>`) — Fraunces, Plus Jakarta Sans, JetBrains Mono
- 외부 의존성 없음 (React, Vue, Tailwind 금지)
- 아이콘은 lucide CDN 또는 inline SVG
- 한 파일 안에서 mobile/desktop responsive 처리 가능하면 좋지만, 별도 artifact 로 나눠도 됨

---

## 11. 우선순위 (시간이 부족하면)

1. **Artifact A** (ClaimCard 카탈로그) — 가장 중요. 이게 정확하면 나머지는 조립 문제.
2. **Artifact B** (mobile 풀 화면) — 다음.
3. Artifact C (desktop) 와 D (states) 는 시간이 남을 때.

끝. 질문 있으면 헤드라인/disclaimer 문구를 자유 변경하기보다 먼저 물어봐라 — 법적 표현 영역이다 (§9.3 7원칙).
