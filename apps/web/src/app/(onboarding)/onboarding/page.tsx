'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WizardShell } from '@celebbase/ui-kit';
import type { schemas } from '@celebbase/shared-types';
import {
  WIZARD_STEPS,
  WIZARD_DRAFT_KEY,
  emptyWizardForm,
  WizardStep0Schema,
  WizardStep1Schema,
  WizardStep2Schema,
  WizardStep4Schema,
} from './wizard-schema.js';
import type { WizardForm } from './wizard-schema.js';
import { PersonaSelect } from '../../../features/persona/components/PersonaSelect.js';
import { BlueprintReveal } from '../../../features/persona/components/BlueprintReveal.js';
import type { PersonaMatchState } from '../../../features/persona/components/BlueprintReveal.js';
import { Step1BasicInfo } from './steps/Step1BasicInfo.js';
import { Step2BodyMetrics } from './steps/Step2BodyMetrics.js';
import { Step3HealthInfo } from './steps/Step3HealthInfo.js';
import { Step4GoalsPrefs } from './steps/Step4GoalsPrefs.js';
import { fetcher, postJson, patchJson, FetcherError } from '../../../lib/fetcher.js';
import styles from './onboarding.module.css';

const PERSONA_MATCH_TIMEOUT_MS = 3000;

interface OnboardingDraft {
  form: WizardForm;
  currentStep: number;
  personaDisplayName: string | null;
}

function loadDraft(): OnboardingDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(WIZARD_DRAFT_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as OnboardingDraft;
    return parsed;
  } catch {
    return null;
  }
}

function saveDraft(draft: OnboardingDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(WIZARD_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // storage disabled or quota exceeded — silent no-op; S7 retry UX handles recovery
  }
}

function clearDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(WIZARD_DRAFT_KEY);
  } catch {
    // ignore
  }
}

function isStepValid(step: number, formData: WizardForm): boolean {
  switch (step) {
    case 0:
      return WizardStep0Schema.safeParse(formData.step0).success;
    case 1:
      return WizardStep1Schema.safeParse(formData.step1).success;
    case 2:
      return WizardStep2Schema.safeParse(formData.step2).success;
    case 3:
      return true; // WizardStep3Schema has all defaults — always valid
    case 4:
      return WizardStep4Schema.safeParse(formData.step4).success;
    case 5:
      return true; // review step, no blocking validation
    default:
      return false;
  }
}

function resolvePrimaryGoal(formData: WizardForm): string {
  const goal = formData.step4.primary_goal;
  if (goal === 'weight_loss' || goal === 'muscle_gain' || goal === 'longevity') {
    return goal;
  }
  if (goal === 'energy' || goal === 'maintenance') {
    return 'general';
  }
  return 'general';
}

function emitPersonaMatchTimeoutEvent(celebritySlug: string): void {
  if (typeof window === 'undefined') return;
  // Fire-and-forget observability beacon. analytics-service aggregates the event.
  void fetch('/api/telemetry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      event: 'onboarding.s7.persona_match_timeout',
      attributes: { celebritySlug, timeoutMs: PERSONA_MATCH_TIMEOUT_MS },
    }),
  }).catch(() => {
    // beacon failure must never surface to user
  });
}

