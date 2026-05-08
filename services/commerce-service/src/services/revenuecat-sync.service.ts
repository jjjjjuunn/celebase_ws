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

export type SyncSource = 'purchase' | 'app_open' | 'manual';

export interface SyncFromRevenuecatDeps {
  pool: pg.Pool;
  config: RevenuecatSyncConfig;
  userClient: UserServiceClient;
  adapter: RevenuecatAdapter;
  log: FastifyBaseLogger;
}

export interface SyncFromRevenuecatParams {
  userId: string;
  source: SyncSource;
}

export interface SyncFromRevenuecatResult {
  user_id: string;
  tier: UserTier;
  status: SubscriptionStatus | 'free';
  current_period_end: string | null;
  source: SyncSource;
}

// CHORE-SUB-CACHE-001: source-aware cache + single-flight in front of doSync.
//
// - `source=purchase` bypasses cache (mobile just completed IAP — always fetch
//   fresh entitlement to avoid showing stale tier post-purchase)
// - `source=app_open` / `source=manual` use 60s TTL cache to absorb foreground
//   re-check burst + reduce RevenueCat REST API quota burn
// - in-flight Promise dedup: concurrent calls for the same userId hit the
//   adapter exactly once (Plan v5 §M5 single-flight requirement)

const SYNC_CACHE_TTL_MS = 60_000;

// Result shape stored in cache. We strip `source` because cache value is
// shared across different request sources — caller's source is re-stamped on
// hit to keep response/log dimension accurate.
type CachedSyncResult = Omit<SyncFromRevenuecatResult, 'source'>;

const syncCache = new Map<string, { result: CachedSyncResult; expiresAt: number }>();
const inFlightSync = new Map<string, Promise<CachedSyncResult>>();

// Test-only helper. Module Map persists across Jest tests; integration tests
// reset in beforeEach for isolation.
export function resetSyncCacheForTest(): void {
  syncCache.clear();
  inFlightSync.clear();
}

/**
 * Pull-style sync: client (mobile) calls BFF → BFF → this internal handler.
 * RevenueCat REST API 를 직접 조회하여 entitlement → tier 도출 후
 * `subscriptions` upsert + user-service `tier` 동기화.
 *
 * Cache policy (CHORE-SUB-CACHE-001):
 * - `source=purchase` → bypass cache (always fetch fresh)
 * - `source=app_open` / `source=manual` → 60s TTL + single-flight dedup
 *
 * webhook 의 handleWebhookEvent 와의 차이:
 * - event_id 가 없음 → idempotency key 는 `${userId}:${tier}:sync:${period_end_ms}`
 *   형태로 구성 (period_end 가 같으면 동일 sync 상태 → 자연 idempotent)
 * - eventType 분기 없음 → INITIAL_PURCHASE 와 동일하게 처리 (active → active)
 */
export async function syncFromRevenuecat(
  deps: SyncFromRevenuecatDeps,
  params: SyncFromRevenuecatParams,
): Promise<SyncFromRevenuecatResult> {
  const { userId, source } = params;

  // Bypass for purchase — never serve stale tier right after IAP success.
  if (source === 'purchase') {
    const result = await doSyncFromRevenuecat(deps, params);
    // Refresh cache so subsequent app_open/manual within TTL get the new state.
    const { source: _src, ...cacheable } = result;
    syncCache.set(userId, { result: cacheable, expiresAt: Date.now() + SYNC_CACHE_TTL_MS });
    return result;
  }

  // app_open / manual: cache hit?
  const cached = syncCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    deps.log.debug({ user_id: userId, source }, 'revenuecat.sync.cache-hit');
    return { ...cached.result, source };
  }

  // Single-flight: dedupe concurrent fetches for the same userId.
  const inFlight = inFlightSync.get(userId);
  if (inFlight) {
    deps.log.debug({ user_id: userId, source }, 'revenuecat.sync.in-flight-coalesced');
    const result = await inFlight;
    return { ...result, source };
  }

  // Fresh fetch.
  const promise = (async (): Promise<CachedSyncResult> => {
    try {
      const result = await doSyncFromRevenuecat(deps, params);
      const { source: _src, ...cacheable } = result;
      syncCache.set(userId, { result: cacheable, expiresAt: Date.now() + SYNC_CACHE_TTL_MS });
      return cacheable;
    } finally {
      inFlightSync.delete(userId);
    }
  })();
  inFlightSync.set(userId, promise);
  const result = await promise;
  return { ...result, source };
}

