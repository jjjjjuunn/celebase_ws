# 2026-05-15 세션 정리 — 모바일 로그인 6시간 incident 종결

> 비전공자도 이해할 수 있도록 풀어 쓴 보고서.

## 1. 오늘 한 일을 한 줄로

**동료 (Dohyun) 가 어제부터 막혀있던 staging 모바일 로그인 실패를 진단하고 fix. 그 과정에서 BE owner (JUNWON) 의 mobile dev environment 셋업까지 한 번에 정착 + 추가 navigation 버그 발견 fix.**

PR #93 (mobile navigation fix) + IMPL_LOG 3 entries 신규 작성 + staging DB drift 1건 적용.

---

## 2. 큰 그림 — 문제는 1개가 아니라 4개가 겹쳐있었다

동료의 짧은 보고:
> "로그인 화면에서 502 BFF_CONTRACT_VIOLATION. zodIssues 공유해줘 — 한 줄로 끝남."

실제로 까보니 **4개의 독립적 문제가 한 incident 에 응고**되어 있었다:

| # | 문제 | 영역 | 발견 시점 |
|---|------|------|---------|
| 1 | staging DB 의 schema migration 미적용 (drift) | BE / infra | 처음 1시간 — 동료 진단 정확 |
| 2 | Expo Go 의 native module 한계 (Amplify SRP 작동 불가) | mobile dev env | 2~5시간 (디버깅 끝물) |
| 3 | macOS 의 project path 공백 함정 (CocoaPods build truncate) | local infra | 5~5.5시간 |
| 4 | RootNavigator 의 login signal 비대칭 (PR #93) | mobile auth flow | 5.5~6시간 (검증 직전) |

#1 만 해결하면 끝날 줄 알았는데, 진짜 검증을 위해 본인이 mobile 화면을 띄워야 했고, 그 과정에서 #2, #3, #4 가 연쇄로 표출.

---

## 3. 단계별 — 4개 문제 각각의 비유

### 문제 1: staging DB 의 schema 가 main 보다 옛날 버전 (drift)

**증상**: 모바일 로그인 시도 → Cognito 통과 → BFF 도착 → `502 Upstream response failed schema validation`

**비유**: 회사 본사 (`main` 브랜치) 에는 새 양식 (`preferred_celebrity_slug`, `preferences` 컬럼) 이 도입됐는데, 지사 (`staging` 서버 DB) 는 옛 양식 그대로. 손님 (사용자) 이 새 양식을 기대하고 들어왔는데 지사 직원이 옛 양식만 갖고 있어서 양식 빠진 채로 응답 → 본사 게이트가 검사하다가 거절.

**원인**: 우리 staging deploy 파이프라인이 **컨테이너 image 만 새로 push** 하고 **DB schema migration 은 자동 실행 안 함**. 누군가 손으로 적용해야 하는데 5월 초 migration 0010/0012 가 누락된 채 흘러왔음.

**해결** (1시간 만에 끝):
- BFF stderr 의 `zodIssues` 로그에서 `path: ["user","preferred_celebrity_slug"]`, `expected:string received:undefined` 확인 — 컬럼 자체 부재 확정
- staging EC2 SSH → `docker compose exec db psql -U celebbase -d celebase` 로 진입 → migration 0010, 0012 의 `ALTER TABLE ... ADD COLUMN` 4번 실행
- 결과: `users` 테이블 11 → 13 컬럼, 5 → 7 인덱스, 기존 행은 NULL/`{}` 로 자동 backfill

**후속 backlog**: `CHORE-STAGING-MIGRATION-AUTORUN-001` — CD workflow 에 migration runner (`node-pg-migrate` / `dbmate` 등) 통합. 이번 같은 drift 가 재발 안 하도록.

### 문제 2: Expo Go 로는 모바일 인증 검증 자체가 불가능

**증상**: 동료에게 fix 적용했다 알리고 본인이 직접 검증하려고 Expo Go 로 앱 띄워서 로그인 시도 → generic `[Unknown: An unknown error has occurred.]` 만 표출. 진짜 에러 메시지 없음.

**비유**: Expo Go = **App Store 에 미리 올라간 단일 앱** 안에 "Expo 가 사전 선별한 native module 패키지" 가 빌트인. 임의 third-party native module (= `@aws-amplify/react-native`, RevenueCat 등) 은 물리적으로 못 넣음. 그래서:
- 우리 mobile 의 Amplify v6 가 SRP 인증의 `modPow` (모듈러 거듭제곱) 계산을 iOS native module 로 위임
- Expo Go 에 그 native module 이 **없음**
- Cognito 호출 도달 전에 native binding `Proxy.get` 에서 throw → Amplify SDK 의 `assertServiceError` 가 매핑 못 해서 generic "Unknown" wrap

5/8 세션에 "Expo Go 에서 빈 화면 표시 ✅" 라고 적힌 건 **UI 렌더링까지만** 확인된 거고, 인증 같은 native-dependent 동작은 처음부터 작동 불가능했음.

**해결 — 정공법 dev build 로 전환**:
- Xcode 26.3 + CocoaPods 1.16.2 가 본인 Mac 에 이미 설치되어 있는 걸 확인
- `npx expo run:ios` 한 줄로 iOS Simulator (iPhone 16e) 에 dev build 자동 빌드 + 설치 + 실행
- 첫 빌드 ~10분 (Pods 컴파일), 이후 JS 변경은 hot reload — Expo Go 와 같은 dev 경험

**Lesson**: Expo Go 는 **UI/JS preview 전용**. 인증/IAP/native 검증은 dev build 필수. BE owner 도 mobile 화면 띄울 수 있는 capability 유지가 안정화의 한 축.

### 문제 3: project path 의 공백이 CocoaPods 빌드를 부순다

**증상**: `npx expo run:ios` 가 거의 끝까지 갔다가 마지막 단계에서:
```
❌ Script '[CP-User] Generate app.config for prebuilt Constants.manifest' failed
No such file or directory: /Users/junwon/Global
```

**비유**: 본인 project path 가 `/Users/junwon/Global PBL Program/project/applied ai project/celebase/...` 였음. 공백 4개. CocoaPods 의 build script 가 path 를 인용 부호로 묶지 않고 사용 → shell 이 `/Users/junwon/Global` 까지만 한 인자로 해석. **첫 공백 위치에서 truncate**.

이건 React Native + CocoaPods 의 알려진 함정. RN 공식 docs 에도 "프로젝트 path 에 공백/특수문자 금지" 명시. 다만 본인이 그동안 BE/BFF/web 만 빌드해서 안 만났던 함정 — Node/TypeScript/Docker 는 path 공백 안전 처리.

**해결**:
```bash
mv "/Users/junwon/Global PBL Program/project/applied ai project/celebase" /Users/junwon/celebase
```

그 후 cache cleanup (절대 path 박힌 prebuild artifacts, pnpm symlinks, Xcode DerivedData 모두 청소) + 재빌드.

**Lesson**: project clone 위치 path 에 공백/한글/특수문자 금지. iOS native build 만 이 함정에 걸림.

### 문제 4: 로그인 성공 후 화면이 안 바뀌는 navigation 버그

**증상**: 마침내 로그인 성공 → 빨간 dev warning 화면:
```
The action 'RESET' with payload {"index":0,"routes":[{"name":"Main"}]} was not handled by any navigator.
```

**비유**: 회사 입구의 안내데스크 직원이 손님에게 "본관 (Main) 가시려면 이 카드 찍으세요" 라고 했는데, 카드 리더기가 아직 "방문객 모드" 라 본관 카드를 인식 못 함. 직원이 카드 리더기를 "직원 모드" 로 바꾸는 게 먼저인데 그 신호가 안 갔음.

**기술적 원인**:
- `RootNavigator` 가 `phase` state 로 'auth' vs 'main' 화면을 conditional rendering
- 로그인 성공 직후 `LoginScreen.onSuccess` 가 `navigation.reset({ routes: [{ name: 'Main' }] })` 호출
- 그 시점 `phase` 는 여전히 `'auth'` → `Main` screen 자체가 navigator 에 등록 안 됨 → 거절
- 기존 `auth-events` 모듈에 `signalLogout` 만 있고 login 방향 signal 이 빠진 비대칭

**해결** (PR #93):
- `auth-events.ts` 에 `signalLogin` / `onLoginSignal` 추가 (logout 의 거울 구조)
- `services/auth.ts` 의 `signIn` / `confirmSignUpAndLogin` 이 `setTokens` 직후 `signalLogin()` 호출
- `RootNavigator` 가 `onLoginSignal` 구독 → `setPhase('main')` → `Main` screen 등록
- `AuthNavigator` 의 redundant `reset` 호출 제거

총 4 files, +77 / -25 LOC. 다음 검증:
- ✅ signIn → MainTabs 자동 진입
- ✅ logout → Auth 화면 복귀
- ✅ 재로그인 → MainTabs 재진입
- ✅ `pnpm --filter mobile test` 22 suites / 140 tests PASS, 회귀 0

---

## 4. multi-session 경계 — `apps/mobile/**` 는 동료 영역인데 본인이 fix 한 이유

`.claude/rules/multi-session.md` §1 의 owner topology 상 `apps/mobile/**` = Dohyun. JUNWON (BE owner) 이 cross-boundary fix 한 근거:

1. **§9 우선순위**: `보안 > 개인정보 > 데이터 무결성 > 성능 > 편의`. 이번 fix 는 "사용자 unblocking" 으로 §1 (owner 경계) 보다 우선.
2. **30분 fix vs 동료 한나절 회수**: hand-off 만 하면 동료가 내일 같은 incident 디버깅 반복.
3. **선례**: IMPL-AUTH-LAZY-PROVISION-001 도 같은 논리로 BE owner 가 mobile auth flow 가까이 작업한 케이스.

PR 단독 self-merge 금지 — Dohyun review 후 머지 (multi-session §1 존중).

---

## 5. 시간 분포 회고 — 6시간 incident 의 진짜 비용

| 단계 | 소요 | 결과물 |
|------|------|--------|
| BFF schema → migration drift 진단 (real fix) | ~1h | valid fix |
| Cognito user 상태 / policy 가설 (false positive 3개) | ~1h | 가설 기각만 |
| Amplify SDK 깊이 추적 → underlyingError 도달 | ~2h | 결정적 단서 |
| Expo Go native module 부재 확정 | 1분 | "처음부터 불가능" |
| path 공백 함정 발견 + mv | ~30m | 정공법 환경 |
| BUG-MOBILE-AUTH-LOGIN-SIGNAL 발견 + fix | ~30m | PR #93 |
| IMPL_LOG + 회고 정리 | ~30m | 본 노트 |

**약 3시간이 "검증 환경 결함으로 발생한 잘못된 진단"**. 처음부터 dev build 였다면 6시-7시 사이 closure. 오늘 incident 의 2/3 가 환경 미스매치 비용.

이게 안정화의 의미 — `CHORE-MOBILE-DEV-BUILD-LOCAL-001` (BE owner 도 mobile dev env 진입 가능 상태) + `CHORE-STAGING-MIGRATION-AUTORUN-001` (drift 자동 차단) 두 가지가 짝지어야 같은 incident class 종결.

---

## 6. 결과물 정리

### 코드 변경
- **PR #93** (`fix/BUG-MOBILE-AUTH-LOGIN-SIGNAL`, 4 files +77/-25): mobile navigation login signal 신설. Dohyun review 대기.

### 운영 변경 (코드 0건)
- staging DB `users` 테이블에 migration 0010 + 0012 적용 (11 → 13 컬럼, 5 → 7 인덱스)
- 본인 Mac 의 project path `~/Global PBL Program/.../celebase` → `~/celebase` 이동 (공백 제거)
- Cognito staging User Pool 의 `junwon020124@gmail.com` 계정 (테스트 용도, 비밀번호 admin-set)

### 문서
- 본 노트 (`docs/SESSION-2026-05-15-mobile-auth-incident.md`)
- `docs/IMPLEMENTATION_LOG.md` entries 3개:
  - `FIX-STAGING-MIGRATION-0010-0012-001` — staging DB drift 적용 기록
  - `CHORE-MOBILE-DEV-BUILD-LOCAL-001` — dev env 정착 + Expo Go 한계 + path 함정 lesson
  - `BUG-MOBILE-AUTH-LOGIN-SIGNAL` — PR #93 의 IMPL_LOG entry (SHA 는 머지 후 추가)

### Backlog 신규
- `CHORE-RULES-MOBILE-DEV-ENV-001` — `.claude/rules/multi-session.md` 의 mobile dev environment section 신설 (agent rules patch 라 사용자 허가 필요)
- `CHORE-STAGING-MIGRATION-AUTORUN-001` — CD workflow 에 migration runner 통합
- `CHORE-USER-SERVICE-SCHEMA-SANITY-001` — user-service startup 시 column existence sanity check
- `FIX-STAGING-CLAIMS-LOAD-001` — 홈 화면 "Couldn't load claims." 진단 (별개 BE issue)
- `CHORE-MOBILE-DEV-BUILD-SCRIPTS-001` — `apps/mobile/package.json` scripts 정합화 (동료 합의 후)

---

## 7. 동료에게 내일 전달할 메시지

> 어제부터 막혀있던 staging 모바일 로그인 6시간 디버깅 끝났음. 두 가지 fix:
>
> 1. **staging DB migration drift** (BE/infra) — 이미 적용됨, 추가 작업 없음. `pull && pnpm install` 후 그대로 로그인 시도하면 정상.
> 2. **PR #93 (mobile navigation login signal)** — `apps/mobile/` 영역이라 너 review 필요. 4 files +77/-25, navigation 비대칭 fix. typecheck/lint/test PASS, simulator 검증 완료. 코멘트 또는 LGTM 부탁.
>
> 별개로 dev environment 관련 lesson 정리해서 IMPL_LOG 에 entries 3개 추가. `multi-session.md` 의 mobile dev env section 신설은 별도 PR 예정.
>
> 홈 화면의 "Couldn't load claims." 는 별개 BE issue, 내일 BE 세션에서 진단 예정.
