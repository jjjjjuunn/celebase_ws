import type { Meta, StoryObj } from '@storybook/react';
import { WsStatusBanner } from '../src/components/WsStatusBanner/WsStatusBanner.js';

const meta: Meta<typeof WsStatusBanner> = {
  title: 'Composite/WsStatusBanner',
  component: WsStatusBanner,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 560 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof WsStatusBanner>;

export const Connecting: Story = {
  args: { status: 'connecting' },
};

export const Streaming: Story = {
  args: {
    status: 'streaming',
    progressPct: 45,
    message: 'Building day 3 of 7…',
  },
};

export const StreamingStart: Story = {
  args: { status: 'streaming', progressPct: 0 },
};

export const StreamingComplete: Story = {
  args: { status: 'streaming', progressPct: 95, message: 'Finalising plan…' },
};

export const Error: Story = {
  args: {
    status: 'error',
    error: 'Calorie bounds exceeded',
    onRetry: () => undefined,
  },
};

export const ErrorNoRetry: Story = {
  args: {
    status: 'error',
    error: 'Connection lost unexpectedly',
  },
};

export const Idle: Story = {
  args: { status: 'idle' },
};

export const Success: Story = {
  args: { status: 'success' },
};
