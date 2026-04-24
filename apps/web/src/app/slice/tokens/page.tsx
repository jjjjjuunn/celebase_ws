import { tokens, type TokenName } from '@celebbase/design-tokens';

type TokenGroupName = 'brand' | 'neutral' | 'semantic' | 'typography' | 'shadow' | 'radius' | 'space';

function classify(name: TokenName): TokenGroupName {
  if (name.startsWith('--cb-brand-')) return 'brand';
  if (name.startsWith('--cb-neutral-')) return 'neutral';
  if (
    name.startsWith('--cb-success-') ||
    name.startsWith('--cb-warning-') ||
    name.startsWith('--cb-danger-') ||
    name.startsWith('--cb-info-') ||
    name.startsWith('--cb-color-')
  ) {
    return 'semantic';
  }
  if (name.startsWith('--cb-font-') || name.startsWith('--cb-line-height-')) return 'typography';
  if (name.startsWith('--cb-shadow-')) return 'shadow';
  if (name.startsWith('--cb-radius-')) return 'radius';
  if (name.startsWith('--cb-space-')) return 'space';
  return 'semantic';
}

const GROUP_ORDER: readonly TokenGroupName[] = [
  'brand',
  'neutral',
  'semantic',
  'typography',
  'shadow',
  'radius',
  'space',
];

type GroupedTokens = Record<TokenGroupName, Array<{ name: TokenName; value: string }>>;

function groupTokens(): GroupedTokens {
  const empty: GroupedTokens = {
    brand: [],
    neutral: [],
    semantic: [],
    typography: [],
    shadow: [],
    radius: [],
    space: [],
  };
  const names = Object.keys(tokens.light) as TokenName[];
  for (const name of names.sort()) {
    empty[classify(name)].push({ name, value: tokens.light[name] });
  }
  return empty;
}

function Swatch({ name, value }: { name: TokenName; value: string }) {
  return (
    <div
      style={{
        border: '1px solid var(--cb-color-border)',
        borderRadius: 'var(--cb-radius-md)',
        padding: 'var(--cb-space-3)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--cb-space-2)',
        background: 'var(--cb-color-surface)',
      }}
    >
      <div
        aria-label={`${name} swatch`}
        style={{
          height: 56,
          borderRadius: 'var(--cb-radius-sm)',
          background: `var(${name})`,
          boxShadow: 'var(--cb-shadow-ring)',
        }}
      />
      <code style={{ fontFamily: 'var(--cb-font-family-mono)', fontSize: 'var(--cb-font-size-xs)' }}>
        {name}
      </code>
      <code
        style={{
          fontFamily: 'var(--cb-font-family-mono)',
          fontSize: 'var(--cb-font-size-xs)',
          color: 'var(--cb-color-text-muted)',
        }}
      >
        {value}
      </code>
    </div>
  );
}

function TextSample({ name, value }: { name: TokenName; value: string }) {
  const isSize = name.startsWith('--cb-font-size-');
  const isLineHeight = name.startsWith('--cb-line-height-');
  const isWeight = name.startsWith('--cb-font-weight-');
  const isFamily = name.startsWith('--cb-font-family-');
  const sampleStyle: Record<string, string> = {
    fontFamily: isFamily ? `var(${name})` : 'var(--cb-font-family-body)',
    fontSize: isSize ? `var(${name})` : 'var(--cb-font-size-md)',
    lineHeight: isLineHeight ? `var(${name})` : 'var(--cb-line-height-body)',
    fontWeight: isWeight ? `var(${name})` : 'var(--cb-font-weight-regular)',
  };
  return (
    <div
      style={{
        border: '1px solid var(--cb-color-border)',
        borderRadius: 'var(--cb-radius-md)',
        padding: 'var(--cb-space-4)',
        background: 'var(--cb-color-surface)',
      }}
    >
      <code style={{ fontFamily: 'var(--cb-font-family-mono)', fontSize: 'var(--cb-font-size-xs)' }}>
        {name} = {value}
      </code>
      <p style={sampleStyle}>The premium wellness journey begins with honest data.</p>
    </div>
  );
}

function BoxSample({ name, value, kind }: { name: TokenName; value: string; kind: 'shadow' | 'radius' | 'space' }) {
  const boxStyle: Record<string, string | number> = {
    width: 120,
    height: 80,
    background: 'var(--cb-color-surface)',
    border: '1px solid var(--cb-color-border)',
  };
  if (kind === 'shadow') boxStyle['boxShadow'] = `var(${name})`;
  if (kind === 'radius') boxStyle['borderRadius'] = `var(${name})`;
  if (kind === 'space') {
    boxStyle['width'] = `var(${name})`;
    boxStyle['height'] = `var(${name})`;
    boxStyle['background'] = 'var(--cb-color-brand)';
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cb-space-2)' }}>
      <div style={boxStyle} />
      <code style={{ fontFamily: 'var(--cb-font-family-mono)', fontSize: 'var(--cb-font-size-xs)' }}>
        {name}
      </code>
      <code
        style={{
          fontFamily: 'var(--cb-font-family-mono)',
          fontSize: 'var(--cb-font-size-xs)',
          color: 'var(--cb-color-text-muted)',
        }}
      >
        {value}
      </code>
    </div>
  );
}

