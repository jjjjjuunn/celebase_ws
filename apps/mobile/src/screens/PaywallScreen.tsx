// Paywall — RevenueCat Offering 의 packages 를 카드로 표시 + purchase 흐름.
//
// UI states:
//   - 'loading'   — getCurrentOffering() 진행 중
//   - 'no_offer'  — RevenueCat 대시보드 패키지 미설정 또는 Expo Go (dev stub)
//   - 'ready'     — packages 로딩 완료, 사용자 선택 대기
//   - 'purchasing'— Apple/Google native modal 진행 중
//   - 'success'   — purchase + sync 성공, tier 표시 후 onClose
//   - 'error'     — purchase 또는 sync 실패. 사용자 취소는 silent dismiss.
//
// Apple Guideline 3.1.1: Restore Purchases 버튼 + Terms / Privacy 링크 필수.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import { tokens } from '@celebbase/design-tokens';

import { ApiError } from '../lib/api-client';
import { px, resolveToken } from '../lib/tokens';
import {
  getCurrentOffering,
  purchasePackage,
  restorePurchases,
  type PurchaseResult,
} from '../services/subscriptions';

interface PaywallScreenProps {
  /** 구매 성공 또는 사용자 닫기 시 호출. tier 정보를 호출자에게 전달. */
  onClose: (purchased: PurchaseResult | null) => void;
}

type Phase =
  | { state: 'loading' }
  | { state: 'no_offer'; reason: string }
  | { state: 'ready'; offering: PurchasesOffering; selected: string | null }
  | { state: 'purchasing'; offering: PurchasesOffering; selected: string }
  | { state: 'success'; result: PurchaseResult }
  | { state: 'error'; message: string; offering: PurchasesOffering | null }
  | { state: 'dev_preview' };

// 실제 운영 시 spec.md / legal 페이지 URL 로 교체. CHORE-MOBILE-LEGAL-001 백로그.
const TERMS_URL = 'https://celebbase.com/terms';
const PRIVACY_URL = 'https://celebbase.com/privacy';

