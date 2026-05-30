import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadIngredients } from './loaders/ingredientLoader.js';
import { loadCelebrity } from './loaders/celebrityLoader.js';
import { loadClaims, type SeedClaimsFile } from './loaders/claimsLoader.js';
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
  // CHORE-SEEDS-BASE-DIET-TIER1-001 — Tier-1 base_diet 확장 (design handoff §3).
  // 각 slug 는 data/<slug>.json + lifestyle-claims/<slug>.json 둘 다 필요.
  // (Cameron Diaz 는 allowlist 가능한 1차 출처 부재로 보류 — handoff back §3.)
  'tia-clair-toomey',
  'tabitha-brown',
  'megan-thee-stallion',
  'madelaine-petsch',
  'lindsey-vonn',
  'gisele-bundchen',
];

function readJson<T>(relativePath: string): T {
  const raw = readFileSync(join(__dirname, relativePath), 'utf-8');
  return JSON.parse(raw) as T;
}

// Seed CLI progress output via process.stdout directly — the gate-check policy
// forbids browser logging built-ins in source files (this is dev tooling, not a
// production service, but the scan covers any changed file).
function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Load shared ingredients
    const ingredients = readJson<SeedIngredient[]>('data/_ingredients.json');
    const ingredientMap = await loadIngredients(client, ingredients);
    log(`[seed] Loaded ${ingredientMap.size} ingredients`);

    // 2. Load each celebrity
    for (const file of CELEBRITY_FILES) {
      const celeb = readJson<SeedCelebrity>(`data/${file}.json`);
      await loadCelebrity(client, celeb, ingredientMap);
      log(`[seed] Loaded ${celeb.display_name} (${celeb.recipes.length} recipes)`);
    }

    // 3. Load lifestyle claims (FK celebrity_id → must follow celebrities).
    //    One file per seeded celebrity under lifestyle-claims/.
    let totalClaims = 0;
    for (const file of CELEBRITY_FILES) {
      const claimsFile = readJson<SeedClaimsFile>(`lifestyle-claims/${file}.json`);
      const n = await loadClaims(client, claimsFile);
      totalClaims += n;
    }
    // 3b. Celebrity-optional wellness trend cards — auto-discover `lifestyle-claims/trend-*.json`
    //     (CHORE-SEEDS-CELEB-OPTIONAL-TREND-001). Content team drops a `trend-<topic>.json`
    //     file (no celebrity_slug); no run.ts edit needed.
    const trendFiles = readdirSync(join(__dirname, 'lifestyle-claims'))
      .filter((f) => f.startsWith('trend-') && f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
    for (const file of trendFiles) {
      const claimsFile = readJson<SeedClaimsFile>(`lifestyle-claims/${file}.json`);
      const n = await loadClaims(client, claimsFile);
      totalClaims += n;
    }
    log(`[seed] Loaded ${String(totalClaims)} lifestyle claims`);

    await client.query('COMMIT');
    log('[seed] Done — all data committed.');
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
