// SQLite through Node's built-in node:sqlite module (Node 22.13+), so there is no
// native dependency to compile. getBuiltinModule keeps the bundler out of it.

import fs from "node:fs";
import path from "node:path";

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

const globalForDb = globalThis;

export function db() {
  if (!globalForDb.__releaseBriefDb) {
    const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
    const file =
      process.env.DB_PATH ?? path.join(process.cwd(), "data", "app.db");
    if (file !== ":memory:")
      fs.mkdirSync(path.dirname(file), { recursive: true });
    const database = new DatabaseSync(file);
    database.exec(SCHEMA);
    globalForDb.__releaseBriefDb = database;
  }
  return globalForDb.__releaseBriefDb;
}
