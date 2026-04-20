'use client';

import type { ReactElement, ReactNode } from 'react';
import styles from './WizardShell.module.css';

export interface WizardStep {
  label: string;
}

export interface WizardShellProps {
  steps: WizardStep[];
  currentStep: number;
  onNext: () => void;
  onBack: () => void;
  isNextDisabled?: boolean;
  nextLabel?: string;
  backLabel?: string;
  children: ReactNode;
}

export function WizardShell({
  steps,
  currentStep,
  onNext,
  onBack,
  isNextDisabled = false,
  nextLabel = 'Continue',
  backLabel = 'Back',
  children,
}: WizardShellProps): ReactElement {
  const totalSteps = steps.length;
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;
  const stepLabel = steps[currentStep]?.label ?? '';

  return (
    <div className={styles.root}>
      <nav
        className={styles.progress}
        aria-label="Wizard progress"
      >
        <ol className={styles.stepList} role="list">
          {steps.map((step, index) => {
            const state =
              index < currentStep
                ? 'completed'
                : index === currentStep
                  ? 'current'
                  : 'upcoming';
            return (
              <li
                key={step.label}
                className={[styles.stepItem, styles[state]].join(' ')}
                aria-label={`Step ${String(index + 1)}: ${step.label}${state === 'completed' ? ' (completed)' : state === 'current' ? ' (current)' : ''}`}
                aria-current={state === 'current' ? 'step' : undefined}
              >
                <span className={styles.stepDot} aria-hidden="true" />
              </li>
            );
          })}
        </ol>
        <p className={styles.stepCounter} aria-live="polite">
          Step {currentStep + 1} of {totalSteps}: {stepLabel}
        </p>
      </nav>

      <main className={styles.content}>
        {children}
      </main>

      <footer className={styles.footer}>
        <button
          type="button"
          className={[styles.btn, styles.btnBack].join(' ')}
          onClick={onBack}
          disabled={isFirst}
          aria-disabled={isFirst || undefined}
        >
          {backLabel}
        </button>
        <button
          type="button"
          className={[styles.btn, styles.btnNext].join(' ')}
          onClick={onNext}
          disabled={isNextDisabled}
          aria-disabled={isNextDisabled || undefined}
        >
          {isLast ? 'Finish' : nextLabel}
        </button>
      </footer>
    </div>
  );
}
