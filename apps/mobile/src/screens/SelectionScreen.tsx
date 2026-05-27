// Post-signup path selection (IMPL-MOBILE-ONBOARDING-ROUTING-001, Gate G2).
//
// Shown once right after sign-up. Two paths:
//   - "Personalize"  → bio-profile onboarding (allergies + body basics, non-PHI v1)
//   - "Explore trends" → dismiss to the main app (celebrity claims feed)
// Users who pick trends can start personalization later from Profile / the claims
// feed CTA (existing entry points). Purely presentational — navigation is the
// caller's concern (RootNavigator), so this is unit-testable via callback props.

import { useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Text, useTheme, type Theme } from '../ui';

interface SelectionScreenProps {
  /** User chose the personalized path → start bio-profile onboarding. */
  onPersonalized: () => void;
  /** User chose trend-only → dismiss to the main app. */
  onTrendOnly: () => void;
}

export function SelectionScreen({ onPersonalized, onTrendOnly }: SelectionScreenProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="h1" tone="brand" center>
          How do you want to start?
        </Text>
        <Text variant="body" tone="muted" center style={styles.subtitle}>
          You can switch anytime from your profile.
        </Text>

        <ChoiceCard
          icon="sparkles"
          title="Personalize my plan"
          description="Answer a few quick questions — allergies, goals, body basics — for meal plans tailored to you."
          cta="Get personalized"
          testID="selection-personalized"
          onPress={onPersonalized}
        />
        <ChoiceCard
          icon="newspaper-outline"
          title="Just explore trends"
          description="Browse celebrity wellness claims and routines. No questions now — set up later anytime."
          cta="Explore trends"
          testID="selection-trend-only"
          onPress={onTrendOnly}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

interface ChoiceCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  cta: string;
  testID: string;
  onPress: () => void;
}

function ChoiceCard({ icon, title, description, cta, testID, onPress }: ChoiceCardProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <TouchableOpacity
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      style={styles.card}
    >
      <Ionicons name={icon} size={28} color={theme.color.brand} style={styles.cardIcon} />
      <Text variant="h2" style={styles.cardTitle}>
        {title}
      </Text>
      <Text variant="body" tone="muted" style={styles.cardDescription}>
        {description}
      </Text>
      <Text variant="body" tone="brand" style={styles.cardCta}>
        {cta}
      </Text>
    </TouchableOpacity>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    body: { paddingHorizontal: theme.space(4), paddingVertical: theme.space(5), gap: theme.space(4) },
    subtitle: { lineHeight: theme.type.body + 6, marginBottom: theme.space(2) },
    card: {
      padding: theme.space(5),
      borderRadius: theme.radius.lg,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
      gap: theme.space(2),
    },
    cardIcon: { marginBottom: theme.space(1) },
    cardTitle: {},
    cardDescription: { lineHeight: theme.type.body + 6 },
    cardCta: { fontWeight: theme.weight.semibold, marginTop: theme.space(1) },
  });
}
