import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadIngredients } from './loaders/ingredientLoader.js';
import { loadCelebrity } from './loaders/celebrityLoader.js';
import type { SeedIngredient, SeedCelebrity } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://celebbase:devpw@localhost:5432/celebbase_dev';

const CELEBRITY_FILES = [
  'ariana-grande',
  'beyonce',
  'gwyneth-paltrow',
  'cristiano-ronaldo',
  'lebron-james',
  'dwayne-johnson',
  'natalie-portman',
  'joaquin-phoenix',
  'jennifer-aniston',
  'tom-brady',
];

function readJson<T>(relativePath: string): T {
  const raw = readFileSync(join(__dirname, relativePath), 'utf-8');
  return JSON.parse(raw) as T;
}

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Load shared ingredients
    const ingredients = readJson<SeedIngredient[]>('data/_ingredients.json');
    const ingredientMap = await loadIngredients(client, ingredients);
    console.log(`[seed] Loaded ${ingredientMap.size} ingredients`);

    // 2. Load each celebrity
    for (const file of CELEBRITY_FILES) {
      const celeb = readJson<SeedCelebrity>(`data/${file}.json`);
      await loadCelebrity(client, celeb, ingredientMap);
      console.log(`[seed] Loaded ${celeb.display_name} (${celeb.recipes.length} recipes)`);
    }

    await client.query('COMMIT');
    console.log('[seed] Done — all data committed.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seed] FAILED — rolled back:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
