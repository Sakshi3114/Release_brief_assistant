// All database reads and writes. Route handlers call these and nothing else.

import { aiMode, analysePackage } from "./ai";
import { briefBlockers, buildBrief } from "./brief";
import { all, get, inTransaction, run } from "./db";
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

async function loadVersions(releaseId) {
  const rows = await all(
    "SELECT number, package_json, created_at FROM versions WHERE release_id = ? ORDER BY number",
    [releaseId],
  );
  return rows.map((r) => ({
    number: r.number,
    package: JSON.parse(r.package_json),
    createdAt: r.created_at,
  }));
}

async function requireRelease(releaseId) {
  const release = await get("SELECT id, name FROM releases WHERE id = ?", [
    releaseId,
  ]);
  if (!release) throw new HttpError(404, "Release not found.");
  return { id: release.id, name: release.name };
}

export async function listReleases() {
  const rows = await all(
    `SELECT r.id, r.name, r.created_at, MAX(v.number) AS latest
       FROM releases r LEFT JOIN versions v ON v.release_id = r.id
       GROUP BY r.id ORDER BY r.id DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    latestVersion: r.latest,
  }));
}

export async function createRelease(name, input) {
  const pkg = assignIds(input, []);
  return inTransaction(async (tx) => {
    const { lastInsertRowid } = await tx.execute({
      sql: "INSERT INTO releases (name, created_at) VALUES (?, ?)",
      args: [name, now()],
    });
    const releaseId = Number(lastInsertRowid);
    await tx.execute({
      sql: "INSERT INTO versions (release_id, number, package_json, created_at) VALUES (?, 1, ?, ?)",
      args: [releaseId, JSON.stringify(pkg), now()],
    });
    return releaseId;
  });
}

/** Saving never overwrites: it adds the next version number. */
export async function saveVersion(releaseId, input) {
  await requireRelease(releaseId);
  const versions = await loadVersions(releaseId);
  const latest = versions[versions.length - 1];
  const pkg = assignIds(
    input,
    versions.map((v) => v.package),
  );
  if (JSON.stringify(pkg) === JSON.stringify(latest.package)) {
    throw new HttpError(409, "Nothing has changed since the latest version.");
  }
  const number = latest.number + 1;
  await run(
    "INSERT INTO versions (release_id, number, package_json, created_at) VALUES (?, ?, ?, ?)",
    [releaseId, number, JSON.stringify(pkg), now()],
  );
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

export async function getReleaseView(releaseId) {
  const release = await requireRelease(releaseId);
  const versions = await loadVersions(releaseId);
  const latest = versions[versions.length - 1];
  const checks = validatePackage(latest.package);

  const analysisRow = await get(
    "SELECT * FROM analyses WHERE release_id = ? ORDER BY id DESC LIMIT 1",
    [releaseId],
  );

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
    const rows = await all(
      "SELECT * FROM statements WHERE analysis_id = ? ORDER BY id",
      [analysisRow.id],
    );
    statements = rows.map((row) => toStatementView(row, latest.package));
  }

  const briefRows = await all(
    "SELECT * FROM briefs WHERE release_id = ? ORDER BY id DESC",
    [releaseId],
  );
  const briefs = briefRows.map((b) => ({
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

export async function getDiff(releaseId, from, to) {
  await requireRelease(releaseId);
  const versions = await loadVersions(releaseId);
  const before = versions.find((v) => v.number === from);
  const after = versions.find((v) => v.number === to);
  if (!before || !after) throw new HttpError(404, "Version not found.");
  return diffPackages(before.package, after.package);
}

export async function runAnalysis(releaseId) {
  await requireRelease(releaseId);
  const versions = await loadVersions(releaseId);
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

  await inTransaction(async (tx) => {
    const { lastInsertRowid } = await tx.execute({
      sql: `INSERT INTO analyses (release_id, version_number, mode, model, result_json, notes_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        releaseId,
        latest.number,
        mode,
        model,
        JSON.stringify(findings),
        JSON.stringify(notes),
        now(),
      ],
    });
    if (statements.length === 0) return;
    // Every statement starts as 'pending'. Only updateStatement, called from a
    // person's click, can change that.
    await tx.batch(
      statements.map((s) => ({
        sql: `INSERT INTO statements
                (analysis_id, release_id, version_number, kind, text, original_text, citations_json, source_hashes_json, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          Number(lastInsertRowid),
          releaseId,
          latest.number,
          s.kind,
          s.text,
          s.text,
          JSON.stringify(s.citations),
          JSON.stringify(snapshotHashes(latest.package, s.citations)),
          now(),
        ],
      })),
    );
  });
}

export async function updateStatement(statementId, body) {
  const row = await get("SELECT * FROM statements WHERE id = ?", [statementId]);
  if (!row) throw new HttpError(404, "Statement not found.");
  const versions = await loadVersions(row.release_id);
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
    await run(
      `UPDATE statements SET text = ?, citations_json = ?, source_hashes_json = ?, version_number = ?,
           edited = 1, status = 'pending', updated_at = ? WHERE id = ?`,
      [
        text,
        JSON.stringify(citations),
        JSON.stringify(snapshotHashes(latest.package, citations)),
        latest.number,
        now(),
        statementId,
      ],
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
  await run("UPDATE statements SET status = ?, updated_at = ? WHERE id = ?", [
    status,
    now(),
    statementId,
  ]);
}

export async function createBrief(releaseId, reviewer) {
  const view = await getReleaseView(releaseId);
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
  await run(
    "INSERT INTO briefs (release_id, version_number, reviewer, markdown, created_at) VALUES (?, ?, ?, ?, ?)",
    [releaseId, view.latest.number, reviewer, markdown, now()],
  );
}
