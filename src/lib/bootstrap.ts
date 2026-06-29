import { Client } from "pg";
import { SCHEMA_SQL, SEED_SQL } from "@/lib/schema-sql";

/**
 * One-time, self-applying database setup. Runs the bundled schema + seed the
 * first time the app talks to an empty database, so a fresh Vercel + Supabase
 * deploy "just works" with no manual SQL.
 *
 * Connection choice matters on Vercel: the serverless runtime is IPv4-only and
 * cannot reach Supabase's *direct* (non-pooling) host, which is IPv6-only. So we
 * prefer the pooled `POSTGRES_URL` (IPv4) and fall back to the others.
 *
 * Idempotency: a multi-statement simple query runs as a single atomic
 * transaction, so the schema is either fully applied or not at all — no partial
 * state. We guard with an existence check and tolerate a concurrent winner.
 */

function connectionString(): string | null {
  return (
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
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
    // No direct Postgres URL — can't self-install. Caller surfaces this.
    return false;
  }

  const client = new Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
    // pgbouncer (transaction mode) can't use the extended/prepared protocol.
    statement_timeout: 60_000,
  });

  try {
    await client.connect();

    const { rows } = await client.query(
      "select to_regclass('public.profiles') as exists"
    );
    if (rows[0]?.exists != null) {
      return true; // already set up
    }

    // Atomic: a multi-statement simple query is one implicit transaction.
    await client.query(SCHEMA_SQL);
    // Seed is idempotent (on conflict do nothing); failures here are non-fatal.
    try {
      await client.query(SEED_SQL);
    } catch (seedErr) {
      console.error("[bootstrap] Seed verisi uygulanamadı:", seedErr);
    }
    return true;
  } catch (err) {
    // A concurrent cold start may have won the race — re-check before failing.
    try {
      const { rows } = await client.query(
        "select to_regclass('public.profiles') as exists"
      );
      if (rows[0]?.exists != null) return true;
    } catch {
      /* fall through */
    }
    schemaPromise = null; // allow a later request to retry
    console.error("[bootstrap] Şema kurulumu başarısız:", err);
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
}
