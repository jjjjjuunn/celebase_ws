// CONTENT-GATE (server-side) — 발행 직전 법무/카피 차단.
//
// scripts/content-legal-scan.py 의 **결정적 체크**를 TS 로 포팅한 것. 단, 원본은
// 6슬라이드 마크다운 텍스트를 파싱하지만 여기서는 **구조화된 story 객체**를 직접 검사한다
// (모든 문자열 leaf 재귀 스캔 + CTA 는 story.cta 필드 직접). 동등성은 단위테스트로 잠금
// (tests/unit/content-legal-gate.test.ts — Python 픽스처 포팅).
//
// 규칙(content-legal.md):
//   CL-FTC-GUAR (BLOCK)   결과·의료 보장 phrasing. negation("isn't a guarantee")은 예외.
//   CL-NAME-CTA (BLOCK)   셀럽명이 CTA 슬라이드(eyebrow/headline/button/sub)에 등장. disclaimer 예외.
//   CL-DISC     (BLOCK)   비제휴 disclaimer 필수 + (health claim 시) "not medical advice".
//   CL-ENGINE   (HIGH)    엔진 범위 밖 over-promise — 경고(차단 안 함).
//   CL-PRODUCT-CLAIM (MEDIUM) 하드코딩 제품 수치 — 경고.
//
// Prime directive: advisory + human gatekeeper. BLOCK 1건이라도 → 발행 거부(throw).

import { ValidationError } from '@celebbase/service-core';
import type { ClaimStory } from '@celebbase/shared-types';

export interface GateFinding {
  rule: string;
  severity: 'BLOCK' | 'HIGH' | 'MEDIUM';
  slide?: string;
  field?: string;
  evidence: string;
}

const GUARANTEE_PATTERNS: ReadonlyArray<{ re: RegExp; label: string }> = [
  { re: /\bguarantee(s|d)?\b/gi, label: 'guarantee' },
  { re: /\bclinically proven\b/gi, label: 'clinically proven' },
  { re: /\bcure(s|d)?\b/gi, label: 'cure' },
  { re: /\bmelt(s|ed)? (away )?fat\b/gi, label: 'melt fat' },
  { re: /\blose \d+\s?(lb|lbs|pound|pounds|kg)\b/gi, label: 'lose N lbs' },
  { re: /\breverse(s|d)? (aging|disease|diabetes)\b/gi, label: 'reverse aging/disease' },
  { re: /\bdetox(es|ify|ifies)?\b/gi, label: 'detox' },
  { re: /\bmiracle\b/gi, label: 'miracle' },
];

const OVERPROMISE_PATTERNS: ReadonlyArray<{ re: RegExp; label: string }> = [
  { re: /\bgrams? of fiber\b/gi, label: 'fiber gram promise' },
  { re: /\bfiber goal\b/gi, label: 'fiber goal promise' },
  { re: /\bramp\b/gi, label: 'ramp promise' },
  { re: /\bpersona(s)?\b/gi, label: 'persona promise' }, // \b end avoids "personalized"
];

const PRODUCT_CLAIM_PATTERNS: ReadonlyArray<{ re: RegExp; label: string }> = [
  { re: /\banswer\s+\d+\s+questions?\b/gi, label: 'onboarding question count' },
  { re: /\b\d+\s+questions?\b/gi, label: 'question count' },
  { re: /\b\d+[- ]?(day|week|step)s?\s+(plan|program|onboarding)\b/gi, label: 'plan/program length' },
];

// editorial copy 가 보증을 *부정*("isn't a guarantee"/"no cure")하는 경우는 FTC-safe.
const NEGATION_TOKENS: readonly string[] = [
  "isn't", 'is not', 'not a', 'not an', 'no ', 'without', 'never', "won't", "aren't", "n't a",
];

const AFFILIATION_RE = /not affiliated|no affiliation|not endorsed|not sponsored/i;
const MEDICAL_RE = /not medical advice|educational purposes/i;

// CTA 슬라이드에서 셀럽명을 검사할 필드(법적 — disclaimer 는 비제휴 명기라 예외).
const CTA_NAME_FIELDS: readonly string[] = ['eyebrow', 'headline', 'button', 'sub'];

function isNegated(text: string, start: number): boolean {
  const window = text
    .slice(Math.max(0, start - 24), start)
    .toLowerCase()
    .replace(/’/g, "'"); // curly → straight apostrophe (Python parity)
  return NEGATION_TOKENS.some((tok) => window.includes(tok));
}

/** story 의 모든 문자열 leaf 를 (slide, field-path, text) 로 수집. image/layout 은 카피가 아니라 제외. */
function collectStrings(
  node: unknown,
  slide: string,
  field: string,
  out: Array<{ slide: string; field: string; text: string }>,
): void {
  if (typeof node === 'string') {
    out.push({ slide, field, text: node });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => {
      collectStrings(v, slide, `${field}[${String(i)}]`, out);
    });
    return;
  }
  if (node !== null && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'image' || k === 'layout') continue; // URL/enum — copy 아님
      collectStrings(v, slide === '' ? k : slide, field === '' ? k : `${field}.${k}`, out);
    }
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 전체 이름 + 4자 이상 토큰(짧은 단어 오탐 방지). */
function celebNameRegex(name: string): RegExp | null {
  const toks = new Set<string>([name.trim()]);
  for (const t of name.split(/\s+/)) if (t.length >= 4) toks.add(t);
  const parts = [...toks].filter(Boolean).map(escapeRegExp);
  if (parts.length === 0) return null;
  return new RegExp(`\\b(${parts.join('|')})\\b`, 'i');
}

