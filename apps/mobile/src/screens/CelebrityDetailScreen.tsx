// CelebrityDetail — header (avatar + name + bio) + 해당 celeb 의 모든 claims.
//
// 데이터:
//   - GET /api/celebrities/:slug — celeb record
//   - GET /api/celebrities/:slug/claims — claim list (paginated)
//
// 두 fetch 병렬. tier-aware gating 은 ClaimsFeed 와 동일 룰 (trust A/B + free = locked).

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@celebbase/design-tokens';
import type { schemas } from '@celebbase/shared-types';

import { ClaimCard } from '../components/ClaimCard';
import { px, resolveToken } from '../lib/tokens';
import { isClaimLocked, useCurrentTier } from '../lib/use-current-tier';
import { getCelebrity, listCelebrityClaims } from '../services/celebrities';

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
        <TouchableOpacity
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="celebrity-detail-back"
        >
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
      </View>

      {phase.state === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator
            size="large"
            color={resolveToken('light', '--cb-color-brand')}
          />
        </View>
      ) : phase.state === 'error' ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Couldn't load celebrity details.</Text>
        </View>
      ) : (
        <FlatList
          data={phase.claims}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={<HeaderCard celebrity={phase.celebrity} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                No claims yet for {phase.celebrity.display_name}.
              </Text>
            </View>
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

interface HeaderCardProps {
  celebrity: schemas.CelebrityWire;
}

function HeaderCard({ celebrity }: HeaderCardProps): React.JSX.Element {
  return (
    <View style={styles.celebHeader}>
      <View style={styles.avatarPlaceholder}>
        <Text style={styles.avatarInitial}>
          {celebrity.display_name.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <Text style={styles.celebName}>{celebrity.display_name}</Text>
      <Text style={styles.celebCategory}>{celebrity.category.toUpperCase()}</Text>
      {celebrity.short_bio !== null && celebrity.short_bio !== '' ? (
        <Text style={styles.celebBio}>{celebrity.short_bio}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: resolveToken('light', '--cb-color-bg'),
  },
  header: {
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingVertical: px(tokens.light['--cb-space-3']),
  },
  backButton: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-brand'),
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: px(tokens.light['--cb-space-4']),
  },
  errorText: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-error'),
  },
  celebHeader: {
    alignItems: 'center',
    paddingVertical: px(tokens.light['--cb-space-4']),
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    gap: px(tokens.light['--cb-space-2']),
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: resolveToken('light', '--cb-color-brand-bg'),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: px(tokens.light['--cb-space-2']),
  },
  avatarInitial: {
    fontSize: 40,
    fontWeight: '800',
    color: resolveToken('light', '--cb-color-on-brand'),
  },
  celebName: {
    fontSize: 28,
    fontWeight: '800',
    color: resolveToken('light', '--cb-color-text'),
  },
  celebCategory: {
    fontSize: px(tokens.light['--cb-caption']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-brand'),
    letterSpacing: 1,
  },
  celebBio: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text-muted'),
    textAlign: 'center',
    marginTop: px(tokens.light['--cb-space-2']),
    paddingHorizontal: px(tokens.light['--cb-space-3']),
  },
  emptyState: {
    padding: px(tokens.light['--cb-space-5']),
    alignItems: 'center',
  },
  emptyText: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text-muted'),
  },
});
