// All database reads and writes. Route handlers call these and nothing else.

import { aiMode, analysePackage } from "./ai";
import { briefBlockers, buildBrief } from "./brief";
import { db } from "./db";
import { diffPackages } from "./diff";
import { applyGuardrails } from "./guardrails";
import { assignIds } from "./ids";
import { snapshotHashes, staleReasons } from "./staleness";
import { hasFailures, validatePackage } from "./validation";
import { allItems } from "./model";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const now = () => new Date().toISOString();

function loadVersions(releaseId) {
  const rows = db()
    .prepare(
      "SELECT number, package_json, created_at FROM versions WHERE release_id = ? ORDER BY number",
    )
    .all(releaseId);
  return rows.map((r) => ({
    number: r.number,
    package: JSON.parse(r.package_json),
    createdAt: r.created_at,
  }));
}

function requireRelease(releaseId) {
  const release = db()
    .prepare("SELECT id, name FROM releases WHERE id = ?")
    .get(releaseId);
  if (!release) throw new HttpError(404, "Release not found.");
  return { id: release.id, name: release.name };
}

export function listReleases() {
  const rows = db()
    .prepare(
      `SELECT r.id, r.name, r.created_at, MAX(v.number) AS latest
       FROM releases r LEFT JOIN versions v ON v.release_id = r.id
       GROUP BY r.id ORDER BY r.id DESC`,
    )
    .all();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    latestVersion: r.latest,
  }));
}

