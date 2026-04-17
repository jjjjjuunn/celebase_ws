'use client';

import { useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { Badge, Button, Card, Input, Stack, Text } from '@celebbase/ui-kit';

const SECTION_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--cb-space-4)',
  padding: 'var(--cb-space-5)',
  border: '1px solid var(--cb-color-border)',
  borderRadius: 'var(--cb-radius-lg)',
  background: 'var(--cb-color-surface)',
};

const ROW_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--cb-space-3)',
  alignItems: 'center',
};

function Section({ id, title, children }: { id: string; title: string; children: JSX.Element }): JSX.Element {
  return (
    <section id={id} style={SECTION_STYLE} aria-labelledby={`${id}-heading`}>
      <Text as="h2" variant="heading" size="xl" id={`${id}-heading`}>
        {title}
      </Text>
      {children}
    </section>
  );
}

export default function PrimitivesPreview(): JSX.Element {
  const [inputValue, setInputValue] = useState<string>('');
  const [requiredValue, setRequiredValue] = useState<string>('');
  const [selectedDiet, setSelectedDiet] = useState<string>('mediterranean');
  const [tags, setTags] = useState<string[]>(['gluten-free', 'high-protein', 'organic']);
  const requiredError = requiredValue.trim() === '' ? 'This field is required.' : undefined;

  return (
    <Stack direction="column" gap="6" as="main">
      <header>
        <Text as="h1" variant="display" size="2xl">
          Primitives
        </Text>
        <Text as="p" tone="muted">
          IMPL-UI-002 — Stack, Text, Button, Input, Card, Badge. Verify: variants,
          focus-visible rings, 44px touch targets, WCAG 4.5:1 contrast, light/dark.
        </Text>
      </header>

      <Section id="stack" title="Stack">
        <Stack direction="row" gap="3" wrap>
          <div style={{ padding: 'var(--cb-space-3)', background: 'var(--cb-brand-100)' }}>A</div>
          <div style={{ padding: 'var(--cb-space-3)', background: 'var(--cb-brand-200)' }}>B</div>
          <div style={{ padding: 'var(--cb-space-3)', background: 'var(--cb-brand-300)' }}>C</div>
        </Stack>
      </Section>

      <Section id="text" title="Text">
        <Stack direction="column" gap="2">
          <Text as="h3" variant="display" size="2xl">
            Display 2xl — Fraunces
          </Text>
          <Text as="h4" variant="heading" size="lg">
            Heading lg — Fraunces
          </Text>
          <Text as="p" variant="body" size="md">
            Body md — Plus Jakarta Sans. The premium wellness journey begins with honest data.
          </Text>
          <Text as="span" variant="label" size="sm" tone="muted">
            Label sm muted
          </Text>
          <Text as="span" variant="mono" size="sm">
            const mono = &quot;JetBrains&quot;;
          </Text>
        </Stack>
      </Section>

      <Section id="button" title="Button">
        <Stack direction="column" gap="3">
          <div style={ROW_STYLE}>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
          <div style={ROW_STYLE}>
            <Button size="sm">sm (44px)</Button>
            <Button size="md">md (52px)</Button>
            <Button disabled>Disabled</Button>
            <Button loading>Loading…</Button>
          </div>
        </Stack>
      </Section>

      <Section id="input" title="Input">
        <Stack direction="column" gap="3">
          <Input
            id="input-default"
            label="Email address"
            helperText="We'll never share your email."
            value={inputValue}
            onChange={(e): void => {
              setInputValue(e.target.value);
            }}
          />
          <Input
            id="input-required"
            label="Full name"
            required
            {...(requiredError ? { errorText: requiredError, state: 'error' as const } : {})}
            value={requiredValue}
            onChange={(e): void => {
              setRequiredValue(e.target.value);
            }}
          />
          <Input id="input-disabled" label="Read-only field" state="disabled" defaultValue="locked" />
        </Stack>
      </Section>

      <Section id="card" title="Card">
        <Stack direction="column" gap="3">
          <Card variant="hero">
            <Text as="h3" variant="display" size="xl">
              Hero card
            </Text>
            <Text as="p" tone="muted">
              Used for flagship marketing modules and top-of-fold storytelling.
            </Text>
          </Card>
          <Card
            variant="standard"
            interactive
            onClick={(): void => {
              setSelectedDiet('standard-interactive');
            }}
          >
            <Text as="h4" variant="heading" size="md">
              Interactive standard card
            </Text>
            <Text as="p" tone="muted">
              role=button + tabIndex=0 + Enter/Space activation.
            </Text>
          </Card>
          <Card variant="lineItem">
            <Text as="span" variant="label">
              Line item card (44px min-height)
            </Text>
          </Card>
        </Stack>
      </Section>

      <Section id="badge" title="Badge">
        <Stack direction="column" gap="3">
          <div style={ROW_STYLE}>
            <Badge variant="neutral">Neutral</Badge>
            <Badge variant="brand">Brand</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="danger">Danger</Badge>
            <Badge variant="info">Info</Badge>
          </div>
          <div style={ROW_STYLE}>
            <Badge variant="success" dot aria-label="Online">
              Online
            </Badge>
            <Badge variant="warning" dot aria-label="Pending">
              Pending
            </Badge>
            <Badge variant="danger" dot aria-label="Offline">
              Offline
            </Badge>
          </div>
          <div style={ROW_STYLE}>
            {(['mediterranean', 'keto', 'paleo'] as const).map((diet) => (
              <Badge
                key={diet}
                variant="brand"
                selected={selectedDiet === diet}
                onClick={(): void => {
                  setSelectedDiet(diet);
                }}
                role="button"
                tabIndex={0}
                style={{ cursor: 'pointer' }}
              >
                {diet}
              </Badge>
            ))}
          </div>
          <div style={ROW_STYLE}>
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="neutral"
                onRemove={(): void => {
                  setTags((prev) => prev.filter((t) => t !== tag));
                }}
              >
                {tag}
              </Badge>
            ))}
            {tags.length === 0 ? (
              <Text as="span" variant="label" tone="muted">
                All tags removed.
              </Text>
            ) : null}
          </div>
        </Stack>
      </Section>
    </Stack>
  );
}
