'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { WizardShell } from '@celebbase/ui-kit';
import {
  WIZARD_STEPS,
  emptyWizardForm,
  WizardStep1Schema,
  WizardStep2Schema,
  WizardStep4Schema,
} from './wizard-schema.js';
import type { WizardForm } from './wizard-schema.js';
import { Step1BasicInfo } from './steps/Step1BasicInfo.js';
import { Step2BodyMetrics } from './steps/Step2BodyMetrics.js';
import { Step3HealthInfo } from './steps/Step3HealthInfo.js';
import { Step4GoalsPrefs } from './steps/Step4GoalsPrefs.js';
import { postJson } from '../../../lib/fetcher.js';
import styles from './onboarding.module.css';

function isStepValid(step: number, formData: WizardForm): boolean {
  switch (step) {
    case 0:
      return WizardStep1Schema.safeParse(formData.step1).success;
    case 1:
      return WizardStep2Schema.safeParse(formData.step2).success;
    case 2:
      return true; // WizardStep3Schema has all defaults — always valid
    case 3:
      return WizardStep4Schema.safeParse(formData.step4).success;
    default:
      return false;
  }
}

export default function OnboardingPage(): React.ReactElement {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<WizardForm>(emptyWizardForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (): Promise<void> => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      // TODO: also PATCH /api/users/me with display_name (formData.step1.display_name)
      await postJson('/api/users/me/bio-profile', {
        birth_year: formData.step1.birth_year,
        sex: formData.step1.sex,
        height_cm: formData.step2.height_cm,
        weight_kg: formData.step2.weight_kg,
        waist_cm: formData.step2.waist_cm,
        activity_level: formData.step2.activity_level,
        allergies: formData.step3.allergies,
        intolerances: formData.step3.intolerances,
        medical_conditions: formData.step3.medical_conditions,
        medications: formData.step3.medications,
        primary_goal: formData.step4.primary_goal,
        secondary_goals: formData.step4.secondary_goals ?? [],
        diet_type: formData.step4.diet_type,
        cuisine_preferences: formData.step4.cuisine_preferences ?? [],
        disliked_ingredients: formData.step4.disliked_ingredients ?? [],
      });
      router.push('/celebrities');
    } catch {
      setSubmitError('Failed to save your profile. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleNext = (): void => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      void handleSubmit();
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
      case 2:
        return (
          <Step3HealthInfo
            data={formData.step3}
            onChange={(step3) => setFormData((prev) => ({ ...prev, step3 }))}
          />
        );
      case 3:
        return (
          <Step4GoalsPrefs
            data={formData.step4}
            onChange={(step4) => setFormData((prev) => ({ ...prev, step4 }))}
          />
        );
      default:
        return <></>;
    }
  }

  return (
    <WizardShell
      steps={[...WIZARD_STEPS]}
      currentStep={currentStep}
      onNext={handleNext}
      onBack={handleBack}
      isNextDisabled={!isStepValid(currentStep, formData) || isSubmitting}
      nextLabel={isSubmitting ? 'Saving…' : 'Continue'}
    >
      {submitError !== null ? (
        <p role="alert" className={styles.submitError}>
          {submitError}
        </p>
      ) : null}
      {renderStep()}
    </WizardShell>
  );
}
