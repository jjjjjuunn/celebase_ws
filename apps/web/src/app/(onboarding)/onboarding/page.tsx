'use client';

import { useState } from 'react';
import { WizardShell } from '@celebbase/ui-kit';
import {
  WIZARD_STEPS,
  emptyWizardForm,
  WizardStep1Schema,
  WizardStep2Schema,
} from './wizard-schema.js';
import type { WizardForm } from './wizard-schema.js';
import { Step1BasicInfo } from './steps/Step1BasicInfo.js';
import { Step2BodyMetrics } from './steps/Step2BodyMetrics.js';

function isStepValid(step: number, formData: WizardForm): boolean {
  switch (step) {
    case 0:
      return WizardStep1Schema.safeParse(formData.step1).success;
    case 1:
      return WizardStep2Schema.safeParse(formData.step2).success;
    default:
      // Steps 3+4 validated in 002-2c
      return true;
  }
}

export default function OnboardingPage(): React.ReactElement {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<WizardForm>(emptyWizardForm);

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

  function renderStep(): React.ReactElement {
    switch (currentStep) {
      case 0:
        return (
          <Step1BasicInfo
            data={formData.step1}
            onChange={(step1) => setFormData((prev) => ({ ...prev, step1 }))}
          />
        );
      case 1:
        return (
          <Step2BodyMetrics
            data={formData.step2}
            onChange={(step2) => setFormData((prev) => ({ ...prev, step2 }))}
          />
        );
      default:
        // Steps 3+4 implemented in 002-2c
        return (
          <p style={{ color: 'var(--cb-color-muted)' }}>
            {WIZARD_STEPS[currentStep]?.label ?? ''} — coming in 002-2c
          </p>
        );
    }
  }

  return (
    <WizardShell
      steps={[...WIZARD_STEPS]}
      currentStep={currentStep}
      onNext={handleNext}
      onBack={handleBack}
      isNextDisabled={!isStepValid(currentStep, formData)}
    >
      {renderStep()}
    </WizardShell>
  );
}
