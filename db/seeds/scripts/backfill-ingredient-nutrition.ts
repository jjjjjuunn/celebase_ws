/**
 * USDA FoodData Central ingredient nutrition backfill CLI.
 *
 * 2-step workflow:
 *   1. `tsx db/seeds/scripts/backfill-ingredient-nutrition.ts --review-only`
 *      → 237 ingredient × USDA search → top 3 candidates → db/seeds/scripts/review.csv
 *   2. (manual) review.csv 의 `accepted_fdc_id` 컬럼 채움
 *   3. `tsx db/seeds/scripts/backfill-ingredient-nutrition.ts`
 *      → accepted_fdc_id 가 있는 row 만 USDA getFoodDetail 호출 → atomic UPDATE
 *
 * fail-closed: 종료 시 nutrition_source IS NULL count > 0 이면 process.exit(1).
 * idempotent: 재실행 시 nutrition_source IS NULL 인 row 만 처리.
 *
 * Env: DATABASE_URL, USDA_FDC_API_KEY
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import pg from 'pg';
import {
  searchFood,
  getFoodDetail,
  type FdcSearchResult,
  type FdcNutrient,
  type FdcPortion,
} from '../../../services/content-service/src/clients/usda-fdc.client.js';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USDA_DATA_TYPE_PRIORITY: Record<string, number> = {
  Foundation: 0,
  'SR Legacy': 1,
  'Survey (FNDDS)': 2,
  Branded: 3,
};

const USDA_TO_DB_NUTRIENT: Record<number, string> = {
  1008: 'calories',
  1003: 'protein_g',
  1004: 'fat_g',
  1005: 'carbs_g',
  1079: 'fiber_g',
  2000: 'sugar_g',
  1093: 'sodium_mg',
  1106: 'vitamin_a_ug_rae',
  1162: 'vitamin_c_mg',
  1114: 'vitamin_d_ug',
  1109: 'vitamin_e_mg',
  1185: 'vitamin_k_ug',
  1175: 'vitamin_b6_mg',
  1178: 'vitamin_b12_ug',
  1177: 'folate_ug_dfe',
  1087: 'calcium_mg',
  1089: 'iron_mg',
  1090: 'magnesium_mg',
  1095: 'zinc_mg',
  1092: 'potassium_mg',
  // omega3_g 는 USDA_TO_DB_NUTRIENT 단일 매핑 X — 1257 (Fatty acids, total polyunsaturated)
  // 은 PUFA 전체 (omega-3 + 6 + 9) 라 over-report. 정확한 omega-3 = OMEGA3_NUTRIENT_IDS 합산.
  // Gemini review-r2 HIGH finding 반영.
  1091: 'phosphorus_mg',
  1103: 'selenium_ug',
  1100: 'iodine_ug',
};

// Omega-3 합산 매핑 (Gemini review-r2 HIGH finding) — USDA 의 omega-3 fatty acids:
//   1404 = ALA (α-linolenic acid, 18:3 n-3)
//   1278 = EPA (eicosapentaenoic acid, 20:5 n-3)
//   1280 = DPA (docosapentaenoic acid, 22:5 n-3)
//   1272 = DHA (docosahexaenoic acid, 22:6 n-3)
// 단일 PUFA 합계 (1257) 가 아닌 위 4개 합산만 omega3_g 로 사용.
const OMEGA3_NUTRIENT_IDS: ReadonlySet<number> = new Set([1404, 1278, 1280, 1272]);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const reviewOnly = args.includes('--review-only');
  const reviewCsvFlagIndex = args.indexOf('--review-csv');
  const reviewCsvPath =
    reviewCsvFlagIndex >= 0 && args[reviewCsvFlagIndex + 1]
      ? path.resolve(process.cwd(), args[reviewCsvFlagIndex + 1])
      : path.join(__dirname, 'review.csv');

  const apiKey = process.env['USDA_FDC_API_KEY'];
  if (!apiKey) {
    console.error('Missing USDA_FDC_API_KEY env var');
    process.exit(1);
  }
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL env var');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    if (reviewOnly) {
      await runReviewOnly(pool, apiKey, reviewCsvPath);
    } else {
      await runApply(pool, apiKey, reviewCsvPath);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

async function runReviewOnly(pool: pg.Pool, apiKey: string, csvPath: string): Promise<void> {
  const { rows } = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM ingredients WHERE nutrition_source IS NULL ORDER BY name`,
  );
  console.error(`Found ${String(rows.length)} ingredients to review`);

  await fs.promises.mkdir(path.dirname(csvPath), { recursive: true });
  const stream = fs.createWriteStream(csvPath, { encoding: 'utf-8' });

  const header = [
    'ingredient_id',
    'ingredient_name',
    'accepted_fdc_id',
    'candidate_1_fdc_id',
    'candidate_1_desc',
    'candidate_1_dataType',
    'candidate_2_fdc_id',
    'candidate_2_desc',
    'candidate_2_dataType',
    'candidate_3_fdc_id',
    'candidate_3_desc',
    'candidate_3_dataType',
  ];
  await writeCsvRow(stream, header);

  for (const ingredient of rows) {
    let candidates: FdcSearchResult[] = [];
    try {
      candidates = await searchFood(ingredient.name, { apiKey });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      console.error(`USDA search failed for ${ingredient.id}: ${message}`);
    }

    const top = selectTopCandidates(candidates, 3);
    const record: string[] = [ingredient.id, ingredient.name, ''];

    for (let i = 0; i < 3; i += 1) {
      const candidate = top[i];
      if (candidate) {
        record.push(String(candidate.fdcId));
        record.push(candidate.description);
        record.push(candidate.dataType);
      } else {
        record.push('');
        record.push('');
        record.push('');
      }
    }

    await writeCsvRow(stream, record);
  }

  await closeStream(stream);
  console.error(`Review CSV written to ${csvPath}`);
}

async function runApply(pool: pg.Pool, apiKey: string, csvPath: string): Promise<void> {
  const rows = await loadCsv(csvPath);
  const accepted = rows.filter((row) => row.accepted_fdc_id && row.accepted_fdc_id.trim() !== '');
  console.error(`Accepted: ${String(accepted.length)} / Total: ${String(rows.length)}`);

  let updated = 0;
  for (const row of accepted) {
    const ingredientId = row.ingredient_id?.trim();
    if (!ingredientId) {
      console.error('Skip row with missing ingredient_id');
      continue;
    }

    const fdcId = Number.parseInt(row.accepted_fdc_id, 10);
    if (!Number.isFinite(fdcId)) {
      console.warn(`Skip ${ingredientId}: invalid fdc_id ${row.accepted_fdc_id}`);
      continue;
    }

    try {
      const detail = await getFoodDetail(fdcId, { apiKey });
      const nutrition = extractNutritionPer100g(detail.foodNutrients);
      const portions = extractPortionConversions(detail.foodPortions);

      await pool.query(
        `UPDATE ingredients
           SET fdc_id = $1,
               nutrition_per_100g = $2::jsonb,
               nutrition_source = 'usda_fdc',
               nutrition_source_version = 'fdc-v1',
               nutrition_updated_at = NOW(),
               portion_conversions = $3::jsonb
         WHERE id = $4`,
        [fdcId, JSON.stringify(nutrition), JSON.stringify(portions), ingredientId],
      );
      updated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      console.error(`Failed to update ${ingredientId}: ${message}`);
    }
  }

  console.error(`Updated ${String(updated)} ingredients`);

  const { rows: nullRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ingredients WHERE nutrition_source IS NULL`,
  );
  const nullCount = Number(nullRows[0]?.count ?? '0');
  if (nullCount > 0) {
    console.error(`FAIL: ${String(nullCount)} ingredients still NULL nutrition_source`);
    process.exit(1);
  }
  console.error('PASS: all ingredients have nutrition_source set');
}

function selectTopCandidates(results: FdcSearchResult[], limit: number): FdcSearchResult[] {
  if (limit <= 0) {
    return [];
  }
  return results
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const priorityDiff = getDataTypePriority(a.item.dataType) - getDataTypePriority(b.item.dataType);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return a.index - b.index;
    })
    .slice(0, limit)
    .map((entry) => entry.item);
}

function getDataTypePriority(dataType: string): number {
  const priority = USDA_DATA_TYPE_PRIORITY[dataType];
  return priority ?? Number.POSITIVE_INFINITY;
}

async function writeCsvRow(stream: fs.WriteStream, fields: string[]): Promise<void> {
  const line = formatCsvRow(fields) + '\n';
  await new Promise<void>((resolve, reject) => {
    function cleanup(): void {
      stream.off('error', onError);
      stream.off('drain', onDrain);
    }
    function onError(error: Error): void {
      cleanup();
      reject(error);
    }
    function onDrain(): void {
      cleanup();
      resolve();
    }
    stream.once('error', onError);
    const ready = stream.write(line, (err) => {
      if (err) {
        cleanup();
        reject(err);
        return;
      }
      if (ready) {
        cleanup();
        resolve();
      }
    });
    if (!ready) {
      stream.once('drain', onDrain);
    }
  });
}

async function closeStream(stream: fs.WriteStream): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    function cleanup(): void {
      stream.off('error', onError);
      stream.off('finish', onFinish);
    }
    function onError(error: Error): void {
      cleanup();
      reject(error);
    }
    function onFinish(): void {
      cleanup();
      resolve();
    }
    stream.once('error', onError);
    stream.once('finish', onFinish);
    stream.end();
  });
}

async function loadCsv(csvPath: string): Promise<Array<Record<string, string>>> {
  const content = await fs.promises.readFile(csvPath, 'utf-8');
  return parseCsv(content);
}

function parseCsv(content: string): Array<Record<string, string>> {
  const lines = splitCsvLines(content);
  if (lines.length === 0) {
    return [];
  }

  const headerLine = lines[0];
  if (headerLine.trim().length === 0) {
    return [];
  }

  const headers = parseCsvLine(headerLine);
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.length === 0) {
      continue;
    }
    const values = parseCsvLine(line);
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? '';
    });
    rows.push(record);
  }
  return rows;
}

function splitCsvLines(content: string): string[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (char === '"') {
      current += char;
      if (inQuotes && content[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === '\r') {
      if (inQuotes) {
        current += char;
      } else {
        if (content[i + 1] === '\n') {
          i += 1;
        }
        lines.push(current);
        current = '';
      }
    } else if (char === '\n') {
      if (inQuotes) {
        current += char;
      } else {
        lines.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes) {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        inQuotes = true;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function formatCsvRow(fields: string[]): string {
  return fields.map(escapeCsvField).join(',');
}

function escapeCsvField(value: string): string {
  const normalized = value;
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function extractNutritionPer100g(nutrients: FdcNutrient[]): Record<string, number> {
  const result: Record<string, number> = {};
  let omega3Sum = 0;
  let omega3Seen = false;
  for (const nutrient of nutrients) {
    const value = nutrient.value;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }
    const key = USDA_TO_DB_NUTRIENT[nutrient.nutrientId];
    if (key) {
      result[key] = value;
    }
    if (OMEGA3_NUTRIENT_IDS.has(nutrient.nutrientId)) {
      omega3Sum += value;
      omega3Seen = true;
    }
  }
  if (omega3Seen) {
    result['omega3_g'] = omega3Sum;
  }
  return result;
}

function extractPortionConversions(portions: FdcPortion[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const portion of portions) {
    if (typeof portion.gramWeight !== 'number' || !Number.isFinite(portion.gramWeight)) {
      continue;
    }

    if (portion.measureUnit?.name && portion.measureUnit.name !== 'undetermined') {
      const key = portion.measureUnit.name.toLowerCase();
      result[key] = portion.gramWeight;
    }

    if (portion.modifier) {
      const modifierKey = portion.modifier.toLowerCase().trim();
      if (modifierKey && result[modifierKey] === undefined) {
        result[modifierKey] = portion.gramWeight;
      }
    }
  }
  return result;
}
