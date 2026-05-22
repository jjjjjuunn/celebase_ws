// Avatar primitive. Celebrity photos are blocked by a licensing hold, so the
// fallback IS the design: a deterministic tonal monogram (token accent palette +
// Fraunces serif initials) that reads as intentional luxe rather than a
// placeholder box. When a real `uri` arrives later it layers on top.

import { useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

interface AvatarProps {
  name: string;
  uri?: string | null;
  size?: number;
  /** Circle (default) or rounded-square (grid tiles). */
  shape?: 'circle' | 'rounded';
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function hashIndex(name: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h % mod;
}

export function Avatar({ name, uri, size = 56, shape = 'circle' }: AvatarProps): React.JSX.Element {
  const theme = useTheme();
  const [imageFailed, setImageFailed] = useState(false);

  const bg = useMemo(
    () => theme.accents[hashIndex(name, theme.accents.length)],
    [theme.accents, name],
  );
  const radius = shape === 'circle' ? size / 2 : theme.radius.lg;
  const showImage = uri != null && uri !== '' && !imageFailed;

  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: radius, backgroundColor: bg },
      ]}
      accessibilityRole="image"
      accessibilityLabel={name}
    >
      <Text
        variant="h2"
        tone="onBrand"
        style={{ fontFamily: theme.font.display, fontSize: size * 0.4, lineHeight: size * 0.46 }}
      >
        {initials(name)}
      </Text>
      {showImage ? (
        <Image
          source={{ uri }}
          onError={() => {
            setImageFailed(true);
          }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
