import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '@celebbase/design-tokens';

import { px, resolveToken } from './src/lib/tokens';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>CelebBase</Text>
      <Text style={styles.subtitle}>건강한 일상을 위한 웰니스 플랫폼</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: resolveToken('light', '--cb-color-bg'),
    paddingHorizontal: px(tokens.light['--cb-space-4']),
  },
  title: {
    fontSize: 48,
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-brand'),
    marginBottom: px(tokens.light['--cb-space-3']),
  },
  subtitle: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text'),
    textAlign: 'center',
  },
});
