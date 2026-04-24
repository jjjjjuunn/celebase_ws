export const CITATION_TYPES = [
  'celebrity_interview',
  'cookbook',
  'clinical_study',
  'usda_db',
  'nih_standard',
] as const;

export type CitationType = typeof CITATION_TYPES[number];

export const CITATION_LABELS_KO: Record<CitationType, string> = {
  celebrity_interview: '셀럽 인터뷰',
  cookbook: '요리책',
  clinical_study: '임상 연구',
  usda_db: '농무부(USDA) 데이터',
  nih_standard: '국립보건원(NIH) 기준',
};
