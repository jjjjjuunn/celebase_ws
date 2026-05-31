// story 인라인 마크업 파서 단위 테스트 (IMPL-MOBILE-CLAIM-STORY-SCHEMA-001).
// `**bold**` / `*accent*` 토큰화 + 리터럴 마커가 화면에 노출되지 않음을 보장.

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { parseRich } from '../../src/screens/ClaimDetailScreen';

describe('parseRich — story 인라인 마크업', () => {
  it('plain 텍스트는 normal 토큰 1개', () => {
    expect(parseRich('plain text')).toEqual([{ t: 'plain text', kind: 'normal' }]);
  });

  it('**bold** 를 bold 토큰으로(마커 제거)', () => {
    expect(parseRich('a **b** c')).toEqual([
      { t: 'a ', kind: 'normal' },
      { t: 'b', kind: 'bold' },
      { t: ' c', kind: 'normal' },
    ]);
  });

  it('*accent* 를 accent 토큰으로(마커 제거)', () => {
    expect(parseRich('x *y* z')).toEqual([
      { t: 'x ', kind: 'normal' },
      { t: 'y', kind: 'accent' },
      { t: ' z', kind: 'normal' },
    ]);
  });

  it('bold + accent 혼합 — 합치면 리터럴 마커(*) 없음', () => {
    const joined = parseRich('**A** and *B*')
      .map((tok) => tok.t)
      .join('');
    expect(joined).toBe('A and B');
    expect(joined).not.toContain('*');
  });
});
