---
applies_to:
  - "db/seeds/lifestyle-claims/**/*.json"   # source/fact gate input
  - "content card copy (Notion card body)"  # legal/copy gate input
enforced_by: ".claude/agents/content-source-legal-gate.md"
gate_spec: "pipeline/templates/content-gate-criteria.yaml"
---
# Content Source & Legal Gate — Rule Set (CONTENT-GATE)

> 이 문서는 `content-source-legal-gate` 서브에이전트가 발행 전 카드를 검토할 때 쓰는 **루브릭**이다.
> 소싱 기본 규칙·ALLOWED_DOMAINS·면책 문구는 `.claude/rules/domain/content.md` 와
> `scripts/validate-claim-seeds.py` 를 **참조**한다 (중복 정의 금지). 본 문서는 §5 불변 제약
> (셀럽 네이밍권·State A/B·엔진-정직)을 게이트 검사 항목으로 형식화한 부분만 추가한다.

## Prime Directive (예외 없음)

- **이 게이트는 사전 검토(pre-flight)다. 자동 승인자가 아니다.** 법적 책임은 **junwon(게이트키퍼)** 에게 있다.
- 에이전트는 구조화 리포트를 낼 뿐, **법적 게이트를 단독 통과시키지 않는다.**
- `BLOCK` 또는 `HIGH` finding 이 1건이라도 있으면 → **`ESCALATE_TO_HUMAN`** (junwon 사인오프 필요).
- 근거 없는 PASS 금지 (`spec-dod.md`: "느낌으로 판단 금지"). 모든 판정에 evidence(라인/URL/파일) 첨부.

## 두 개의 게이트 (입력 아티팩트가 다름)

| 게이트 | 입력 | 자동화 성격 |
|---|---|---|
| **① 출처/사실** (`content_source_fact`) | `db/seeds/lifestyle-claims/<slug>.json` | 구조화 필드 → **자동 검사 traction 큼** |
| **② 법적/카피** (`content_legal_copy`) | 6슬라이드 카피 (Notion 카드 본문) | 대부분 **정성 판정** + 일부 스캔 |

## Severity & 처리

| severity | 의미 | 처리 |
|---|---|---|
| `BLOCK` | 법적 노출 / §5 위반 / 자동 검사 fail | 발행 차단 → ESCALATE_TO_HUMAN |
| `HIGH` | 실재 위험, 사람 판단 필요 | ESCALATE_TO_HUMAN |
| `MEDIUM` | 보정 권고 / 자동 검증 불가 | 리포트 + junwon 확인 |
| `PASS` | 근거와 함께 통과 | evidence 기록 |

---

## ① 출처/사실 게이트 — 규칙

| rule | 내용 | 검사 (check) | severity |
|---|---|---|---|
| **CL-SRC-SCHEMA** | claim JSON 이 `_schema.json` 준수 | `validate-claim-seeds.py` (required) | BLOCK |
| **CL-SRC-ALLOWLIST** | 모든 source URL 이 `content.md` ALLOWED_DOMAINS 내 | `validate-claim-seeds.py` (required) | BLOCK |
| **CL-SRC-PRIMARY** | `is_primary` ≤ 1/claim, primary 는 url 필수 | `validate-claim-seeds.py` (required) | BLOCK |
| **CL-SRC-TRUSTGATE** | `trust_grade=E` published 금지; `D` published 는 `disclaimer_key` 필수 | `validate-claim-seeds.py` (required) | BLOCK |
| **CL-SRC-CELEBLINK** | `celebrity_slug` → `db/seeds/data/<slug>.json` 존재 + 파일명=slug | `validate-claim-seeds.py` (required) | BLOCK |
| **CL-STATE-A** | food claim 이 `base_diet_id_slug` 로 base_diet 에 연결되고, 그 base_diet 가 실제 food 면 State A("Make my Plan"). 무연결·무food = State B | **claude_judgment** (data/<slug>.json 대조) · _backlog: 스크립트화_ | BLOCK |
| **CL-SRC-SUPPORTS** | primary source 가 claim 문구를 실제로 뒷받침 ("먹는다" O / "보증" X — content.md) | **claude_judgment** (WebFetch; UA차단 시 "사람 클릭 필요" 플래그) | HIGH |
| **CL-FALSELIGHT** | 생존 인물 false-light 금지 — 정확한 출처 사실만, 왜곡/허위 매칭 금지 | **claude_judgment** | BLOCK |
| **CL-HEALTHFLAG** | `is_health_claim` 이 실제 내용과 일치하게 설정 | **claude_judgment** | MEDIUM |

## ② 법적/카피 게이트 — 규칙

