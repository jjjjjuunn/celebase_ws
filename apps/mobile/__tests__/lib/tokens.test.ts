import { px, resolveToken } from '../../src/lib/tokens';

describe('resolveToken', () => {
  it('직접 값 (var() 없음) 토큰은 그대로 반환', () => {
    expect(resolveToken('light', '--cb-brand-700')).toBe('#6B5420');
    expect(resolveToken('light', '--cb-accent-aspirational')).toBe('#D4654A');
  });

  it('var() 참조를 재귀적으로 풀어서 raw 값 반환', () => {
    // --cb-color-brand → var(--cb-brand-700) → '#6B5420'
    expect(resolveToken('light', '--cb-color-brand')).toBe('#6B5420');
    // --cb-color-bg → var(--cb-neutral-0) → '#FAFAF8'
    expect(resolveToken('light', '--cb-color-bg')).toBe('#FAFAF8');
    // --cb-color-text → var(--cb-neutral-900) → '#1A1917'
    expect(resolveToken('light', '--cb-color-text')).toBe('#1A1917');
  });

  it('dark 테마는 light 와 다른 값을 반환', () => {
    // light: '#FAFAF8' / dark: '#141412'
    expect(resolveToken('light', '--cb-color-bg')).not.toBe(
      resolveToken('dark', '--cb-color-bg'),
    );
  });
});

describe('px', () => {
  it('px 접미사를 떼고 number 로 변환', () => {
    expect(px('16px')).toBe(16);
    expect(px('8px')).toBe(8);
  });

  it('숫자만 있어도 파싱', () => {
    expect(px('24')).toBe(24);
  });

  it('파싱 불가 시 throw', () => {
    expect(() => px('var(--cb-foo)')).toThrow(/cannot parse number/);
    expect(() => px('auto')).toThrow(/cannot parse number/);
  });
});
