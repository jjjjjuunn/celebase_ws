// Plan 22-vast-adleman · Phase C1 — users.preferences JSONB
//
// Shape for the `users.preferences` column added by migration 0012.
// Updated via PATCH /users/me/preferences (RFC 7396 merge-patch) in
// user-service. Initial scope covers pantry carryover from silent-skip
// (Phase C2). Future plans add more preference keys here.

import { z } from 'zod';
import { UuidV7, IsoDateTime } from '../schemas/_utils.js';

// Why the ingredient carry-over happened. `skip` = user swiped a scheduled
// meal away on home; `exclude` = user excluded a slot during Plan Preview.
export const PantryEntrySourceSchema = z.enum(['skip', 'exclude']);
export type PantryEntrySource = z.infer<typeof PantryEntrySourceSchema>;

export const PantryEntrySchema = z.object({
  recipe_id: UuidV7,
  added_at: IsoDateTime,
  source: PantryEntrySourceSchema,
});
export type PantryEntry = z.infer<typeof PantryEntrySchema>;

// Root shape. Every field is optional because the column defaults to `{}`
// and the PATCH endpoint accepts partial merge-patch payloads.
export const UserPreferencesSchema = z
  .object({
    pantry: z.array(PantryEntrySchema).optional(),
  })
  .passthrough();
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

// Strict variant used for inbound PATCH validation — rejects unknown top-level
// keys so clients cannot silently write new paths until the schema is updated.
export const UserPreferencesPatchSchema = z
  .object({
    pantry: z.array(PantryEntrySchema).optional(),
  })
  .strict();
export type UserPreferencesPatch = z.infer<typeof UserPreferencesPatchSchema>;
