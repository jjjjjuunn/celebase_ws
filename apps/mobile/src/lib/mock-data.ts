// Mock celebrity data — content-service (BE) 미배포 동안 UI 개발용.
// 실 데이터 연결 시 src/services/celebrities.ts 의 listCelebrities() 응답으로 교체.
// 사진은 라이선스 이슈 (content.md "셀러브리티 이미지: 라이선스 확인 후 사용")로
// placeholder accent box + 이니셜 로 대체 — 실 사진은 BE 연결 시.

export type CelebGender = 'women' | 'men';

/** 카드 placeholder 색상 — design-tokens 의 accent/semantic 키만 사용 (raw hex 금지). */
export type CelebAccentToken =
  | '--cb-accent-biohacker'
  | '--cb-accent-glp1'
  | '--cb-accent-aspirational'
  | '--cb-brand-500'
  | '--cb-info-600'
  | '--cb-success-600';

export interface CelebWorkout {
  /** 운동 종류 — e.g. 'Pilates', 'Weight training'. */
  type: string;
  /** 빈도 — e.g. '5x / week'. */
  frequency: string;
  /** 1회 지속시간 — e.g. '45 min'. */
  duration: string;
}

export interface MockCelebrity {
  id: string;
  slug: string;
  name: string;
  gender: CelebGender;
  /** 식단·루틴(라이프스타일)을 나타내는 해시태그 2-3개 (카드에 표시). */
  hashtags: string[];
  accent: CelebAccentToken;
  bio: {
    heightCm: number;
    weightKg: number;
    age: number;
    /** 본인이 알려진 운동 루틴이 있을 때만. */
    workout?: CelebWorkout;
  };
  /** 하루 평균 대표 매크로 (탄단지) — 표 기본 3열. */
  macros: { carbsG: number; proteinG: number; fatG: number };
  /** 식단 철학 · 루틴 설명. */
  philosophy: string;
}

