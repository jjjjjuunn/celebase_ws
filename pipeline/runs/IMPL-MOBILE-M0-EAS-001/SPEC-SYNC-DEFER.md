# SPEC-SYNC-DEFER: IMPL-MOBILE-M0-EAS-001

- **사유**: `docs/SPEC-PIVOT-PLAN.md` §2 의 "M0 Scaffold" 행이 "M0 통합 PR 시 patch" 정책으로 명시되어 있다. M0 는 5 개 서브태스크 (EAS, Metro `resolveRequest` throw, jest 셋업, design-tokens RN 연동, App.tsx 첫 화면) 의 묶음이며, spec.md §11 의 mobile 섹션 patch 는 5 개 서브태스크 모두 main 머지된 후 한 번에 일관된 상태로 작성하는 것이 합리적. 본 PR 은 M0 의 첫 번째 서브태스크 (EAS 셋업) 만 포함한다.
- **후속 task**: `SPEC-SYNC-MOBILE-M0-001` — M0 5 개 서브태스크 완료 후 retroactive backfill. `docs/SPEC-PIVOT-PLAN.md` §3 에 등록 예정 (M0 마지막 서브태스크 PR 머지 시 동시 등록).
- **영향**: spec.md §11 의 다음 항목들이 M0 통합 PR 머지 전까지 stale:
  - EAS 빌드 인프라 도입 (eas-cli pin, eas.json 3 프로파일 구조)
  - bundle identifier (`com.celebbase.mobile`) 결정
  - Expo project owner 가 개인 계정 (`@ryuben/celebbase-mobile`) 인 임시 상태 — 출시 전 celebbase 조직 owner 로 transfer 필요 (`SPEC-SYNC-MOBILE-M0-001` 에 함께 기록)
  - 검증: 본 PR 의 `apps/mobile/eas.json` + `apps/mobile/app.json` 코드 자체가 결정 사항의 source of truth — spec 본문 patch 전까지는 코드 참조로 대체.
