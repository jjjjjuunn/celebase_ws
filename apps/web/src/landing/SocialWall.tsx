'use client';

import { useRef, type CSSProperties, type ReactNode } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { SOCIAL_TILES, type PersonaAccent, type SocialTile } from './data';
import { Motif } from './Motif';
import styles from './landing.module.css';

const ACCENT_VAR: Record<PersonaAccent, string> = {
  biohacker: 'var(--cb-accent-biohacker)',
  glp1: 'var(--cb-accent-glp1)',
  aspirational: 'var(--cb-accent-aspirational)',
  household: 'var(--cb-brand-500)',
};

// Three columns, each a rotated subset, drifting at slightly different depths.
const COLUMNS: readonly (readonly SocialTile[])[] = [
  [SOCIAL_TILES[0], SOCIAL_TILES[3], SOCIAL_TILES[5]].filter(Boolean) as SocialTile[],
  [SOCIAL_TILES[1], SOCIAL_TILES[4], SOCIAL_TILES[0]].filter(Boolean) as SocialTile[],
  [SOCIAL_TILES[2], SOCIAL_TILES[5], SOCIAL_TILES[3]].filter(Boolean) as SocialTile[],
];

const PARALLAX = [-70, -130, -40];
const DRIFT_CLASS = [styles.driftSlow, styles.driftFast, styles.driftMed];

function Tile({ tile }: { tile: SocialTile }): ReactNode {
  const accent = ACCENT_VAR[tile.accent];
  return (
    <figure className={styles.socialTile} style={{ '--tile-accent': accent } as CSSProperties}>
      <div className={styles.socialArt} aria-hidden="true">
        <Motif name={tile.motif} />
      </div>
      <figcaption className={styles.socialMeta}>
        <span className={styles.socialAvatar} aria-hidden="true">
          {tile.initial}
        </span>
        <span className={styles.socialText}>
          <span className={styles.socialHandle}>{tile.handle}</span>
          <span className={styles.socialCaption}>{tile.caption}</span>
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * Hero backdrop: an illustrative "social wall" of fictional archetype tiles.
 * CSS marquee gives a constant gentle drift (works with no JS); framer parallax
 * adds depth tied to scroll. Reduced motion disables both. Purely decorative and
 * aria-hidden — the hero's real content lives in the foreground.
 */
export function SocialWall(): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });

  const yA = useTransform(scrollYProgress, [0, 1], [0, reduced === true ? 0 : PARALLAX[0]]);
  const yB = useTransform(scrollYProgress, [0, 1], [0, reduced === true ? 0 : PARALLAX[1]]);
  const yC = useTransform(scrollYProgress, [0, 1], [0, reduced === true ? 0 : PARALLAX[2]]);
  const ys = [yA, yB, yC];

  return (
    <div ref={ref} className={styles.socialWall} aria-hidden="true">
      <div className={styles.socialWallInner}>
        {COLUMNS.map((col, i) => (
          <motion.div key={i} className={styles.socialCol} style={{ y: ys[i] }}>
            <div className={`${styles.socialTrack} ${DRIFT_CLASS[i] ?? ''}`}>
              {[...col, ...col].map((tile, j) => (
                <Tile key={`${tile.handle}-${String(j)}`} tile={tile} />
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
