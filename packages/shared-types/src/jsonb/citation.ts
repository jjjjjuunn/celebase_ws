import { z } from 'zod';

// spec §5.8 — LLM Enhancement Layer Citation schema
// Mirrors Python CitationSource enum in services/meal-plan-engine/src/engine/llm_schema.py

export const CitationSourceSchema = z.enum([
  'celebrity_interview',
  'cookbook',
  'clinical_study',
  'usda_db',
  'nih_standard',
]);
export type CitationSource = z.infer<typeof CitationSourceSchema>;

export const CitationSchema = z
  .object({
    source_type: CitationSourceSchema,
    title: z.string().min(1).max(200),
    url: z.string().url().optional(),
    celeb_persona: z.string().min(1).max(100).optional(),
  })
  .refine(
    (data) => data.url !== undefined || data.celeb_persona !== undefined,
    { message: 'url 또는 celeb_persona 중 하나 필수 (spec §5.8 Citation 완전성)' },
  );
export type Citation = z.infer<typeof CitationSchema>;

export const CitationArraySchema = z.array(CitationSchema);
export type CitationArray = z.infer<typeof CitationArraySchema>;
