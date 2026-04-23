'use client';

import { useEffect, useRef, useState } from 'react';
import { PersonaHero } from '@celebbase/ui-kit';
import type { schemas } from '@celebbase/shared-types';
import { fetcher } from '../../../lib/fetcher.js';

export interface PersonaSelectProps {
  value: string | undefined;
  onChange: (slug: string) => void;
}

interface CelebrityCardData {
  slug: string;
  displayName: string;
  shortBio: string | null;
  avatarUrl: string;
  coverImageUrl: string | null;
  category: schemas.CelebrityWire['category'];
  tags: string[];
  isFeatured: boolean;
}

function toCardData(wire: schemas.CelebrityWire): CelebrityCardData {
  return {
    slug: wire.slug,
    displayName: wire.display_name,
    shortBio: wire.short_bio,
    avatarUrl: wire.avatar_url,
    coverImageUrl: wire.cover_image_url,
    category: wire.category,
    tags: wire.tags,
    isFeatured: wire.is_featured,
  };
}

interface ConfirmationOverlayProps {
  celebrity: CelebrityCardData;
}

function ConfirmationOverlay({ celebrity }: ConfirmationOverlayProps): React.ReactElement {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setVisible(false);
    const prefersReducedMotion =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    if (prefersReducedMotion) {
      setVisible(true);
      return () => {
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      };
    }
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, 0);
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [celebrity.slug]);

  return (
    <section
      aria-live="polite"
      data-testid="persona-confirmation"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--cb-space-3)',
        alignItems: 'center',
        padding: 'var(--cb-space-8)',
        borderRadius: 'var(--cb-radius-lg)',
        background: 'var(--cb-color-surface)',
        border: '1px solid var(--cb-color-border)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 300ms ease, transform 300ms ease',
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: '50%',
          overflow: 'hidden',
          background: 'var(--cb-color-bg)',
          boxShadow: 'var(--cb-shadow-md)',
        }}
      >
        {celebrity.avatarUrl ? (
          <img
            src={celebrity.avatarUrl}
            alt={celebrity.displayName}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : null}
      </div>
      <h2
        style={{
          margin: 0,
          fontFamily: 'var(--cb-font-family-display)',
          fontSize: 'var(--cb-display-md)',
          fontWeight: 600,
          textAlign: 'center',
          color: 'var(--cb-color-text)',
        }}
      >
        {`${celebrity.displayName} 와 함께`}
      </h2>
      {celebrity.shortBio !== null ? (
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--cb-font-family-body)',
            fontSize: 'var(--cb-body-md)',
            color: 'var(--cb-color-text-muted)',
            maxWidth: 560,
            textAlign: 'center',
          }}
        >
          {celebrity.shortBio}
        </p>
      ) : null}
    </section>
  );
}

export function PersonaSelect({ value, onChange }: PersonaSelectProps): React.ReactElement {
  const [celebrities, setCelebrities] = useState<CelebrityCardData[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const payload = await fetcher<schemas.CelebrityListResponse>('/api/celebrities?limit=12');
        if (cancelled) return;
        setCelebrities(payload.items.map(toCardData));
      } catch {
        if (cancelled) return;
        setLoadError('Could not load personas. Please refresh to try again.');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError !== null) {
    return (
      <p role="alert" style={{ color: 'var(--cb-color-danger)' }}>
        {loadError}
      </p>
    );
  }

  if (celebrities === null) {
    return (
      <p aria-live="polite" aria-busy="true">
        Loading personas…
      </p>
    );
  }

  const selected =
    value !== undefined ? celebrities.find((c) => c.slug === value) ?? null : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cb-space-6)' }}>
      <PersonaHero
        celebrities={celebrities}
        onSelect={onChange}
        {...(value !== undefined ? { selectedSlug: value } : {})}
      />
      {selected !== null ? <ConfirmationOverlay celebrity={selected} /> : null}
    </div>
  );
}
