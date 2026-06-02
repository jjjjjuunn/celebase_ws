import { describe, it, expect } from '@jest/globals';
import type { ClaimStory } from '@celebbase/shared-types';

import { runLegalGate, assertLegalGate } from '../../src/lib/content-legal-gate.js';

// 깨끗한 baseline story (비제휴 + 의료 disclaimer 포함, negation 가드 케이스 포함).
function baseStory(): ClaimStory {
  return {
    hook: {
      eyebrow: 'DIET · CELEBRITY DECODE',
      headline: "Her longevity plate, *decoded.*",
      sub: 'What she eats — rescaled to you.',
    },
    what: { eyebrow: 'WHAT SHE DOES', headline: 'Mediterranean, whole-food.', rows: ['Savory oats with greens.'] },
    science: {
      eyebrow: 'SCIENCE',
      headline: 'One of the most-studied patterns.',
      checks: ['Mediterranean eating is **associated with** better heart health.'],
      caveat: '"Associated with" isn\'t a guarantee — and her needs aren\'t yours.',
    },
    catch: { eyebrow: 'CATCH', headline: 'Built for *her* body.', body: "Her calorie needs aren't yours." },
    rescaled: {
      eyebrow: 'RESCALED TO YOU',
      headline: 'Same base. Your numbers.',
      profiles: [{ who: 'Your calories', what: 'Set to your target.' }],
    },
    cta: {
      eyebrow: 'YOUR TURN',
      headline: 'Get *your* personalized plan.',
      button: 'Make my Plan',
      sub: 'Answer a few quick questions.',
      disclaimer:
        'celebase is not affiliated with, endorsed by, or sponsored by the named individual. Not medical advice; individual results vary.',
    },
  };
}

function rules(story: ClaimStory, celeb: string | null, health: boolean): string[] {
  return runLegalGate(story, celeb, health).map((f) => `${f.rule}:${f.severity}`);
}

describe('content-legal-gate', () => {
  it('clean Cameron-style story passes (negation guard lets "isn\'t a guarantee" through)', () => {
    const s = baseStory();
    expect(runLegalGate(s, 'Cameron Diaz', true).filter((f) => f.severity === 'BLOCK')).toHaveLength(0);
    expect(() => assertLegalGate(s, 'Cameron Diaz', true)).not.toThrow();
  });

  it('BLOCK: unnegated guarantee phrasing (CL-FTC-GUAR)', () => {
    const s = baseStory();
    s.hook.sub = 'We guarantee you will lose 10 lbs.';
    expect(rules(s, 'Cameron Diaz', true)).toContain('CL-FTC-GUAR:BLOCK');
    expect(() => assertLegalGate(s, 'Cameron Diaz', true)).toThrow(/legal gate/i);
  });

  it('negated guarantees are NOT flagged ("no cure", "isn\'t a guarantee")', () => {
    const s = baseStory();
    s.what.rows = ['This is not a cure and no miracle — just food.'];
    const blocks = runLegalGate(s, 'Cameron Diaz', true).filter((f) => f.rule === 'CL-FTC-GUAR');
    expect(blocks).toHaveLength(0);
  });

  it('BLOCK: celebrity name in CTA field (CL-NAME-CTA), disclaimer line excepted', () => {
    const s = baseStory();
    s.cta.headline = 'Eat like Cameron Diaz.';
    expect(rules(s, 'Cameron Diaz', true)).toContain('CL-NAME-CTA:BLOCK');
    // 셀럽명이 disclaimer 에만 있으면 통과(비제휴 명기 예외).
    const s2 = baseStory();
    expect(runLegalGate(s2, 'Cameron Diaz', true).filter((f) => f.rule === 'CL-NAME-CTA')).toHaveLength(0);
  });

  it('BLOCK: missing non-affiliation disclaimer (CL-DISC)', () => {
    const s = baseStory();
    s.cta.disclaimer = 'Not medical advice.';
    expect(rules(s, 'Cameron Diaz', true)).toContain('CL-DISC:BLOCK');
  });

  it('BLOCK: health claim without medical disclaimer (CL-DISC)', () => {
    const s = baseStory();
    s.cta.disclaimer = 'celebase is not affiliated with the named individual.';
    expect(rules(s, 'Cameron Diaz', true)).toContain('CL-DISC:BLOCK'); // health=true, medical missing
    // 같은 disclaimer 인데 health=false 면 통과.
    expect(runLegalGate(s, 'Cameron Diaz', false).filter((f) => f.rule === 'CL-DISC')).toHaveLength(0);
  });

  it('HIGH (not block): over-promise "persona"; "personalized" 은 매치 안 함', () => {
    const s = baseStory();
    s.what.headline = 'We build a persona for you.';
    const f = runLegalGate(s, 'Cameron Diaz', true);
    expect(f.some((x) => x.rule === 'CL-ENGINE' && x.severity === 'HIGH')).toBe(true);
    expect(f.filter((x) => x.severity === 'BLOCK')).toHaveLength(0); // 경고일 뿐 차단 아님
    // "personalized" (cta.headline) 은 \b 끝 경계로 매치 안 됨 → CL-ENGINE 0건 추가.
    const s2 = baseStory();
    expect(runLegalGate(s2, 'Cameron Diaz', true).filter((x) => x.rule === 'CL-ENGINE')).toHaveLength(0);
  });

  it('MEDIUM (not block): hardcoded product count "answer 3 questions"', () => {
    const s = baseStory();
    s.cta.sub = 'Answer 3 questions and get your plan.';
    const f = runLegalGate(s, 'Cameron Diaz', true);
    expect(f.some((x) => x.rule === 'CL-PRODUCT-CLAIM' && x.severity === 'MEDIUM')).toBe(true);
    expect(f.filter((x) => x.severity === 'BLOCK')).toHaveLength(0);
  });

  it('no celeb (trend card) → CL-NAME-CTA skipped', () => {
    const s = baseStory();
    s.cta.headline = 'Eat like Cameron Diaz.'; // 셀럽 null 이면 검사 안 함
    expect(runLegalGate(s, null, true).filter((f) => f.rule === 'CL-NAME-CTA')).toHaveLength(0);
  });

  it('image/layout fields are not scanned as copy', () => {
    const s = baseStory();
    s.hook.image = 'https://celebbase-assets-staging.s3.us-west-2.amazonaws.com/hero/x/cure-detox.png';
    s.hook.layout = 'fullbleed';
    // URL 에 "cure"/"detox" 가 있어도 image 필드라 스캔 제외 → BLOCK 0.
    expect(runLegalGate(s, 'Cameron Diaz', true).filter((f) => f.severity === 'BLOCK')).toHaveLength(0);
  });
});
