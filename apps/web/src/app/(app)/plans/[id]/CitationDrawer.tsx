'use client';

import { useEffect, useRef } from 'react';
import type { schemas } from '@celebbase/shared-types';
import { CITATION_LABELS_KO } from '@celebbase/shared-types';
import styles from './plan-detail.module.css';

interface CitationDrawerProps {
  citation: schemas.MealCitation | null;
  onClose: () => void;
}

export function CitationDrawer({
  citation,
  onClose,
}: CitationDrawerProps): React.ReactElement | null {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const node = dialogRef.current;
    if (node === null) return;
    if (citation !== null && !node.open) {
      node.showModal();
    } else if (citation === null && node.open) {
      node.close();
    }
  }, [citation]);

  if (citation === null) return null;

  return (
    <dialog
      ref={dialogRef}
      className={styles.citationDialog}
      aria-labelledby="citation-dialog-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className={styles.citationDialogBody}>
        <span className={styles.citationDialogType}>
          {CITATION_LABELS_KO[citation.source_type]}
        </span>
        <h3 id="citation-dialog-title" className={styles.citationDialogTitle}>
          {citation.title}
        </h3>
        {citation.celeb_persona != null && citation.celeb_persona !== '' && (
          <p className={styles.citationDialogPersona}>
            인용: {citation.celeb_persona}
          </p>
        )}
        {citation.url != null && citation.url !== '' && (
          <a
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.citationDialogLink}
          >
            출처 보기 →
          </a>
        )}
        <button
          type="button"
          className={styles.citationDialogClose}
          onClick={onClose}
        >
          닫기
        </button>
      </div>
    </dialog>
  );
}
