import type { ReactNode } from 'react';
import type { MotifKey } from './data';

// Self-authored line-art glyphs (currentColor, no fill) used as the illustrative
// "imagery" across the feed + social wall. Decorative — always aria-hidden; the
// surrounding card carries the real text. No stock photo, no scraped asset.

const PATHS: Record<MotifKey, ReactNode> = {
  protein: (
    <>
      <path d="M10 30c0-7 5-12 14-12s14 5 14 12" />
      <path d="M10 30h28" />
      <circle cx="24" cy="14" r="3" />
      <path d="M18 30v6M24 30v8M30 30v6" />
    </>
  ),
  supplement: (
    <>
      <rect x="11" y="18" width="26" height="12" rx="6" />
      <path d="M24 18v12" />
      <path d="M31 11l2-2M35 13l2-2M33 7l1 5l5 1" />
    </>
  ),
  plant: (
    <>
      <path d="M24 38V20" />
      <path d="M24 24c0-6-4-10-10-10 0 6 4 10 10 10Z" />
      <path d="M24 20c0-6 4-10 10-10 0 6-4 10-10 10Z" />
    </>
  ),
  prep: (
    <>
      <rect x="13" y="22" width="22" height="14" rx="3" />
      <path d="M13 28h22" />
      <rect x="17" y="12" width="14" height="8" rx="2" />
    </>
  ),
  cardio: (
    <>
      <path d="M8 24h7l3-8 5 16 4-12 3 4h9" />
    </>
  ),
  ferment: (
    <>
      <rect x="15" y="16" width="18" height="22" rx="4" />
      <path d="M17 12h14M19 16v-4M29 16v-4" />
      <circle cx="22" cy="27" r="1.4" />
      <circle cx="27" cy="31" r="1.4" />
    </>
  ),
  strength: (
    <>
      <circle cx="24" cy="28" r="9" />
      <path d="M20 19c0-3 2-5 4-5s4 2 4 5" />
    </>
  ),
  timing: (
    <>
      <circle cx="24" cy="25" r="12" />
      <path d="M24 18v7l5 3" />
      <path d="M19 9h10" />
    </>
  ),
};

export function Motif({ name }: { name: MotifKey }): ReactNode {
  return (
    <svg
      viewBox="0 0 48 48"
      width="48"
      height="48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
