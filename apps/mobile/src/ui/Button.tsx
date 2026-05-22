// Button primitive. Replaces the 5+ ad-hoc `primaryButton` StyleSheet blocks
// copied across screens. Press feedback is a subtle scale via the RN core
// Animated API (no reanimated dependency — keeps the dev build rebuild-free).

import { useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
} from 'react-native';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: (e: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  loading = false,
  fullWidth = true,
  accessibilityLabel,
}: ButtonProps): React.JSX.Element {
  const theme = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const styles = useMemo(() => {
    const padY = size === 'lg' ? theme.space(4) : theme.space(3);
    return StyleSheet.create({
      base: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.space(2),
        paddingVertical: padY,
        paddingHorizontal: theme.space(5),
        borderRadius: theme.radius.lg,
        borderWidth: 2,
        alignSelf: fullWidth ? 'stretch' : 'flex-start',
      },
      primary: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
      secondary: { backgroundColor: theme.color.surface, borderColor: theme.color.brand },
      ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
      disabled: { opacity: 0.45 },
    });
  }, [theme, size, fullWidth]);

  const onPressIn = (): void => {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start();
  };
  const onPressOut = (): void => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50 }).start();
  };

  const tone = variant === 'primary' ? 'onBrand' : 'brand';
  const inactive = disabled || loading;

  return (
    <Animated.View style={{ transform: [{ scale }], alignSelf: fullWidth ? 'stretch' : 'flex-start' }}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={inactive}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: inactive, busy: loading }}
        style={[styles.base, styles[variant], inactive && styles.disabled]}
      >
        {loading ? (
          <ActivityIndicator color={variant === 'primary' ? theme.color.onBrand : theme.color.brand} />
        ) : (
          <Text variant="body" tone={tone} style={boldText}>
            {label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const boldText = { fontWeight: '700' as const };
