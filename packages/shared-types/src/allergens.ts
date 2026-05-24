// Canonical allergen vocabulary — the single source of truth shared by clients
// (onboarding chips), the user-service write path (normalization), and the
// allergen drift-guard. CHORE-ALLERGEN-VOCAB-001.
//
// WHY tokens, not labels: the meal-plan engine filters allergens by EXACT
// case-insensitive equality against recipe allergen tags, which derive from
// `ingredients.allergens` (db/seeds/data/_ingredients.json). Those tags are the
// lowercase strings below (e.g. "tree nuts" WITH a space, "dairy" not "milk").
// A chip emitting the display label "Milk" produced `milk`, which never matched
// the tag `dairy` — so the allergy silently failed to filter. Clients must emit
// the `tags`, and the server normalizes any legacy/label input to them.
//
// `tags` MUST match the ingredient tag strings verbatim. The bidirectional
// drift-guard test (allergens.test.ts) fails CI if these and the seed diverge.

/** One user-selectable allergen mapped to the recipe allergen tag(s) it blocks. */
export interface CanonicalAllergen {
  /** Stable code key (never shown to users). */
  readonly id: string;
  /** User-facing chip label. */
  readonly label: string;
  /**
   * The recipe allergen tag string(s) this selection blocks — verbatim ingredient
   * tags. Usually one; "Wheat / gluten" maps to BOTH because the seed co-tags
   * wheat-containing items and a gluten-only/wheat-only item must each still block.
   */
  readonly tags: readonly string[];
}

export const CANONICAL_ALLERGENS: readonly CanonicalAllergen[] = [
  { id: 'peanuts', label: 'Peanuts', tags: ['peanuts'] },
  { id: 'tree_nuts', label: 'Tree nuts', tags: ['tree nuts'] },
  { id: 'dairy', label: 'Milk / dairy', tags: ['dairy'] },
  { id: 'eggs', label: 'Eggs', tags: ['eggs'] },
  { id: 'gluten', label: 'Wheat / gluten', tags: ['gluten', 'wheat'] },
  { id: 'soy', label: 'Soy', tags: ['soy'] },
  { id: 'shellfish', label: 'Shellfish', tags: ['shellfish'] },
  { id: 'fish', label: 'Fish', tags: ['fish'] },
  { id: 'sesame', label: 'Sesame', tags: ['sesame'] },
];

/** Flat, de-duplicated set of every canonical allergen tag. */
export const CANONICAL_ALLERGEN_TAGS: readonly string[] = [
  ...new Set(CANONICAL_ALLERGENS.flatMap((a) => a.tags)),
];

// Resolution map: any recognized form (id, label, tag, or known legacy alias),
// lowercased+trimmed, → the full tag set of the canonical allergen it belongs to.
// Resolving to the FULL set means a user who stored just "wheat" still blocks the
// whole gluten group.
const RESOLVE = new Map<string, readonly string[]>();
for (const a of CANONICAL_ALLERGENS) {
  for (const form of [a.id, a.label, ...a.tags]) {
    RESOLVE.set(form.toLowerCase().trim(), a.tags);
  }
}
// Legacy values previously emitted by clients that don't equal any current
// id/label/tag (so they need an explicit alias → id mapping).
const LEGACY_ALIASES: Readonly<Record<string, string>> = {
  milk: 'dairy', // old mobile chip "Milk"
  'wheat (gluten)': 'gluten', // old mobile chip "Wheat (gluten)"
};
for (const [alias, id] of Object.entries(LEGACY_ALIASES)) {
  const allergen = CANONICAL_ALLERGENS.find((a) => a.id === id);
  if (allergen) RESOLVE.set(alias, allergen.tags);
}

/**
 * Normalize stored/incoming allergy strings to canonical tags.
 *
 * Recognized forms (canonical id/label/tag or a known legacy label) expand to
 * the canonical allergen's full tag set. Unknown strings (e.g. a user's custom
 * free-text entry) are preserved trimmed — they simply won't match a recipe tag
 * until the custom-allergy autocomplete ships. Output is de-duplicated.
 *
 * Applied authoritatively at the user-service bio-profile write path so the
 * stored `allergies`/`intolerances` are always canonical regardless of client
 * version or input surface.
 */
export function normalizeAllergies(input: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of input) {
    const key = raw.toLowerCase().trim();
    if (key === '') continue;
    const tags = RESOLVE.get(key);
    if (tags !== undefined) {
      out.push(...tags);
    } else {
      out.push(raw.trim());
    }
  }
  return [...new Set(out)];
}
