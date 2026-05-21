// S2 — Persona Select. 셀럽 그리드에서 하나를 선택해 onNext 호출.
//
// 데이터/그리드는 공용 CelebrityPicker (식단 생성 시트와 공유) 가 담당한다.
// 본 스텝은 온보딩 chrome (header/intro/footer + Continue 게이트) 만 책임진다.
// 본 task scope 는 selection 만 — PATCH /api/users/me { preferred_celebrity_slug }
// 호출은 S7 최종 confirm 시점 (후속 sub-task) 에 묶음.

import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '@celebbase/design-tokens';

import { CelebrityPicker } from '../components/CelebrityPicker';
import { px, resolveToken } from '../lib/tokens';
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
  const [selectedSlug, setSelectedSlug] = useState<string | undefined>(
    initial?.preferred_celebrity_slug,
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.stepLabel}>1 / 3</Text>
      </View>

      <View style={styles.intro}>
        <Text style={styles.title}>Pick a celebrity to follow</Text>
        <Text style={styles.subtitle}>
          We'll tailor your wellness recommendations based on their habits.
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
        <TouchableOpacity
          onPress={() => {
            if (selectedSlug !== undefined && selectedSlug !== '') {
              onNext({ preferred_celebrity_slug: selectedSlug });
            }
          }}
          disabled={selectedSlug === undefined}
          accessibilityRole="button"
          accessibilityLabel="Continue"
          accessibilityState={{ disabled: selectedSlug === undefined }}
          style={[
            styles.nextButton,
            selectedSlug === undefined ? styles.nextButtonDisabled : styles.nextButtonActive,
          ]}
        >
          <Text
            style={[
              styles.nextButtonText,
              selectedSlug === undefined
                ? styles.nextButtonTextDisabled
                : styles.nextButtonTextActive,
            ]}
          >
            Continue
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: resolveToken('light', '--cb-color-bg'),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingVertical: px(tokens.light['--cb-space-3']),
  },
  closeButton: {
    fontSize: 24,
    color: resolveToken('light', '--cb-color-text-muted'),
  },
  stepLabel: {
    fontSize: px(tokens.light['--cb-body-sm']),
    color: resolveToken('light', '--cb-color-text-muted'),
    fontWeight: '600',
  },
  intro: {
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingBottom: px(tokens.light['--cb-space-3']),
    gap: px(tokens.light['--cb-space-2']),
  },
  title: {
    fontSize: px(tokens.light['--cb-display-md']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-text'),
  },
  subtitle: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text-muted'),
    lineHeight: px(tokens.light['--cb-body-md']) + 6,
  },
  pickerArea: {
    flex: 1,
  },
  footer: {
    padding: px(tokens.light['--cb-space-4']),
    borderTopWidth: 1,
    borderTopColor: resolveToken('light', '--cb-color-border'),
  },
  nextButton: {
    paddingVertical: px(tokens.light['--cb-button-pad-y']),
    paddingHorizontal: px(tokens.light['--cb-button-pad-x']),
    borderRadius: 8,
    alignItems: 'center',
  },
  nextButtonActive: {
    backgroundColor: resolveToken('light', '--cb-color-brand-bg'),
  },
  nextButtonDisabled: {
    backgroundColor: resolveToken('light', '--cb-color-neutral-100'),
  },
  nextButtonText: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '600',
  },
  nextButtonTextActive: {
    color: resolveToken('light', '--cb-color-on-brand'),
  },
  nextButtonTextDisabled: {
    color: resolveToken('light', '--cb-color-text-muted'),
  },
});
