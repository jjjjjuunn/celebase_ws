// Screen primitive — themed SafeAreaView wrapper with an optional large-title
// header. Standardizes background + safe-area edges + screen padding so screens
// stop re-declaring `container` / `screenTitle` blocks.

import { useMemo } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

interface ScreenProps {
  children: React.ReactNode;
  title?: string;
  scroll?: boolean;
  edges?: readonly Edge[];
  contentStyle?: ViewStyle;
}

export function Screen({
  children,
  title,
  scroll = false,
  edges = ['top'],
  contentStyle,
}: ScreenProps): React.JSX.Element {
  const theme = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1, backgroundColor: theme.color.bg },
        title: { paddingHorizontal: theme.space(4), paddingVertical: theme.space(4) },
        scrollContent: { paddingBottom: theme.space(6) },
        body: { flex: 1 },
      }),
    [theme],
  );

  const header =
    title != null && title !== '' ? (
      <Text variant="h1" style={styles.title}>
        {title}
      </Text>
    ) : null;

  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      {header}
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.scrollContent, contentStyle]}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.body, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}