function PaletteHarmony() {
  const swatchRow = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 'var(--cb-space-4)',
  };
  const cardBase: Record<string, string> = {
    borderRadius: 'var(--cb-radius-lg)',
    padding: 'var(--cb-space-5)',
    border: '1px solid var(--cb-color-border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--cb-space-3)',
  };
  return (
    <section
      id="palette-harmony"
      aria-labelledby="palette-harmony-heading"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--cb-space-4)',
        padding: 'var(--cb-space-6)',
        borderRadius: 'var(--cb-radius-xl)',
        background: 'var(--cb-color-surface)',
        border: '1px solid var(--cb-color-border)',
      }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cb-space-2)' }}>
        <h2
          id="palette-harmony-heading"
          style={{ fontFamily: 'var(--cb-font-family-display)', fontSize: 'var(--cb-display-md)' }}
        >
          Palette harmony · gold + 2025 adjacencies
        </h2>
        <p style={{ color: 'var(--cb-color-text-muted)', margin: 0 }}>
          Gold brand (DESIGN.md §2.1) paired with the three 2025 wellness adjacencies: Lyons Blue
          (info), Lemon Grass (CTA accent), Digital Lavender (GLP-1). Shown in realistic UI slots so
          reviewer + user can validate co-occurrence visually (plan §Phase A · M3).
        </p>
      </header>

      <div style={swatchRow}>
        {/* 1. Primary CTA — gold */}
        <div style={cardBase}>
          <code style={{ fontFamily: 'var(--cb-font-family-mono)', fontSize: 'var(--cb-font-size-xs)' }}>
            Primary CTA · --cb-brand-600
          </code>
          <button
            type="button"
            style={{
              background: 'var(--cb-color-brand-bg)',
              color: 'var(--cb-cta-text)',
              border: 'none',
              borderRadius: 'var(--cb-radius-md)',
              padding: 'var(--cb-button-pad-y) var(--cb-button-pad-x)',
              fontFamily: 'var(--cb-font-family-body)',
              fontWeight: 'var(--cb-font-weight-semibold)',
              boxShadow: 'var(--cb-shadow-brand)',
              cursor: 'pointer',
            }}
          >
            Generate meal plan
          </button>
          <span style={{ color: 'var(--cb-color-text-muted)', fontSize: 'var(--cb-body-sm)' }}>
            5.1:1 vs on-brand text (WCAG AA)
          </span>
        </div>

        {/* 2. Info chip — Lyons Blue */}
        <div style={cardBase}>
          <code style={{ fontFamily: 'var(--cb-font-family-mono)', fontSize: 'var(--cb-font-size-xs)' }}>
            Info chip · --cb-info-600 / --cb-info-100
          </code>
          <span
            style={{
              alignSelf: 'flex-start',
              background: 'var(--cb-info-100)',
              color: 'var(--cb-info-600)',
              borderRadius: 'var(--cb-radius-pill)',
              padding: 'var(--cb-space-2) var(--cb-space-4)',
              fontFamily: 'var(--cb-font-family-body)',
              fontWeight: 'var(--cb-font-weight-semibold)',
              fontSize: 'var(--cb-label-md)',
              letterSpacing: '0.01em',
            }}
          >
            Source: Harvard Med News
          </span>
          <span style={{ color: 'var(--cb-color-text-muted)', fontSize: 'var(--cb-body-sm)' }}>
            Scientific transparency cue
          </span>
        </div>

        {/* 3. GLP-1 badge — Digital Lavender */}
        <div style={cardBase}>
          <code style={{ fontFamily: 'var(--cb-font-family-mono)', fontSize: 'var(--cb-font-size-xs)' }}>
            GLP-1 badge · --cb-accent-glp1
          </code>
          <span
            style={{
              alignSelf: 'flex-start',
              background: 'var(--cb-accent-glp1)',
              color: 'var(--cb-color-on-glp1)',
              borderRadius: 'var(--cb-radius-sm)',
              padding: 'var(--cb-space-2) var(--cb-space-4)',
              fontFamily: 'var(--cb-font-family-body)',
              fontWeight: 'var(--cb-font-weight-semibold)',
              fontSize: 'var(--cb-label-md)',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
          >
            GLP-1 friendly
          </span>
          <span style={{ color: 'var(--cb-color-text-muted)', fontSize: 'var(--cb-body-sm)' }}>
            Category accent · not a medical claim
          </span>
        </div>

        {/* 4. Lemon Grass accent — secondary CTA / chart */}
        <div style={cardBase}>
          <code style={{ fontFamily: 'var(--cb-font-family-mono)', fontSize: 'var(--cb-font-size-xs)' }}>
            Accent · --cb-cta-accent (Lemon Grass)
          </code>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--cb-space-3)',
              padding: 'var(--cb-space-3) var(--cb-space-4)',
              borderRadius: 'var(--cb-radius-md)',
              background: 'var(--cb-cta-accent)',
              color: 'var(--cb-color-text)',
              fontFamily: 'var(--cb-font-family-body)',
              fontWeight: 'var(--cb-font-weight-semibold)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 10,
                height: 10,
                borderRadius: 'var(--cb-radius-circle)',
                background: 'var(--cb-color-brand-bg)',
              }}
            />
            Adherence streak · 7 days
          </div>
          <span style={{ color: 'var(--cb-color-text-muted)', fontSize: 'var(--cb-body-sm)' }}>
            Secondary accent + gold dot (combined use)
          </span>
        </div>
      </div>

      {/* Combined composition preview — all four tokens co-occurring */}
      <div
        aria-label="All four palette roles composed together"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--cb-space-3)',
          padding: 'var(--cb-space-5)',
          borderRadius: 'var(--cb-radius-lg)',
          background: 'var(--cb-color-bg)',
          border: '1px solid var(--cb-color-border)',
        }}
      >
        <div style={{ display: 'flex', gap: 'var(--cb-space-2)', flexWrap: 'wrap' }}>
          <span
            style={{
              background: 'var(--cb-info-100)',
              color: 'var(--cb-info-600)',
              padding: 'var(--cb-space-1) var(--cb-space-3)',
              borderRadius: 'var(--cb-radius-pill)',
              fontSize: 'var(--cb-label-sm)',
              fontFamily: 'var(--cb-font-family-body)',
              fontWeight: 'var(--cb-font-weight-semibold)',
            }}
          >
            Source: Vogue 2024
          </span>
          <span
            style={{
              background: 'var(--cb-accent-glp1)',
              color: 'var(--cb-color-on-glp1)',
              padding: 'var(--cb-space-1) var(--cb-space-3)',
              borderRadius: 'var(--cb-radius-sm)',
              fontSize: 'var(--cb-label-sm)',
              fontFamily: 'var(--cb-font-family-body)',
              fontWeight: 'var(--cb-font-weight-semibold)',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
          >
            GLP-1
          </span>
        </div>
        <h3
          style={{
            fontFamily: 'var(--cb-font-family-display)',
            fontSize: 'var(--cb-h2)',
            margin: 0,
          }}
        >
          Tom Brady · TB12 Hydration Blueprint
        </h3>
        <p style={{ color: 'var(--cb-color-text-muted)', margin: 0 }}>
          Persona meal plan preview combining source citation (blue), category accent (lavender),
          adherence streak (lemon grass), and primary fulfillment CTA (gold).
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cb-space-3)', flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--cb-space-2)',
              padding: 'var(--cb-space-2) var(--cb-space-3)',
              background: 'var(--cb-cta-accent)',
              borderRadius: 'var(--cb-radius-pill)',
              fontFamily: 'var(--cb-font-family-body)',
              fontSize: 'var(--cb-label-md)',
              fontWeight: 'var(--cb-font-weight-semibold)',
            }}
          >
            7-day streak
          </span>
          <button
            type="button"
            style={{
              background: 'var(--cb-color-brand-bg)',
              color: 'var(--cb-cta-text)',
              border: 'none',
              borderRadius: 'var(--cb-radius-md)',
              padding: 'var(--cb-button-pad-y) var(--cb-button-pad-x)',
              fontFamily: 'var(--cb-font-family-body)',
              fontWeight: 'var(--cb-font-weight-semibold)',
              boxShadow: 'var(--cb-shadow-brand)',
              cursor: 'pointer',
            }}
          >
            Shop ingredients
          </button>
        </div>
      </div>
    </section>
  );
}

