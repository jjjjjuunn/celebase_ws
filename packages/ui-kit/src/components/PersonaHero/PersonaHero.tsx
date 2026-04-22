'use client';

import type { HTMLAttributes, ReactElement, ReactNode } from 'react';
import { CelebrityCard } from '../CelebrityCard/CelebrityCard.js';
import type { CelebrityCardData } from '../CelebrityCard/CelebrityCard.js';
import styles from './PersonaHero.module.css';

export interface PersonaHeroProps
  extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'onSelect'> {
  headline?: string;
  subhead?: string;
  celebrities: CelebrityCardData[];
  onSelect?: (slug: string) => void;
  footnote?: ReactNode;
}

const DEFAULT_HEADLINE = 'Who would you like to live like?';
const DEFAULT_SUBHEAD =
  'Choose a persona to anchor your meal plan. We personalize calories, macros, and safety against your profile.';

export function PersonaHero(props: PersonaHeroProps): ReactElement {
  const {
    headline = DEFAULT_HEADLINE,
    subhead = DEFAULT_SUBHEAD,
    celebrities,
    onSelect,
    footnote,
    className,
    ...rest
  } = props;

  const classes = [styles.hero, className].filter(Boolean).join(' ');

  return (
    <section {...rest} className={classes} aria-label="Persona selection">
      <header className={styles.header}>
        <h1 className={styles.headline}>{headline}</h1>
        {subhead ? <p className={styles.subhead}>{subhead}</p> : null}
      </header>

      <div className={styles.grid} role="list">
        {celebrities.map((celeb) => (
          <div key={celeb.slug} role="listitem" className={styles.cell}>
            <CelebrityCard data={celeb} {...(onSelect ? { onClick: onSelect } : {})} />
          </div>
        ))}
      </div>

      {footnote ? <p className={styles.footnote}>{footnote}</p> : null}
    </section>
  );
}
