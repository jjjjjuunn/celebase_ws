// 비밀번호 규칙 실시간 표시 — SignupScreen / ForgotPasswordScreen 공용.
// 매 keystroke 마다 evaluatePassword() 호출 후 4 항목 ✓/○ 표시.
//
// 색상: 충족 = brand (gold), 미충족 = text-muted. 별도 green/red 토큰을 안 쓰는
// 이유는 design-tokens 의 success palette 가 native 빌드에서 corrupt 값을 가지고
// 있어 (`packages/design-tokens/src/tokens.native.ts` 의 --cb-success-600) RN
// 에서 안전하지 않기 때문. 브랜드 골드는 항상 안정.

import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '@celebbase/design-tokens';

import { evaluatePassword } from '../lib/password-policy';
import { px, resolveToken } from '../lib/tokens';

interface PasswordRequirementsProps {
  password: string;
}

export function PasswordRequirements({
  password,
}: PasswordRequirementsProps): React.JSX.Element {
  const rules = evaluatePassword(password);
  return (
    <View
      accessibilityLabel="Password requirements"
      accessibilityRole="list"
      style={styles.container}
    >
      {rules.map((rule) => (
        <View
          key={rule.id}
          accessibilityRole="text"
          accessibilityLabel={`${rule.label}, ${rule.met ? 'met' : 'not met'}`}
          style={styles.row}
        >
          <Text
            style={[styles.icon, rule.met ? styles.iconMet : styles.iconUnmet]}
          >
            {rule.met ? '✓' : '○'}
          </Text>
          <Text style={[styles.label, rule.met ? styles.labelMet : styles.labelUnmet]}>
            {rule.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: -px(tokens.light['--cb-space-2']),
    marginBottom: px(tokens.light['--cb-space-3']),
    paddingLeft: px(tokens.light['--cb-space-2']),
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(tokens.light['--cb-space-2']),
  },
  icon: {
    fontSize: px(tokens.light['--cb-body-sm']),
    width: 14,
    textAlign: 'center',
  },
  iconMet: {
    color: resolveToken('light', '--cb-color-brand'),
    fontWeight: '700',
  },
  iconUnmet: {
    color: resolveToken('light', '--cb-color-text-muted'),
    fontWeight: '400',
  },
  label: {
    fontSize: px(tokens.light['--cb-body-sm']),
  },
  labelMet: {
    color: resolveToken('light', '--cb-color-text'),
    fontWeight: '600',
  },
  labelUnmet: {
    color: resolveToken('light', '--cb-color-text-muted'),
    fontWeight: '400',
  },
});
