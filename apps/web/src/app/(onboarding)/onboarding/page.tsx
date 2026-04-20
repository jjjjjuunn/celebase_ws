'use client';

import { useState } from 'react';
import type { Metadata } from 'next';
import { WizardShell } from '@celebbase/ui-kit';
import { Text } from '@celebbase/ui-kit';
import { WIZARD_STEPS, emptyWizardForm } from './wizard-schema.js';
import type { WizardForm } from './wizard-schema.js';
import styles from './onboarding.module.css';

// Metadata cannot be exported from a 'use client' page in Next.js App Router.
// The (onboarding)/layout.tsx or a parent RSC wrapper handles static metadata.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _metadata: Metadata = { title: 'Set up your profile — CelebBase Wellness' };

export default function OnboardingPage(): React.ReactElement {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<WizardForm>(emptyWizardForm);

  void formData;
  void setFormData;

  const handleNext = (): void => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      // TODO 002-2c: submit bio profile to /api/users/me/bio-profile → redirect to /celebrities
    }
  };

  const handleBack = (): void => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  return (
    <WizardShell
      steps={[...WIZARD_STEPS]}
      currentStep={currentStep}
      onNext={handleNext}
      onBack={handleBack}
    >
      <div className={styles.stepContent}>
        <Text variant="display" size="lg">
          {WIZARD_STEPS[currentStep]?.label ?? ''}
        </Text>
        <Text tone="muted">
          Step {currentStep + 1} form fields — implemented in 002-2b / 002-2c.
        </Text>
      </div>
    </WizardShell>
  );
}