export function PaywallScreen({ onClose }: PaywallScreenProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>({ state: 'loading' });

  useEffect(() => {
    let cancelled: boolean = false;

    void (async (): Promise<void> => {
      const offering = await getCurrentOffering();
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (cancelled) return;
      const noPackages = offering === null || offering.availablePackages.length === 0;
      if (noPackages) {
        // DEV-only: Expo Go 에서 native module 부재 시 mock 카드 표시 — 디자인 미리보기용.
        // Production 빌드에선 real offering 만 표시, 부재 시 'no_offer' fallback.
        if (__DEV__) {
          setPhase({ state: 'dev_preview' });
          return;
        }
        setPhase({
          state: 'no_offer',
          reason:
            'Subscriptions are not available right now. Please try again later.',
        });
        return;
      }
      setPhase({ state: 'ready', offering, selected: null });
    })();

    return (): void => {
      cancelled = true;
    };
  }, []);

  async function handlePurchase(pkg: PurchasesPackage, offering: PurchasesOffering): Promise<void> {
    setPhase({ state: 'purchasing', offering, selected: pkg.identifier });
    try {
      const result = await purchasePackage(pkg);
      setPhase({ state: 'success', result });
    } catch (err) {
      if (isUserCancelled(err)) {
        // 사용자가 native modal 에서 cancel — paywall 그대로 두고 ready 로 복귀.
        setPhase({ state: 'ready', offering, selected: pkg.identifier });
        return;
      }
      setPhase({
        state: 'error',
        message: mapErrorToMessage(err),
        offering,
      });
    }
  }

  async function handleRestore(): Promise<void> {
    setPhase({ state: 'loading' });
    try {
      const synced = await restorePurchases();
      if (synced.tier === 'free') {
        // 복원했지만 활성 구독 없음.
        setPhase({
          state: 'error',
          message: 'No active subscription found to restore.',
          offering: null,
        });
        return;
      }
      setPhase({
        state: 'success',
        result: { tier: synced.tier, receipt: synced },
      });
    } catch (err) {
      setPhase({
        state: 'error',
        message: mapErrorToMessage(err),
        offering: null,
      });
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            onClose(phase.state === 'success' ? phase.result : null);
          }}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>Unlock CelebBase Pro</Text>
        <Text style={styles.subtitle}>
          Personalized wellness plans inspired by your favorite celebrities.
        </Text>

        <View style={styles.benefits}>
          <BenefitRow text="Full access to celebrity wellness libraries" />
          <BenefitRow text="Personalized meal plans tailored to your goals" />
          <BenefitRow text="Daily insights from real wellness habits" />
          <BenefitRow text="Cancel anytime in your subscription settings" />
        </View>

        {phase.state === 'loading' ? (
          <View style={styles.centered}>
            <ActivityIndicator
              size="large"
              color={resolveToken('light', '--cb-color-brand')}
            />
          </View>
        ) : null}

        {phase.state === 'no_offer' ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{phase.reason}</Text>
          </View>
        ) : null}

        {phase.state === 'dev_preview' ? (
          <View style={styles.packageList}>
            <View style={styles.packageCard}>
              <Text style={styles.packagePrice}>$34.99</Text>
              <Text style={styles.packagePeriod}>per month</Text>
              <Text style={styles.packageCta}>Subscribe</Text>
            </View>
            <Text style={styles.devPreviewNote}>
              (Preview — real purchase available in production build)
            </Text>
          </View>
        ) : null}

        {phase.state === 'ready' || phase.state === 'purchasing' ? (
          <View style={styles.packageList}>
            {phase.offering.availablePackages.map((pkg) => {
              const active = phase.selected === pkg.identifier;
              const busy = phase.state === 'purchasing';
              return (
                <PackageCard
                  key={pkg.identifier}
                  pkg={pkg}
                  active={active}
                  busy={busy}
                  onPress={() => {
                    void handlePurchase(pkg, phase.offering);
                  }}
                />
              );
            })}
          </View>
        ) : null}

        {phase.state === 'success' ? (
          <View style={styles.successCard}>
            <Text style={styles.successEmoji}>🎉</Text>
            <Text style={styles.successTitle}>You're now {phase.result.tier}!</Text>
            <Text style={styles.successBody}>
              Your premium content is unlocked. Enjoy!
            </Text>
            <TouchableOpacity
              onPress={() => {
                onClose(phase.result);
              }}
              accessibilityRole="button"
              accessibilityLabel="Continue"
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {phase.state === 'error' ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{phase.message}</Text>
            <TouchableOpacity
              onPress={() => {
                if (phase.offering !== null) {
                  setPhase({ state: 'ready', offering: phase.offering, selected: null });
                } else {
                  onClose(null);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Try again"
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.legal}>
          <TouchableOpacity
            onPress={() => {
              void handleRestore();
            }}
            accessibilityRole="button"
            accessibilityLabel="Restore purchases"
            disabled={phase.state === 'loading' || phase.state === 'purchasing'}
          >
            <Text style={styles.legalLink}>Restore purchases</Text>
          </TouchableOpacity>
          <Text style={styles.legalSeparator}>·</Text>
          <TouchableOpacity
            onPress={() => {
              void Linking.openURL(TERMS_URL);
            }}
            accessibilityRole="link"
          >
            <Text style={styles.legalLink}>Terms</Text>
          </TouchableOpacity>
          <Text style={styles.legalSeparator}>·</Text>
          <TouchableOpacity
            onPress={() => {
              void Linking.openURL(PRIVACY_URL);
            }}
            accessibilityRole="link"
          >
            <Text style={styles.legalLink}>Privacy</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.legalDisclaimer}>
          Payment will be charged to your App Store / Play Store account. Subscriptions auto-renew unless cancelled at least 24 hours before the end of the current period. You can manage and cancel subscriptions in your store account settings.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

interface PackageCardProps {
  pkg: PurchasesPackage;
  active: boolean;
  busy: boolean;
  onPress: () => void;
}

function PackageCard({ pkg, active, busy, onPress }: PackageCardProps): React.JSX.Element {
  const product = pkg.product;
  const showBusy = busy && active;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`Subscribe for ${product.priceString}`}
      accessibilityState={{ selected: active, disabled: busy }}
      style={[styles.packageCard, active ? styles.packageCardActive : null]}
    >
      <Text style={styles.packagePrice}>{product.priceString}</Text>
      <Text style={styles.packagePeriod}>per month</Text>
      {showBusy ? (
        <ActivityIndicator
          color={resolveToken('light', '--cb-color-on-brand')}
          style={styles.packageBusy}
        />
      ) : (
        <Text style={styles.packageCta}>Subscribe</Text>
      )}
    </TouchableOpacity>
  );
}

interface BenefitRowProps {
  text: string;
}

function BenefitRow({ text }: BenefitRowProps): React.JSX.Element {
  return (
    <View style={styles.benefitRow}>
      <Text style={styles.benefitCheck}>✓</Text>
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

function isUserCancelled(err: unknown): boolean {
  // RevenueCat 의 user-cancelled 는 errorCode 1 또는 userCancelled: true.
  if (err === null || typeof err !== 'object') return false;
  const obj = err as Record<string, unknown>;
  if (obj['userCancelled'] === true) return true;
  if (typeof obj['code'] === 'string' && obj['code'].includes('CANCEL')) return true;
  return false;
}

function mapErrorToMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'Too many attempts. Please try again in a minute.';
    if (err.code === 'REVENUECAT_UNAVAILABLE') {
      return 'Subscription service is temporarily unavailable. Please try again.';
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: resolveToken('light', '--cb-color-bg'),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingVertical: px(tokens.light['--cb-space-3']),
  },
  closeButton: {
    fontSize: 24,
    color: resolveToken('light', '--cb-color-text-muted'),
  },
  body: {
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingBottom: px(tokens.light['--cb-space-5']),
    gap: px(tokens.light['--cb-space-4']),
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: resolveToken('light', '--cb-color-brand'),
    textAlign: 'center',
  },
  subtitle: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text-muted'),
    textAlign: 'center',
    lineHeight: px(tokens.light['--cb-body-md']) + 6,
  },
  benefits: {
    gap: px(tokens.light['--cb-space-2']),
    paddingVertical: px(tokens.light['--cb-space-3']),
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: px(tokens.light['--cb-space-2']),
  },
  benefitCheck: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-brand'),
    fontWeight: '700',
  },
  benefitText: {
    flex: 1,
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text'),
    lineHeight: px(tokens.light['--cb-body-md']) + 6,
  },
  packageList: {
    gap: px(tokens.light['--cb-space-3']),
  },
  packageCard: {
    padding: px(tokens.light['--cb-space-5']),
    borderRadius: 16,
    backgroundColor: resolveToken('light', '--cb-color-brand'),
    alignItems: 'center',
    gap: 4,
  },
  packageCardActive: {
    opacity: 0.85,
  },
  packagePrice: {
    fontSize: 40,
    fontWeight: '800',
    color: resolveToken('light', '--cb-color-on-brand'),
  },
  packagePeriod: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '500',
    color: resolveToken('light', '--cb-color-on-brand'),
    opacity: 0.85,
    marginBottom: px(tokens.light['--cb-space-3']),
  },
  packageCta: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-on-brand'),
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  packageBusy: {
    marginTop: px(tokens.light['--cb-space-2']),
  },
  devPreviewNote: {
    fontSize: px(tokens.light['--cb-caption']),
    color: resolveToken('light', '--cb-color-text-muted'),
    textAlign: 'center',
    marginTop: px(tokens.light['--cb-space-2']),
    fontStyle: 'italic',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: px(tokens.light['--cb-space-4']),
    gap: px(tokens.light['--cb-space-3']),
  },
  errorText: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-error'),
    textAlign: 'center',
  },
  successCard: {
    alignItems: 'center',
    padding: px(tokens.light['--cb-space-4']),
    gap: px(tokens.light['--cb-space-3']),
  },
  successEmoji: { fontSize: 64 },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: resolveToken('light', '--cb-color-brand'),
    textTransform: 'capitalize',
  },
  successBody: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text'),
    textAlign: 'center',
  },
  primaryButton: {
    paddingVertical: px(tokens.light['--cb-button-pad-y']),
    paddingHorizontal: px(tokens.light['--cb-button-pad-x']),
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: resolveToken('light', '--cb-color-brand'),
    minWidth: 200,
  },
  primaryButtonText: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-on-brand'),
  },
  secondaryButton: {
    paddingVertical: px(tokens.light['--cb-button-pad-y']),
    paddingHorizontal: px(tokens.light['--cb-button-pad-x']),
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: resolveToken('light', '--cb-color-surface'),
  },
  secondaryButtonText: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-text'),
  },
  legal: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: px(tokens.light['--cb-space-2']),
    paddingTop: px(tokens.light['--cb-space-3']),
  },
  legalLink: {
    fontSize: px(tokens.light['--cb-body-sm']),
    color: resolveToken('light', '--cb-color-brand'),
    fontWeight: '600',
  },
  legalSeparator: {
    fontSize: px(tokens.light['--cb-body-sm']),
    color: resolveToken('light', '--cb-color-text-muted'),
  },
  legalDisclaimer: {
    fontSize: px(tokens.light['--cb-caption']),
    color: resolveToken('light', '--cb-color-text-muted'),
    textAlign: 'center',
    lineHeight: px(tokens.light['--cb-caption']) + 6,
  },
});