export const MOCK_CELEBRITIES: ReadonlyArray<MockCelebrity> = [
  {
    id: 'c1',
    slug: 'zendaya',
    name: 'Zendaya',
    gender: 'women',
    hashtags: ['Mediterranean', 'Pilates', 'PlantForward'],
    accent: '--cb-accent-aspirational',
    bio: {
      heightCm: 178,
      weightKg: 59,
      age: 28,
      workout: { type: 'Pilates', frequency: '4x / week', duration: '50 min' },
    },
    macros: { carbsG: 210, proteinG: 95, fatG: 70 },
    philosophy:
      'Balanced Mediterranean-style eating with plenty of vegetables, lean protein, and olive oil. Movement is kept low-impact and consistent rather than intense.',
  },
  {
    id: 'c2',
    slug: 'hailey-bieber',
    name: 'Hailey Bieber',
    gender: 'women',
    hashtags: ['HighProtein', 'Strength', 'GutHealth'],
    accent: '--cb-accent-glp1',
    bio: {
      heightCm: 170,
      weightKg: 52,
      age: 28,
      workout: { type: 'Strength training', frequency: '5x / week', duration: '45 min' },
    },
    macros: { carbsG: 180, proteinG: 110, fatG: 65 },
    philosophy:
      'Protein-forward meals built around whole foods, with a focus on gut health and hydration. Strength sessions emphasize form over heavy load.',
  },
  {
    id: 'c3',
    slug: 'beyonce',
    name: 'Beyoncé',
    gender: 'women',
    hashtags: ['PlantBased', 'HIIT', 'Hydration'],
    accent: '--cb-accent-biohacker',
    bio: {
      heightCm: 169,
      weightKg: 61,
      age: 43,
      workout: { type: 'HIIT', frequency: '5x / week', duration: '60 min' },
    },
    macros: { carbsG: 195, proteinG: 90, fatG: 60 },
    philosophy:
      'Plant-based phases around performance cycles, paired with high-intensity interval training. Emphasis on hydration and recovery between shows.',
  },
  {
    id: 'c4',
    slug: 'jennifer-aniston',
    name: 'Jennifer Aniston',
    gender: 'women',
    hashtags: ['IntermittentFasting', 'Yoga', 'CleanEating'],
    accent: '--cb-brand-500',
    bio: {
      heightCm: 164,
      weightKg: 51,
      age: 56,
      workout: { type: 'Yoga', frequency: '4x / week', duration: '60 min' },
    },
    macros: { carbsG: 160, proteinG: 85, fatG: 62 },
    philosophy:
      'A 16:8 intermittent fasting window with clean, minimally processed meals. Yoga and Pvolve-style movement keep training joint-friendly.',
  },
  {
    id: 'c5',
    slug: 'gwyneth-paltrow',
    name: 'Gwyneth Paltrow',
    gender: 'women',
    hashtags: ['Paleo', 'ColdPlunge', 'Detox'],
    accent: '--cb-info-600',
    bio: {
      heightCm: 175,
      weightKg: 57,
      age: 52,
      workout: { type: 'Pilates', frequency: '5x / week', duration: '55 min' },
    },
    macros: { carbsG: 150, proteinG: 88, fatG: 75 },
    philosophy:
      'Mostly paleo-leaning meals with seasonal produce, plus contrast therapy like cold plunges. Wellness rituals are treated as daily non-negotiables.',
  },
  {
    id: 'c6',
    slug: 'madison-beer',
    name: 'Madison Beer',
    gender: 'women',
    hashtags: ['Balanced', 'Dance', 'Mindset'],
    accent: '--cb-success-600',
    bio: {
      heightCm: 165,
      weightKg: 54,
      age: 26,
      workout: { type: 'Dance cardio', frequency: '3x / week', duration: '40 min' },
    },
    macros: { carbsG: 200, proteinG: 80, fatG: 68 },
    philosophy:
      'A no-restriction, balanced approach that prioritizes mental health alongside food. Dance-based cardio keeps training enjoyable rather than punishing.',
  },
  {
    id: 'c7',
    slug: 'chris-hemsworth',
    name: 'Chris Hemsworth',
    gender: 'men',
    hashtags: ['HighProtein', 'Hypertrophy', 'Recovery'],
    accent: '--cb-accent-biohacker',
    bio: {
      heightCm: 191,
      weightKg: 91,
      age: 41,
      workout: { type: 'Hypertrophy training', frequency: '6x / week', duration: '75 min' },
    },
    macros: { carbsG: 320, proteinG: 200, fatG: 90 },
    philosophy:
      'High-volume, protein-dense eating to support muscle-building blocks for film roles. Training is periodized with deliberate recovery and mobility work.',
  },
  {
    id: 'c8',
    slug: 'lebron-james',
    name: 'LeBron James',
    gender: 'men',
    hashtags: ['Performance', 'Strength', 'Sleep'],
    accent: '--cb-accent-aspirational',
    bio: {
      heightCm: 206,
      weightKg: 113,
      age: 40,
      workout: { type: 'Strength & conditioning', frequency: '6x / week', duration: '90 min' },
    },
    macros: { carbsG: 380, proteinG: 220, fatG: 110 },
    philosophy:
      'Performance-first nutrition timed around training and games, with a famous emphasis on sleep as the foundation of recovery.',
  },
  {
    id: 'c9',
    slug: 'cristiano-ronaldo',
    name: 'Cristiano Ronaldo',
    gender: 'men',
    hashtags: ['LeanProtein', 'Cardio', 'SmallMeals'],
    accent: '--cb-brand-500',
    bio: {
      heightCm: 187,
      weightKg: 85,
      age: 40,
      workout: { type: 'Football conditioning', frequency: '6x / week', duration: '90 min' },
    },
    macros: { carbsG: 300, proteinG: 190, fatG: 80 },
    philosophy:
      'Six small meals a day built on lean protein, whole grains, and fish. Training blends explosive conditioning with disciplined recovery and hydration.',
  },
  {
    id: 'c10',
    slug: 'zac-efron',
    name: 'Zac Efron',
    gender: 'men',
    hashtags: ['Pescatarian', 'Functional', 'WholeFoods'],
    accent: '--cb-info-600',
    bio: {
      heightCm: 173,
      weightKg: 77,
      age: 37,
      workout: { type: 'Functional training', frequency: '5x / week', duration: '60 min' },
    },
    macros: { carbsG: 260, proteinG: 170, fatG: 85 },
    philosophy:
      'A whole-foods, largely pescatarian diet with minimal processed sugar. Functional training favors varied, athletic movement over isolation lifts.',
  },
  {
    id: 'c11',
    slug: 'mark-wahlberg',
    name: 'Mark Wahlberg',
    gender: 'men',
    hashtags: ['EarlyRiser', 'HighProtein', '5amClub'],
    accent: '--cb-accent-glp1',
    bio: {
      heightCm: 173,
      weightKg: 80,
      age: 53,
      workout: { type: 'Weight training', frequency: '6x / week', duration: '70 min' },
    },
    macros: { carbsG: 280, proteinG: 210, fatG: 95 },
    philosophy:
      'A famously early daily schedule with multiple protein-rich meals and structured weight training. Consistency and routine are the core principles.',
  },
  {
    id: 'c12',
    slug: 'david-beckham',
    name: 'David Beckham',
    gender: 'men',
    hashtags: ['Mediterranean', 'Endurance', 'Balance'],
    accent: '--cb-success-600',
    bio: {
      heightCm: 183,
      weightKg: 75,
      age: 49,
      workout: { type: 'Mixed cardio & strength', frequency: '5x / week', duration: '60 min' },
    },
    macros: { carbsG: 240, proteinG: 150, fatG: 78 },
    philosophy:
      'A Mediterranean-leaning diet with fish, vegetables, and olive oil, balanced across endurance and strength work to stay athletic year-round.',
  },
];

/** gender 로 필터링한 mock 셀럽 목록. */
export function getMockCelebritiesByGender(
  gender: CelebGender,
): ReadonlyArray<MockCelebrity> {
  return MOCK_CELEBRITIES.filter((c) => c.gender === gender);
}

/** slug 로 단일 mock 셀럽 조회 — CelebrityDetail 화면용. */
export function getMockCelebrityBySlug(slug: string): MockCelebrity | undefined {
  return MOCK_CELEBRITIES.find((c) => c.slug === slug);
}