export default function TokensPreview() {
  const groups = groupTokens();
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 'var(--cb-space-3)',
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cb-space-8)' }}>
      <header>
        <h1 style={{ fontFamily: 'var(--cb-font-family-display)', fontSize: 'var(--cb-font-size-2xl)' }}>
          Design tokens
        </h1>
        <p style={{ color: 'var(--cb-color-text-muted)' }}>
          Source of truth: <code>packages/design-tokens/tokens.css</code> · build:{' '}
          <code>pnpm --filter @celebbase/design-tokens build</code>
        </p>
      </header>

      <PaletteHarmony />

      {GROUP_ORDER.map((group) => {
        const items = groups[group];
        if (items.length === 0) return null;
        return (
          <section key={group} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cb-space-3)' }}>
            <h2 style={{ fontFamily: 'var(--cb-font-family-display)', fontSize: 'var(--cb-font-size-xl)' }}>
              {group} ({items.length})
            </h2>
            <div style={gridStyle}>
              {items.map(({ name, value }) => {
                if (group === 'brand' || group === 'neutral' || group === 'semantic') {
                  const resolvedValue = value.startsWith('var(')
                    ? value
                    : value;
                  return <Swatch key={name} name={name} value={resolvedValue} />;
                }
                if (group === 'typography') {
                  return <TextSample key={name} name={name} value={value} />;
                }
                return <BoxSample key={name} name={name} value={value} kind={group} />;
              })}
            </div>
          </section>
        );
      })}
    </section>
  );
}
