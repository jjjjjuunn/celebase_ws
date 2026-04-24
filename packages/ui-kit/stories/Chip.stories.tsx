import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Chip } from '../src/components/Chip/Chip.js';

const meta: Meta<typeof Chip> = {
  title: 'Composite/Chip',
  component: Chip,
};
export default meta;

type Story = StoryObj<typeof Chip>;

export const Default: Story = {
  render: () => <Chip label="Gluten-free" />,
};

export const Toggleable: Story = {
  render: () => {
    function Controlled(): JSX.Element {
      const [selected, setSelected] = useState<boolean>(false);
      return (
        <Chip
          label="High protein"
          selected={selected}
          onToggle={() => setSelected((v) => !v)}
        />
      );
    }
    return <Controlled />;
  },
};

export const ToggleGroup: Story = {
  render: () => {
    function Controlled(): JSX.Element {
      const [selected, setSelected] = useState<Set<string>>(new Set(['keto']));
      const toggle = (key: string): void => {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      };
      return (
        <div style={{ display: 'flex', gap: 'var(--cb-space-2)', flexWrap: 'wrap' }}>
          {['mediterranean', 'keto', 'paleo', 'vegan'].map((key) => (
            <Chip
              key={key}
              label={key.charAt(0).toUpperCase() + key.slice(1)}
              selected={selected.has(key)}
              onToggle={() => toggle(key)}
            />
          ))}
        </div>
      );
    }
    return <Controlled />;
  },
};

export const Removable: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--cb-space-2)', flexWrap: 'wrap' }}>
      <Chip label="Gluten-free" onRemove={() => undefined} />
      <Chip label="Dairy-free" onRemove={() => undefined} />
    </div>
  ),
};

export const ToggleAndRemovable: Story = {
  render: () => {
    function Controlled(): JSX.Element {
      const [selected, setSelected] = useState<boolean>(true);
      return (
        <Chip
          label="High protein"
          selected={selected}
          onToggle={() => setSelected((v) => !v)}
          onRemove={() => undefined}
        />
      );
    }
    return <Controlled />;
  },
};

export const Disabled: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--cb-space-2)' }}>
      <Chip label="Keto" disabled />
      <Chip label="Paleo" disabled selected onToggle={() => undefined} />
    </div>
  ),
};

export const SmallSize: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--cb-space-2)' }}>
      <Chip label="Small" size="sm" />
      <Chip label="Selected" size="sm" selected onToggle={() => undefined} />
    </div>
  ),
};
