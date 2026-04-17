import type { Meta, StoryObj } from '@storybook/react-vite';
import type { JSX } from 'react';
import { Text } from '../src/components/Text/Text.js';

const meta: Meta<typeof Text> = {
  title: 'Primitives/Text',
  component: Text,
};
export default meta;

type Story = StoryObj<typeof Text>;

export const DisplayScale: Story = {
  render: (): JSX.Element => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cb-space-4)' }}>
      <Text as="span" variant="display" size="3xl" weight="semibold">
        Display 3xl
      </Text>
      <Text as="span" variant="display" size="2xl" weight="semibold">
        Display 2xl
      </Text>
    </div>
  ),
};

export const HeadingScale: Story = {
  render: (): JSX.Element => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cb-space-3)' }}>
      <Text as="h1" variant="heading" size="2xl" weight="bold">
        Heading 1
      </Text>
      <Text as="h2" variant="heading" size="xl" weight="semibold">
        Heading 2
      </Text>
      <Text as="h3" variant="heading" size="lg" weight="semibold">
        Heading 3
      </Text>
      <Text as="h4" variant="heading" size="md" weight="semibold">
        Heading 4
      </Text>
      <Text as="h5" variant="heading" size="sm" weight="medium">
        Heading 5
      </Text>
      <Text as="h6" variant="heading" size="xs" weight="medium">
        Heading 6
      </Text>
    </div>
  ),
};

export const BodyAndLabel: Story = {
  render: (): JSX.Element => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cb-space-3)' }}>
      <Text variant="body" size="md">
        Body medium — the quick brown fox jumps over the lazy dog.
      </Text>
      <Text variant="body" size="sm">
        Body small — supporting details in compact reading flow.
      </Text>
      <Text as="span" variant="label" size="xs" weight="medium">
        LABEL XS MEDIUM
      </Text>
    </div>
  ),
};

export const Mono: Story = {
  render: (): JSX.Element => (
    <Text as="span" variant="mono" size="sm">
      GET /api/meal-plans → 200 OK
    </Text>
  ),
};

export const Tones: Story = {
  render: (): JSX.Element => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cb-space-2)' }}>
      <Text variant="body" size="md" tone="default">
        Default tone — primary text color.
      </Text>
      <Text variant="body" size="md" tone="muted">
        Muted tone — secondary text color.
      </Text>
    </div>
  ),
};