| rule | 내용 | 검사 (check) | severity |
|---|---|---|---|
| **CL-NAME-CTA** | 셀럽명 = CTA/버튼/앱스토어/푸시/유료광고에 **금지** (disclaimer 의 비제휴 명기는 예외) | `content-legal-scan.py` (required) | BLOCK |
| **CL-FTC-GUAR** | 결과·의료 보장 phrasing 금지 (cure/guarantee/clinically proven/lose N lbs…) | `content-legal-scan.py` (required) | BLOCK |
| **CL-DISC** | 비제휴 disclaimer + (health claim 시) "Not medical advice" 존재 | `content-legal-scan.py` (required) | BLOCK |
| **CL-ENGINE** | 엔진-정직: 칼로리·3대 매크로·취향 리스케일만 약속. 섬유질 그램·ramp·페르소나 금지 | `content-legal-scan.py` (HIGH) + claude_judgment | HIGH |
| **CL-PRODUCT-CLAIM** | 우리 제품 자기주장(온보딩 질문 수·플랜 길이·기능 상태)이 실제 제품과 일치. **드리프트 나는 하드코딩 숫자 금지** — 온보딩이 'N/3' 카운터를 의도적으로 제거함, 카피도 일반 표현 사용 | `content-legal-scan.py` (MEDIUM) + claude_judgment (spec/onboarding 대조) | MEDIUM |
| **CL-NAME-EDITORIAL** | 셀럽명은 에디토리얼 본문(헤드라인/바디, 1–3 슬라이드)에만 | **claude_judgment** | HIGH |
| **CL-NOMINATIVE** | 명목적 공정이용 3요건 충족 (① 식별에 필요 ② 최소 사용 ③ 후원 암시 없음) — CA §3344/SB683, Lanham, *New Kids* | **claude_judgment** | HIGH |
| **CL-FTC-PROMISE** | "associated with/linked to" 유지, 단정·과장 금지 (FTC) | **claude_judgment** | HIGH |
| **CL-IMAGE** | 이미지: 얼굴 X·로고 X·타이포 중심, **AI 셀럽 얼굴 생성 금지**. 프롬프트 = 오브제/음식/손목아래/실루엣 | **claude_judgment** (이미지 디렉션 검토) | BLOCK |
| **CL-IMAGE-HOST** | 발행 이미지 URL 의 hostname 이 신뢰 S3 에셋 allowlist(`ASSET_HOST_ALLOW`)에 일치 — 정확/도메인 suffix 매칭(substring 우회 차단). admin 도구 외부 노출 시 curl 우회 차단(서버측 강제) | `content-service content-legal-gate.ts` (서버측 자동, published 경로) | BLOCK |

---

## rule → check 매핑 (drift 방지)

- **required (자동, exit 0 필요)**: CL-SRC-SCHEMA · CL-SRC-ALLOWLIST · CL-SRC-PRIMARY · CL-SRC-TRUSTGATE · CL-SRC-CELEBLINK → `scripts/validate-claim-seeds.py` ‖ CL-NAME-CTA · CL-FTC-GUAR · CL-DISC → `scripts/content-legal-scan.py` ‖ **CL-IMAGE-HOST → `content-service content-legal-gate.ts`** (서버측 런타임 발행 게이트, published 경로 — seed CI 스캐너와 별개)
- **claude_judgment (정성)**: CL-STATE-A · CL-SRC-SUPPORTS · CL-FALSELIGHT · CL-HEALTHFLAG · CL-ENGINE · CL-NAME-EDITORIAL · CL-NOMINATIVE · CL-FTC-PROMISE · CL-IMAGE · CL-PRODUCT-CLAIM
- **scanner-detected (advisory, exit-fail 아님)**: CL-PRODUCT-CLAIM (하드코딩 카운트 MEDIUM 플래그)
- **v1 backlog (스크립트화 예정)**: CL-STATE-A (base_diet_id_slug → data/<slug>.json food 연결 자동 대조) · CL-ENGINE (현재 부분 스캔만)

## 제품 자기주장 — 단일 진실 출처 (drift 방지)

카피가 우리 제품의 구체 수치/상태를 주장할 때(온보딩 질문 수, 플랜 길이, "라이브/준비중" 등)는 **반드시 source of truth와 대조**한다. 하드코딩한 숫자는 제품이 바뀌면 거짓이 된다:
- **온보딩 질문 수** → `apps/mobile/src/onboarding/OnboardingFlow.tsx` (`INPUT_STEP_COUNT`). 현재 9 step(이름·생년·성별·키·체중·활동·알레르기·목표·선호). 제품이 per-screen "N/3" 카운터를 **드리프트 때문에 제거**했으므로 카피도 **하드 숫자 대신 일반 표현**("a few quick questions") 사용.
- **State A/B (CTA 라이브/준비중)** → seed의 `base_diet_id_slug` 연결 + staging.
- 의심 시: 숫자를 빼고 일반화한다 ("3 questions" → "a few quick questions").

## 참조 (중복 정의하지 말 것)

- 소싱 기본 규칙·"먹는 식단(O)/보증(X)"·trust<0.7 pending·트렌드 자동게시 금지 → `content.md`
- ALLOWED_DOMAINS 실제 목록·schema·trust_grade published gate → `scripts/validate-claim-seeds.py`
- 면책 문구 원문 → `content.md` Health Disclaimer
- 리포트 스키마·severity 운영 → `.claude/rules/evaluator-runtime.md`, `pipeline/templates/gate-criteria.yaml`
