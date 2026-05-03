// Plan 22 · Phase D2 — canonical unit mapping + name normalization for ingredient
// aggregation. Shared by the BFF aggregate route and the Plan Preview client so the
// same keying rule is used when the FE recomputes subtotals optimistically.
//
// `recipes.ingredients` carries free-form units entered per recipe. Identical
// ingredients (same `name_normalized`) may appear with `g` vs `kg` vs `oz` across
// recipes. We project into SI units where possible:
//   mass:   mg|g|kg|oz|lb         → grams
//   volume: ml|l|cup|tbsp|tsp|floz → millilitres
// Mismatched dimensions under the same name (`g` vs `cup`) are reported as
// `unit_conflicts` rather than silently summed.

export type CanonicalUnit = 'g' | 'ml' | 'count';

export interface CanonicalizedQuantity {
  canonical_unit: CanonicalUnit;
  qty: number;
}

const MASS_TO_GRAMS: Record<string, number> = {
  mg: 0.001,
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
};

const VOLUME_TO_MILLILITRES: Record<string, number> = {
  ml: 1,
  millilitre: 1,
  milliliter: 1,
  l: 1000,
  litre: 1000,
  liter: 1000,
  cup: 240,
  cups: 240,
  tbsp: 14.7868,
  tablespoon: 14.7868,
  tablespoons: 14.7868,
  tsp: 4.92892,
  teaspoon: 4.92892,
  teaspoons: 4.92892,
  floz: 29.5735,
  'fl oz': 29.5735,
  pint: 473.176,
  quart: 946.353,
  gallon: 3785.41,
};

const COUNT_UNITS = new Set([
  '',
  'count',
  'piece',
  'pieces',
  'unit',
  'units',
  'slice',
  'slices',
  'clove',
  'cloves',
  'each',
  'item',
  'items',
  'whole',
]);

export function normalizeName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '');
}

export function canonicalize(unit: string, qty: number): CanonicalizedQuantity | null {
  const key = unit.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(MASS_TO_GRAMS, key)) {
    return { canonical_unit: 'g', qty: qty * MASS_TO_GRAMS[key]! };
  }
  if (Object.prototype.hasOwnProperty.call(VOLUME_TO_MILLILITRES, key)) {
    return { canonical_unit: 'ml', qty: qty * VOLUME_TO_MILLILITRES[key]! };
  }
  if (COUNT_UNITS.has(key)) {
    return { canonical_unit: 'count', qty };
  }
  return null;
}

export function aggregationKey(name: string, canonicalUnit: CanonicalUnit): string {
  return `${normalizeName(name)}:${canonicalUnit}`;
}
