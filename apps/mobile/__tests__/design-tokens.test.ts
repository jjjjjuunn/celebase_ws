import { tokens, getToken } from '@celebbase/design-tokens';

describe('@celebbase/design-tokens (RN smoke)', () => {
  it('light/dark 테마 객체를 export 한다', () => {
    expect(tokens.light).toBeDefined();
    expect(tokens.dark).toBeDefined();
  });

  it('직접 색상값 (var() 참조 없음) 토큰은 RN 에서 즉시 사용 가능하다', () => {
    expect(tokens.light['--cb-accent-aspirational']).toBe('#D4654A');
    expect(tokens.light['--cb-accent-biohacker']).toBe('#0E8F9B');
  });

  it('spacing 토큰은 px 문자열로 제공된다', () => {
    expect(tokens.light['--cb-space-2']).toBe('8px');
    expect(tokens.light['--cb-space-4']).toBe('16px');
  });

  it('getToken 헬퍼가 raw 값을 반환한다', () => {
    expect(getToken('light', '--cb-accent-aspirational')).toBe('#D4654A');
  });
});