export default function OnboardingPage(): React.ReactElement {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<WizardForm>(emptyWizardForm);
  const [personaDisplayName, setPersonaDisplayName] = useState<string | null>(null);
  const [personaMatch, setPersonaMatch] = useState<PersonaMatchState>({ status: 'pending' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPersonaSaving, setIsPersonaSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const draft = loadDraft();
    if (draft !== null) {
      setFormData(draft.form);
      setCurrentStep(draft.currentStep);
      setPersonaDisplayName(draft.personaDisplayName);
    }
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    saveDraft({ form: formData, currentStep, personaDisplayName });
  }, [formData, currentStep, personaDisplayName]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const firePersonaMatch = useCallback(
    (slug: string): void => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPersonaMatch({ status: 'pending' });

      const timeoutId = window.setTimeout(() => {
        controller.abort();
        emitPersonaMatchTimeoutEvent(slug);
      }, PERSONA_MATCH_TIMEOUT_MS);

      const wellnessKeywords = [
        ...(formData.step4.secondary_goals ?? []),
        ...(formData.step4.cuisine_preferences ?? []),
      ].slice(0, 10);

      const goal = resolvePrimaryGoal(formData);
      void postJson<{ matchScore: number; rationale: string | null; identitySyncScore: number }>(
        '/api/persona-match',
        { celebritySlug: slug, goal, wellnessKeywords },
        { signal: controller.signal },
      )
        .then((data) => {
          window.clearTimeout(timeoutId);
          if (controller.signal.aborted) return;
          setPersonaMatch({
            status: 'ready',
            matchScore: data.identitySyncScore ?? data.matchScore,
            rationale: data.rationale,
          });
        })
        .catch((err: unknown) => {
          window.clearTimeout(timeoutId);
          if (controller.signal.aborted) {
            if (controller.signal.reason instanceof Error && controller.signal.reason.name === 'AbortError') {
              setPersonaMatch({ status: 'error', reason: 'timeout' });
            }
            return;
          }
          if (err instanceof FetcherError && err.status === 503) {
            setPersonaMatch({ status: 'error', reason: 'unavailable' });
            return;
          }
          setPersonaMatch({ status: 'error', reason: 'unknown' });
        });
    },
    [formData],
  );

  const handlePersonaChange = useCallback(
    async (slug: string): Promise<void> => {
      setFormData((prev) => ({
        ...prev,
        step0: { preferred_celebrity_slug: slug },
      }));
      setIsPersonaSaving(true);
      try {
        const resp = await fetcher<{ celebrity: schemas.CelebrityWire }>(
          `/api/celebrities/${encodeURIComponent(slug)}`,
        );
        setPersonaDisplayName(resp.celebrity.display_name);
      } catch {
        // fall back to the list-level display name; resolved next try
      }
      try {
        await patchJson('/api/users/me', { preferred_celebrity_slug: slug });
      } catch {
        // non-fatal: persona selection still progresses in the wizard state;
        // final submit re-asserts the slug via bio-profile payload.
      } finally {
        setIsPersonaSaving(false);
      }
    },
    [],
  );

  const handleSubmit = useCallback(async (): Promise<void> => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      if (formData.step1.display_name !== undefined) {
        try {
          await patchJson('/api/users/me', { display_name: formData.step1.display_name });
        } catch {
          // non-fatal: display_name PATCH can be retried from profile settings
        }
      }
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
      clearDraft();
      router.push('/celebrities');
    } catch (err) {
      if (err instanceof FetcherError && err.status >= 500) {
        setSubmitError(
          'We hit a snag saving your blueprint. Your answers are stored locally — try again in a moment.',
        );
      } else {
        setSubmitError('Failed to save your profile. Please try again.');
      }
      setIsSubmitting(false);
    }
  }, [formData, router]);

  const handleNext = useCallback((): void => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      // S6 (index 4) → S7 (index 5): fire async persona-match before transition
      if (currentStep === 4) {
        const slug = formData.step0.preferred_celebrity_slug;
        if (typeof slug === 'string' && slug.length > 0) {
          firePersonaMatch(slug);
        }
      }
      setCurrentStep((s) => s + 1);
    } else {
      void handleSubmit();
    }
  }, [currentStep, firePersonaMatch, formData.step0.preferred_celebrity_slug, handleSubmit]);

  const handleBack = useCallback((): void => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  const handleRetryMatch = useCallback((): void => {
    const slug = formData.step0.preferred_celebrity_slug;
    if (typeof slug === 'string' && slug.length > 0) {
      firePersonaMatch(slug);
    }
  }, [firePersonaMatch, formData.step0.preferred_celebrity_slug]);

  function renderStep(): React.ReactElement {
    switch (currentStep) {
      case 0:
        return (
          <PersonaSelect
            value={formData.step0.preferred_celebrity_slug}
            onChange={(slug) => {
              void handlePersonaChange(slug);
            }}
          />
        );
      case 1:
        return (
          <Step1BasicInfo
            data={formData.step1}
            onChange={(step1) => setFormData((prev) => ({ ...prev, step1 }))}
          />
        );
      case 2:
        return (
          <Step2BodyMetrics
            data={formData.step2}
            onChange={(step2) => setFormData((prev) => ({ ...prev, step2 }))}
          />
        );
      case 3:
        return (
          <Step3HealthInfo
            data={formData.step3}
            onChange={(step3) => setFormData((prev) => ({ ...prev, step3 }))}
          />
        );
      case 4:
        return (
          <Step4GoalsPrefs
            data={formData.step4}
            onChange={(step4) => setFormData((prev) => ({ ...prev, step4 }))}
          />
        );
      case 5:
        return (
          <BlueprintReveal
            form={formData}
            personaDisplayName={personaDisplayName}
            personaSlug={formData.step0.preferred_celebrity_slug ?? null}
            personaMatch={personaMatch}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onStart={() => {
              void handleSubmit();
            }}
            onRetryMatch={handleRetryMatch}
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
      isNextDisabled={
        !isStepValid(currentStep, formData) || isSubmitting || isPersonaSaving
      }
      nextLabel={isPersonaSaving ? 'Saving persona…' : 'Continue'}
    >
      {currentStep < 5 && submitError !== null ? (
        <p role="alert" className={styles.submitError}>
          {submitError}
        </p>
      ) : null}
      {renderStep()}
    </WizardShell>
  );
}

