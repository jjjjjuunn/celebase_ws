// Verify that /api/* route handlers produce responses matching
// @celebbase/shared-types Zod schemas. Run against a live Next.js dev
// server at CONTRACT_BASE_URL (default http://localhost:3000).
//
// Exit 1 on drift with diff to stdout. Exit 0 on clean match.
//
// Sprint scoping (plan §A10 / R2-M2):
//   - Gate infra lands in IMPL-APP-000b (this file).
//   - Zod schemas land in IMPL-APP-001a (@celebbase/shared-types/schemas).
//   - BFF route handlers land in IMPL-APP-001b.
// Until shared-types schemas resolve, this script exits 0 with a SKIP
// marker so CI wiring works today and starts enforcing post-001a.

const BASE = process.env.CONTRACT_BASE_URL ?? "http://localhost:3000";

type ExpectedStatus = number | readonly number[];

type ContractCheck = {
  readonly name: string;
  readonly path: string;
  readonly method: "GET" | "POST";
  readonly body?: unknown;
  readonly expectedStatus: ExpectedStatus;
  readonly schemaName?: string;
};

type ZodSafeParseResult = {
  readonly success: boolean;
  readonly error?: { readonly issues: unknown };
};

type ZodLikeSchema = {
  readonly safeParse: (input: unknown) => ZodSafeParseResult;
};

type SchemasModule = Readonly<Record<string, ZodLikeSchema | undefined>>;

async function loadSchemas(): Promise<SchemasModule | null> {
  try {
    const mod = (await import("@celebbase/shared-types")) as unknown as SchemasModule;
    return mod;
  } catch {
    return null;
  }
}

function statusAllowed(status: number, expected: ExpectedStatus): boolean {
  return Array.isArray(expected) ? expected.includes(status) : status === expected;
}

function describeStatus(expected: ExpectedStatus): string {
  return Array.isArray(expected) ? expected.join(" or ") : String(expected);
}

function validateBody(
  schemas: SchemasModule,
  schemaName: string,
  body: unknown,
): string | null {
  const schema = schemas[schemaName];
  if (schema === undefined) {
    return `schema ${schemaName} not exported from @celebbase/shared-types`;
  }
  const result = schema.safeParse(body);
  if (result.success) return null;
  return `schema ${schemaName} mismatch: ${JSON.stringify(result.error?.issues)}`;
}

async function runCheck(
  check: ContractCheck,
  schemas: SchemasModule,
): Promise<{ readonly ok: boolean; readonly reason?: string }> {
  const url = `${BASE}${check.path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: check.method,
      headers: check.body ? { "content-type": "application/json" } : undefined,
      body: check.body ? JSON.stringify(check.body) : undefined,
    });
  } catch (err) {
    return { ok: false, reason: `fetch failed: ${String(err)}` };
  }

  if (!statusAllowed(res.status, check.expectedStatus)) {
    return {
      ok: false,
      reason: `status ${res.status} (expected ${describeStatus(check.expectedStatus)})`,
    };
  }

  if (check.schemaName !== undefined) {
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      return { ok: false, reason: "response body is not valid JSON" };
    }
    const mismatch = validateBody(schemas, check.schemaName, parsed);
    if (mismatch !== null) {
      return { ok: false, reason: mismatch };
    }
  }

  return { ok: true };
}

function buildChecks(): readonly ContractCheck[] {
  const nonexistentUuid = "00000000-0000-7000-8000-000000000000";
  return [
    {
      name: "GET /api/celebrities",
      path: "/api/celebrities",
      method: "GET",
      expectedStatus: 200,
      schemaName: "CelebrityListResponseSchema",
    },
    {
      name: "GET /api/users/me (unauth)",
      path: "/api/users/me",
      method: "GET",
      expectedStatus: 401,
    },
    {
      name: "POST /api/auth/login (rejected credentials)",
      path: "/api/auth/login",
      method: "POST",
      body: { email: "contract-check@celebbase.invalid", password: "x" },
      expectedStatus: [200, 400, 401],
    },
    {
      name: `GET /api/meal-plans/${nonexistentUuid}`,
      path: `/api/meal-plans/${nonexistentUuid}`,
      method: "GET",
      expectedStatus: [401, 404],
    },
  ];
}

async function main(): Promise<void> {
  const schemas = await loadSchemas();
  if (schemas === null) {
    process.stdout.write(
      "SKIP: @celebbase/shared-types schemas not yet exported. " +
        "Gate infra is in place; enforcement activates after IMPL-APP-001a.\n",
    );
    process.exit(0);
  }

  const checks = buildChecks();
  let failed = 0;
  for (const check of checks) {
    const result = await runCheck(check, schemas);
    if (result.ok) {
      process.stdout.write(`[ok] ${check.name}\n`);
    } else {
      process.stdout.write(`[fail] ${check.name}: ${result.reason ?? "unknown"}\n`);
      failed += 1;
    }
  }

  if (failed > 0) {
    process.stderr.write(`verify-api-contracts: ${failed} mismatch(es)\n`);
    process.exit(1);
  }
  process.stdout.write(`verify-api-contracts: all ${checks.length} checks passed\n`);
}

void main().catch((err: unknown) => {
  process.stderr.write(`verify-api-contracts: fatal: ${String(err)}\n`);
  process.exit(1);
});
