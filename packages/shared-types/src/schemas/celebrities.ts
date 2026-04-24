// Sprint A celebrities + base-diets wire schemas (IMPL-APP-001a-3).

import { z } from 'zod';
import { CelebrityCategory, DietType } from '../enums.js';
import type { BaseDiet, Celebrity } from '../entities.js';
import { IsoDateTime, UuidV7 } from './_utils.js';
import { MacroRatioSchema, SourceRefSchema } from '../jsonb/index.js';

export const CelebrityWireSchema = z.object({
  id: UuidV7,
  slug: z.string().min(1),
  display_name: z.string().min(1),
  short_bio: z.string().nullable(),
  avatar_url: z.string().url(),
  cover_image_url: z.string().url().nullable(),
  category: CelebrityCategory,
  tags: z.array(z.string()),
  is_featured: z.boolean(),
  sort_order: z.number().int(),
  is_active: z.boolean(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
});
export type CelebrityWire = z.infer<typeof CelebrityWireSchema>;

export const CelebrityListResponseSchema = z.object({
  items: z.array(CelebrityWireSchema),
  next_cursor: z.string().nullable(),
  has_next: z.boolean(),
});
export type CelebrityListResponse = z.infer<typeof CelebrityListResponseSchema>;

export const CelebrityDetailResponseSchema = z.object({
  celebrity: CelebrityWireSchema,
});
export type CelebrityDetailResponse = z.infer<typeof CelebrityDetailResponseSchema>;

// ── base_diets ──

export const BaseDietWireSchema = z.object({
  id: UuidV7,
  celebrity_id: UuidV7,
  name: z.string().min(1),
  description: z.string().nullable(),
  philosophy: z.string().nullable(),
  diet_type: DietType,
  avg_daily_kcal: z.number().min(0).nullable(),
  macro_ratio: MacroRatioSchema,
  included_foods: z.array(z.string()),
  excluded_foods: z.array(z.string()),
  key_supplements: z.array(z.string()),
  source_refs: z.array(SourceRefSchema),
  verified_by: z.string().nullable(),
  last_verified_at: IsoDateTime,
  version: z.number().int().min(1),
  is_active: z.boolean(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
});
export type BaseDietWire = z.infer<typeof BaseDietWireSchema>;

export const BaseDietDetailResponseSchema = z.object({
  base_diet: BaseDietWireSchema,
});
export type BaseDietDetailResponse = z.infer<typeof BaseDietDetailResponseSchema>;

export const CelebrityDietsResponseSchema = z.object({
  diets: z.array(BaseDietWireSchema),
});
export type CelebrityDietsResponse = z.infer<typeof CelebrityDietsResponseSchema>;

// Wire↔Row parity guards (D1).
const _celebrityWireRowParity = null as unknown as CelebrityWire satisfies {
  id: Celebrity['id'];
  slug: Celebrity['slug'];
  display_name: Celebrity['display_name'];
  short_bio: Celebrity['short_bio'];
  avatar_url: Celebrity['avatar_url'];
  cover_image_url: Celebrity['cover_image_url'];
  category: Celebrity['category'];
  tags: Celebrity['tags'];
  is_featured: Celebrity['is_featured'];
  sort_order: Celebrity['sort_order'];
  is_active: Celebrity['is_active'];
  created_at: string;
  updated_at: string;
};
void _celebrityWireRowParity;

const _baseDietWireRowParity = null as unknown as BaseDietWire satisfies {
  id: BaseDiet['id'];
  celebrity_id: BaseDiet['celebrity_id'];
  name: BaseDiet['name'];
  description: BaseDiet['description'];
  philosophy: BaseDiet['philosophy'];
  diet_type: BaseDiet['diet_type'];
  avg_daily_kcal: BaseDiet['avg_daily_kcal'];
  macro_ratio: BaseDiet['macro_ratio'];
  included_foods: BaseDiet['included_foods'];
  excluded_foods: BaseDiet['excluded_foods'];
  key_supplements: BaseDiet['key_supplements'];
  source_refs: BaseDiet['source_refs'];
  verified_by: BaseDiet['verified_by'];
  last_verified_at: string;
  version: BaseDiet['version'];
  is_active: BaseDiet['is_active'];
  created_at: string;
  updated_at: string;
};
void _baseDietWireRowParity;
