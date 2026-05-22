// 비밀번호 규칙 실시간 표시 — SignupScreen / ForgotPasswordScreen 공용.
// 매 keystroke 마다 evaluatePassword() 호출 후 4 항목 ✓/○ 표시.
// 충족 = brand(gold) / 미충족 = muted — 디자인 시스템 톤으로 통일.

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { evaluatePassword } from '../lib/password-policy';
import { Text, useTheme, type Theme } from '../ui';

interface PasswordRequirementsProps {
  password: string;
}

export function PasswordRequirements({
  password,
}: PasswordRequirementsProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
            variant="bodySm"
            tone={rule.met ? 'brand' : 'muted'}
            style={[styles.icon, rule.met ? styles.iconMet : styles.iconUnmet]}
          >
            {rule.met ? '✓' : '○'}
          </Text>
          <Text variant="bodySm" tone={rule.met ? 'default' : 'muted'} style={rule.met ? styles.labelMet : undefined}>
            {rule.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      marginTop: -theme.space(2),
      marginBottom: theme.space(3),
      paddingLeft: theme.space(2),
      gap: 2,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: theme.space(2) },
    icon: { width: 14, textAlign: 'center' },
    iconMet: { fontWeight: theme.weight.bold },
    iconUnmet: { fontWeight: theme.weight.regular },
    labelMet: { fontWeight: theme.weight.semibold },
  });
}
