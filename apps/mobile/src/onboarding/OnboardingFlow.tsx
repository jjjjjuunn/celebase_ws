// Onboarding wizard container — S2-S7 전체 6 step.
// PHI 안전: 모든 step 의 state 는 in-memory only. PHI 필드 (medical_conditions /
// medications) 는 S7 의 단일 POST 호출로만 BE 전송 — 다른 endpoint 절대 미경유.

import { useState } from 'react';

import { PersonaSelectStep } from './PersonaSelectStep';
import { BasicInfoStep } from './BasicInfoStep';
import { BodyMetricsStep } from './BodyMetricsStep';
import { ActivityHealthStep } from './ActivityHealthStep';
import { GoalsStep } from './GoalsStep';
import { RevealStep } from './RevealStep';
import type {
  ActivityHealthDraft,
  BasicInfoDraft,
  BodyMetricsDraft,
  GoalsDraft,
  OnboardingDraftComplete,
  PersonaDraft,
} from './types';

interface OnboardingFlowProps {
  /** S7 reveal 의 "홈으로" 호출 시점 — Claims feed 등으로 복귀. */
  onDone: () => void;
  /** 어느 단계든 ✕ 닫기 시 호출. */
  onClose: () => void;
}

type Step = 'persona' | 'basic' | 'metrics' | 'health' | 'goals' | 'reveal';

export function OnboardingFlow({ onDone, onClose }: OnboardingFlowProps): React.JSX.Element {
  const [step, setStep] = useState<Step>('persona');
  const [persona, setPersona] = useState<PersonaDraft | undefined>(undefined);
  const [basicInfo, setBasicInfo] = useState<BasicInfoDraft | undefined>(undefined);
  const [bodyMetrics, setBodyMetrics] = useState<BodyMetricsDraft | undefined>(undefined);
  const [activityHealth, setActivityHealth] = useState<ActivityHealthDraft | undefined>(undefined);
  const [goals, setGoals] = useState<GoalsDraft | undefined>(undefined);

  if (step === 'persona') {
    return (
      <PersonaSelectStep
        {...(persona !== undefined ? { initial: persona } : {})}
        onNext={(draft) => {
          setPersona(draft);
          setStep('basic');
        }}
        onClose={onClose}
      />
    );
  }

  if (step === 'basic') {
    return (
      <BasicInfoStep
        {...(basicInfo !== undefined ? { initial: basicInfo } : {})}
        onNext={(draft) => {
          setBasicInfo(draft);
          setStep('metrics');
        }}
        onBack={() => {
          setStep('persona');
        }}
        onClose={onClose}
      />
    );
  }

  if (step === 'metrics') {
    return (
      <BodyMetricsStep
        {...(bodyMetrics !== undefined ? { initial: bodyMetrics } : {})}
        onComplete={(draft) => {
          setBodyMetrics(draft);
          setStep('health');
        }}
        onBack={() => {
          setStep('basic');
        }}
        onClose={onClose}
      />
    );
  }

  if (step === 'health') {
    return (
      <ActivityHealthStep
        {...(activityHealth !== undefined ? { initial: activityHealth } : {})}
        onNext={(draft) => {
          setActivityHealth(draft);
          setStep('goals');
        }}
        onBack={() => {
          setStep('metrics');
        }}
        onClose={onClose}
      />
    );
  }

  if (step === 'goals') {
    return (
      <GoalsStep
        {...(goals !== undefined ? { initial: goals } : {})}
        onNext={(draft) => {
          setGoals(draft);
          setStep('reveal');
        }}
        onBack={() => {
          setStep('health');
        }}
        onClose={onClose}
      />
    );
  }

  // step === 'reveal'.
  // 본 시점에 도달하려면 위 5개 step 통과 — 모든 draft 가 정의돼야 함.
  if (
    persona === undefined ||
    basicInfo === undefined ||
    bodyMetrics === undefined ||
    activityHealth === undefined ||
    goals === undefined
  ) {
    // type-narrow guard. 실제 도달 불가 — 안전 fallback 으로 첫 step.
    setStep('persona');
    return <></>;
  }

  const complete: OnboardingDraftComplete = {
    persona,
    basicInfo,
    bodyMetrics,
    activityHealth,
    goals,
  };

  return (
    <RevealStep
      draft={complete}
      onDone={onDone}
      onBack={() => {
        setStep('goals');
      }}
    />
  );
}
