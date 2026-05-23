// 폼 에러 박스 — 메시지를 error 색 border + text 의 alert 박스로 표시.
// accessibilityRole="alert" — 스크린리더가 즉시 읽음 (웹 role="alert" 대응).

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, useTheme, type Theme } from '../ui';

interface FormErrorBoxProps {
  /** 표시할 메시지. null 또는 공백 문자열이면 박스 자체 미렌더. */
  message: string | null;
}

export function FormErrorBox({ message }: FormErrorBoxProps): React.JSX.Element | null {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // 빈/공백 문자열도 "에러 없음" 으로 취급한다. SocialAuthButtons 가 탭 시 clear 신호로
  // onError('') 를 보내는데, '' !== null 이라 박스만 비어서 떠버리는 회귀를 막는다.
  if (message === null || message.trim() === '') return null;
  return (
    <View accessibilityRole="alert" style={styles.container}>
      <Text variant="bodySm" tone="error">
        {message}
      </Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: theme.space(4),
      paddingVertical: theme.space(3),
      backgroundColor: theme.color.bg,
      borderWidth: 1,
      borderColor: theme.color.error,
      borderRadius: theme.radius.sm,
    },
  });
}
