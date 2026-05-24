// DrumPicker — iOS-style scroll wheel for numeric onboarding input.
//
// Mirrors the web onboarding DrumPicker UX (centered selection lens, snap,
// depth via per-item scale/opacity) in a pure-JS RN implementation: no native
// module, so it ships reload-safe (no dev-client rebuild). The depth animation
// is driven by the scroll offset on the native thread (useNativeDriver) so the
// wheel stays smooth.
//
// The wheel always resolves to a value (defaults to `defaultValue` on mount) —
// iOS picker semantics, no "please select" friction. VoiceOver users get
// spinbutton-equivalent semantics via accessibilityRole="adjustable" +
// increment/decrement actions.
//
// Ranges here are bounded and small (years, feet, inches, lb, waist), so a
// plain ScrollView mounts every row without perf concern. A future unbounded
// range would warrant FlatList virtualization.

import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Text, useTheme, type Theme } from '../ui';

const ITEM_HEIGHT = 44;
const DEFAULT_VISIBLE_COUNT = 5; // odd → a true center row

export interface DrumPickerProps {
  /** Inclusive lower bound. */
  min: number;
  /** Inclusive upper bound. */
  max: number;
  /** Increment between items (default 1). */
  step?: number;
  /** Controlled value. `undefined` resolves to `defaultValue` (emitted on mount). */
  value: number | undefined;
  /** Resting value when nothing has been picked yet. */
  defaultValue: number;
  onChange: (value: number) => void;
  /** Map a raw value to its display string (e.g. month 1 → "Jan"). */
  formatItem?: (v: number) => string;
  /** Accessible name announced by VoiceOver. */
  accessibilityLabel: string;
  /** Visible rows; odd recommended so one row sits dead-center (default 5). */
  visibleCount?: number;
}

export function DrumPicker({
  min,
  max,
  step = 1,
  value,
  defaultValue,
  onChange,
  formatItem,
  accessibilityLabel,
  visibleCount = DEFAULT_VISIBLE_COUNT,
}: DrumPickerProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const height = ITEM_HEIGHT * visibleCount;
  const pad = (height - ITEM_HEIGHT) / 2;

  const items = useMemo<number[]>(() => {
    const arr: number[] = [];
    for (let v = min; v <= max + 1e-9; v += step) arr.push(Math.round(v * 1000) / 1000);
    return arr;
  }, [min, max, step]);

  const indexOf = useMemo(
    () =>
      (target: number): number => {
        let best = 0;
        let bestDist = Infinity;
        for (let i = 0; i < items.length; i += 1) {
          const d = Math.abs(items[i] - target);
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        }
        return best;
      },
    [items],
  );

  const activeIndex = indexOf(value ?? defaultValue);

  const scrollY = useRef(new Animated.Value(activeIndex * ITEM_HEIGHT)).current;
  const scrollRef = useRef<ScrollView>(null);
  const lastEmitted = useRef<number | undefined>(value);

  // Resolve to a concrete value once on mount so the wheel is never "empty".
  // Mount-only by design; external changes are handled by the controlled-sync
  // effect below. (`items[i]` is non-undefined here — noUncheckedIndexedAccess
  // is off — and `activeIndex` is clamped into range.)
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    if (value === undefined) {
      lastEmitted.current = items[activeIndex];
      onChange(items[activeIndex]);
    }
    // Center the active row on mount. `contentOffset` covers iOS; this deferred
    // scroll covers platforms where that prop is not applied at init (Android).
    const raf = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: activeIndex * ITEM_HEIGHT, animated: false });
    });
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [value, items, activeIndex, onChange]);

  // Keep the wheel aligned with externally-driven value changes (e.g. DOB day
  // clamped when the month shrinks). Skips when the change originated here.
  useEffect(() => {
    if (value !== undefined && value !== lastEmitted.current) {
      lastEmitted.current = value;
      scrollRef.current?.scrollTo({ y: indexOf(value) * ITEM_HEIGHT, animated: false });
    }
  }, [value, indexOf]);

  function emitForOffset(y: number): void {
    const idx = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM_HEIGHT)));
    const next = items[idx];
    if (next !== lastEmitted.current) {
      lastEmitted.current = next;
      onChange(next);
    }
  }

  function handleSettle(e: NativeSyntheticEvent<NativeScrollEvent>): void {
    emitForOffset(e.nativeEvent.contentOffset.y);
  }

  function adjust(direction: 1 | -1): void {
    const idx = indexOf(value ?? defaultValue);
    const nextIdx = Math.max(0, Math.min(items.length - 1, idx + direction));
    const next = items[nextIdx];
    if (next !== value) {
      lastEmitted.current = next;
      onChange(next);
      scrollRef.current?.scrollTo({ y: nextIdx * ITEM_HEIGHT, animated: true });
    }
  }

  function onAccessibilityAction(e: AccessibilityActionEvent): void {
    if (e.nativeEvent.actionName === 'increment') adjust(1);
    else if (e.nativeEvent.actionName === 'decrement') adjust(-1);
  }

  return (
    <View
      style={[styles.viewport, { height }]}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value ?? defaultValue }}
      accessibilityActions={ACCESSIBILITY_ACTIONS}
      onAccessibilityAction={onAccessibilityAction}
    >
      <View pointerEvents="none" style={[styles.lens, { top: pad, height: ITEM_HEIGHT }]} />
      <Animated.ScrollView
        ref={scrollRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        scrollEventThrottle={16}
        contentOffset={{ x: 0, y: activeIndex * ITEM_HEIGHT }}
        contentContainerStyle={{ paddingVertical: pad }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        onMomentumScrollEnd={handleSettle}
        onScrollEndDrag={handleSettle}
      >
        {items.map((v, index) => {
          const inputRange = [
            (index - 2) * ITEM_HEIGHT,
            (index - 1) * ITEM_HEIGHT,
            index * ITEM_HEIGHT,
            (index + 1) * ITEM_HEIGHT,
            (index + 2) * ITEM_HEIGHT,
          ];
          const scale = scrollY.interpolate({
            inputRange,
            outputRange: [0.78, 0.9, 1, 0.9, 0.78],
            extrapolate: 'clamp',
          });
          const opacity = scrollY.interpolate({
            inputRange,
            outputRange: [0.3, 0.6, 1, 0.6, 0.3],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View
              key={v}
              style={[styles.item, { height: ITEM_HEIGHT, opacity, transform: [{ scale }] }]}
            >
              <Text style={styles.itemText}>{formatItem !== undefined ? formatItem(v) : String(v)}</Text>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

const ACCESSIBILITY_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }] as const;

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    viewport: {
      alignSelf: 'stretch',
      borderWidth: 1,
      borderColor: theme.color.border,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.surface,
      overflow: 'hidden',
    },
    // The selection "lens" — a calm band marking the centered row, iOS-style.
    // Explicit zIndex (0) keeps it BEHIND the scrolling items (zIndex 1) so the
    // centered value renders on top — independent of JSX order.
    lens: {
      position: 'absolute',
      left: theme.space(3),
      right: theme.space(3),
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.brandSubtle,
      zIndex: 0,
    },
    scroll: { zIndex: 1 },
    item: { alignItems: 'center', justifyContent: 'center' },
    itemText: {
      fontFamily: theme.font.mono,
      fontVariant: ['tabular-nums'],
      fontSize: theme.type.h3,
      lineHeight: theme.type.h3 * 1.1,
      color: theme.color.text,
    },
  });
}
