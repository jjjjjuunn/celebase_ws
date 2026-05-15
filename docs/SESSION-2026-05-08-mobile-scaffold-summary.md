# 2026-05-08 세션 정리 — Expo 모바일 스캐폴드 + 첫 실행

> 비전공자도 이해할 수 있도록 풀어 쓴 보고서.

## 1. 오늘 한 일을 한 줄로

**스마트폰 앱(iOS/Android) 의 빈 껍데기를 만들고 실제 폰에서 실행되는지까지 확인했습니다.**

PR 1개 (#60) 가 새로 열렸고, CI 통과 후 머지 대기 중. 그 안에 5번의 fix 가 쌓이며 처음에는 안 떴지만 결국 사용자 iPhone 의 Expo Go 앱에서 화면이 정상 표시되는 것까지 확인.

---

## 2. 큰 그림 — 왜 이걸 만들었나

이전 세션까지: 스마트폰 앱이 백엔드(서버)와 통신할 수 있도록 모든 인증·결제·동기화 흐름을 서버 쪽에서 완비.

이번 세션: **그 위에 올릴 모바일 앱의 "빈 껍데기"** 를 만들었어요. 마치 집을 짓기 전에 부지를 정리하고 기초 토대만 깐 상태. 안에 들어갈 화면 (로그인, 셀럽 피드, 결제 페이지 등) 은 동료 Dohyun 이 그 위에 올릴 예정.

이 단계의 목적:
1. 동료가 즉시 작업을 시작할 수 있도록 폴더·설정 파일·CI 자동 검증을 모두 준비
2. 사용자(JUNWON) 가 "내 폰에서 실제로 뜨는지" 직접 확인

---

## 3. 사용한 기술 — 비유로

| 기술 | 비유 |
|------|------|
| **Expo** (SDK 54) | "스마트폰 앱을 만드는 도구함" — 카메라·위치·결제 같은 폰 기능을 쉽게 사용할 수 있게 해주는 framework |
| **React Native** (0.81) | "웹사이트 만들 때 쓰는 React 를 폰에서도 쓸 수 있게 해주는 다리" |
| **Expo Go** | "Apple App Store / Google Play 출시 전에 폰에서 미리 보는 미리보기 앱" — QR 찍거나 URL 입력하면 즉시 내 앱이 뜸 |
| **Metro Bundler** | "코드를 폰에서 실행할 수 있는 형태로 바꿔주는 변환기" |
| **pnpm monorepo** | "한 폴더 안에 여러 프로젝트(웹사이트·서버·모바일) 를 같이 두고 의존성을 효율적으로 관리하는 방식" |

---

## 4. 오늘 발생한 문제와 해결 — 4단계

이번 세션은 **"문제 → 원인 분석 → 해결 → 다음 문제"** 가 4번 반복됐어요. 각 단계를 풀어서:

### 단계 1: 처음 만든 직후 CI 가 실패 (lint-typecheck)
- **증상**: PR #60 의 자동 검증이 빨간색
- **원인**: Expo SDK 54 가 React **19** 를 사용하는데, 우리 웹사이트 (`apps/web`) 는 React **18**. pnpm 이 React 19 의 타입 정보를 웹사이트까지 끌어와서 웹사이트 검증이 깨짐.
- **첫 시도**: Expo SDK 52 (React 18 호환) 로 다운그레이드 → CI 통과
- **부작용**: iPhone 의 Expo Go 가 **SDK 54 만 지원** (Apple 정책상 이전 버전 설치 불가). SDK 52 는 시뮬레이터/Android 만 됨.

### 단계 2: SDK 54 복원 + 호환성 우회
- **방법**: 모바일은 SDK 54 (React 19) 로 되돌리되, **`pnpm.overrides`** 라는 트릭으로 "타입 정보만 React 18 로 강제". 모바일의 실제 동작 (runtime) 은 React 19 그대로, 타입 검사할 때만 React 18 흉내.
- **결과**: 양쪽 검증 통과 (28/28). iPhone Expo Go 호환.

### 단계 3: 폰에 띄우니 빨간 에러 화면 — "expo-modules-core 못 찾음"
- **원인**: pnpm 의 보안 설계 (의존성을 깊은 폴더에 isolated 배치) 와 Metro 의 자동 모듈 탐색 (얕은 폴더만 봄) 충돌.
- **첫 시도**: `public-hoist-pattern` 옵션으로 expo 관련 패키지만 root 로 끌어올림 → 안 됨 (Metro 가 여전히 못 찾음)
- **두 번째 시도**: `node-linker=hoisted` 로 모든 의존성을 npm 처럼 평평하게 → Metro 는 찾음, 그런데 **다른 패키지들의 lint 가 30곳 이상 깨짐** (의존성 정렬이 바뀌면서 코드 스타일 검사가 새 위반 발견)
- **세 번째 시도 (최종 해결)**: `metro.config.js` 의 **`unstable_enableSymlinks: true`** 옵션 활성화 → Metro 가 pnpm 의 isolated 폴더 안 symlink 를 직접 따라가게. monorepo 다른 패키지 영향 없음.

### 단계 4: 부수적 lint cleanup
- 의존성 락파일 (pnpm-lock.yaml) 이 새로 만들어지면서 typescript-eslint 의 타입 추론 정밀도가 약간 향상 → 기존 코드의 불필요한 타입 cast 3건이 새로 lint error 로 잡힘
- ESLint `--fix` 자동수정으로 3개 파일 단순 정리 (실제 동작 변화 없음)

### 결과
**iPhone Expo Go 에서 "Open up App.tsx to start working on your app!" 흰 배경 화면 정상 표시** ✅

---

## 5. PR #60 의 최종 변경 (12 commit)

| 분류 | 내용 |
|------|------|
| 신규 폴더 | `apps/mobile/` (Expo SDK 54 blank-typescript scaffold) |
| 신규 파일 | App.tsx (default), metro.config.js (monorepo+symlink), .env.example, README.md, app.json, tsconfig.json, .gitignore, package.json, 4개 PNG 아이콘 |
| 수정 (root) | `package.json` 에 `pnpm.overrides` 추가 (`@types/react` 18 강제), `pnpm-lock.yaml` 갱신, `spec.md §11`, `docs/SPEC-PIVOT-PLAN.md`, `docs/IMPLEMENTATION_LOG.md` |
| 부수 정리 | 3개 unnecessary type cast 자동 제거 (web frozen 영역의 1줄, ui-kit 1줄, content-service 1줄, user-service 1줄) |

---

## 6. 모바일 앱 다시 실행하는 방법 (비전공자 가이드)

### Q. Background dev server 를 끄면 Expo Go 에서 앱이 안 보이나요?
**네, 맞습니다.** 

비유: dev server = "라디오 방송국". 방송국이 꺼지면 라디오는 신호를 못 받음.
- Mac 에서 `pnpm start` 가 실행 중이어야 폰의 Expo Go 가 화면을 받아옴
- 종료하면 폰에 "Could not connect to development server" 같은 에러

### 다시 시작하는 명령

```bash
# 1) 터미널 열기 (Mac 의 Terminal 앱)

# 2) 프로젝트 모바일 폴더로 이동
cd "/Users/junwon/Global PBL Program/project/applied ai project/celebase/celebase_ws/apps/mobile"

# 3) dev server 시작
pnpm start
```

### 시작되면 보일 화면 (터미널)

```
› Metro waiting on exp://192.168.1.233:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)

› Press i │ open iOS simulator
› Press a │ open Android
› Press w │ open web
› Press r │ reload app
```

### 폰에서 다시 보기

- iPhone Camera 앱으로 터미널의 QR 스캔, **또는**
- Expo Go 앱 → "Enter URL manually" → `exp://192.168.1.233:8081` 입력

> **Wi-Fi 같은 망 필수** — 폰과 Mac 이 같은 Wi-Fi 여야 함. 외부망에서 보고 싶으면 ngrok / Expo tunnel 사용 (`pnpm start --tunnel`).

### 자주 마주할 문제

| 증상 | 원인 | 해결 |
|------|------|------|
| "Port 8081 is running this app in another window" | 이전 dev server 가 살아있음 | 터미널에서 `Ctrl+C` 로 종료, 또는 `lsof -ti :8081 \| xargs kill -9` |
| "Could not connect to development server" | dev server 가 실행 중이 아니거나 Wi-Fi 다름 | 위 명령으로 다시 시작 + Wi-Fi 확인 |
| "Project is incompatible with this version of Expo Go" | Expo Go 앱 버전과 SDK 불일치 | 우리 프로젝트 = SDK 54. Expo Go 는 항상 최신 = SDK 54. 같으면 OK. iPhone 은 App Store 자동 업데이트 |
| 빨간 에러 화면 (코드 변경 후) | JS 번들 컴파일 에러 | 터미널 출력 확인. 보통 typo. 코드 수정 후 폰의 "Reload JS" 버튼 |

### dev server 종료

터미널에서 `Ctrl+C`. 또는 brutally:
```bash
lsof -ti :8081 | xargs kill -9
```

---

## 7. 다음 단계 — 누가 무엇을 할 수 있나

### 동료 Dohyun (모바일 프론트엔드)
PR #60 머지 후 **즉시 진입 가능**:
- `apps/mobile/App.tsx` 의 default 텍스트를 **CelebBase 로고 + welcome 화면** 으로 교체
- M0 본격 작업: EAS (앱스토어 빌드 파이프라인), Metro 의 추가 import 차단, jest 테스트 셋업, design-tokens 의 RN 변환 연동
- M1~M5: 인증 → API 클라이언트 → 셀럽 피드 → 온보딩 → 결제

### JUNWON (백엔드)
당장 필요한 BE 작업 없음. 동료가 진행하다가 막히는 부분 (예: 새 API 추가 요청) 발생 시 즉시 대응. 미리 할 만한 것:
- **CHORE-MOBILE-002**: refresh token 유효기간 단축 (보안 강화) — M1 안정화 후
- **IMPL-MOBILE-PUSH-001**: 푸시 알림 (FCM/APNs) — post-MVP
- spec.md 본문의 web-first 표현 점진적 정리 — long-horizon

---

## 8. 핵심 숫자

| 지표 | 값 |
|------|-----|
| 머지된 PR (이번 세션) | 1개 (#60, 머지 대기) |
| 신규 파일 | 9개 + assets/ 4개 PNG |
| commits in PR #60 | 12개 |
| 최종 검증 | 28/28 turbo lint+typecheck PASS, iOS 실기기 화면 정상 |
| 시도→fix→재시도 횟수 | 4번 (SDK 다운→복원, hoist 시도 3번) |
| 사용된 새 디버깅 도구 | gh run view --log-failed (CI 로그), Monitor (background dev server 시작 감지), TaskStop |

---

## 9. 한 줄 마무리

오늘로 **모바일 앱의 빈 껍데기가 완성되어 실제 iPhone 에서 실행되는 것까지 확인**됐습니다. 동료 Dohyun 이 그 위에 화면을 올리기만 하면 출시 준비가 점점 완성됩니다.
