import { isAllowedSourceUrl } from '../../src/lib/url-allowlist';

describe('isAllowedSourceUrl', () => {
  it('allowlist 도메인 정확히 일치 → true', () => {
    expect(isAllowedSourceUrl('https://vogue.com/article/x')).toBe(true);
    expect(isAllowedSourceUrl('http://elle.com/foo')).toBe(true);
  });

  it('allowlist 도메인의 서브도메인 → true', () => {
    expect(isAllowedSourceUrl('https://www.vogue.com/article/x')).toBe(true);
    expect(isAllowedSourceUrl('https://uk.harpersbazaar.com/foo')).toBe(true);
  });

  it('allowlist 외 도메인 → false', () => {
    expect(isAllowedSourceUrl('https://example.com/foo')).toBe(false);
    expect(isAllowedSourceUrl('https://malicious.com/vogue.com')).toBe(false);
  });

  it('non-http(s) scheme → false', () => {
    expect(isAllowedSourceUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedSourceUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedSourceUrl('ftp://vogue.com/x')).toBe(false);
  });

  it('malformed URL / null / empty → false', () => {
    expect(isAllowedSourceUrl(null)).toBe(false);
    expect(isAllowedSourceUrl(undefined)).toBe(false);
    expect(isAllowedSourceUrl('')).toBe(false);
    expect(isAllowedSourceUrl('not a url')).toBe(false);
  });

  it('도메인 접미사만 매칭하는 spoofing 방어', () => {
    // host = "fakevogue.com" → vogue.com 으로 끝나지만 . 가 앞에 없음 → false
    expect(isAllowedSourceUrl('https://fakevogue.com/x')).toBe(false);
  });
});
