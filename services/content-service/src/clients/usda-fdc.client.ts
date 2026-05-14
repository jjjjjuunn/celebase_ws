const FDC_BASE = 'https://api.nal.usda.gov/fdc/v1/';
const ALLOWED_HOST = 'api.nal.usda.gov';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 3;
const SUCCESS_DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchWithTimeout(url: URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function ensureRelativePath(path: string): void {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) {
    throw new UsdaClientError('absolute URLs are not allowed in path');
  }
}

function ensureNoSchemePrefix(value: string, field: string): void {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value.trim())) {
    throw new UsdaClientError(field + ' must not contain a scheme prefix');
  }
}

function buildUrl(path: string): URL {
  ensureRelativePath(path);
  const url = new URL(path, FDC_BASE);
  if (url.hostname !== ALLOWED_HOST) {
    throw new UsdaClientError('resolved host is not allowed');
  }
  if (url.protocol !== 'https:') {
    throw new UsdaClientError('only https protocol is allowed');
  }
  return url;
}

function redactPath(url: URL): string {
  const cloned = new URL(url.toString());
  cloned.searchParams.delete('api_key');
  return cloned.pathname + cloned.search;
}

function parseSearchPayload(payload: unknown): FdcSearchResult[] {
  if (!isRecord(payload)) {
    throw new UsdaClientError('invalid USDA response: expected object');
  }
  const foods = payload.foods;
  if (!Array.isArray(foods)) {
    return [];
  }

  const results: FdcSearchResult[] = [];
  for (const item of foods) {
    if (!isRecord(item)) {
      continue;
    }
    const { fdcId, description, dataType } = item;
    if (typeof fdcId === 'number' && typeof description === 'string' && typeof dataType === 'string') {
      results.push({ fdcId, description, dataType });
    }
  }
  return results;
}

function parseFoodDetailPayload(payload: unknown): FdcFoodDetail {
  if (!isRecord(payload)) {
    throw new UsdaClientError('invalid USDA response: expected object');
  }

  const { fdcId, description } = payload;
  if (typeof fdcId !== 'number') {
    throw new UsdaClientError('invalid USDA response: missing fdcId');
  }
  if (typeof description !== 'string') {
    throw new UsdaClientError('invalid USDA response: missing description');
  }

  const nutrientsRaw = Array.isArray(payload.foodNutrients) ? payload.foodNutrients : [];
  const foodNutrients: FdcNutrient[] = [];
  for (const entry of nutrientsRaw) {
    if (!isRecord(entry)) {
      continue;
    }
    const { nutrientId, nutrientName, unitName, value } = entry;
    if (
      typeof nutrientId === 'number' &&
      typeof nutrientName === 'string' &&
      typeof unitName === 'string' &&
      typeof value === 'number'
    ) {
      foodNutrients.push({ nutrientId, nutrientName, unitName, value });
    }
  }

  const portionsRaw = Array.isArray(payload.foodPortions) ? payload.foodPortions : [];
  const foodPortions: FdcPortion[] = [];
  for (const portion of portionsRaw) {
    if (!isRecord(portion)) {
      continue;
    }
    const { modifier, gramWeight } = portion;
    if (typeof modifier !== 'string' || typeof gramWeight !== 'number') {
      continue;
    }
    let measureUnit: FdcPortion['measureUnit'];
    if (isRecord(portion.measureUnit) && typeof portion.measureUnit.name === 'string') {
      measureUnit = { name: portion.measureUnit.name };
    }
    foodPortions.push({
      modifier,
      gramWeight,
      ...(measureUnit !== undefined ? { measureUnit } : {}),
    });
  }

  return {
    fdcId,
    description,
    foodNutrients,
    foodPortions,
  };
}

function createHeaders(apiKey: string): Record<string, string> {
  if (apiKey.length === 0) {
    throw new UsdaClientError('USDA API key is required');
  }
  return {
    'X-Api-Key': apiKey,
    Accept: 'application/json',
  };
}

async function requestJson<T>(
  url: URL,
  options: UsdaClientOptions,
  parse: (payload: unknown) => T,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const headers = createHeaders(options.apiKey);

  const init: RequestInit = {
    method: 'GET',
    headers,
  };

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);

      if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
        if (attempt < maxRetries) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw new UsdaClientError(`status: ${String(response.status)} ${redactPath(url)}`);
      }

      if (response.status >= 400) {
        throw new UsdaClientError(`status: ${String(response.status)} ${redactPath(url)}`);
      }

      const payload: unknown = await response.json();
      const parsed = parse(payload);
      await sleep(SUCCESS_DELAY_MS);
      return parsed;
    } catch (error) {
      if (error instanceof UsdaClientError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        if (attempt < maxRetries) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw new UsdaClientError('request aborted by timeout', error);
      }

      if (error instanceof TypeError) {
        if (attempt < maxRetries) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw new UsdaClientError('network error', error);
      }

      throw new UsdaClientError('unexpected fetch error', error instanceof Error ? error : undefined);
    }
  }

  throw new UsdaClientError('exhausted retries');
}

export interface FdcSearchResult {
  fdcId: number;
  description: string;
  dataType: string;
}

export interface FdcNutrient {
  nutrientId: number;
  nutrientName: string;
  unitName: string;
  value: number;
}

export interface FdcPortion {
  modifier: string;
  gramWeight: number;
  measureUnit?: { name: string };
}

export interface FdcFoodDetail {
  fdcId: number;
  description: string;
  foodNutrients: FdcNutrient[];
  foodPortions: FdcPortion[];
}

export class UsdaClientError extends Error {
  override readonly cause?: unknown;
  override name = 'UsdaClientError';

  constructor(message: string, cause?: unknown) {
    super(message);
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export interface UsdaClientOptions {
  apiKey: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export async function searchFood(
  query: string,
  options: UsdaClientOptions,
): Promise<FdcSearchResult[]> {
  ensureNoSchemePrefix(query, 'query');
  const url = buildUrl('foods/search');
  url.searchParams.set('query', query.trim());
  return requestJson(url, options, parseSearchPayload);
}

export async function getFoodDetail(
  fdcId: number,
  options: UsdaClientOptions,
): Promise<FdcFoodDetail> {
  if (!Number.isFinite(fdcId)) {
    throw new UsdaClientError('fdcId must be a finite number');
  }
  const url = buildUrl(`food/${String(Math.trunc(fdcId))}`);
  return requestJson(url, options, parseFoodDetailPayload);
}
