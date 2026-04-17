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
