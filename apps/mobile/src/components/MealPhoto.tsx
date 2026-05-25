// Meal photo tile for the Meal Plan tab. Recipes carry an optional image_url,
// but most seeds are null while food photography is on a licensing hold — so the
// fallback (a deterministic warm-grey tonal block + scrim + name overlay) is the
// design, mirroring CelebritiesScreen's placeholder tiles. Once real photos land
// the same component renders them full-bleed with no caller change.

import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { resolveToken } from '../lib/tokens';
import { monogramIndex, useTheme, type Theme } from '../ui';

interface MealPhotoProps {
  /** recipe.image_url — null/empty falls back to the tonal placeholder. */
  imageUrl: string | null;
  /** Meal name — drives the deterministic placeholder shade + overlay label. */
  name: string;
  /**
   * Fill the parent's height instead of the default 16:10 aspect ratio. The
   * Meal Plan snap-scroll cards size the photo to a fixed px height (70% of the
   * body), so the tile must stretch to its wrapper rather than derive height
   * from width.
   */
  fill?: boolean;
}

// Same warm-grey/taupe shades CelebritiesScreen uses, so meal and celebrity
// placeholders read as one cohesive monochrome system.
const TILE_SHADES = ['--cb-neutral-400', '--cb-neutral-500', '--cb-neutral-600'] as const;

function tileShade(theme: Theme, name: string): string {
  return resolveToken(theme.mode, TILE_SHADES[monogramIndex(name, TILE_SHADES.length)]);
}

export function MealPhoto({ imageUrl, name, fill = false }: MealPhotoProps): React.JSX.Element {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = imageUrl != null && imageUrl !== '' && !imageFailed;

  return (
    <View style={[fill ? styles.tileFill : styles.tile, { backgroundColor: tileShade(theme, name) }]}>
      {showImage ? (
        <Image
          source={{ uri: imageUrl }}
          onError={() => {
            setImageFailed(true);
          }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        // 사진 미존재 — 메뉴 이름은 호출부 caption 으로 노출되므로 타일은 중복 라벨 없이
        // 중앙에 옅은 음식 아이콘만 두어 "이미지 자리"로 읽히게 한다.
        <View style={styles.iconWrap}>
          <Ionicons name="restaurant-outline" size={40} color={theme.color.onInk} />
        </View>
      )}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    tile: {
      width: '100%',
      aspectRatio: 16 / 10,
      borderRadius: theme.radius.lg,
      overflow: 'hidden',
    },
    // `fill` — stretch to the wrapper (which sets a fixed px height).
    tileFill: {
      width: '100%',
      height: '100%',
      borderRadius: theme.radius.lg,
      overflow: 'hidden',
    },
    iconWrap: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      opacity: 0.55,
    },
  });
}
