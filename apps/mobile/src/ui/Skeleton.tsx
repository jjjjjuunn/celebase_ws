// Skeleton primitive — shimmer placeholder for loading states (replaces bare
// ActivityIndicator spinners). Uses the RN core Animated API: a shimmer-colored
// overlay pulses its opacity on the native driver (no reanimated dependency).
// Skeleton tokens (--cb-skeleton-base / --cb-skeleton-shimmer) finally get used.

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from './ThemeProvider';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = '100%', height = 16, radius, style }: SkeletonProps): React.JSX.Element {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [pulse]);

  const borderRadius = radius ?? theme.radius.md;
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View
      style={[{ width, height, borderRadius, backgroundColor: theme.color.skeletonBase }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius, backgroundColor: theme.color.skeletonShimmer, opacity },
        ]}
      />
    </View>
  );
}
