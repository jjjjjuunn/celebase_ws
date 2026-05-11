// RN-friendly accessor for @celebbase/design-tokens.
//
// design-tokens 의 native export 는 web 의 CSS variable 시스템을 그대로 보존하기
// 위해 일부 토큰 값을 'var(--cb-X)' 형태의 참조 문자열로 가지고 있다. RN 은
// CSS variable 을 못 풀기 때문에 본 헬퍼가 참조를 재귀적으로 풀어 raw 값을
// 반환한다. 또한 '16px' 같은 문자열 토큰을 RN StyleSheet 가 받는 number 로
// 변환하는 px() 도 함께 제공.

import { tokens, type TokenName } from '@celebbase/design-tokens';

const VAR_REF = /^var\(--([\w-]+)\)$/;
const MAX_DEPTH = 8;

/**
 * Resolve a design token to its raw value, following var() references recursively.
 * Throws if a reference cycle is detected (depth > MAX_DEPTH) or a referenced
 * token does not exist.
 */
export function resolveToken(theme: 'light' | 'dark', name: TokenName): string {
  // var() 참조가 design-tokens 의 키로 존재하지 않을 수도 있으므로 (예: 잘못된
  // 참조, 빌드 누락) loose Record 타입으로 indexing 해서 undefined 체크가
  // 런타임 가드로 동작하게 한다. as TokenName 캐스트로는 TS 가 always-defined
  // 로 추론하여 ESLint no-unnecessary-condition 위반.
  const themeTokens = tokens[theme] as Record<string, string | undefined>;
  let current: string = tokens[theme][name];
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const match = current.match(VAR_REF);
    if (!match) return current;
    const refName = `--${match[1]}`;
    const next = themeTokens[refName];
    if (next === undefined) {
      throw new Error(
        `[design-tokens] '${name}' references unknown token '${refName}' (theme=${theme})`,
      );
    }
    current = next;
  }
  throw new Error(
    `[design-tokens] '${name}' var() reference depth exceeded ${String(MAX_DEPTH)} (theme=${theme}) — cycle?`,
  );
}

/**
 * Convert a token value like '16px' to the number 16 for RN StyleSheet props
 * (padding, margin, fontSize, etc.). Throws if the value is not parseable as
 * a number (e.g. 'var(...)' reference — call resolveToken first if needed).
 */
export function px(value: string): number {
  const num = parseFloat(value);
  if (Number.isNaN(num)) {
    throw new Error(`[design-tokens] cannot parse number from value: '${value}'`);
  }
  return num;
}