async function doSyncFromRevenuecat(
  deps: SyncFromRevenuecatDeps,
  params: SyncFromRevenuecatParams,
): Promise<SyncFromRevenuecatResult> {
  const { pool, config, userClient, adapter, log } = deps;
  const { userId, source } = params;

  const snapshot = await adapter.getSubscriber(userId);

  let resolved = selectActiveKnownEntitlement(snapshot, config.productTierMap);
  if (resolved == null) {
    resolved = selectMostRecentEntitlement(snapshot);
  }

  if (resolved == null) {
    // No entitlement at all — sync to free.
    const idempotencyKey = `${userId}:free:sync:0`;
    await userClient.syncTier(userId, 'free', { idempotencyKey });
    log.info(
      { user_id: userId, tier: 'free', source },
      'revenuecat.sync.no-entitlement',
    );
    return { user_id: userId, tier: 'free', status: 'free', current_period_end: null, source };
  }

  const subTier = mapRevenuecatProductToTier(
    resolved.entitlement.product_identifier,
    config.productTierMap,
  );

  if (subTier == null) {
    // Unknown product (revenuecat dashboard config drift) — sync to free.
    log.warn(
      { user_id: userId, product_identifier: resolved.entitlement.product_identifier, source },
      'revenuecat.sync.unknown-product',
    );
    const idempotencyKey = `${userId}:free:sync:0`;
    await userClient.syncTier(userId, 'free', { idempotencyKey });
    return { user_id: userId, tier: 'free', status: 'free', current_period_end: null, source };
  }

  // Pull-sync 는 webhook eventType 가 없음. INITIAL_PURCHASE 로 분류 — 활성 entitlement 면
  // active, expires_date 가 과거면 expired, 그 외 자체 분기.
  const status = deriveStatusFromEntitlement(resolved.entitlement, 'INITIAL_PURCHASE');
  const userTier = deriveUserTier(status, subTier);

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

  const revenuecatSubscriptionId = `${userId}:${resolved.entitlement.product_identifier}`;

  await upsertRevenuecatSubscription(pool, {
    userId,
    revenuecatSubscriptionId,
    revenuecatAppUserId: userId,
    tier: subTier,
    status,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd:
      resolved.entitlement.unsubscribe_detected_at != null && status === 'active',
  });

  // Idempotency key: period_end_ms 포함 → 갱신될 때만 user-service updateTier 적용,
  // 동일 sync 상태 재호출은 user-service 가 409 DUPLICATE_REQUEST 로 skip.
  const periodEndMs = currentPeriodEnd != null ? currentPeriodEnd.getTime() : 0;
  const idempotencyKey = `${userId}:${userTier}:sync:${String(periodEndMs)}`;

  try {
    await userClient.syncTier(userId, userTier, { idempotencyKey });
  } catch (err) {
    // user-service 의 409 DUPLICATE_REQUEST 는 정상 idempotent skip — InternalClientError 로
    // 래핑되어 throw 됨. 메시지로 분기.
    const msg = err instanceof Error ? err.message : '';
    if (!msg.includes('409')) throw err;
    log.debug(
      { user_id: userId, tier: userTier, idempotency_key: idempotencyKey },
      'revenuecat.sync.tier-already-synced',
    );
  }

  log.info(
    {
      user_id: userId,
      sub_tier: subTier,
      user_tier: userTier,
      status,
      source,
    },
    'revenuecat.sync.synced',
  );

  return {
    user_id: userId,
    tier: userTier,
    status,
    current_period_end: currentPeriodEnd != null ? currentPeriodEnd.toISOString() : null,
    source,
  };
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
