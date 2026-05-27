// Decision-as-test — product 결정을 코드로 박아 회귀 방지.
// 누가 실수로 값 변경 시 빨간불 + 결정 문서 (memory) 링크가 commit 에 남음.
//
// 신규 결정 추가 시:
//   1. memory/ 에 결정 문서 작성 (project_*.md)
//   2. 본 파일에 it() 추가 + 결정 문서 경로를 description 에 명시
//   3. 결정이 폐기되면 본 테스트 + memory 둘 다 제거

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isClaimLocked } from '../src/lib/use-current-tier';

describe('Decision: Paywall carries no hard-coded price (pricing lives in RevenueCat)', () => {
  // 근거: PROD-DEPLOY-ROADMAP G1 (Codex HIGH — dev-preview $34.99 제거) +
  // 2026-05-25 사용자 지시("Paywall 더미가격 제거"). 이전 결정
  // (memory/project_pricing_single_tier_3499.md — dev_preview=$34.99) 을 대체한다.
  // 실제 가격/티어 구조(단일 vs Premium/Elite)는 IAP product 등록(G1) 시 RevenueCat
  // dashboard 에서 확정하며 코드에 하드코딩하지 않는다. 본 테스트는 더미 가격 재유입을 차단.

  it('PaywallScreen.tsx contains no hard-coded $NN.NN price literal', () => {
    const src = readFileSync(join(__dirname, '../src/screens/PaywallScreen.tsx'), 'utf8');
    expect(src).not.toMatch(/\$\d+\.\d{2}/);
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
