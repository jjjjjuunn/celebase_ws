'use client';

import type { schemas } from '@celebbase/shared-types';
import { CITATION_LABELS_KO } from '@celebbase/shared-types';
import styles from './plan-detail.module.css';

interface CitationChipListProps {
  citations: schemas.MealCitation[];
  maxVisible?: number;
  onSelect: (citation: schemas.MealCitation) => void;
}

export function CitationChipList({
  citations,
  maxVisible = 3,
  onSelect,
}: CitationChipListProps): React.ReactElement | null {
  if (citations.length === 0) return null;

  const visible = citations.slice(0, maxVisible);
  const overflowCount = citations.length - visible.length;

  return (
    <ul className={styles.citationList} role="list">
      {visible.map((c, idx) => (
        <li key={idx} role="listitem">
          <button
            type="button"
            className={styles.citationChip}
            onClick={() => onSelect(c)}
            aria-label={`출처 보기: ${c.title}`}
          >
            {CITATION_LABELS_KO[c.source_type]}
          </button>
        </li>
      ))}
      {overflowCount > 0 && (
        <li
          role="listitem"
          className={styles.citationChipOverflow}
          aria-label={`외 ${String(overflowCount)}개의 출처가 더 있습니다.`}
        >
          +{String(overflowCount)}
        </li>
      )}
    </ul>
  );
}
