// Card primitive — the shared surface container. Replaces per-screen
// `creditsCard` / `mealCard` / `planHeaderCard` StyleSheet blocks.

import { useMemo } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from './ThemeProvider';

export type CardVariant = 'surface' | 'subtle' | 'outlined';

interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  padded?: boolean;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
  accessibilityLabel?: string;
}

export function Card({
  children,
  variant = 'surface',
  padded = true,
  onPress,
  style,
  accessibilityLabel,
}: CardProps): React.JSX.Element {
  const theme = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        base: {
          borderRadius: theme.radius.xl,
          padding: padded ? theme.space(4) : 0,
          // Soft elevation — iOS shadow + Android elevation. shadowColor uses the
          // darkest neutral token (no raw hex per FE token rule).
          shadowColor: theme.color.text,
          shadowOpacity: theme.mode === 'dark' ? 0.3 : 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        },
        surface: { backgroundColor: theme.color.surface },
        subtle: { backgroundColor: theme.color.brandSubtle },
        outlined: { backgroundColor: theme.color.bg, borderWidth: 1, borderColor: theme.color.border },
      }),
    [theme, padded],
  );

  const composed = [styles.base, styles[variant], style];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={composed}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={composed}>{children}</View>;
}
