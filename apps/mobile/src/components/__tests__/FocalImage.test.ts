// FocalImage.computeFocalBox — cover 스케일 + focal(0..1) 중앙정렬 절대배치 박스 계산.
// 이번 기능의 유일한 비자명 로직(앱 상세 hero 크롭 통제, CARDNEWS-HERO-CUSTOM-001).
// 컴포넌트 렌더는 RN/시뮬레이터 검증으로 위임하고, 여기선 순수 수학만 봉인한다.

import { computeFocalBox } from '../FocalImage';

describe('computeFocalBox', () => {
  // 세로 이미지(2:3=0.667)를 가로로 긴 컨테이너(300×200=1.5)에 → 너비 맞추고 상하 크롭.
  describe('portrait image in wide container (crops vertically)', () => {
    const cw = 300;
    const ch = 200;
    const imgAspect = 2 / 3; // 0.667 < 1.5

    it('matches width, overflows height by image aspect', () => {
      const b = computeFocalBox(cw, ch, imgAspect, 0.5, 0.5);
      expect(b.width).toBe(300); // 너비를 컨테이너에 맞춤
      expect(b.height).toBeCloseTo(450, 5); // 300 / (2/3) = 450 → 상하 크롭
    });

    it('focal y=0.5 centers vertically, no horizontal shift', () => {
      const b = computeFocalBox(cw, ch, imgAspect, 0.5, 0.5);
      expect(b.left).toBe(0); // 너비 일치 → 좌우 이동 없음
      expect(b.top).toBeCloseTo(-125, 5); // (450-200)/2 = 125 위로
    });

    it('focal y=0 reveals top edge (clamped to 0)', () => {
      const b = computeFocalBox(cw, ch, imgAspect, 0.5, 0);
      expect(b.top).toBe(0);
    });

    it('focal y=1 reveals bottom edge (clamped to ch-scaledH)', () => {
      const b = computeFocalBox(cw, ch, imgAspect, 0.5, 1);
      expect(b.top).toBeCloseTo(ch - b.height, 5); // -250, 이미지 하단 정렬
    });
  });

  // 가로 이미지(3:2=1.5)를 세로로 긴 컨테이너(200×300=0.667)에 → 높이 맞추고 좌우 크롭.
  describe('landscape image in tall container (crops horizontally)', () => {
    const cw = 200;
    const ch = 300;
    const imgAspect = 3 / 2; // 1.5 > 0.667

    it('matches height, overflows width', () => {
      const b = computeFocalBox(cw, ch, imgAspect, 0.5, 0.5);
      expect(b.height).toBe(300);
      expect(b.width).toBeCloseTo(450, 5); // 300 * 1.5
    });

    it('focal x=0 reveals left edge, x=1 reveals right edge', () => {
      const leftFocus = computeFocalBox(cw, ch, imgAspect, 0, 0.5);
      const rightFocus = computeFocalBox(cw, ch, imgAspect, 1, 0.5);
      expect(leftFocus.left).toBe(0);
      expect(rightFocus.left).toBeCloseTo(cw - rightFocus.width, 5); // -250
      expect(leftFocus.top).toBe(0); // 높이 일치 → 상하 이동 없음
    });
  });

  // 불변식: 어떤 focal 이든 박스는 항상 컨테이너를 완전히 덮는다(빈 모서리 없음).
  it('always covers the container regardless of focal', () => {
    const cases: Array<[number, number, number, number, number]> = [
      [300, 200, 2 / 3, 0.5, 0.5],
      [200, 300, 3 / 2, 0.2, 0.8],
      [375, 600, 0.54, 0, 0], // 앱 상세 hook 근처 비율 + 모서리 focal
      [375, 600, 0.54, 1, 1],
      [400, 400, 1, 0.5, 0.5], // 정사각 컨테이너 + 정사각 이미지
    ];
    for (const [cw, ch, asp, fx, fy] of cases) {
      const b = computeFocalBox(cw, ch, asp, fx, fy);
      expect(b.left).toBeLessThanOrEqual(0); // 좌상단은 컨테이너 밖으로만(빈틈 X)
      expect(b.top).toBeLessThanOrEqual(0);
      expect(b.left + b.width).toBeGreaterThanOrEqual(cw - 1e-6); // 우하단은 컨테이너 끝까지
      expect(b.top + b.height).toBeGreaterThanOrEqual(ch - 1e-6);
    }
  });

  // 범위 밖 focal 은 0..1 로 clamp(스키마가 막지만 방어).
  it('clamps out-of-range focal to [0,1]', () => {
    const within = computeFocalBox(200, 300, 1.5, 1, 0.5);
    const beyond = computeFocalBox(200, 300, 1.5, 2, 0.5);
    expect(beyond.left).toBeCloseTo(within.left, 5);
  });
});
