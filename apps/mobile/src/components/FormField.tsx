// 폼 입력 필드 — Label + TextInput + focus state.
// 웹 `EmailLoginForm.module.css` 의 `.label` + `.input` 패턴을 RN 으로 옮김.
//   - label sm + medium weight, input 위에 배치
//   - input surface bg + border + radius-md + body font
//   - focus 시 border brand (onFocus state — 웹 :focus-visible 대응), disabled opacity 0.55
// 다른 모든 TextInput prop 은 그대로 전달 — keyboardType / autoComplete / secureTextEntry 등.

import { forwardRef, useMemo, useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { Text, useTheme, type Theme } from '../ui';

interface FormFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** label 의 htmlFor 대응 — accessibility 용 id (RN 에선 nativeID). */
  id?: string;
  /** 본 필드 에러일 때 input border 를 danger 색으로. */
  hasError?: boolean;
}

export const FormField = forwardRef<TextInput, FormFieldProps>(function FormField(
  { label, id, hasError = false, onFocus, onBlur, editable = true, ...inputProps },
  ref,
) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldGroup}>
      <Text
        variant="bodySm"
        accessibilityRole="text"
        nativeID={id !== undefined ? `${id}-label` : undefined}
        style={styles.label}
      >
        {label}
      </Text>
      <TextInput
        ref={ref}
        nativeID={id}
        accessibilityLabel={label}
        editable={editable}
        placeholderTextColor={theme.color.textMuted}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          focused && styles.inputFocused,
          hasError && styles.inputError,
          !editable && styles.inputDisabled,
        ]}
        {...inputProps}
      />
    </View>
  );
});

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    fieldGroup: { gap: theme.space(2) },
    label: { fontWeight: theme.weight.medium },
    input: {
      width: '100%',
      paddingHorizontal: theme.space(4),
      paddingVertical: theme.space(3),
      fontSize: theme.type.body,
      color: theme.color.text,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
      borderRadius: theme.radius.md,
    },
    inputFocused: {
      borderColor: theme.color.brand,
      borderWidth: 2,
      paddingHorizontal: theme.space(4) - 1,
      paddingVertical: theme.space(3) - 1,
    },
    inputError: { borderColor: theme.color.error },
    inputDisabled: { opacity: 0.55 },
  });
}
