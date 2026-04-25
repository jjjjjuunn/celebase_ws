import pg from 'pg';

// Coerce NUMERIC columns (height_cm, weight_kg, etc.) from string to JS number.
// pg defaults to string for arbitrary-precision safety; our wire schemas
// (BioProfileWireSchema) expect z.number(), so parse at the driver layer.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value: string) => parseFloat(value));

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}