export function createRelease(name, input) {
  const pkg = assignIds(input, []);
  const database = db();
  database.exec("BEGIN");
  try {
    const { lastInsertRowid } = database
      .prepare("INSERT INTO releases (name, created_at) VALUES (?, ?)")
      .run(name, now());
    const releaseId = Number(lastInsertRowid);
    database
      .prepare(
        "INSERT INTO versions (release_id, number, package_json, created_at) VALUES (?, 1, ?, ?)",
      )
      .run(releaseId, JSON.stringify(pkg), now());
    database.exec("COMMIT");
    return releaseId;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

/** Saving never overwrites: it adds the next version number. */
export function saveVersion(releaseId, input) {
  requireRelease(releaseId);
  const versions = loadVersions(releaseId);
  const latest = versions[versions.length - 1];
  const pkg = assignIds(
    input,
    versions.map((v) => v.package),
  );
  if (JSON.stringify(pkg) === JSON.stringify(latest.package)) {
    throw new HttpError(409, "Nothing has changed since the latest version.");
  }
  const number = latest.number + 1;
  db()
    .prepare(
      "INSERT INTO versions (release_id, number, package_json, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(releaseId, number, JSON.stringify(pkg), now());
  return number;
}

function toStatementView(row, latest) {
  return {
    id: row.id,
    kind: row.kind,
    text: row.text,
    originalText: row.original_text,
    citations: JSON.parse(row.citations_json),
    status: row.status,
    edited: row.edited === 1,
    versionNumber: row.version_number,
    stale: staleReasons(JSON.parse(row.source_hashes_json), latest),
  };
}

export function getReleaseView(releaseId) {
  const release = requireRelease(releaseId);
  const versions = loadVersions(releaseId);
  const latest = versions[versions.length - 1];
  const checks = validatePackage(latest.package);

  const analysisRow = db()
    .prepare(
      "SELECT * FROM analyses WHERE release_id = ? ORDER BY id DESC LIMIT 1",
    )
    .get(releaseId);

  let analysis = null;
  let statements = [];
  if (analysisRow) {
    const result = JSON.parse(analysisRow.result_json);
    analysis = {
      versionNumber: analysisRow.version_number,
      mode: analysisRow.mode,
      model: analysisRow.model ?? null,
      createdAt: analysisRow.created_at,
      classifications: result.classifications,
      missingInformation: result.missingInformation,
      unsupportedClaims: result.unsupportedClaims,
      guardrailNotes: JSON.parse(analysisRow.notes_json),
    };
    // The working set is the statements of the most recent analysis.
    const rows = db()
      .prepare("SELECT * FROM statements WHERE analysis_id = ? ORDER BY id")
      .all(analysisRow.id);
    statements = rows.map((row) => toStatementView(row, latest.package));
  }

  const briefs = db()
    .prepare("SELECT * FROM briefs WHERE release_id = ? ORDER BY id DESC")
    .all(releaseId)
    .map((b) => ({
      id: b.id,
      versionNumber: b.version_number,
      reviewer: b.reviewer,
      markdown: b.markdown,
      createdAt: b.created_at,
    }));

  return {
    id: release.id,
    name: release.name,
    versions: versions.map((v) => ({
      number: v.number,
      createdAt: v.createdAt,
    })),
    latest: { number: latest.number, package: latest.package, checks },
    analysis,
    statements,
    briefs,
    briefBlockers: briefBlockers(checks, analysis, statements),
    aiMode: aiMode(),
  };
}

export function getDiff(releaseId, from, to) {
  requireRelease(releaseId);
  const versions = loadVersions(releaseId);
  const before = versions.find((v) => v.number === from);
  const after = versions.find((v) => v.number === to);
  if (!before || !after) throw new HttpError(404, "Version not found.");
  return diffPackages(before.package, after.package);
}

export async function runAnalysis(releaseId) {
  requireRelease(releaseId);
  const versions = loadVersions(releaseId);
  const latest = versions[versions.length - 1];
  if (hasFailures(validatePackage(latest.package))) {
    throw new HttpError(
      400,
      "Fix the failing required-section checks before running the analysis.",
    );
  }

  const { result: raw, mode, model } = await analysePackage(latest.package);
  const { result, notes } = applyGuardrails(raw, latest.package);
  const { statements, ...findings } = result;

  const database = db();
  database.exec("BEGIN");
  try {
    const { lastInsertRowid } = database
      .prepare(
        `INSERT INTO analyses (release_id, version_number, mode, model, result_json, notes_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        releaseId,
        latest.number,
        mode,
        model,
        JSON.stringify(findings),
        JSON.stringify(notes),
        now(),
      );
    const insert = database.prepare(
      `INSERT INTO statements
         (analysis_id, release_id, version_number, kind, text, original_text, citations_json, source_hashes_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    // Every statement starts as 'pending'. Only updateStatement, called from a
    // person's click, can change that.
    for (const s of statements) {
      insert.run(
        Number(lastInsertRowid),
        releaseId,
        latest.number,
        s.kind,
        s.text,
        s.text,
        JSON.stringify(s.citations),
        JSON.stringify(snapshotHashes(latest.package, s.citations)),
        now(),
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function updateStatement(statementId, body) {
  const row = db()
    .prepare("SELECT * FROM statements WHERE id = ?")
    .get(statementId);
  if (!row) throw new HttpError(404, "Statement not found.");
  const versions = loadVersions(row.release_id);
  const latest = versions[versions.length - 1];
  const statement = toStatementView(row, latest.package);

  if (body.action === "edit") {
    const text = body.text.trim();
    if (!text) throw new HttpError(400, "Statement text can't be empty.");
    const known = new Set(allItems(latest.package).map((i) => i.id));
    const citations = [
      ...new Set(
        body.citations.map((c) => c.trim().toUpperCase()).filter(Boolean),
      ),
    ];
    const unknown = citations.filter((c) => !known.has(c));
    if (unknown.length > 0) {
      throw new HttpError(
        400,
        `Unknown item id(s) in the current version: ${unknown.join(", ")}.`,
      );
    }
    if (citations.length === 0)
      throw new HttpError(400, "Cite at least one release item.");
    // The reviewer has rewritten the statement against the current package, so
    // its sources are re-pinned to this version and it needs a fresh decision.
    db()
      .prepare(
        `UPDATE statements SET text = ?, citations_json = ?, source_hashes_json = ?, version_number = ?,
           edited = 1, status = 'pending', updated_at = ? WHERE id = ?`,
      )
      .run(
        text,
        JSON.stringify(citations),
        JSON.stringify(snapshotHashes(latest.package, citations)),
        latest.number,
        now(),
        statementId,
      );
    return;
  }

  if (body.action === "approve") {
    if (statement.citations.length === 0) {
      throw new HttpError(
        400,
        "This statement cites nothing. Edit it to add a citation before approving.",
      );
    }
    if (statement.stale.length > 0) {
      throw new HttpError(
        400,
        "This statement is stale. Edit it against the current package before approving.",
      );
    }
  }
  const status =
    body.action === "approve"
      ? "approved"
      : body.action === "reject"
        ? "rejected"
        : "pending";
  db()
    .prepare("UPDATE statements SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, now(), statementId);
}

export function createBrief(releaseId, reviewer) {
  const view = getReleaseView(releaseId);
  if (view.briefBlockers.length > 0) {
    throw new HttpError(
      400,
      `The brief can't be generated yet: ${view.briefBlockers.join(" ")}`,
    );
  }
  const markdown = buildBrief({
    releaseName: view.name,
    versionNumber: view.latest.number,
    pkg: view.latest.package,
    statements: view.statements,
    reviewer,
    date: now().slice(0, 10),
  });
  db()
    .prepare(
      "INSERT INTO briefs (release_id, version_number, reviewer, markdown, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(releaseId, view.latest.number, reviewer, markdown, now());
}
