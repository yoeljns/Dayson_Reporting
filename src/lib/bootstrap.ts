import { Client } from "pg";
import { SCHEMA_SQL, SEED_SQL } from "@/lib/schema-sql";

/**
 * One-time, self-applying database setup. Runs the bundled schema + seed the
 * first time the app talks to an empty database, so a fresh Vercel + Supabase
 * deploy "just works" with no manual SQL. Idempotent and safe under concurrency
 * (Postgres advisory lock + an existence guard).
 */

function connectionString(): string | null {
  return (
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    null
  );
}

// Memoize so the work runs at most once per server process.
let schemaPromise: Promise<boolean> | null = null;

export function ensureSchema(): Promise<boolean> {
  if (!schemaPromise) schemaPromise = runEnsureSchema();
  return schemaPromise;
}

async function runEnsureSchema(): Promise<boolean> {
  const conn = connectionString();
  if (!conn) {
    // No direct Postgres URL (e.g. local dev). Assume the schema is managed
    // manually; skip silently.
    return false;
  }

  const client = new Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    // Serialize first-boot setup across concurrent cold starts.
    await client.query("select pg_advisory_lock(727274001)");

    const { rows } = await client.query(
      "select to_regclass('public.profiles') as exists"
    );
    const alreadySetUp = rows[0]?.exists != null;

    if (!alreadySetUp) {
      await client.query(SCHEMA_SQL);
      await client.query(SEED_SQL);
    }

    await client.query("select pg_advisory_unlock(727274001)");
    return true;
  } catch (err) {
    // Reset so a later request can retry after a transient failure.
    schemaPromise = null;
    console.error("[bootstrap] Şema kurulumu başarısız:", err);
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
}
