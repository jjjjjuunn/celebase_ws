import type { Meta, StoryObj } from '@storybook/react';
import { AuthCard } from '../src/components/AuthCard/AuthCard.js';
import { Button } from '../src/components/Button/Button.js';
import { Text } from '../src/components/Text/Text.js';

const meta: Meta<typeof AuthCard> = {
  title: 'Composite/AuthCard',
  component: AuthCard,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof AuthCard>;

export const Default: Story = {
  args: {
    title: 'Welcome back',
    children: (
      <Text tone="secondary">Sign in to continue to CelebBase Wellness.</Text>
    ),
  },
};

export const WithFooter: Story = {
  args: {
    title: 'Create account',
    children: (
      <Text tone="secondary">Start your personalized wellness journey today.</Text>
    ),
    footer: (
      <Text size="sm" tone="secondary">
        Already have an account?{' '}
        <a href="/login" style={{ color: 'var(--cb-color-brand)' }}>
          Sign in
        </a>
      </Text>
    ),
  },
};

export const WithActions: Story = {
  args: {
    title: 'Sign in',
    children: (
      <>
        <Text tone="secondary">Use your social account to get started quickly.</Text>
        <Button variant="primary" size="md">
          Continue with Google
        </Button>
        <Button variant="secondary" size="md">
          Continue with Apple
        </Button>
      </>
    ),
    footer: (
      <Text size="sm" tone="secondary">
        Don&apos;t have an account?{' '}
        <a href="/signup" style={{ color: 'var(--cb-color-brand)' }}>
          Sign up
        </a>
      </Text>
    ),
  },
};

export const NoTitle: Story = {
  args: {
    children: (
      <Text tone="secondary">A card without a title header section.</Text>
    ),
  },
};