/**
 * 발행 전 게이트 실행. 모든 finding 을 반환(BLOCK/HIGH/MEDIUM).
 * @param story 발행할 claim 의 story
 * @param celebName 셀럽 display_name (무셀럽이면 null — CL-NAME-CTA skip)
 * @param isHealthClaim is_health_claim
 */
export function runLegalGate(
  story: ClaimStory,
  celebName: string | null,
  isHealthClaim: boolean,
): GateFinding[] {
  const findings: GateFinding[] = [];
  const leaves: Array<{ slide: string; field: string; text: string }> = [];
  collectStrings(story, '', '', leaves);

  // CL-FTC-GUAR (BLOCK) — negation 가드.
  for (const leaf of leaves) {
    for (const { re, label } of GUARANTEE_PATTERNS) {
      for (const m of leaf.text.matchAll(re)) {
        if (isNegated(leaf.text, m.index)) continue;
        findings.push({
          rule: 'CL-FTC-GUAR',
          severity: 'BLOCK',
          slide: leaf.slide,
          field: leaf.field,
          evidence: `prohibited guarantee phrasing (${label}): ${JSON.stringify(m[0])}`,
        });
      }
    }
  }

  // CL-ENGINE (HIGH) — over-promise(경고).
  for (const leaf of leaves) {
    for (const { re, label } of OVERPROMISE_PATTERNS) {
      for (const m of leaf.text.matchAll(re)) {
        findings.push({
          rule: 'CL-ENGINE',
          severity: 'HIGH',
          slide: leaf.slide,
          field: leaf.field,
          evidence: `over-promise beyond engine scope (${label}): ${JSON.stringify(m[0])}`,
        });
      }
    }
  }

  // CL-PRODUCT-CLAIM (MEDIUM) — 하드코딩 수치(경고). leaf 내 span 중복 제거.
  for (const leaf of leaves) {
    const seen: Array<[number, number]> = [];
    for (const { re, label } of PRODUCT_CLAIM_PATTERNS) {
      for (const m of leaf.text.matchAll(re)) {
        if (seen.some(([s, e]) => s <= m.index && m.index < e)) continue;
        seen.push([m.index, m.index + m[0].length]);
        findings.push({
          rule: 'CL-PRODUCT-CLAIM',
          severity: 'MEDIUM',
          slide: leaf.slide,
          field: leaf.field,
          evidence: `product self-claim (${label}) — verify vs onboarding/spec: ${JSON.stringify(m[0])}`,
        });
      }
    }
  }

  // CL-NAME-CTA (BLOCK) — 셀럽명이 CTA 의 eyebrow/headline/button/sub 에 등장.
  if (celebName !== null && celebName.trim() !== '') {
    const nameRe = celebNameRegex(celebName);
    if (nameRe !== null) {
      for (const f of CTA_NAME_FIELDS) {
        const val = (story.cta as unknown as Record<string, unknown>)[f];
        if (typeof val === 'string' && nameRe.test(val)) {
          findings.push({
            rule: 'CL-NAME-CTA',
            severity: 'BLOCK',
            slide: 'cta',
            field: `cta.${f}`,
            evidence: `celebrity name in CTA field (use generic copy): ${JSON.stringify(val.slice(0, 120))}`,
          });
        }
      }
    }
  }

  // CL-DISC (BLOCK) — 비제휴 disclaimer + (health) 의료 disclaimer.
  const allText = leaves.map((l) => l.text).join('\n');
  if (!AFFILIATION_RE.test(allText)) {
    findings.push({
      rule: 'CL-DISC',
      severity: 'BLOCK',
      slide: 'cta',
      field: 'cta.disclaimer',
      evidence: "missing non-affiliation disclaimer (e.g. 'not affiliated with, endorsed by, or sponsored by <celebrity>')",
    });
  }
  if (isHealthClaim && !MEDICAL_RE.test(allText)) {
    findings.push({
      rule: 'CL-DISC',
      severity: 'BLOCK',
      slide: 'cta',
      field: 'cta.disclaimer',
      evidence: "is_health_claim=true but no 'Not medical advice / educational purposes' disclaimer found",
    });
  }

  return findings;
}

/**
 * 발행 게이트. BLOCK 이 1건이라도 있으면 ValidationError(400) throw → 발행 차단.
 * 통과 시 경고(HIGH/MEDIUM) 배열 반환(응답에 surface).
 */
export function assertLegalGate(
  story: ClaimStory,
  celebName: string | null,
  isHealthClaim: boolean,
): GateFinding[] {
  const findings = runLegalGate(story, celebName, isHealthClaim);
  const blocks = findings.filter((f) => f.severity === 'BLOCK');
  if (blocks.length > 0) {
    throw new ValidationError(
      'Content legal gate failed — fix the flagged copy before publishing.',
      blocks.map((b) => ({ field: b.field ?? b.slide ?? b.rule, issue: `${b.rule}: ${b.evidence}` })),
    );
  }
  return findings.filter((f) => f.severity !== 'BLOCK');
}
