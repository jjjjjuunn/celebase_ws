import type { Meta, StoryObj } from '@storybook/react';
import type { CSSProperties, JSX } from 'react';
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

function tokensIn(group: TokenGroupName | TokenGroupName[]): Array<{ name: TokenName; value: string }> {
  const groups = Array.isArray(group) ? group : [group];
  const names = Object.keys(tokens.light) as TokenName[];
  return names
    .filter((n) => groups.includes(classify(n)))
    .sort()
    .map((n) => ({ name: n, value: tokens.light[n] }));
}

const meta: Meta = {
  title: 'Tokens/Overview',
  parameters: { layout: 'padded' },
};

export default meta;

type Story = StoryObj;

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: 'var(--cb-space-3)',
};

export const Colors: Story = {
  render: (): JSX.Element => {
    const items = tokensIn(['brand', 'neutral', 'semantic']);
    return (
      <div style={gridStyle}>
        {items.map(({ name, value }) => (
          <Swatch key={name} name={name} value={value} />
        ))}
      </div>
    );
  },
};

export const Typography: Story = {
  render: (): JSX.Element => {
    const items = tokensIn('typography');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cb-space-3)' }}>
        {items.map(({ name, value }) => (
          <TextSample key={name} name={name} value={value} />
        ))}
      </div>
    );
  },
};

export const Shadow: Story = {
  render: (): JSX.Element => {
    const items = tokensIn('shadow');
    return (
      <div style={gridStyle}>
        {items.map(({ name, value }) => (
          <BoxSample key={name} name={name} value={value} kind="shadow" />
        ))}
      </div>
    );
  },
};

export const Radius: Story = {
  render: (): JSX.Element => {
    const items = tokensIn('radius');
    return (
      <div style={gridStyle}>
        {items.map(({ name, value }) => (
          <BoxSample key={name} name={name} value={value} kind="radius" />
        ))}
      </div>
    );
  },
};

export const Space: Story = {
  render: (): JSX.Element => {
    const items = tokensIn('space');
    return (
      <div style={gridStyle}>
        {items.map(({ name, value }) => (
          <BoxSample key={name} name={name} value={value} kind="space" />
        ))}
      </div>
    );
  },
};
