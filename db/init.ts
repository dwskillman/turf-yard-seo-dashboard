/**
 * db/init.ts — initialize the SQLite database at data/seo.db.
 *
 * Runs the schema in db/schema.sql. Safe to re-run: all statements use
 * CREATE TABLE IF NOT EXISTS, so existing data is preserved.
 *
 * Usage: npm run db:init  (tsx db/init.ts)
 */
import Database from 'better-sqlite3';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const dbPath = resolve(projectRoot, 'data', 'seo.db');
const schemaPath = resolve(__dirname, 'schema.sql');

// Ensure the data/ directory exists.
const dataDir = dirname(dbPath);
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const schema = readFileSync(schemaPath, 'utf-8');
db.exec(schema);

console.log(`✓ Database initialized at ${dbPath}`);

// Report current table list for confirmation.
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all() as { name: string }[];
console.log(`✓ Tables (${tables.length}): ${tables.map((t) => t.name).join(', ')}`);

db.close();
