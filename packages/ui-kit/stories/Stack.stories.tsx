import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties, JSX, ReactNode } from 'react';
import { Stack } from '../src/components/Stack/Stack.js';

const boxStyle: CSSProperties = {
  background: 'var(--cb-color-surface)',
  border: '1px solid var(--cb-color-border)',
  borderRadius: 'var(--cb-radius-md)',
  padding: 'var(--cb-space-3) var(--cb-space-4)',
  color: 'var(--cb-color-text)',
  fontFamily: 'var(--cb-font-family-body)',
  fontSize: 'var(--cb-font-size-sm)',
};

function Box({ children, width }: { children: ReactNode; width?: number }): JSX.Element {
  return <div style={{ ...boxStyle, ...(width ? { width } : {}) }}>{children}</div>;
}

const meta: Meta<typeof Stack> = {
  title: 'Primitives/Stack',
  component: Stack,
};
export default meta;

type Story = StoryObj<typeof Stack>;

export const Default: Story = {
  args: { direction: 'column', gap: '4' },
  render: (args) => (
    <Stack {...args}>
      <Box>First item</Box>
      <Box>Second item</Box>
      <Box>Third item</Box>
    </Stack>
  ),
};

export const Row: Story = {
  args: { direction: 'row', gap: '6' },
  render: (args) => (
    <Stack {...args}>
      <Box>One</Box>
      <Box>Two</Box>
      <Box>Three</Box>
    </Stack>
  ),
};

export const Wrapping: Story = {
  args: { direction: 'row', gap: '3', wrap: true },
  render: (args) => (
    <Stack {...args}>
      {Array.from({ length: 8 }, (_, i) => (
        <Box key={i} width={120}>
          Item {i + 1}
        </Box>
      ))}
    </Stack>
  ),
};

export const Centered: Story = {
  args: { direction: 'column', gap: '4', align: 'center', justify: 'center' },
  render: (args) => (
    <div style={{ minHeight: 240, background: 'var(--cb-color-bg)' }}>
      <Stack {...args}>
        <Box>Centered child</Box>
      </Stack>
    </div>
  ),
};
