import type { Meta, StoryObj } from '@storybook/react-vite';
import type { JSX } from 'react';
import { Badge } from '../src/components/Badge/Badge.js';

const meta: Meta<typeof Badge> = {
  title: 'Primitives/Badge',
  component: Badge,
};
export default meta;

type Story = StoryObj<typeof Badge>;

export const AllVariants: Story = {
  render: (): JSX.Element => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--cb-space-2)' }}>
      <Badge variant="neutral">Neutral</Badge>
      <Badge variant="brand">Brand</Badge>
      <Badge variant="success">Success</Badge>
      <Badge variant="warning">Warning</Badge>
      <Badge variant="danger">Danger</Badge>
      <Badge variant="info">Info</Badge>
    </div>
  ),
};

export const Dot: Story = {
  render: (): JSX.Element => (
    <div style={{ display: 'flex', gap: 'var(--cb-space-3)' }}>
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
  ),
};

export const Selected: Story = {
  render: (): JSX.Element => (
    <div style={{ display: 'flex', gap: 'var(--cb-space-2)' }}>
      <Badge variant="brand" selected>
        Mediterranean
      </Badge>
      <Badge variant="brand">Keto</Badge>
      <Badge variant="brand">Paleo</Badge>
    </div>
  ),
};

export const Removable: Story = {
  render: (): JSX.Element => (
    <div style={{ display: 'flex', gap: 'var(--cb-space-2)' }}>
      <Badge
        variant="neutral"
        onRemove={(): void => {
          /* storybook demo */
        }}
      >
        Gluten-free
      </Badge>
      <Badge
        variant="brand"
        onRemove={(): void => {
          /* storybook demo */
        }}
      >
        High protein
      </Badge>
    </div>
  ),
};
