import { createHash } from "node:crypto";
import { Client } from "pg";
import { SCHEMA_SQL, SEED_SQL, PATCH_SQL } from "@/lib/schema-sql";

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

function rawConnectionString(): string | null {
  return (
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    null
  );
}

/**
 * Supabase connection strings carry `sslmode=require`, which pg now treats as
 * `verify-full` and that OVERRIDES our `ssl.rejectUnauthorized:false`, failing
 * on Supabase's self-signed chain. Strip the ssl params so our ssl object wins.
 */
function connectionString(): string | null {
  const raw = rawConnectionString();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    u.searchParams.delete("sslmode");
    u.searchParams.delete("ssl");
    u.searchParams.delete("uselibpqcompat");
    return u.toString();
  } catch {
    return raw;
  }
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
  });

  try {
    await client.connect();

    const { rows } = await client.query(
      "select to_regclass('public.profiles') as exists"
    );

    if (rows[0]?.exists == null) {
      // Fresh DB. Atomic: a multi-statement simple query is one transaction.
      await client.query(SCHEMA_SQL);
      // Seed is idempotent (on conflict do nothing); failures non-fatal.
      try {
        await client.query(SEED_SQL);
      } catch (seedErr) {
        console.error("[bootstrap] Seed verisi uygulanamadı:", seedErr);
      }
    }

    // Apply idempotent patches only when the bundled PATCH_SQL changed since
    // the last successful run: the whole blob (~25KB of DDL) used to replay on
    // every cold start. The recorded hash lives in app_settings; the read
    // fails harmlessly on DBs that predate that table, forcing a full run.
    const patchHash = createHash("sha256").update(PATCH_SQL).digest("hex");
    let upToDate = false;
    try {
      const { rows: ver } = await client.query(
        "select value->>'hash' as hash from app_settings where key = 'schema_patch_hash'"
      );
      upToDate = ver[0]?.hash === patchHash;
    } catch {
      /* app_settings not there yet → run the patch */
    }
    if (!upToDate) {
      try {
        // Advisory lock serializes concurrent cold starts; the hash upsert is
        // part of the same implicit transaction, so a failed patch never
        // records itself as applied.
        await client.query(
          `select pg_advisory_xact_lock(872764183);\n${PATCH_SQL}\n` +
            `insert into app_settings (key, value) values ` +
            `('schema_patch_hash', jsonb_build_object('hash', '${patchHash}')) ` +
            `on conflict (key) do update set value = excluded.value, updated_at = now();`
        );
      } catch (patchErr) {
        console.error("[bootstrap] Patch uygulanamadı:", patchErr);
      }
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
