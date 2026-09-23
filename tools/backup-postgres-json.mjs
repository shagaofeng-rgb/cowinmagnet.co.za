import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import pg from "pg";

const output = process.argv[2];
if (!output) throw new Error("Usage: node tools/backup-postgres-json.mjs <output-file>");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const quoteIdentifier = (value) => `"${String(value).replaceAll('"', '""')}"`;
await client.connect();
try {
  const tables = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const snapshot = { createdAt: new Date().toISOString(), tables: {} };
  for (const { table_name: tableName } of tables.rows) {
    const result = await client.query(`SELECT * FROM ${quoteIdentifier(tableName)}`);
    snapshot.tables[tableName] = result.rows;
  }
  const target = resolve(output);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ output: target, tables: Object.keys(snapshot.tables), createdAt: snapshot.createdAt }));
} finally {
  await client.end();
}
