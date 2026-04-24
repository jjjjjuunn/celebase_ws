'use client';

import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { WizardShell } from '../src/components/WizardShell/WizardShell.js';
import { Text } from '../src/components/Text/Text.js';

const DEMO_STEPS = [
  { label: 'Basic Info' },
  { label: 'Body Metrics' },
  { label: 'Health Info' },
  { label: 'Goals & Preferences' },
];

const meta: Meta<typeof WizardShell> = {
  title: 'Composite/WizardShell',
  component: WizardShell,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof WizardShell>;

function InteractiveWizard(): React.ReactElement {
  const [step, setStep] = useState(0);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 32 }}>
      <WizardShell
        steps={DEMO_STEPS}
        currentStep={step}
        onNext={() => setStep((s) => Math.min(s + 1, DEMO_STEPS.length - 1))}
        onBack={() => setStep((s) => Math.max(s - 1, 0))}
      >
        <Text variant="display" size="lg">
          {DEMO_STEPS[step]?.label ?? ''}
        </Text>
        <Text tone="muted">
          This is the content area for step {step + 1}. Form fields will go here.
        </Text>
      </WizardShell>
    </div>
  );
}

export const Interactive: Story = {
  render: () => <InteractiveWizard />,
  name: 'Interactive (4 steps)',
};

export const Step1: Story = {
  args: {
    steps: DEMO_STEPS,
    currentStep: 0,
    onNext: () => undefined,
    onBack: () => undefined,
    children: <Text tone="muted">Step 1 content</Text>,
  },
  name: 'Step 1 of 4',
};

export const Step3: Story = {
  args: {
    steps: DEMO_STEPS,
    currentStep: 2,
    onNext: () => undefined,
    onBack: () => undefined,
    children: <Text tone="muted">Step 3 content</Text>,
  },
  name: 'Step 3 of 4',
};

export const LastStep: Story = {
  args: {
    steps: DEMO_STEPS,
    currentStep: 3,
    onNext: () => undefined,
    onBack: () => undefined,
    children: <Text tone="muted">Last step — shows Finish button</Text>,
  },
  name: 'Last Step (Finish)',
};

export const NextDisabled: Story = {
  args: {
    steps: DEMO_STEPS,
    currentStep: 0,
    isNextDisabled: true,
    onNext: () => undefined,
    onBack: () => undefined,
    children: <Text tone="muted">Next is disabled until form is valid</Text>,
  },
};
