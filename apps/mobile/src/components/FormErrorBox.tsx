// 폼 에러 박스 — 웹 `EmailLoginForm.module.css .error` 와 동등.
//
// 웹은 `--cb-danger-100` bg + `--cb-danger-600` text 사용. 모바일은
// design-tokens 빌드에서 danger-100 값이 corrupt 되어있어 (`'#B4232C; --cb-danger-100: #FADADD'`)
// 안전하게 surface bg + danger 색 border + text 로 시각 대체. 색 강조는 보존.
//
// accessibilityRole="alert" — 스크린리더가 즉시 읽음 (웹 role="alert" 대응).

import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '@celebbase/design-tokens';

import { px, resolveToken } from '../lib/tokens';

interface FormErrorBoxProps {
  /** 표시할 메시지. null 이면 박스 자체 미렌더. */
  message: string | null;
}

export function FormErrorBox({ message }: FormErrorBoxProps): React.JSX.Element | null {
  if (message === null) return null;
  return (
    <View accessibilityRole="alert" style={styles.container}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingVertical: px(tokens.light['--cb-space-3']),
    backgroundColor: resolveToken('light', '--cb-color-bg'),
    borderWidth: 1,
    borderColor: resolveToken('light', '--cb-color-error'),
    borderRadius: px(tokens.light['--cb-radius-sm']),
  },
  text: {
    fontSize: px(tokens.light['--cb-font-size-sm']),
    color: resolveToken('light', '--cb-color-error'),
    lineHeight: px(tokens.light['--cb-font-size-sm']) * 1.4,
  },
});
