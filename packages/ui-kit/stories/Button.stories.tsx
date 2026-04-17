import type { Meta, StoryObj } from '@storybook/react-vite';
import type { JSX } from 'react';
import { Button } from '../src/components/Button/Button.js';

const meta: Meta<typeof Button> = {
  title: 'Primitives/Button',
  component: Button,
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: { variant: 'primary', children: 'Start my plan' },
};

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Skip for now' },
};

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Learn more' },
};

export const Destructive: Story = {
  args: { variant: 'destructive', children: 'Delete account' },
};

export const Sizes: Story = {
  render: (): JSX.Element => (
    <div style={{ display: 'flex', gap: 'var(--cb-space-4)', alignItems: 'center' }}>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
    </div>
  ),
};

export const Loading: Story = {
  args: { variant: 'primary', loading: true, children: 'Saving…' },
};

export const Disabled: Story = {
  args: { variant: 'primary', disabled: true, children: 'Disabled' },
};
