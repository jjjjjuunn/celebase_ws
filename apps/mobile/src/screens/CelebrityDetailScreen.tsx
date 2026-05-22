// CelebrityDetail — header (avatar + name + bio) + 해당 celeb 의 모든 claims.
//
// 데이터:
//   - GET /api/celebrities/:slug — celeb record
//   - GET /api/celebrities/:slug/claims — claim list (paginated)
//
// 두 fetch 병렬. tier-aware gating 은 ClaimsFeed 와 동일 룰 (trust A/B + free = locked).
// 헤더는 ui/ primitive(Avatar monogram + Badge)로 재작성 (IMPL-MOBILE-CELEB-REDESIGN-001).

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { schemas } from '@celebbase/shared-types';

import { ClaimCard } from '../components/ClaimCard';
import { isClaimLocked, useCurrentTier } from '../lib/use-current-tier';
import { getCelebrity, listCelebrityClaims } from '../services/celebrities';
import { Avatar, Badge, EmptyState, Text, useTheme, type Theme } from '../ui';

interface CelebrityDetailScreenProps {
  slug: string;
  onBack: () => void;
  onClaimPress: (claimId: string) => void;
}

type Phase =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | {
      state: 'loaded';
      celebrity: schemas.CelebrityWire;
      claims: schemas.LifestyleClaimWire[];
    };

export function CelebrityDetailScreen({
  slug,
  onBack,
  onClaimPress,
}: CelebrityDetailScreenProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [phase, setPhase] = useState<Phase>({ state: 'loading' });
  const { tier } = useCurrentTier();

  useEffect(() => {
    let cancelled = false;
    setPhase({ state: 'loading' });

    Promise.all([getCelebrity(slug), listCelebrityClaims(slug)])
      .then(([celebRes, claimsRes]) => {
        if (cancelled) return;
        setPhase({
          state: 'loaded',
          celebrity: celebRes.celebrity,
          claims: claimsRes.claims,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'unknown';
        setPhase({ state: 'error', message });
      });

    return (): void => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="celebrity-detail-back"
        >
          <Text variant="body" tone="brand" style={styles.bold}>
            ← Back
          </Text>
        </Pressable>
      </View>

      {phase.state === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.color.brand} />
        </View>
      ) : phase.state === 'error' ? (
        <View style={styles.centered}>
          <Text variant="body" tone="error">
            Couldn't load celebrity details.
          </Text>
        </View>
      ) : (
        <FlatList
          data={phase.claims}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={<HeaderCard celebrity={phase.celebrity} />}
          ListEmptyComponent={
            <EmptyState
              glyph="📭"
              title="No claims yet"
              body={`No wellness claims for ${phase.celebrity.display_name} yet.`}
            />
          }
          renderItem={({ item }) => {
            const locked = isClaimLocked(item.trust_grade, tier);
            return (
              <ClaimCard
                claim={item}
                locked={locked}
                onPress={(id) => {
                  if (locked) return;
                  onClaimPress(id);
                }}
              />
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function HeaderCard({ celebrity }: { celebrity: schemas.CelebrityWire }): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.celebHeader}>
      <Avatar name={celebrity.display_name} size={96} />
      <Text variant="h2" center>
        {celebrity.display_name}
      </Text>
      <Badge label={celebrity.category.toUpperCase()} tone="subtle" />
      {celebrity.short_bio !== null && celebrity.short_bio !== '' ? (
        <Text variant="body" tone="muted" center style={styles.bio}>
          {celebrity.short_bio}
        </Text>
      ) : null}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    header: { paddingHorizontal: theme.space(4), paddingVertical: theme.space(3) },
    bold: { fontWeight: '600' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.space(4) },
    celebHeader: {
      alignItems: 'center',
      paddingVertical: theme.space(4),
      paddingHorizontal: theme.space(4),
      gap: theme.space(2),
    },
    bio: { marginTop: theme.space(2), paddingHorizontal: theme.space(3) },
  });
}
