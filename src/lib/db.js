// Database access through the libSQL client, which speaks SQLite.
// - Locally it uses a plain SQLite file (data/app.db), so there is nothing to set up.
// - When TURSO_DATABASE_URL is set it uses a hosted Turso database instead. That is
//   what the deployed app needs: serverless hosts have no disk that survives restarts.
// Every call is async because the hosted database is reached over the network.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
-- Versions are immutable snapshots: rows are inserted, never updated.
CREATE TABLE IF NOT EXISTS versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  release_id INTEGER NOT NULL REFERENCES releases(id),
  number INTEGER NOT NULL,
  package_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (release_id, number)
);
CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  release_id INTEGER NOT NULL REFERENCES releases(id),
  version_number INTEGER NOT NULL,
  mode TEXT NOT NULL,
  model TEXT,
  result_json TEXT NOT NULL,
  notes_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS statements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER NOT NULL REFERENCES analyses(id),
  release_id INTEGER NOT NULL REFERENCES releases(id),
  version_number INTEGER NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  original_text TEXT NOT NULL,
  citations_json TEXT NOT NULL,
  source_hashes_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  edited INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS briefs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  release_id INTEGER NOT NULL REFERENCES releases(id),
  version_number INTEGER NOT NULL,
  reviewer TEXT NOT NULL,
  markdown TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

function localFileUrl() {
  // Without Turso on a serverless host, /tmp is the only writable folder.
  // Data there is temporary; it is a fallback, not a real deployment setup.
  const file =
    process.env.DB_PATH ??
    (process.env.VERCEL
      ? "/tmp/release-brief.db"
      : path.join(process.cwd(), "data", "app.db"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return `file:${file.replace(/\\/g, "/")}`;
}

const globalForDb = globalThis;

/** Returns the connected client, creating the tables on first use. */
export function db() {
  if (!globalForDb.__releaseBriefDb) {
    const client = createClient({
      // "||" so that an empty value in .env falls back to the local file too.
      url: process.env.TURSO_DATABASE_URL || localFileUrl(),
      authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    });
    globalForDb.__releaseBriefDb = client
      .executeMultiple(SCHEMA)
      .then(() => client)
      .catch((error) => {
        // Don't cache a failed connection; the next request tries again.
        globalForDb.__releaseBriefDb = undefined;
        throw error;
      });
  }
  return globalForDb.__releaseBriefDb;
}

/** Run a query and return all rows. */
export async function all(sql, args = []) {
  const client = await db();
  return (await client.execute({ sql, args })).rows;
}

/** Run a query and return the first row, or undefined. */
export async function get(sql, args = []) {
  return (await all(sql, args))[0];
}

/** Run an INSERT or UPDATE. */
export async function run(sql, args = []) {
  const client = await db();
  return client.execute({ sql, args });
}

/**
 * Run several writes as one transaction: all of them succeed or none do.
 * `work` receives the transaction and must use it for every query.
 */
export async function inTransaction(work) {
  const client = await db();
  const tx = await client.transaction("write");
  try {
    const result = await work(tx);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}
