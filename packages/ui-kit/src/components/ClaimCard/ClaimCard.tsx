'use client';

/** ClaimCard — primary feed card for spec §7.2 Wellness Claims Feed. */

import type { KeyboardEvent, MouseEvent, ReactElement } from 'react';
import { useId, useState } from 'react';
import type { schemas } from '@celebbase/shared-types';
import styles from './ClaimCard.module.css';

type LifestyleClaimWire = schemas.LifestyleClaimWire;
type ClaimSourceWire = schemas.ClaimSourceWire;
type ClaimType = LifestyleClaimWire['claim_type'];
type TrustGrade = LifestyleClaimWire['trust_grade'];

export interface ClaimCardCelebrity {
  displayName: string;
  slug: string;
  avatarUrl: string | null;
}

export interface ClaimCardProps {
  claim: LifestyleClaimWire;
  celebrity: ClaimCardCelebrity;
  primarySource?: ClaimSourceWire | null;
  disclaimerText?: string | null;
  isLoading?: boolean;
  onMealPlanClick?: (claim: LifestyleClaimWire) => void;
  onSaveClick?: (claim: LifestyleClaimWire) => void;
  onShareClick?: (claim: LifestyleClaimWire) => void;
  onCardClick?: (claim: LifestyleClaimWire) => void;
  className?: string;
}

const DEFAULT_DISCLAIMER =
  'This information is for educational purposes only and is not intended as medical advice. Consult a healthcare professional before making changes.';

const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  food: 'Food',
  workout: 'Workout',
  sleep: 'Sleep',
  beauty: 'Beauty',
  brand: 'Brand',
  philosophy: 'Philosophy',
  supplement: 'Supplement',
};

const HERO_GRADIENT_CLASS: Record<ClaimType, string> = {
  food: styles.heroFood ?? '',
  workout: styles.heroWorkout ?? '',
  sleep: styles.heroSleep ?? '',
  beauty: styles.heroBeauty ?? '',
  brand: styles.heroBrand ?? '',
  philosophy: styles.heroPhilosophy ?? '',
  supplement: styles.heroSupplement ?? '',
};

const TRUST_BADGE_CLASS: Record<TrustGrade, string> = {
  A: styles.trustA ?? '',
  B: styles.trustB ?? '',
  C: styles.trustC ?? '',
  D: styles.trustD ?? '',
  E: styles.trustD ?? '',
};

const RELATIVE_TIME_UNITS: ReadonlyArray<{ label: string; seconds: number }> = [
  { label: 'year', seconds: 60 * 60 * 24 * 365 },
  { label: 'month', seconds: 60 * 60 * 24 * 30 },
  { label: 'week', seconds: 60 * 60 * 24 * 7 },
  { label: 'day', seconds: 60 * 60 * 24 },
  { label: 'hour', seconds: 60 * 60 },
  { label: 'minute', seconds: 60 },
];

function formatRelativeTime(iso: string | null): string | null {
  if (iso === null) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return 'Updated just now';
  for (const unit of RELATIVE_TIME_UNITS) {
    const value = Math.floor(diffSec / unit.seconds);
    if (value >= 1) {
      return `Updated ${String(value)} ${unit.label}${value === 1 ? '' : 's'} ago`;
    }
  }
  return null;
}

