// Mock news articles — content-service trend intelligence (spec.md §Trend) 연결 시 교체.
// NewsScreen(feed) 과 NewsDetailScreen 이 동일 source 를 import 한다.
// content.md "자동 게시 금지: 편집팀 수동 승인 후에만 노출" — 실 연결 시 published 만.

export type NewsCategory = 'beauty' | 'diet' | 'wellness';

export interface NewsArticle {
  id: string;
  category: NewsCategory;
  title: string;
  source: string;
  /** 발행 표시용 상대 시간 — mock. */
  postedAt: string;
  readMinutes: number;
  /** 본문 문단 — mock. */
  body: string[];
}

export const NEWS_CATEGORIES: ReadonlyArray<{ key: NewsCategory; label: string }> = [
  { key: 'beauty', label: 'Beauty' },
  { key: 'diet', label: 'Diet' },
  { key: 'wellness', label: 'Wellness & Fitness' },
];

export const NEWS_ARTICLES: ReadonlyArray<NewsArticle> = [
  {
    id: 'n1',
    category: 'diet',
    title: 'Why high-protein breakfasts are having a moment',
    source: 'The Wellness Edit',
    postedAt: '2h ago',
    readMinutes: 4,
    body: [
      'Front-loading protein at breakfast has moved from gym-bro advice to mainstream nutrition guidance. The logic is simple: a 30-to-40 gram protein hit early in the day blunts mid-morning cravings, steadies blood sugar, and protects lean mass as we age.',
      'Dietitians caution that the source matters as much as the number. Eggs, Greek yogurt, cottage cheese, tofu scrambles, and protein-forward smoothies all clear the bar, while most cereals and pastries fall far short despite marketing claims.',
      'The practical takeaway is to treat breakfast as the anchor meal rather than an afterthought — and to pair the protein with fiber and a little fat so the satiety actually lasts until lunch.',
    ],
  },
  {
    id: 'n2',
    category: 'wellness',
    title: 'Cold plunges, explained: what the science actually says',
    source: 'Recovery Lab',
    postedAt: '5h ago',
    readMinutes: 6,
    body: [
      'Cold-water immersion has exploded across recovery culture, but the evidence is more nuanced than the highlight reels suggest. Short exposures appear to reduce perceived soreness and can sharpen mood and alertness through a sympathetic-nervous-system spike.',
      'The trade-off: plunging immediately after strength training may blunt some of the muscle-building signal you just worked for. Most researchers suggest separating cold exposure from hypertrophy sessions by several hours.',
      'For most people the safe, useful protocol is brief and consistent rather than extreme — a few minutes in genuinely cold water, a handful of times per week, with warming up done actively afterward.',
    ],
  },
  {
    id: 'n3',
    category: 'beauty',
    title: 'The skin-barrier routine dermatologists keep recommending',
    source: 'Glow Journal',
    postedAt: '1d ago',
    readMinutes: 5,
    body: [
      'After years of acid-heavy, multi-step regimens, dermatologists are steering patients back toward barrier repair. The shift is a response to a wave of over-exfoliated, sensitized skin that no serum can fix on its own.',
      'The core routine is unglamorous: a gentle cleanser, a humectant-and-ceramide moisturizer, and daily SPF. Actives like retinoids are reintroduced slowly, only once the barrier feels calm.',
      'The reminder beneath the trend is that consistency beats novelty. A short routine done every day outperforms an elaborate one your skin can not tolerate.',
    ],
  },
  {
    id: 'n4',
    category: 'diet',
    title: 'Mediterranean vs. plant-based: how the celebrity plates compare',
    source: 'Plate & Performance',
    postedAt: '1d ago',
    readMinutes: 8,
    body: [
      'Two eating patterns dominate celebrity wellness talk: the Mediterranean approach, rich in olive oil, fish, and vegetables, and fully plant-based plates built around legumes, whole grains, and produce.',
      'Both score well for heart health and longevity markers in the research. The Mediterranean pattern makes hitting protein and omega-3 targets easier, while a well-planned plant-based diet shines on fiber and phytonutrients but needs attention to B12, iron, and protein variety.',
      'The honest conclusion is that adherence wins. The best pattern is the nutrient-dense one a given person will actually stick with across seasons and travel.',
    ],
  },
  {
    id: 'n5',
    category: 'wellness',
    title: 'Sleep is the new supplement: routines from elite athletes',
    source: 'Recovery Lab',
    postedAt: '2d ago',
    readMinutes: 7,
    body: [
      'Ask a professional athlete about their edge and the answer is increasingly about sleep, not a powder. Sleep is when growth hormone peaks, glycogen restocks, and the nervous system resets for the next session.',
      'The protocols are consistent: a fixed wake time, a cool dark room, caffeine cut-offs in the early afternoon, and a wind-down that pulls screens out of the last hour. Many add short, strategic naps rather than chasing one heroic night.',
      'For non-athletes the message is the same — regularity matters more than any single perfect night, and the gains compound quietly over weeks.',
    ],
  },
  {
    id: 'n6',
    category: 'beauty',
    title: 'Inside the 5-step morning routine that took over your feed',
    source: 'Glow Journal',
    postedAt: '3d ago',
    readMinutes: 4,
    body: [
      'The viral morning routine — light first, water, movement, protein, then sunlight again — is less a beauty hack than a circadian one. Each step nudges the body clock toward an earlier, more stable rhythm.',
      'Skin and energy benefits follow indirectly: better-timed light and earlier meals improve sleep, and better sleep is what actually shows up on your face.',
      'Stripped of the aesthetic packaging, it is a reminder that the most photogenic routines usually work because of boring fundamentals, not the props.',
    ],
  },
];

export function getNewsArticlesByCategory(category: NewsCategory): ReadonlyArray<NewsArticle> {
  return NEWS_ARTICLES.filter((a) => a.category === category);
}

export function getNewsArticle(id: string): NewsArticle | undefined {
  return NEWS_ARTICLES.find((a) => a.id === id);
}
