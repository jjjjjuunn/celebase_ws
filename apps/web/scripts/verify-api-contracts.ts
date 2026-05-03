#!/usr/bin/env tsx
// FE ↔ BE contract verifier (fixture-based).
//
// Reads live-recorded BE response fixtures under apps/web/scripts/fixtures/
// and parses each against the matching shared-types Zod schema. Drift
// between BE response shape and the FE schema fails the gate and blocks
// the PR.
//
// SKIP semantics (plan R15 — Round-3 finding):
//   When the fixture directory is empty or missing, the script exits 0 with
//   a SKIP marker so the gate-activation PR isn't self-blocking before
//   fixtures exist. The same PR that ships this infra is expected to
//   commit live-recorded fixtures (via record-fixtures.sh); post-merge,
//   every subsequent chunk's blocking fe_contract_check enforces z.parse.
//
// Re-recording: `pnpm --filter web record:fixtures` against the local
// dev BE stack. Hand-editing fixtures is forbidden per plan D25.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schemas } from '@celebbase/shared-types';
import type { ZodTypeAny } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = resolve(__dirname, 'fixtures');

interface FixtureBinding {
  readonly file: string;
  readonly schema: ZodTypeAny;
  readonly description: string;
}

// 8 live-recorded fixtures — domain-keyed. Every fixture is a BE success-
// path response body. Keep this list in lockstep with record-fixtures.sh.
const BINDINGS: readonly FixtureBinding[] = [
  { file: 'auth.json', schema: schemas.LoginResponseSchema, description: 'POST /auth/login (user-service)' },
  { file: 'users.json', schema: schemas.MeResponseSchema, description: 'GET /users/me (user-service)' },
  { file: 'bio-profiles.json', schema: schemas.BioProfileResponseSchema, description: 'GET /users/me/bio-profile (user-service)' },
  { file: 'celebrities.json', schema: schemas.CelebrityListResponseSchema, description: 'GET /celebrities (content-service)' },
  { file: 'base-diets.json', schema: schemas.BaseDietDetailResponseSchema, description: 'GET /base-diets/:id (content-service)' },
  { file: 'recipes.json', schema: schemas.RecipeListResponseSchema, description: 'GET /recipes (content-service)' },
  { file: 'meal-plans.json', schema: schemas.MealPlanListResponseSchema, description: 'GET /meal-plans (meal-plan-engine)' },
  { file: 'ws-ticket.json', schema: schemas.WsTicketResponseSchema, description: 'POST /ws/ticket (meal-plan-engine)' },
];

function listFixtureFiles(): readonly string[] {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json'));
}

function main(): number {
  const present = listFixtureFiles();
  if (present.length === 0) {
    process.stdout.write(
      'SKIP: no fixtures recorded. Run `pnpm --filter web record:fixtures` ' +
        'against the dev BE stack, commit the JSON files under ' +
        'apps/web/scripts/fixtures/, and re-run.\n',
    );
    return 0;
  }

  let failed = 0;
  let checked = 0;
  const missing: string[] = [];

  for (const binding of BINDINGS) {
    const path = join(FIXTURE_DIR, binding.file);
    if (!existsSync(path)) {
      missing.push(binding.file);
      continue;
    }
    checked += 1;
    let payload: unknown;
    try {
      payload = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`FAIL ${binding.file} (${binding.description}): invalid JSON — ${msg}\n`);
      continue;
    }
    const result = binding.schema.safeParse(payload);
    if (!result.success) {
      failed += 1;
      process.stderr.write(`FAIL ${binding.file} (${binding.description}):\n`);
      for (const issue of result.error.issues) {
        const path = issue.path.join('.') || '<root>';
        process.stderr.write(`  - path=${path} code=${issue.code} msg=${issue.message}\n`);
      }
      continue;
    }
    process.stdout.write(`OK   ${binding.file} (${binding.description})\n`);
  }

  if (missing.length > 0) {
    process.stderr.write(`\nMissing fixtures (re-run record:fixtures): ${missing.join(', ')}\n`);
  }

  process.stdout.write(
    `\nverify-api-contracts: ${checked}/${BINDINGS.length} fixtures parsed, ` +
      `${failed} failed, ${missing.length} missing.\n`,
  );

  return failed > 0 || missing.length > 0 ? 1 : 0;
}

process.exit(main());
