// S2 — Persona Select. 셀럽 그리드에서 하나를 선택해 onNext 호출.
//
// 데이터/그리드는 공용 CelebrityPicker (식단 생성 시트와 공유) 가 담당한다.
// 본 스텝은 온보딩 chrome (header/intro/footer + Continue 게이트) 만 책임진다.

import { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CelebrityPicker } from '../components/CelebrityPicker';
import { Button, Text, useTheme, type Theme } from '../ui';
import type { PersonaDraft } from './types';

interface PersonaSelectStepProps {
  initial?: PersonaDraft;
  onNext: (draft: PersonaDraft) => void;
  onClose: () => void;
}

export function PersonaSelectStep({
  initial,
  onNext,
  onClose,
}: PersonaSelectStepProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [selectedSlug, setSelectedSlug] = useState<string | undefined>(
    initial?.preferred_celebrity_slug,
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <Text tone="muted" style={styles.navIcon}>
            ✕
          </Text>
        </TouchableOpacity>
        <Text variant="bodySm" tone="muted" style={styles.stepLabel}>
          1 / 3
        </Text>
      </View>

      <View style={styles.intro}>
        <Text variant="h1">Pick a celebrity to follow</Text>
        <Text variant="body" tone="muted" style={styles.subtitle}>
          We&apos;ll tailor your wellness recommendations based on their habits.
        </Text>
      </View>

      <View style={styles.pickerArea}>
        <CelebrityPicker
          selectedSlug={selectedSlug}
          onSelect={(celebrity) => {
            setSelectedSlug(celebrity.slug);
          }}
        />
      </View>

      <View style={styles.footer}>
        <Button
          label="Continue"
          disabled={selectedSlug === undefined}
          onPress={() => {
            if (selectedSlug !== undefined && selectedSlug !== '') {
              onNext({ preferred_celebrity_slug: selectedSlug });
            }
          }}
        />
      </View>
    </SafeAreaView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: theme.space(4),
      paddingVertical: theme.space(3),
    },
    navIcon: { fontSize: 24 },
    stepLabel: { fontWeight: theme.weight.semibold },
    intro: {
      paddingHorizontal: theme.space(4),
      paddingBottom: theme.space(3),
      gap: theme.space(2),
    },
    subtitle: { lineHeight: theme.type.body + 6 },
    pickerArea: { flex: 1 },
    footer: {
      padding: theme.space(4),
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
    },
  });
}
