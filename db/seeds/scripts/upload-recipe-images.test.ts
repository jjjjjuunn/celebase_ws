/**
 * Unit tests for upload-recipe-images pure helpers. Run: `tsx --test` (db has no jest).
 * Pure lib only — no S3/DB/env.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildRecipeIndex,
  normalizeTitle,
  parseCsv,
  planMatch,
  recipeKey,
  sanitizeTargetFilename,
  slugify,
  type DbRecipeRow,
  type ShotlistRow,
} from './upload-recipe-images.lib.js';

test('slugify: case, spaces, punctuation, diacritics', () => {
  assert.equal(slugify('Smoked Salmon and Egg Plate'), 'smoked-salmon-and-egg-plate');
  assert.equal(slugify('Açaí Bowl (No Sugar!)'), 'acai-bowl-no-sugar');
  assert.equal(slugify('  Trim—Me  '), 'trim-me');
});

test('normalizeTitle: NBSP, smart quotes, whitespace, case all converge', () => {
  // straight vs smart quote + NBSP + double space + case → identical key
  const a = normalizeTitle("Chef's  Special Bowl");
  const b = normalizeTitle('Chef’s Special  Bowl');
  assert.equal(a, b);
  assert.equal(a, "chef's special bowl");
});

test('parseCsv: quoted fields with commas and escaped quotes', () => {
  const csv =
    'celebrity_slug,title,target_filename,description\n' +
    'jen,"Eggs, Bacon, Toast",jen__eggs.png,"He said ""hi"", then ate"\n' +
    'bey,Simple Bowl,bey__simple-bowl.png,plain\n';
  const rows = parseCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'Eggs, Bacon, Toast');
  assert.equal(rows[0].description, 'He said "hi", then ate');
  assert.equal(rows[0].target_filename, 'jen__eggs.png');
  assert.equal(rows[1].title, 'Simple Bowl');
});

test('sanitizeTargetFilename: rejects traversal / separators / empty', () => {
  assert.equal(sanitizeTargetFilename('jen__eggs.png'), 'jen__eggs.png');
  assert.equal(sanitizeTargetFilename('../secret.png'), null);
  assert.equal(sanitizeTargetFilename('a/b.png'), null);
  assert.equal(sanitizeTargetFilename('a\\b.png'), null);
  assert.equal(sanitizeTargetFilename('..'), null);
  assert.equal(sanitizeTargetFilename(''), null);
  assert.equal(sanitizeTargetFilename('bad\0.png'), null);
});

test('buildRecipeIndex + planMatch: matched / missingFile / noDbMatch / ambiguous / extraFiles / invalid', () => {
  const db: DbRecipeRow[] = [
    { id: 'r1', slug: 'jen', title: 'Smoked Salmon and Egg Plate' },
    { id: 'r2', slug: 'bey', title: 'Simple Bowl' },
    // duplicate (celeb,title) → ambiguous
    { id: 'r3a', slug: 'dup', title: 'Twin Dish' },
    { id: 'r3b', slug: 'dup', title: 'Twin Dish' },
  ];
  const index = buildRecipeIndex(db);
  assert.deepEqual(index.get(recipeKey('jen', 'smoked salmon and egg plate')), ['r1']);

  const csv: ShotlistRow[] = [
    { celebrity_slug: 'jen', title: 'Smoked Salmon and Egg Plate', target_filename: 'jen__salmon.png' }, // matched
    { celebrity_slug: 'bey', title: 'Simple Bowl', target_filename: 'bey__simple.png' }, // missingFile (not in dir)
    { celebrity_slug: 'jen', title: 'Nonexistent Dish', target_filename: 'jen__nope.png' }, // noDbMatch
    { celebrity_slug: 'dup', title: 'Twin Dish', target_filename: 'dup__twin.png' }, // ambiguous
    { celebrity_slug: 'jen', title: 'Bad Name', target_filename: '../escape.png' }, // invalid
  ];
  const dirFiles = new Set(['jen__salmon.png', 'jen__nope.png', 'dup__twin.png', 'orphan.png']);
  const plan = planMatch(csv, index, dirFiles);

  assert.equal(plan.matched.length, 1);
  assert.deepEqual(plan.matched[0], {
    recipeId: 'r1',
    celebSlug: 'jen',
    title: 'Smoked Salmon and Egg Plate',
    filename: 'jen__salmon.png',
  });
  assert.equal(plan.missingFile.length, 1);
  assert.equal(plan.missingFile[0].celebrity_slug, 'bey');
  assert.equal(plan.noDbMatch.length, 1);
  assert.equal(plan.noDbMatch[0].title, 'Nonexistent Dish');
  assert.equal(plan.ambiguous.length, 1);
  assert.deepEqual(plan.ambiguous[0].ids, ['r3a', 'r3b']);
  assert.equal(plan.invalidFilename.length, 1);
  // orphan.png is in dir but not in CSV; ../escape.png is invalid so never referenced
  assert.deepEqual(plan.extraFiles.sort(), ['orphan.png']);
});
