/**
 * Recipe food-photo ingestion (CHORE-CONTENT-RECIPE-IMG-UPLOAD-001).
 *
 * Teammate generates food photos (gpt-image-2) and drops them in a Google Drive
 * folder. An operator downloads that folder locally (rclone or manual), then runs:
 *
 *   pnpm --filter @celebbase/db run images:recipes -- --input <dir> [--dry-run] [--only-missing]
 *
 * Flow (per file, sequential — sharp memory):
 *   shotlist CSV row (celebrity_slug, title, target_filename)
 *     → find file by sanitized target_filename in --input dir (path-traversal guarded)
 *     → resolve recipe.id by (celebrity_slug, normalizeTitle(title)) — 0=skip, >1=ambiguous skip
 *     → sharp resize 1500x1000 cover → webp q82  (3:2; warns if source aspect deviates)
 *     → S3 PutObject recipes/<celeb>/<recipe_id>.webp (image/webp, max-age=86400)
 *     → UPDATE recipes SET image_url = <PUBLIC_BASE>/recipes/<celeb>/<recipe_id>.webp (rowcount===1)
 *
 * Key = recipe.id → collision-proof, idempotent (same bytes re-run = same key/URL).
 * Two-way mismatch (missing file / no DB match / ambiguous / invalid name / extra file)
 * is reported and skipped — never silent; non-dry-run exits nonzero if any unresolved.
 *
 * Env (fail-closed): DATABASE_URL, RECIPE_ASSETS_BUCKET, RECIPE_ASSETS_PUBLIC_BASE_URL, AWS_REGION.
 * AWS credentials via the SDK default chain (no hardcoded secrets).
 *
 * PREREQ (ops, outside this script): the assets bucket must allow public-read on
 * recipes/* (mirroring hero/*). Verify after a pilot upload with `curl -I <url>` → 200.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import {
  buildRecipeIndex,
  parseCsv,
  planMatch,
  type DbRecipeRow,
  type MatchedItem,
  type ShotlistRow,
} from './upload-recipe-images.lib.js';

const TARGET_W = 1500;
const TARGET_H = 1000; // 3:2 — app MealPhoto cover-crops per context
const ASPECT_TOLERANCE = 0.1;
const IMAGE_RE = /\.(png|jpe?g|webp)$/i;

interface Args {
  inputDir: string;
  csvPath: string;
  dryRun: boolean;
  onlyMissing: boolean;
}

function parseArgs(argv: string[]): Args {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  let inputDir = '';
  let csvPath = join(repoRoot, 'docs', 'food-photo-shotlist.csv');
  let dryRun = false;
  let onlyMissing = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--') {
      // end-of-options marker forwarded by `pnpm run <script> -- <args>`
      continue;
    }
    if (a === '--input') {
      inputDir = argv[i + 1] ?? '';
      i += 1;
    } else if (a === '--csv') {
      csvPath = argv[i + 1] ?? '';
      i += 1;
    } else if (a === '--dry-run') {
      dryRun = true;
    } else if (a === '--only-missing') {
      onlyMissing = true;
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  if (inputDir === '') throw new Error('--input <dir> is required');
  return { inputDir: resolve(inputDir), csvPath, dryRun, onlyMissing };
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.trim() === '') {
    console.error(`✗ Missing required env var: ${name}`);
    process.exit(1);
  }
  return v.trim();
}

// Progress output via process.stdout — the policy gate forbids stdout logging
// through the console API (mirrors db/seeds/run.ts). Diagnostics use warn/error.
function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

function s3Key(item: MatchedItem): string {
  return `recipes/${item.celebSlug}/${item.recipeId}.webp`;
}

async function transform(filePath: string): Promise<Buffer> {
  const img = sharp(filePath);
  const meta = await img.metadata();
  if (typeof meta.width === 'number' && typeof meta.height === 'number' && meta.height > 0) {
    const ar = meta.width / meta.height;
    const target = TARGET_W / TARGET_H;
    if (Math.abs(ar - target) / target > ASPECT_TOLERANCE) {
      console.warn(
        `  ⚠ ${filePath}: source aspect ${ar.toFixed(2)} deviates from 3:2 — cover-crop will trim edges`,
      );
    }
  }
  return img.resize(TARGET_W, TARGET_H, { fit: 'cover', position: 'centre' }).webp({ quality: 82 }).toBuffer();
}

async function recipesWithImage(pool: pg.Pool, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM recipes WHERE id = ANY($1::uuid[]) AND image_url IS NOT NULL',
    [ids],
  );
  return new Set(rows.map((r) => r.id));
}

function reportMismatches(plan: ReturnType<typeof planMatch>): number {
  const show = (label: string, rows: ShotlistRow[]): void => {
    if (rows.length === 0) return;
    console.warn(`  ⚠ ${label}: ${String(rows.length)}`);
    for (const r of rows.slice(0, 8)) console.warn(`      - ${r.celebrity_slug} / ${r.title} (${r.target_filename})`);
    if (rows.length > 8) console.warn(`      … +${String(rows.length - 8)} more`);
  };
  show('CSV rows with no file in --input', plan.missingFile);
  show('CSV rows with no active recipe (celeb,title)', plan.noDbMatch);
  show('CSV rows with invalid target_filename (rejected)', plan.invalidFilename);
  if (plan.ambiguous.length > 0) {
    console.warn(`  ⚠ CSV rows matching >1 recipe (ambiguous, skipped): ${String(plan.ambiguous.length)}`);
    for (const a of plan.ambiguous.slice(0, 8)) {
      console.warn(`      - ${a.row.celebrity_slug} / ${a.row.title} → [${a.ids.join(', ')}]`);
    }
  }
  if (plan.extraFiles.length > 0) {
    console.warn(`  ⚠ files in --input not referenced by CSV: ${String(plan.extraFiles.length)}`);
    for (const f of plan.extraFiles.slice(0, 8)) console.warn(`      - ${f}`);
    if (plan.extraFiles.length > 8) console.warn(`      … +${String(plan.extraFiles.length - 8)} more`);
  }
  return (
    plan.missingFile.length + plan.noDbMatch.length + plan.invalidFilename.length + plan.ambiguous.length
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = requireEnv('DATABASE_URL');
  const bucket = requireEnv('RECIPE_ASSETS_BUCKET');
  const publicBase = requireEnv('RECIPE_ASSETS_PUBLIC_BASE_URL').replace(/\/+$/, '');
  const region = requireEnv('AWS_REGION');
  try {
    // eslint-disable-next-line no-new
    new URL(publicBase);
  } catch {
    console.error(`✗ RECIPE_ASSETS_PUBLIC_BASE_URL is not a valid URL: ${publicBase}`);
    process.exit(1);
  }

  if (!statSync(args.inputDir).isDirectory()) {
    console.error(`✗ --input is not a directory: ${args.inputDir}`);
    process.exit(1);
  }
  const dirFiles = new Set(readdirSync(args.inputDir).filter((f) => IMAGE_RE.test(f)));
  const csvRows = parseCsv(readFileSync(args.csvPath, 'utf-8')) as ShotlistRow[];
  if (csvRows.length === 0 || csvRows[0].target_filename === undefined) {
    console.error(`✗ CSV missing or has no target_filename column: ${args.csvPath}`);
    process.exit(1);
  }

  log(`input=${args.inputDir} files=${String(dirFiles.size)} csvRows=${String(csvRows.length)} bucket=${bucket} dryRun=${String(args.dryRun)}`);

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const { rows: dbRows } = await pool.query<DbRecipeRow>(
      `SELECT r.id, r.title, c.slug
         FROM recipes r
         JOIN base_diets bd ON r.base_diet_id = bd.id
         JOIN celebrities c ON bd.celebrity_id = c.id
        WHERE r.is_active = TRUE`,
    );
    const index = buildRecipeIndex(dbRows);
    const plan = planMatch(csvRows, index, dirFiles);
    const unresolved = reportMismatches(plan);

    let work = plan.matched;
    if (args.onlyMissing) {
      const have = await recipesWithImage(pool, work.map((m) => m.recipeId));
      const before = work.length;
      work = work.filter((m) => !have.has(m.recipeId));
      log(`  --only-missing: ${String(before - work.length)} already have image_url, ${String(work.length)} remain`);
    }

    if (args.dryRun) {
      if (work.length > 0) log(`  sample URL: ${publicBase}/${s3Key(work[0])}`);
      log(`[dry-run] matched=${String(plan.matched.length)} toProcess=${String(work.length)} unresolved=${String(unresolved)} — no writes`);
      return;
    }

    const s3 = new S3Client({ region });
    let uploaded = 0;
    let updated = 0;
    for (const m of work) {
      // defense-in-depth: filename is already a sanitized basename; confirm containment.
      const filePath = resolve(args.inputDir, m.filename);
      if (!filePath.startsWith(args.inputDir + sep)) {
        console.error(`  ✗ refusing path outside input dir: ${m.filename}`);
        process.exitCode = 1;
        continue;
      }
      const key = s3Key(m);
      const body = await transform(filePath);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: 'image/webp',
          CacheControl: 'public, max-age=86400',
        }),
      );
      uploaded += 1;
      const url = `${publicBase}/${key}`;
      const res = await pool.query('UPDATE recipes SET image_url = $1 WHERE id = $2', [url, m.recipeId]);
      if (res.rowCount !== 1) {
        console.error(`  ✗ UPDATE affected ${String(res.rowCount)} rows for recipe ${m.recipeId} (expected 1)`);
        process.exitCode = 1;
        continue;
      }
      updated += 1;
      log(`  ✓ ${m.celebSlug} / ${m.title} → ${key}`);
    }
    log(`done: uploaded=${String(uploaded)} updated=${String(updated)} skippedUnresolved=${String(unresolved)} extraFiles=${String(plan.extraFiles.length)}`);
    if (unresolved > 0) {
      console.error('✗ unresolved mismatches present — see report above');
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
