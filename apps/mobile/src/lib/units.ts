// Imperial ↔ Metric 변환 유틸 — US 시장 (en-US) 사용자 입력 받는 곳에서 사용.
// BE 는 metric 단위로만 저장하므로 mobile 이 입력 즉시 변환 후 send.
//
// 정밀도: imperial → metric 변환 후 소수점 1자리 round (BE 가 받는 height_cm 등은 number).

const CM_PER_INCH = 2.54;
const KG_PER_LB = 0.45359237;
const INCHES_PER_FOOT = 12;

export interface FeetInches {
  feet: number;
  inches: number;
}

/**
 * feet + inches → cm. 입력이 NaN 이면 NaN 반환.
 */
export function feetInchesToCm(ft: number, inches: number): number {
  if (Number.isNaN(ft) || Number.isNaN(inches)) return Number.NaN;
  const totalInches = ft * INCHES_PER_FOOT + inches;
  return round1(totalInches * CM_PER_INCH);
}

/**
 * cm → feet + inches (정수 feet + 정수 inches, inches 는 0~11).
 * 입력이 NaN 또는 음수면 { feet: 0, inches: 0 }.
 */
export function cmToFeetInches(cm: number): FeetInches {
  if (Number.isNaN(cm) || cm <= 0) return { feet: 0, inches: 0 };
  const totalInches = cm / CM_PER_INCH;
  const feet = Math.floor(totalInches / INCHES_PER_FOOT);
  const inches = Math.round(totalInches - feet * INCHES_PER_FOOT);
  // round 가 12 로 올림될 수 있음 — carry-over 처리.
  if (inches === INCHES_PER_FOOT) return { feet: feet + 1, inches: 0 };
  return { feet, inches };
}

/**
 * pounds → kg. 정밀도 1자리.
 */
export function lbToKg(lb: number): number {
  if (Number.isNaN(lb)) return Number.NaN;
  return round1(lb * KG_PER_LB);
}

/**
 * kg → pounds. 정밀도 0자리 (정수).
 */
export function kgToLb(kg: number): number {
  if (Number.isNaN(kg) || kg <= 0) return 0;
  return Math.round(kg / KG_PER_LB);
}

/**
 * inches → cm. 정밀도 1자리.
 */
export function inchesToCm(inches: number): number {
  if (Number.isNaN(inches)) return Number.NaN;
  return round1(inches * CM_PER_INCH);
}

/**
 * cm → inches. 정밀도 0자리.
 */
export function cmToInches(cm: number): number {
  if (Number.isNaN(cm) || cm <= 0) return 0;
  return Math.round(cm / CM_PER_INCH);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
