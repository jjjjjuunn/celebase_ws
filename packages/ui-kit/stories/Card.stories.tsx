import type { Meta, StoryObj } from '@storybook/react-vite';
import type { JSX } from 'react';
import { Card } from '../src/components/Card/Card.js';

const meta: Meta<typeof Card> = {
  title: 'Primitives/Card',
  component: Card,
};
export default meta;

type Story = StoryObj<typeof Card>;

export const Standard: Story = {
  render: (): JSX.Element => (
    <Card variant="standard">
      <strong>Weekly check-in</strong>
      <p style={{ margin: 'var(--cb-space-2) 0 0', color: 'var(--cb-color-text-muted)' }}>
        Three goals on track.
      </p>
    </Card>
  ),
};

export const Hero: Story = {
  render: (): JSX.Element => (
    <Card variant="hero">
      <h2 style={{ margin: 0, fontFamily: 'var(--cb-font-family-display)' }}>Your plan</h2>
      <p style={{ margin: 'var(--cb-space-3) 0 0', color: 'var(--cb-color-text-muted)' }}>
        Tailored to your biomarkers and preferences.
      </p>
    </Card>
  ),
};

export const LineItem: Story = {
  render: (): JSX.Element => (
    <Card variant="lineItem">
      <span>Breakfast — Greek yogurt bowl</span>
    </Card>
  ),
};

export const Interactive: Story = {
  render: (): JSX.Element => (
    <Card
      variant="standard"
      interactive
      onClick={(): void => {
        /* storybook demo */
      }}
    >
      <strong>Clickable card</strong>
      <p style={{ margin: 'var(--cb-space-2) 0 0', color: 'var(--cb-color-text-muted)' }}>
        Enter/Space also activates.
      </p>
    </Card>
  ),
};

export const AsButton: Story = {
  render: (): JSX.Element => (
    <Card
      variant="standard"
      as="button"
      interactive
      onClick={(): void => {
        /* storybook demo */
      }}
    >
      <strong>Native button card</strong>
    </Card>
  ),
};
