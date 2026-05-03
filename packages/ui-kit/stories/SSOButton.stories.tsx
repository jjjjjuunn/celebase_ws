import type { Meta, StoryObj } from '@storybook/react';
import { SSOButton } from '../src/components/SSOButton/SSOButton.js';

const meta: Meta<typeof SSOButton> = {
  title: 'Composite/SSOButton',
  component: SSOButton,
  parameters: { layout: 'centered' },
  argTypes: {
    provider: { control: { type: 'select' }, options: ['google', 'apple'] },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof SSOButton>;

export const Google: Story = {
  args: { provider: 'google' },
};

export const Apple: Story = {
  args: { provider: 'apple' },
};

export const GoogleLoading: Story = {
  args: { provider: 'google', loading: true },
  name: 'Google — Loading',
};

export const AppleLoading: Story = {
  args: { provider: 'apple', loading: true },
  name: 'Apple — Loading',
};

export const GoogleDisabled: Story = {
  args: { provider: 'google', disabled: true },
  name: 'Google — Disabled',
};

export const BothProviders: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cb-space-3)', width: 320 }}>
      <SSOButton provider="google" />
      <SSOButton provider="apple" />
    </div>
  ),
  name: 'Both providers',
};
