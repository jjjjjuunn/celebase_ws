'use client';

import { useEffect, useState } from 'react';
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

  const footnote = value
    ? `Selected · "${celebrities.find((c) => c.slug === value)?.displayName ?? value}"`
    : 'Select a persona to continue.';

  return (
    <PersonaHero
      celebrities={celebrities}
      onSelect={onChange}
      footnote={footnote}
    />
  );
}
