// 폼 입력 필드 — Label + TextInput + focus state.
// 웹 `EmailLoginForm.module.css` 의 `.label` + `.input` 패턴을 RN 으로 옮김.
//
// 디자인 정렬:
//   - label sm size + medium weight + 본문 color, input 위에 배치
//   - input surface bg + border + radius-md + body-md font
//   - focus 시 border brand color (RN onFocus state 로 처리 — 웹의 :focus-visible 대응)
//   - disabled 시 opacity 0.55
//
// 다른 모든 TextInput prop 은 그대로 전달 — keyboardType / autoComplete / secureTextEntry 등.

import { forwardRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

import { tokens } from '@celebbase/design-tokens';

import { px, resolveToken } from '../lib/tokens';

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
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldGroup}>
      <Text accessibilityRole="text" nativeID={id !== undefined ? `${id}-label` : undefined} style={styles.label}>
        {label}
      </Text>
      <TextInput
        ref={ref}
        nativeID={id}
        accessibilityLabel={label}
        editable={editable}
        placeholderTextColor={resolveToken('light', '--cb-color-text-muted')}
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

const styles = StyleSheet.create({
  fieldGroup: {
    gap: px(tokens.light['--cb-space-2']),
  },
  label: {
    fontSize: px(tokens.light['--cb-font-size-sm']),
    fontWeight: '500',
    color: resolveToken('light', '--cb-color-text'),
  },
  input: {
    width: '100%',
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingVertical: px(tokens.light['--cb-space-3']),
    fontSize: px(tokens.light['--cb-font-size-md']),
    color: resolveToken('light', '--cb-color-text'),
    backgroundColor: resolveToken('light', '--cb-color-surface'),
    borderWidth: 1,
    borderColor: resolveToken('light', '--cb-color-border'),
    borderRadius: px(tokens.light['--cb-radius-md']),
  },
  inputFocused: {
    borderColor: resolveToken('light', '--cb-color-brand'),
    borderWidth: 2,
    paddingHorizontal: px(tokens.light['--cb-space-4']) - 1,
    paddingVertical: px(tokens.light['--cb-space-3']) - 1,
  },
  inputError: {
    borderColor: resolveToken('light', '--cb-color-error'),
  },
  inputDisabled: {
    opacity: 0.55,
  },
});
