import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';

import {
  upsertRevenuecatSubscription,
} from '../repositories/subscription.repository.js';
import {
  RevenuecatAdapter,
  type RevenuecatEntitlement,
  type RevenuecatSubscriberSnapshot,
} from '../adapters/revenuecat.adapter.js';
import type { UserServiceClient } from './user-service.client.js';

export type RevenuecatEventType =
  | 'INITIAL_PURCHASE'
  | 'RENEWAL'
  | 'CANCELLATION'
  | 'EXPIRATION'
  | 'BILLING_ISSUE'
  | 'PRODUCT_CHANGE'
  | 'TRANSFER'
  | 'UNCANCELLATION'
  | 'NON_RENEWING_PURCHASE'
  | 'SUBSCRIPTION_PAUSED'
  | 'SUBSCRIBER_ALIAS'
  | 'SUBSCRIPTION_EXTENDED';

export interface RevenuecatWebhookPayload {
  id: string;
  type: RevenuecatEventType;
  app_user_id: string;
  product_id?: string | null;
  expiration_at_ms?: number | null;
  purchased_at_ms?: number | null;
  original_app_user_id?: string | null;
  period_type?: string | null;
  environment?: string | null;
  transaction_id?: string | null;
}

export interface RevenuecatSyncConfig {
  enabled: boolean;
  apiKey: string;
  apiBaseUrl: string;
  productTierMap: Readonly<Record<string, 'premium' | 'elite'>>;
}

type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'expired';
type UserTier = 'free' | 'premium' | 'elite';
type SubTier = 'premium' | 'elite';

const TERMINAL_TYPES: ReadonlySet<RevenuecatEventType> = new Set([
  'EXPIRATION',
  'SUBSCRIPTION_PAUSED',
]);

const PAST_DUE_TYPES: ReadonlySet<RevenuecatEventType> = new Set(['BILLING_ISSUE']);

const CANCEL_TYPES: ReadonlySet<RevenuecatEventType> = new Set(['CANCELLATION']);

export function mapRevenuecatProductToTier(
  productIdentifier: string,
  productTierMap: Readonly<Record<string, SubTier>>,
): SubTier | null {
  return productTierMap[productIdentifier] ?? null;
}

interface ResolvedEntitlement {
  key: string;
  entitlement: RevenuecatEntitlement;
}

function selectActiveKnownEntitlement(
  snapshot: RevenuecatSubscriberSnapshot,
  productTierMap: Readonly<Record<string, SubTier>>,
): ResolvedEntitlement | null {
  for (const [key, ent] of Object.entries(snapshot.entitlements)) {
    if (!ent.is_active) continue;
    if (mapRevenuecatProductToTier(ent.product_identifier, productTierMap) == null) continue;
    return { key, entitlement: ent };
  }
  return null;
}

function selectMostRecentEntitlement(
  snapshot: RevenuecatSubscriberSnapshot,
): ResolvedEntitlement | null {
  let chosen: ResolvedEntitlement | null = null;
  let chosenPurchaseMs = -Infinity;
  for (const [key, ent] of Object.entries(snapshot.entitlements)) {
    const purchaseMs = Date.parse(ent.purchase_date);
    const safeMs = Number.isFinite(purchaseMs) ? purchaseMs : 0;
    if (safeMs >= chosenPurchaseMs) {
      chosen = { key, entitlement: ent };
      chosenPurchaseMs = safeMs;
    }
  }
  return chosen;
}

export function deriveStatusFromEntitlement(
  entitlement: RevenuecatEntitlement,
  eventType: RevenuecatEventType,
  now: number = Date.now(),
): SubscriptionStatus {
  if (PAST_DUE_TYPES.has(eventType) || entitlement.billing_issues_detected_at != null) {
    return 'past_due';
  }
  if (TERMINAL_TYPES.has(eventType)) {
    return 'expired';
  }
  if (entitlement.expires_date != null) {
    const expiresAtMs = Date.parse(entitlement.expires_date);
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= now) {
      return 'expired';
    }
  }
  if (CANCEL_TYPES.has(eventType) || entitlement.unsubscribe_detected_at != null) {
    return 'active';
  }
  return entitlement.is_active ? 'active' : 'expired';
}

export function deriveUserTier(status: SubscriptionStatus, subTier: SubTier | null): UserTier {
  if (subTier == null) return 'free';
  if (status === 'cancelled' || status === 'expired') return 'free';
  return subTier;
}

interface HandleWebhookEventDeps {
  pool: pg.Pool;
  payload: RevenuecatWebhookPayload;
  config: RevenuecatSyncConfig;
  userClient: UserServiceClient;
  adapter: RevenuecatAdapter;
  log: FastifyBaseLogger;
}

export async function handleWebhookEvent(deps: HandleWebhookEventDeps): Promise<void> {
  const { pool, payload, config, userClient, adapter, log } = deps;
  const appUserId = payload.app_user_id;
  if (!appUserId) {
    throw new Error('RevenuecatWebhookPayload.app_user_id is required');
  }

  const snapshot = await adapter.getSubscriber(appUserId);
  // RevenueCat app_user_id == celebbase user_id (set at SDK login on mobile).
  const userId = appUserId;

  let resolved = selectActiveKnownEntitlement(snapshot, config.productTierMap);
  if (resolved == null) {
    resolved = selectMostRecentEntitlement(snapshot);
  }

  if (resolved == null) {
    await userClient.syncTier(userId, 'free', {
      idempotencyKey: `${userId}:free:${payload.id}`,
    });
    log.info(
      {
        revenuecat_event_id: payload.id,
        event_type: payload.type,
        user_id: userId,
        tier: 'free',
      },
      'revenuecat.sync.no-entitlement',
    );
    return;
  }

  const subTier = mapRevenuecatProductToTier(
    resolved.entitlement.product_identifier,
    config.productTierMap,
  );

  if (subTier == null) {
    log.warn(
      {
        revenuecat_event_id: payload.id,
        product_identifier: resolved.entitlement.product_identifier,
      },
      'revenuecat.sync.unknown-product',
    );
    await userClient.syncTier(userId, 'free', {
      idempotencyKey: `${userId}:free:${payload.id}`,
    });
    return;
  }

  const status = deriveStatusFromEntitlement(resolved.entitlement, payload.type);
  const userTier = deriveUserTier(status, subTier);

  const revenuecatSubscriptionId =
    payload.transaction_id != null && payload.transaction_id.length > 0
      ? payload.transaction_id
      : `${appUserId}:${resolved.entitlement.product_identifier}`;

  const currentPeriodStart = (() => {
    const ms = Date.parse(resolved.entitlement.purchase_date);
    return Number.isFinite(ms) ? new Date(ms) : null;
  })();
  const currentPeriodEnd =
    resolved.entitlement.expires_date != null
      ? (() => {
          const ms = Date.parse(resolved.entitlement.expires_date);
          return Number.isFinite(ms) ? new Date(ms) : null;
        })()
      : null;

  await upsertRevenuecatSubscription(pool, {
    userId,
    revenuecatSubscriptionId,
    revenuecatAppUserId: appUserId,
    tier: subTier,
    status,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd:
      resolved.entitlement.unsubscribe_detected_at != null && status === 'active',
  });

  await userClient.syncTier(userId, userTier, {
    idempotencyKey: `${userId}:${userTier}:${payload.id}`,
  });

  log.info(
    {
      revenuecat_event_id: payload.id,
      event_type: payload.type,
      user_id: userId,
      sub_tier: subTier,
      user_tier: userTier,
      status,
    },
    'revenuecat.sync.synced',
  );
}
