// claim source URL 외부 링크 열기 전 도메인 화이트리스트 검증.
// spec.md §9.3 #2 (URL allowlist / SSRF 차단). seed validator
// (`scripts/validate-claim-seeds.py`) 의 ALLOWED_DOMAINS 와 동일 목록을
// 유지한다. allowlist 추가 시 양쪽 동시 갱신.

const ALLOWED_DOMAINS: ReadonlySet<string> = new Set([
  'vogue.com',
  'elle.com',
  'harpersbazaar.com',
  'womenshealthmag.com',
  'allure.com',
  'people.com',
  'instyle.com',
  'glamour.com',
  'nytimes.com',
  'instagram.com',
  'youtube.com',
  'tiktok.com',
  'x.com',
]);

/**
 * source.url 이 (a) http/https scheme, (b) allowlist 도메인 또는 서브도메인
 * 인지 검증. 둘 다 통과해야 외부 브라우저로 열 수 있다.
 *
 * RN 의 `Linking.openURL` 은 임의 URL 을 받기 때문에 본 가드 없이 호출하면
 * BE seed validator 가 차단한 도메인이 BE 신뢰등급 우회로 클라이언트에서
 * 열릴 수 있다.
 */
export function isAllowedSourceUrl(rawUrl: string | null | undefined): boolean {
  if (rawUrl === null || rawUrl === undefined || rawUrl === '') return false;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase().trim();
  if (host === '') return false;

  for (const allowed of ALLOWED_DOMAINS) {
    if (host === allowed) return true;
    if (host.endsWith(`.${allowed}`)) return true;
  }
  return false;
}
