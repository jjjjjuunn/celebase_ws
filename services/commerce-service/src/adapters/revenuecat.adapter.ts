import { CircuitBreaker, createLogger } from '@celebbase/service-core';

export class RevenuecatUnavailableError extends Error {
  override readonly cause?: unknown;
  override name = 'RevenuecatUnavailableError';
  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

export interface RevenuecatEntitlement {
  product_identifier: string;
  expires_date: string | null; // ISO 8601 — null means lifetime
  purchase_date: string;
  is_active: boolean;
  unsubscribe_detected_at: string | null;
  billing_issues_detected_at: string | null;
}

export interface RevenuecatSubscriberSnapshot {
  appUserId: string;
  originalAppUserId: string;
  entitlements: Record<string, RevenuecatEntitlement>;
  managementUrl: string | null;
}

interface RevenuecatAdapterOpts {
  apiKey: string;
  baseUrl: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 3_000;

interface SubscriberApiResponse {
  subscriber: {
    original_app_user_id: string;
    entitlements: Record<
      string,
      {
        product_identifier: string;
        expires_date: string | null;
        purchase_date: string;
        unsubscribe_detected_at?: string | null;
        billing_issues_detected_at?: string | null;
      }
    >;
    management_url?: string | null;
  };
}

export class RevenuecatAdapter {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly breaker: CircuitBreaker;
  private readonly log = createLogger('commerce-service');

  constructor(opts: RevenuecatAdapterOpts) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.breaker = new CircuitBreaker({
      name: 'revenuecat',
      threshold: 5,
      timeoutMs: 30_000,
    });
  }

  async getSubscriber(appUserId: string): Promise<RevenuecatSubscriberSnapshot> {
    if (!appUserId) {
      throw new RevenuecatUnavailableError('appUserId is required');
    }

    try {
      return await this.breaker.execute(async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => {
          controller.abort();
        }, this.timeoutMs);
        try {
          const url = `${this.baseUrl}/v1/subscribers/${encodeURIComponent(appUserId)}`;
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              Accept: 'application/json',
            },
            signal: controller.signal,
          });

          if (!response.ok) {
            const bodyText = await response.text();
            this.log.warn(
              {
                status: response.status,
                body: bodyText.slice(0, 200),
              },
              'revenuecat.subscriber.error',
            );
            throw new Error(`RevenueCat API error: ${String(response.status)}`);
          }

          const data = (await response.json()) as SubscriberApiResponse;
          const now = Date.now();
          const entitlements: Record<string, RevenuecatEntitlement> = {};
          for (const [key, entitlement] of Object.entries(data.subscriber.entitlements)) {
            const expiresAtMs =
              entitlement.expires_date != null
                ? Date.parse(entitlement.expires_date)
                : Number.POSITIVE_INFINITY;
            const isActive = Number.isFinite(expiresAtMs) ? expiresAtMs > now : true;
            entitlements[key] = {
              product_identifier: entitlement.product_identifier,
              expires_date: entitlement.expires_date,
              purchase_date: entitlement.purchase_date,
              is_active: isActive,
              unsubscribe_detected_at: entitlement.unsubscribe_detected_at ?? null,
              billing_issues_detected_at: entitlement.billing_issues_detected_at ?? null,
            };
          }

          return {
            appUserId,
            originalAppUserId: data.subscriber.original_app_user_id,
            entitlements,
            managementUrl: data.subscriber.management_url ?? null,
          };
        } finally {
          clearTimeout(timer);
        }
      });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('circuit breaker open')) {
        this.log.warn(
          {
            failureCount: 5,
            threshold: 5,
            cooldownUntil: Date.now() + 30_000,
          },
          'revenuecat.breaker.open',
        );
      }
      throw new RevenuecatUnavailableError('RevenueCat unavailable', err);
    }
  }
}
