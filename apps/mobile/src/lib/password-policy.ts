// 비밀번호 정책 — Cognito staging User Pool 의 password_policy 와 동기.
// (`infra/cognito/main.tf`: minimum_length=12, require_uppercase/lowercase/numbers,
//  require_symbols=false)
//
// 클라이언트에서 사전 차단해야 서버 round-trip 없이 즉각적 피드백 가능.
// SignupScreen / ForgotPasswordScreen 의 "새 비밀번호" 입력 모두 본 모듈 재사용.

import { z } from 'zod';

export interface PasswordRule {
  /** UI 키 — React list key 용. */
  id: 'length' | 'uppercase' | 'lowercase' | 'number';
  /** 사용자에게 보여줄 라벨. */
  label: string;
  /** 입력값이 본 규칙을 충족하는지. */
  met: boolean;
}

/**
 * 입력 비밀번호를 평가해 4 규칙의 met 상태를 반환한다.
 * 매 keystroke 마다 호출되므로 부작용 / 정규식 컴파일 없음 (literal regex).
 */
export function evaluatePassword(password: string): PasswordRule[] {
  return [
    { id: 'length', label: 'At least 12 characters', met: password.length >= 12 },
    { id: 'uppercase', label: 'Uppercase letter (A-Z)', met: /[A-Z]/.test(password) },
    { id: 'lowercase', label: 'Lowercase letter (a-z)', met: /[a-z]/.test(password) },
    { id: 'number', label: 'Number (0-9)', met: /[0-9]/.test(password) },
  ];
}

/**
 * 모든 규칙 충족 여부 — submit 활성화 분기에 사용.
 */
export function isPasswordValid(password: string): boolean {
  return evaluatePassword(password).every((r) => r.met);
}

/**
 * Zod schema — form 제출 시 final validation.
 * Cognito 가 동일 정책으로 다시 거절할 수 있으나, 본 schema 는 1차 차단.
 */
export const PasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters.')
  .regex(/[A-Z]/, 'Password must include an uppercase letter.')
  .regex(/[a-z]/, 'Password must include a lowercase letter.')
  .regex(/[0-9]/, 'Password must include a number.');
