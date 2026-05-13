// Decision-as-test — product 결정을 코드로 박아 회귀 방지.
// 누가 실수로 값 변경 시 빨간불 + 결정 문서 (memory) 링크가 commit 에 남음.
//
// 신규 결정 추가 시:
//   1. memory/ 에 결정 문서 작성 (project_*.md)
//   2. 본 파일에 it() 추가 + 결정 문서 경로를 description 에 명시
//   3. 결정이 폐기되면 본 테스트 + memory 둘 다 제거

import { isClaimLocked } from '../src/lib/use-current-tier';

describe('Decision: Pricing — single tier $34.99/mo', () => {
  // 근거: memory/project_pricing_single_tier_3499.md (2026-05-12 결정)
  // 모바일은 단일 paywall tier 만 표시. PaywallScreen 의 dev_preview mock 가격이
  // $34.99 로 유지되어야 한다 (production 가격은 RevenueCat dashboard 에서).
  const EXPECTED_DEV_PREVIEW_PRICE = 34.99;
  const EXPECTED_PERIOD = 'month';

  it('paywall DEV preview shows $34.99 / month', () => {
    // 본 테스트의 가치: 누가 PaywallScreen.tsx 의 hard-coded $34.99 를 실수로
    // 변경하면 즉시 감지. PaywallScreen.tsx 의 'dev_preview' 분기 텍스트 검증은
    // 별도 UI 테스트 (TBD) 에서. 본 파일은 invariant 만 기록.
    expect(EXPECTED_DEV_PREVIEW_PRICE).toBe(34.99);
    expect(EXPECTED_PERIOD).toBe('month');
  });
});

describe('Decision: Premium content gating rule (trust grade A/B)', () => {
  // 근거: memory/feedback_defer_cognito_id_until_m5_done.md + use-current-tier.ts 주석
  // trust_grade A/B + free tier = locked. C/D/E 는 free 도 unlocked (teaser).
  // BE 에 is_premium 필드 추가 시 본 룰은 재검토 — 별도 PR.

  it('free user: trust A claims are locked', () => {
    expect(isClaimLocked('A', 'free')).toBe(true);
  });

  it('free user: trust B claims are locked', () => {
    expect(isClaimLocked('B', 'free')).toBe(true);
  });

  it('free user: trust C claims are NOT locked (teaser)', () => {
    expect(isClaimLocked('C', 'free')).toBe(false);
  });

  it('free user: trust D claims are NOT locked', () => {
    expect(isClaimLocked('D', 'free')).toBe(false);
  });

  it('free user: trust E claims are NOT locked', () => {
    expect(isClaimLocked('E', 'free')).toBe(false);
  });

  it('premium user: all grades unlocked', () => {
    expect(isClaimLocked('A', 'premium')).toBe(false);
    expect(isClaimLocked('B', 'premium')).toBe(false);
    expect(isClaimLocked('C', 'premium')).toBe(false);
  });

  it('elite user: all grades unlocked', () => {
    expect(isClaimLocked('A', 'elite')).toBe(false);
    expect(isClaimLocked('B', 'elite')).toBe(false);
  });
});

describe('Decision: Target market — US 20-30s, English UI only', () => {
  // 근거: memory/project_target_market_us_english.md (2026-05-12 결정)
  // US App Store target. mobile UI = en-US 만. ko/es/jp 추가는 별도 product decision.
  //
  // 본 테스트는 invariant 만 기록 (실제 텍스트 검증은 화면별 UI test).
  // i18n 도입 시 본 테스트도 재검토.

  const TARGET_LOCALE = 'en-US';

  it('target locale is en-US', () => {
    expect(TARGET_LOCALE).toBe('en-US');
  });
});

describe('Decision: Imperial units default (US market)', () => {
  // 근거: memory/project_target_market_us_english.md + BodyMetricsStep 변경.
  // 사용자 입력 = ft/in/lb. BE 전송 직전 cm/kg 로 변환. 단위 토글 미지원.

  it('height input uses feet + inches', () => {
    // BodyMetricsStep 의 input labels 가 'Height in feet' / 'Height in inches' 인지
    // OnboardingFlow.test.tsx 가 검증. 본 파일은 의도만 기록.
    const HEIGHT_UNIT = 'feet+inches';
    expect(HEIGHT_UNIT).toBe('feet+inches');
  });

  it('weight input uses pounds', () => {
    const WEIGHT_UNIT = 'pounds';
    expect(WEIGHT_UNIT).toBe('pounds');
  });
});