function hostnameOf(url: string | null): string | null {
  if (url === null) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function formatSourceMeta(
  primarySource: ClaimSourceWire | null | undefined,
  fallbackUrl: string | null,
): string | null {
  if (primarySource != null) {
    const monthYear =
      primarySource.published_date != null
        ? formatMonthYear(primarySource.published_date)
        : null;
    return monthYear != null
      ? `${primarySource.outlet} · ${monthYear}`
      : primarySource.outlet;
  }
  return hostnameOf(fallbackUrl);
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function formatMonthYear(yyyymmdd: string): string | null {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(yyyymmdd);
  if (match === null) return null;
  const year = match[1];
  const monthIdx = Number.parseInt(match[2] ?? '0', 10) - 1;
  if (year === undefined || monthIdx < 0 || monthIdx > 11) return null;
  return `${SHORT_MONTHS[monthIdx] ?? ''} ${year}`;
}

function celebrityInitial(name: string): string {
  const first = name.trim().charAt(0);
  return first.length > 0 ? first.toUpperCase() : '?';
}

function avatarSlot(name: string): string {
  const slots = [
    styles.avatarSlotBrand,
    styles.avatarSlotTeal,
    styles.avatarSlotPurple,
    styles.avatarSlotCoral,
    styles.avatarSlotDark,
  ];
  const code = name.charCodeAt(0);
  const idx = Number.isNaN(code) ? 0 : code % slots.length;
  return slots[idx] ?? slots[0] ?? '';
}

interface IconProps {
  size?: number;
}

function ClaimTypeIcon({ kind, size = 16 }: { kind: ClaimType; size?: number }): ReactElement {
  switch (kind) {
    case 'food':
      return <BowlIcon size={size} />;
    case 'workout':
      return <DumbbellIcon size={size} />;
    case 'sleep':
      return <MoonIcon size={size} />;
    case 'beauty':
      return <SparklesIcon size={size} />;
    case 'brand':
      return <CrownIcon size={size} />;
    case 'philosophy':
      return <BookIcon size={size} />;
    case 'supplement':
      return <PillIcon size={size} />;
  }
  return <BowlIcon size={size} />;
}

function svgProps(size: number): {
  width: number;
  height: number;
  viewBox: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round';
  strokeLinejoin: 'round';
  'aria-hidden': 'true';
  focusable: 'false';
} {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  };
}

function BowlIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...svgProps(size)}>
      <path d="M3 11h18" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 4v3" />
      <path d="M9 6l3 1 3-1" />
    </svg>
  );
}

function DumbbellIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...svgProps(size)}>
      <path d="M6 8v8" />
      <path d="M3 10v4" />
      <path d="M18 8v8" />
      <path d="M21 10v4" />
      <path d="M6 12h12" />
    </svg>
  );
}

function MoonIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...svgProps(size)}>
      <path d="M21 13a8 8 0 1 1-9.5-9.5A6 6 0 0 0 21 13z" />
    </svg>
  );
}

function SparklesIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...svgProps(size)}>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
      <path d="M19 16l.7 1.8L21.5 18.5 19.7 19.2 19 21l-.7-1.8L16.5 18.5l1.8-.7z" />
    </svg>
  );
}

function CrownIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...svgProps(size)}>
      <path d="M3 18h18" />
      <path d="M3 8l4 4 5-6 5 6 4-4-2 10H5z" />
    </svg>
  );
}

function BookIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...svgProps(size)}>
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
      <path d="M5 17a3 3 0 0 1 3-3h11" />
    </svg>
  );
}

function PillIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...svgProps(size)}>
      <path d="M8.5 3.5a5 5 0 0 1 7.07 7.07l-5.04 5.04a5 5 0 1 1-7.07-7.07z" />
      <path d="M7 12l5-5" />
    </svg>
  );
}

function BookmarkIcon({ size = 18 }: IconProps): ReactElement {
  return (
    <svg {...svgProps(size)}>
      <path d="M6 4h12v16l-6-4-6 4z" />
    </svg>
  );
}

function ShareIcon({ size = 18 }: IconProps): ReactElement {
  return (
    <svg {...svgProps(size)}>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.2 10.7l7.6-3.4" />
      <path d="M8.2 13.3l7.6 3.4" />
    </svg>
  );
}

function ChevronIcon({ size = 14, up = false }: IconProps & { up?: boolean }): ReactElement {
  return (
    <svg {...svgProps(size)}>
      {up ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
    </svg>
  );
}

function InfoIcon({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.5v.01" />
    </svg>
  );
}

function buildClassName(parts: ReadonlyArray<string | false | null | undefined>): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ');
}

