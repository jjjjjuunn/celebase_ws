// Sprint A wire-schema primitives (IMPL-APP-001a-1).
//
// Wire shape = the JSON that travels between BFF and BE.
// Row shape  = the DB/entity type defined in `entities.ts` (Date objects, etc.).
//
// Timestamps are `string` on the wire (ISO 8601); consumers coerce to `Date` at the
// call site via `new Date(wire.created_at)`. JSONB columns keep the same `z.infer`
// instance as the row type — wire/row parity is by construction for them.
//
// ApiError / CursorParams / JSONB schemas stay in their existing module paths
// (`../api/common.js`, `../jsonb/index.js`) and are already re-exported from the
// package barrel (`src/index.ts`), so no duplication here.

import { z } from 'zod';

export const IsoDateTime = z.string().datetime({ offset: true });
export const UuidV7 = z.string().uuid();

/**
 * PHI paths that must be redacted before logging / response-forwarding.
 * Mirrors `packages/service-core/src/logger.ts` value-for-value, with the BFF-specific
 * additions (`intolerances`, `id_token`) appended. Keep in sync on any BE change.
 *
 * Pino `redact.paths` uses `*` to match a single level. Deeper nesting uses `*.*.<key>`.
 */
export const PhiRedactKeys = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.authorization',
  '*.cookie',
  '*.access_token',
  '*.refresh_token',
  '*.biomarkers',
  '*.height',
  '*.height_cm',
  '*.weight',
  '*.weight_kg',
  '*.body_fat_pct',
  '*.medical_conditions',
  '*.medications',
  '*.allergies',
  'DATABASE_URL',
  '*.intolerances',
  '*.id_token',
] as const;
