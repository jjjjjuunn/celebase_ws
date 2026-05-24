// OptionChips — pill-style selectable chips shared across onboarding question
// screens (sex, allergies, goals, diet, GLP-1). Purely presentational: it marks
// chips whose value is in `selected` and calls `onToggle(value)`. The caller
// decides single-select (replace) vs multi-select (add/remove) semantics.

import { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { Text, useTheme, type Theme } from '../ui';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

interface OptionChipsProps<T extends string> {
  options: ReadonlyArray<ChipOption<T>>;
  /** Selected values. Single-select callers pass `[value]` or `[]`. */
  selected: ReadonlyArray<T>;
  onToggle: (value: T) => void;
}

export function OptionChips<T extends string>({
  options,
  selected,
  onToggle,
}: OptionChipsProps<T>): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => {
              onToggle(opt.value);
            }}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
            accessibilityState={{ selected: active }}
            style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
          >
            <Text variant="bodySm" tone={active ? 'onBrand' : 'default'} style={styles.chipText}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) },
    chip: {
      paddingHorizontal: theme.space(4),
      paddingVertical: theme.space(2),
      borderRadius: theme.radius.pill,
    },
    chipActive: { backgroundColor: theme.color.brand },
    chipInactive: { backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
    chipText: { fontWeight: theme.weight.semibold },
  });
}
