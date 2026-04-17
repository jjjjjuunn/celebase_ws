---
paths:
  - "services/content-service/**/*"
  - "src/web/**/*"
  - "src/mobile/**/*"
  - "**/*.tsx"
---
# Content, Data & Accessibility Rules

## Celebrity Data

- 식단 정보는 공개 인터뷰, 출판물, 공식 SNS에서만 수집.
- 모든 식단에 출처(`source_refs`) 명시.
- "~가 먹는 식단" (O) / "~가 추천/보증하는 식단" (X) — 오해 유발 표현 금지.
- 셀러브리티 이미지: 라이선스 확인 후 사용.

## Health Disclaimer

- 모든 식단/영양 화면에 면책 조항 표시:
  > "This information is for educational purposes only and is not intended as medical advice."
- 특정 의료 조건 입력 시 식단 생성 전 추가 경고.
- 칼로리 목표 < 1200kcal 시 하한선 적용 + 의사 상담 권고.

## Nutritional Data

- 출처: USDA FoodData Central (기본), 제조사 라벨 (보조).
- 재료 단위 합산 자동 계산 (수동 입력 최소화).
- 자동 계산 vs 참조 데이터 편차 > 20% → 관리자 리뷰 플래그.

## Trend Intelligence (Phase 2+)

- **자동 게시 금지**: 편집팀 수동 승인 후에만 노출.
- **수집 범위**: 공개 게시물만. 비공개/삭제/DM/파파라치 제외.
- **플랫폼 ToS 준수**: 공식 API만 사용, 스크래핑 금지.
- **원본 비저장**: 이미지/영상 저장 금지, 텍스트 발췌+메타데이터만.
- **신뢰도 < 0.7**: `pending` 분류 → 편집팀 리뷰.
- **Dynamic Base Layer**: 사용자 opt-in 알림. 기존 meal plan 자동 변경 금지.

## Wearable Data (Phase 2+)

- 사용자 명시적 동의 카테고리만 수집.
- 기기 로컬 집계 → 일일 요약값만 서버 전송.
- CGM 데이터: `bio_profiles.biomarkers`와 동일 암호화 정책.

## Accessibility & i18n

- WCAG 2.1 AA 준수.
- 색상 대비 최소 4.5:1.
- 모든 이미지에 alt text.
- 초기: English (en-US). i18n 프레임워크 Day 1 적용 (하드코딩 문자열 금지).
- 숫자/단위: locale 기반 (미국 기본 lb/oz/°F, metric 전환 옵션).
- **ARIA toggle consistency (IMPL-UI-002 교훈)**: toggle 버튼/칩 그룹의 모든 멤버는 `aria-pressed` 를 boolean 으로 항상 emit (selected=false 도 `"false"` 명시). attribute 생략은 display-only 일 때만 허용 — 스크린리더가 toggle 여부 자체를 인식하지 못하는 것을 방지한다. `:focus-visible` 로만 focus ring 제공, `:focus` 단독 사용은 마우스 클릭에도 노출되어 금지.

## Deployment & Infrastructure

### Environments
`local` → `dev` → `staging` → `production`
- local: Docker Compose / dev: PR 자동 배포 / staging: develop 자동 배포 / production: main 태그, 수동 승인.

### Container Rules
- Base: `node:22-alpine` (Node), `python:3.12-slim` (Python)
- Multi-stage build 필수
- Health check: `GET /health` → `{ "status": "ok", "version": "x.y.z" }`
- Non-root user 실행
- 이미지: WebP 우선, 적응형 크기(thumbnail/medium/full), CDN

### Mobile Performance
- 번들: iOS 30MB, Android 25MB
- Lazy loading, Skeleton UI (빈 화면 금지)
