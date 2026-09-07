#!/usr/bin/env node
/**
 * Generates src/lib/schema-sql.ts from supabase/migrations/*.sql so the
 * migrations directory is the single source of truth:
 *
 *   SCHEMA_SQL ← 0001_init.sql          (fresh-install schema)
 *   SEED_SQL   ← 0002_seed.sql          (idempotent seed)
 *   PATCH_PRE_SQL ← NNNN_enums_*.sql   (ALTER TYPE … ADD VALUE only; applied in
 *                                        its OWN transaction before PATCH_SQL, because
 *                                        a new enum value cannot be used in the same
 *                                        transaction that adds it)
 *   PATCH_SQL  ← 0003…latest, in order  (idempotent patches, run every boot)
 *
 * Usage:  node scripts/gen-schema-sql.mjs          # rewrite the file
 *         node scripts/gen-schema-sql.mjs --check  # exit 1 if out of date (CI)
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");
const outFile = join(root, "src", "lib", "schema-sql.ts");

const files = readdirSync(migrationsDir)
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort();

if (files.length < 2) {
  console.error("gen-schema-sql: expected at least 0001 + 0002 migrations");
  process.exit(1);
}

const read = (f) => readFileSync(join(migrationsDir, f), "utf8").trimEnd();
// Escape for embedding in a JS template literal.
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

const schema = read(files[0]);
const seed = read(files[1]);
const isEnumFile = (f) => /^\d{4}_enums_.*\.sql$/.test(f);
const rest = files.slice(2);
const prePatches = rest
  .filter(isEnumFile)
  .map((f) => `-- ────── ${f} ──────\n${read(f)}`)
  .join("\n\n");
const patches = rest
  .filter((f) => !isEnumFile(f))
  .map((f) => `-- ────── ${f} ──────\n${read(f)}`)
  .join("\n\n");

const out = `// AUTO-GENERATED from supabase/migrations/*.sql — do not edit by hand.
// Regenerate with \`npm run gen:schema\` after changing the migrations. Bundled
// so the runtime migrator (src/lib/bootstrap.ts) can apply the schema without
// filesystem access.

export const SCHEMA_SQL = \`${esc(schema)}
\`;

export const SEED_SQL = \`${esc(seed)}
\`;

export const PATCH_PRE_SQL = \`${esc(prePatches)}
\`;

export const PATCH_SQL = \`${esc(patches)}
\`;
`;

if (process.argv.includes("--check")) {
  const current = readFileSync(outFile, "utf8");
  if (current !== out) {
    console.error(
      "gen-schema-sql: src/lib/schema-sql.ts is out of date with supabase/migrations/.\n" +
        "Run `npm run gen:schema` and commit the result."
    );
    process.exit(1);
  }
  console.log("gen-schema-sql: up to date.");
} else {
  writeFileSync(outFile, out);
  console.log(
    `gen-schema-sql: wrote ${outFile} from ${files.length} migrations (${files[0]}…${files[files.length - 1]}).`
  );
}
