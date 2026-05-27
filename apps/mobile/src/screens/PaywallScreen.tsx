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

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import { ApiError } from '../lib/api-client';
import {
  getCurrentOffering,
  purchasePackage,
  restorePurchases,
  type PurchaseResult,
} from '../services/subscriptions';
import { Button, Text, useTheme, type Theme } from '../ui';

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
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
          reason: 'Subscriptions are not available right now. Please try again later.',
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
      setPhase({ state: 'error', message: mapErrorToMessage(err), offering });
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
      setPhase({ state: 'success', result: { tier: synced.tier, receipt: synced } });
    } catch (err) {
      setPhase({ state: 'error', message: mapErrorToMessage(err), offering: null });
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
          <Ionicons name="close" size={26} color={theme.color.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="h1" tone="brand" center>
          Unlock Celebase Pro
        </Text>
        <Text variant="body" tone="muted" center style={styles.subtitle}>
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
            <ActivityIndicator size="large" color={theme.color.brand} />
          </View>
        ) : null}

        {phase.state === 'no_offer' ? (
          <View style={styles.centered}>
            <Text variant="body" tone="error" center>
              {phase.reason}
            </Text>
          </View>
        ) : null}

        {phase.state === 'dev_preview' ? (
          // No hard-coded price: real pricing comes from RevenueCat / the store at
          // runtime (Codex HIGH — a dummy price must never ship or mislead QA).
          <View style={styles.centered}>
            <Text variant="body" tone="muted" center>
              Subscription options load from the App Store / Play Store in a device build.
            </Text>
            <Text variant="caption" tone="muted" center style={styles.devPreviewNote}>
              (Preview build — live pricing is unavailable in Expo Go)
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
            <Ionicons name="sparkles" size={56} color={theme.color.gold} />
            <Text variant="h1" tone="brand" center style={styles.successTitle}>
              You&apos;re now {phase.result.tier}!
            </Text>
            <Text variant="body" center>
              Your premium content is unlocked. Enjoy!
            </Text>
            <View style={styles.successCta}>
              <Button
                label="Continue"
                onPress={() => {
                  onClose(phase.result);
                }}
              />
            </View>
          </View>
        ) : null}

        {phase.state === 'error' ? (
          <View style={styles.centered}>
            <Text variant="body" tone="error" center>
              {phase.message}
            </Text>
            <View style={styles.errorCta}>
              <Button
                label="Try again"
                variant="secondary"
                onPress={() => {
                  if (phase.offering !== null) {
                    setPhase({ state: 'ready', offering: phase.offering, selected: null });
                  } else {
                    onClose(null);
                  }
                }}
              />
            </View>
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
            <Text variant="bodySm" tone="brand" style={styles.legalLink}>
              Restore purchases
            </Text>
          </TouchableOpacity>
          <Text variant="bodySm" tone="muted">
            ·
          </Text>
          <TouchableOpacity
            onPress={() => {
              void Linking.openURL(TERMS_URL);
            }}
            accessibilityRole="link"
          >
            <Text variant="bodySm" tone="brand" style={styles.legalLink}>
              Terms
            </Text>
          </TouchableOpacity>
          <Text variant="bodySm" tone="muted">
            ·
          </Text>
          <TouchableOpacity
            onPress={() => {
              void Linking.openURL(PRIVACY_URL);
            }}
            accessibilityRole="link"
          >
            <Text variant="bodySm" tone="brand" style={styles.legalLink}>
              Privacy
            </Text>
          </TouchableOpacity>
        </View>

        <Text variant="caption" tone="muted" center style={styles.legalDisclaimer}>
          Payment will be charged to your App Store / Play Store account. Subscriptions auto-renew
          unless cancelled at least 24 hours before the end of the current period. You can manage and
          cancel subscriptions in your store account settings.
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
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
      <Text variant="metricXl" style={styles.packagePrice}>
        {product.priceString}
      </Text>
      <Text variant="body" style={styles.packagePeriod}>
        per month
      </Text>
      {showBusy ? (
        <ActivityIndicator color={theme.color.gold} style={styles.packageBusy} />
      ) : (
        <Text variant="body" style={styles.packageCta}>
          Subscribe
        </Text>
      )}
    </TouchableOpacity>
  );
}

interface BenefitRowProps {
  text: string;
}

function BenefitRow({ text }: BenefitRowProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.benefitRow}>
      <Ionicons
        name="checkmark-circle"
        size={20}
        color={theme.color.brand}
        style={styles.benefitCheck}
      />
      <Text variant="body" style={styles.benefitText}>
        {text}
      </Text>
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

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    header: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: theme.space(4),
      paddingVertical: theme.space(3),
    },
    body: {
      paddingHorizontal: theme.space(4),
      paddingBottom: theme.space(5),
      gap: theme.space(4),
    },
    subtitle: { lineHeight: theme.type.body + 6 },
    benefits: { gap: theme.space(2), paddingVertical: theme.space(3) },
    benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.space(2) },
    benefitCheck: { marginTop: 2 },
    benefitText: { flex: 1, lineHeight: theme.type.body + 6 },
    packageList: { gap: theme.space(3) },
    packageCard: {
      padding: theme.space(5),
      borderRadius: theme.radius.lg,
      backgroundColor: theme.color.ink,
      borderWidth: 2,
      borderColor: theme.color.ink,
      alignItems: 'center',
      gap: 4,
    },
    packageCardActive: { borderColor: theme.color.gold },
    packagePrice: { color: theme.color.gold },
    packagePeriod: { color: theme.color.onInk, opacity: 0.7, marginBottom: theme.space(3) },
    packageCta: {
      color: theme.color.gold,
      fontWeight: theme.weight.bold,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    packageBusy: { marginTop: theme.space(2) },
    devPreviewNote: { marginTop: theme.space(2), fontStyle: 'italic' },
    centered: { alignItems: 'center', justifyContent: 'center', padding: theme.space(4), gap: theme.space(3) },
    successCard: { alignItems: 'center', padding: theme.space(4), gap: theme.space(3) },
    successTitle: { textTransform: 'capitalize' },
    successCta: { alignSelf: 'stretch', paddingHorizontal: theme.space(6) },
    errorCta: { alignSelf: 'stretch', paddingHorizontal: theme.space(6) },
    legal: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: theme.space(2),
      paddingTop: theme.space(3),
    },
    legalLink: { fontWeight: theme.weight.semibold },
    legalDisclaimer: { lineHeight: theme.type.caption + 6 },
  });
}
