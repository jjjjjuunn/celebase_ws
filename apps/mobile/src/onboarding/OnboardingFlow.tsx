// Onboarding wizard container — S2-S4 step navigation + draft state.
// S5-S7 (PHI 입력 + persona-match + Reveal + 최종 POST) 는 후속 sub-task 에서
// 본 컴포넌트를 확장하여 추가한다.
//
// onComplete 시점에 호출자 (App.tsx) 가 draft 를 받아 다음 단계 placeholder
// 화면을 띄운다. 본 sub-task 는 BE 호출 0 — 클라이언트 메모리 only.

import { useState } from 'react';

import { PersonaSelectStep } from './PersonaSelectStep';
import { BasicInfoStep } from './BasicInfoStep';
import { BodyMetricsStep } from './BodyMetricsStep';
import type {
  BasicInfoDraft,
  BodyMetricsDraft,
  OnboardingDraftS2S4,
  PersonaDraft,
} from './types';

interface OnboardingFlowProps {
  /** S4 완료 후 호출 — 본 sub-task 에서는 placeholder 화면 트리거. */
  onComplete: (draft: OnboardingDraftS2S4) => void;
  /** 어느 단계든 ✕ 닫기 시 호출 — Claims feed 등 외부 화면으로 복귀. */
  onClose: () => void;
}

type Step = 'persona' | 'basic' | 'metrics';

export function OnboardingFlow({ onComplete, onClose }: OnboardingFlowProps): React.JSX.Element {
  const [step, setStep] = useState<Step>('persona');
  const [persona, setPersona] = useState<PersonaDraft | undefined>(undefined);
  const [basicInfo, setBasicInfo] = useState<BasicInfoDraft | undefined>(undefined);

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

  return (
    <BodyMetricsStep
      onComplete={(metricsDraft: BodyMetricsDraft) => {
        // 본 sub-task 의 unique 진입 — 위 두 단계 통과해야 도달.
        // persona / basicInfo 가 undefined 일 수 없지만 type-narrow guard.
        if (persona === undefined || basicInfo === undefined) {
          setStep('persona');
          return;
        }
        onComplete({ persona, basicInfo, bodyMetrics: metricsDraft });
      }}
      onBack={() => {
        setStep('basic');
      }}
      onClose={onClose}
    />
  );
}
