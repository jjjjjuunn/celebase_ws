# apps/web — FROZEN (2026-05-07)

> **상태**: PIVOT-MOBILE-2026-05 이후 운영 중단. 자산 보존 목적으로만 유지.
> **재활성화**: 별도 결정 시 (예: 어드민 패널, 마케팅 사이트) 재개. 그전까지 새 기능 추가 금지.
> **Active client**: `apps/mobile` (Expo / React Native). `docs/MOBILE-ROADMAP.md` 참조.

---

## 왜 frozen 인가

- 2026-05-07 PIVOT-MOBILE-2026-05 결정으로 운영 채널을 web → mobile (iOS + Android) 단독으로 전환
- 단일 코드베이스 (Expo / RN) 로 App Store + Play Store 양쪽 출시
- web BFF (cookie-session 기반) 는 모바일 (bearer token 기반) 에서 재사용 부적합 — 모바일은 BE 서비스 직접 호출

## 보존 대상

- Next.js App Router 페이지·layout (`src/app/**`)
- React Server Components, Server Actions
- BFF 라우트 (`src/app/api/**`) — JUNWON 이 잔존 유지보수
- middleware (CSP, JWT 가드 등)
- Playwright E2E spec
- `packages/ui-kit` 의 web React 컴포넌트 (별도 frozen)

## 유지보수 범위 (JUNWON 만)

허용:
- 보안 패치 (CSP, header, 의존성 CVE 업그레이드)
- BE 서비스 인터페이스 변경에 따른 BFF 라우트 호환 패치
- 빌드 깨짐 방지용 minimal fix

금지:
- 새 페이지·라우트 추가
- UX 개선·디자인 iteration
- 새 BFF 엔드포인트 (모바일은 BE 직접 호출)

## 재활성화 시 체크포인트

만약 web 재개 결정이 나면:
1. `docs/MOBILE-ROADMAP.md` 와의 양립 가능성 결정 (admin/marketing 분리 vs 동일 채널)
2. PIVOT 이후 추가된 BE 변경분 (`services/**`) 을 web 에서 재사용 가능한지 검증
3. `packages/design-tokens` RN 익스포트가 추가된 상태에서 web CSS 변수 빌드 회귀 X 확인
4. 로컬 dev: `pnpm --filter web dev` (변경 없음)
5. CI: web 잡이 paths-ignore 로 모바일 변경 시 스킵되는지 확인 → 재활성화 시 필요한 트리거 복원

## 로컬 dev (긴급용)

```bash
pnpm install
pnpm --filter web dev
# http://localhost:3000
```

빌드 깨질 경우 우선순위는 보안·deps 패치 → 그 외 변경은 PIVOT 결정 재논의 후.

## Cross-references

- `CLAUDE.md` §1.1 Ownership
- `.claude/rules/multi-session.md` Session Topology — Frozen 영역
- `docs/MOBILE-ROADMAP.md` — active client roadmap
- `docs/FE-ROADMAP.md` — pre-pivot historical north-star (archived)