function ClaimCardSkeleton({ className }: { className?: string }): ReactElement {
  return (
    <article
      className={buildClassName([styles.card, styles.cardSkeleton, className])}
      aria-busy="true"
      data-clickable="false"
    >
      <span className={styles.visuallyHidden}>Loading claim…</span>
      <div className={buildClassName([styles.hero, styles.skeletonBlock])} aria-hidden="true">
        <span className={styles.skeletonShimmer} />
      </div>
      <div className={styles.body} aria-hidden="true">
        <div className={buildClassName([styles.skeletonLine, styles.skeletonLineHeadline])}>
          <span className={styles.skeletonShimmer} />
        </div>
        <div className={buildClassName([styles.skeletonLine, styles.skeletonLineHeadline])}>
          <span className={styles.skeletonShimmer} />
        </div>
        <div className={buildClassName([styles.skeletonLine, styles.skeletonLineSource])}>
          <span className={styles.skeletonShimmer} />
        </div>
      </div>
    </article>
  );
}

export function ClaimCard(props: ClaimCardProps): ReactElement {
  const {
    claim,
    celebrity,
    primarySource,
    disclaimerText,
    isLoading,
    onMealPlanClick,
    onSaveClick,
    onShareClick,
    onCardClick,
    className,
  } = props;

  const reactBodyId = useId();
  const [expanded, setExpanded] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  if (isLoading === true) {
    return (
      <ClaimCardSkeleton {...(className !== undefined ? { className } : {})} />
    );
  }

  if (
    claim.trust_grade === 'E' &&
    process.env['NODE_ENV'] !== 'production'
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ClaimCard] received trust_grade='E' for claim ${claim.id} — should be filtered server-side per spec §3.5`,
    );
  }

  const isClickable = onCardClick !== undefined;
  const trustClass = TRUST_BADGE_CLASS[claim.trust_grade];
  const heroClass = HERO_GRADIENT_CLASS[claim.claim_type];
  const claimTypeLabel = CLAIM_TYPE_LABEL[claim.claim_type];

  const relativeTime =
    formatRelativeTime(claim.last_verified_at) ??
    (claim.published_at != null ? formatRelativeTime(claim.published_at) : null);

  const sourceMeta = formatSourceMeta(primarySource, claim.primary_source_url);

  const showDisclaimer =
    expanded &&
    disclaimerText !== null &&
    (claim.is_health_claim ||
      claim.trust_grade === 'D' ||
      (typeof disclaimerText === 'string' && disclaimerText.length > 0));

  const resolvedDisclaimer =
    typeof disclaimerText === 'string' && disclaimerText.length > 0
      ? disclaimerText
      : DEFAULT_DISCLAIMER;

  const showMealPlan = claim.base_diet_id !== null && onMealPlanClick !== undefined;
  const showSave = onSaveClick !== undefined;
  const showShare = onShareClick !== undefined;
  const showCtaRow = expanded && (showMealPlan || showSave || showShare);
  const ctaRowNoPrimary = showCtaRow && !showMealPlan;

  const bodyId = `claim-card-body-${reactBodyId.replace(/:/g, '')}`;

  const handleCardClick = (event: MouseEvent<HTMLElement>): void => {
    if (onCardClick === undefined) return;
    if (event.target instanceof HTMLElement) {
      const interactive = event.target.closest('button, a');
      if (interactive !== null) return;
    }
    onCardClick(claim);
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (onCardClick === undefined) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target instanceof HTMLElement) {
      const interactive = event.target.closest('button, a');
      if (interactive !== null) return;
    }
    event.preventDefault();
    onCardClick(claim);
  };

  const handleToggle = (): void => {
    setExpanded((prev) => !prev);
  };

  const handleMealPlan = (): void => {
    onMealPlanClick?.(claim);
  };

  const handleSave = (): void => {
    onSaveClick?.(claim);
  };

  const handleShare = (): void => {
    onShareClick?.(claim);
  };

  const trustLabel = `Trust grade ${claim.trust_grade}`;
  const showAvatarImg = celebrity.avatarUrl != null && !avatarFailed;

  return (
    <article
      className={buildClassName([styles.card, className])}
      data-clickable={isClickable ? 'true' : 'false'}
      role={isClickable ? 'button' : 'article'}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={isClickable ? `${celebrity.displayName}: ${claim.headline}` : undefined}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
    >
      <div className={buildClassName([styles.hero, heroClass])}>
        <div className={styles.heroTopRow}>
          <span className={styles.typeChip}>
            <ClaimTypeIcon kind={claim.claim_type} size={14} />
            <span>{claimTypeLabel}</span>
          </span>
          <span className={buildClassName([styles.trustBadge, trustClass])} aria-label={trustLabel}>
            {`Grade ${claim.trust_grade}`}
          </span>
        </div>
        <div className={styles.heroMeta}>
          <span
            className={buildClassName([
              styles.avatar,
              !showAvatarImg ? avatarSlot(celebrity.displayName) : null,
            ])}
            aria-hidden="true"
          >
            {showAvatarImg && celebrity.avatarUrl != null ? (
              <img
                src={celebrity.avatarUrl}
                alt=""
                className={styles.avatarImg}
                onError={() => {
                  setAvatarFailed(true);
                }}
              />
            ) : (
              <span className={styles.avatarInitial}>
                {celebrityInitial(celebrity.displayName)}
              </span>
            )}
          </span>
          <span className={styles.heroMetaText}>
            <span className={styles.heroName}>{celebrity.displayName}</span>
            {relativeTime != null ? (
              <span className={styles.heroTime}>{relativeTime}</span>
            ) : null}
          </span>
        </div>
      </div>
      <div className={styles.body}>
        <h3 className={styles.headline}>{claim.headline}</h3>
        {claim.body != null && claim.body.length > 0 ? (
          <>
            <button
              type="button"
              className={styles.toggle}
              aria-expanded={expanded ? 'true' : 'false'}
              aria-controls={bodyId}
              onClick={handleToggle}
            >
              <span>{expanded ? 'Less' : 'More'}</span>
              <ChevronIcon size={14} up={expanded} />
            </button>
            <div
              id={bodyId}
              className={buildClassName([styles.expandable, expanded ? styles.expandableOpen : null])}
            >
              {expanded ? (
                <>
                  <p className={styles.bodyText}>{claim.body}</p>
                  {sourceMeta != null ? (
                    claim.primary_source_url != null ? (
                      <a
                        href={claim.primary_source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.sourceLink}
                      >
                        <span className={styles.sourceLabel}>Source</span>
                        <span className={styles.sourceMeta}>{sourceMeta}</span>
                      </a>
                    ) : (
                      <span className={styles.sourceStatic}>
                        <span className={styles.sourceLabel}>Source</span>
                        <span className={styles.sourceMeta}>{sourceMeta}</span>
                      </span>
                    )
                  ) : null}
                  {showDisclaimer ? (
                    <aside
                      role="note"
                      aria-label="Health claim disclaimer"
                      className={styles.disclaimer}
                    >
                      <span className={styles.disclaimerIcon} aria-hidden="true">
                        <InfoIcon size={16} />
                      </span>
                      <span className={styles.disclaimerText}>{resolvedDisclaimer}</span>
                    </aside>
                  ) : null}
                </>
              ) : null}
            </div>
          </>
        ) : null}
        {showCtaRow ? (
          <div
            className={buildClassName([
              styles.ctaRow,
              ctaRowNoPrimary ? styles.ctaRowNoPrimary : null,
            ])}
          >
            {showMealPlan ? (
              <button
                type="button"
                className={styles.ctaPrimary}
                onClick={handleMealPlan}
              >
                <SparklesIcon size={16} />
                <span>Inspired Meal Plan</span>
              </button>
            ) : null}
            {showSave ? (
              <button
                type="button"
                className={styles.ctaIcon}
                aria-label="Save this claim"
                onClick={handleSave}
              >
                <BookmarkIcon size={18} />
              </button>
            ) : null}
            {showShare ? (
              <button
                type="button"
                className={styles.ctaIcon}
                aria-label="Share this claim"
                onClick={handleShare}
              >
                <ShareIcon size={18} />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
