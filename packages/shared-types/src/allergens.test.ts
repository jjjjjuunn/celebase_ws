// Bidirectional allergen drift-guard (CHORE-ALLERGEN-VOCAB-001). Run via
// `tsx --test`. Reads the recipe allergen tag vocabulary from the ingredient
// seed and asserts it agrees with CANONICAL_ALLERGENS in BOTH directions:
//   - canonical ⊆ seed  → never offer an allergen no ingredient is tagged with
//                          (a dead filter = false protection).
//   - seed ⊆ canonical  → catch a DB mistag ("diary", "walnuts") that the engine
//                          would silently fail OPEN on (no canonical match).
// If the seed legitimately gains a new allergen, CANONICAL_ALLERGENS must be
// extended — forcing a conscious, reviewed decision rather than silent drift.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_ALLERGENS,
  CANONICAL_ALLERGEN_TAGS,
  normalizeAllergies,
} from './allergens.js';

// Walk up from this file until db/seeds/data/_ingredients.json is found.
function seedPath(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    const candidate = resolve(dir, 'db/seeds/data/_ingredients.json');
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error('could not locate db/seeds/data/_ingredients.json from test dir');
}

function seedAllergenTags(): Set<string> {
  const raw = readFileSync(seedPath(), 'utf8');
  const ingredients = JSON.parse(raw) as Array<{ allergens?: string[] }>;
  const tags = new Set<string>();
  for (const ing of ingredients) {
    for (const tag of ing.allergens ?? []) tags.add(tag.toLowerCase().trim());
  }
  return tags;
}

void test('canonical allergen tags ⊆ ingredient seed tags (no dead filters)', () => {
  const seed = seedAllergenTags();
  const missing = CANONICAL_ALLERGEN_TAGS.filter((t) => !seed.has(t));
  assert.deepEqual(
    missing,
    [],
    `Canonical tags absent from _ingredients.json (no ingredient carries them → filter is a no-op): ${missing.join(', ')}`,
  );
});

void test('ingredient seed tags ⊆ canonical tags (no un-offered / mistagged allergen)', () => {
  const seed = seedAllergenTags();
  const canonical = new Set(CANONICAL_ALLERGEN_TAGS);
  const extra = [...seed].filter((t) => !canonical.has(t));
  assert.deepEqual(
    extra,
    [],
    `Ingredient allergen tags not in CANONICAL_ALLERGENS (possible DB mistag that fails OPEN, or a new allergen to add to the vocab): ${extra.join(', ')}`,
  );
});

void test('canonical ids and labels are unique', () => {
  const ids = CANONICAL_ALLERGENS.map((a) => a.id);
  const labels = CANONICAL_ALLERGENS.map((a) => a.label);
  assert.equal(new Set(ids).size, ids.length, 'duplicate allergen id');
  assert.equal(new Set(labels).size, labels.length, 'duplicate allergen label');
});

void test('normalizeAllergies maps labels / legacy / tokens to canonical tags', () => {
  // Legacy mobile/web labels → canonical tokens.
  assert.deepEqual(normalizeAllergies(['Milk']), ['dairy']);
  assert.deepEqual(normalizeAllergies(['Wheat (gluten)']), ['gluten', 'wheat']);
  assert.deepEqual(normalizeAllergies(['Wheat / gluten']), ['gluten', 'wheat']);
  // Current labels + bare tags both resolve to the full group.
  assert.deepEqual(normalizeAllergies(['Milk / dairy']), ['dairy']);
  assert.deepEqual(normalizeAllergies(['wheat']), ['gluten', 'wheat']);
  // Already-canonical tokens are stable (idempotent).
  assert.deepEqual(normalizeAllergies(['dairy', 'peanuts']), ['dairy', 'peanuts']);
  assert.deepEqual(normalizeAllergies(normalizeAllergies(['Milk'])), ['dairy']);
  // De-dupes overlapping inputs.
  assert.deepEqual(normalizeAllergies(['gluten', 'wheat', 'Wheat / gluten']), ['gluten', 'wheat']);
  // Unknown custom free-text preserved (trimmed), not dropped.
  assert.deepEqual(normalizeAllergies(['  Mango  ']), ['Mango']);
  // Empties skipped.
  assert.deepEqual(normalizeAllergies(['', '   ', 'Milk']), ['dairy']);
});
