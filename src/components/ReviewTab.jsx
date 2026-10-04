"use client";

import { useState } from "react";
import { hasFailures } from "@/lib/validation";
import { allItems } from "@/lib/model";
import { Badge, Button, Card, ErrorNote, api, formatDate } from "./ui";

const IMPACT_TONE = {
  high: "red",
  medium: "amber",
  low: "blue",
  none: "neutral",
};
const STATUS_TONE = { pending: "neutral", approved: "green", rejected: "red" };

const KINDS = [
  {
    kind: "technical",
    title: "Internal technical summary",
    hint: "For engineers and support staff.",
  },
  {
    kind: "stakeholder",
    title: "Stakeholder and client summary",
    hint: "Plain language for non-technical readers.",
  },
  {
    kind: "risk",
    title: "Risks and limitations",
    hint: "What readers should be warned about.",
  },
];

function Statement({ statement, itemText, unverified, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(statement.text);
  const [citations, setCitations] = useState(statement.citations.join(", "));
  const [error, setError] = useState(null);

  const stale = statement.stale.length > 0;
  const uncited = statement.citations.length === 0;

  async function act(body) {
    setError(null);
    try {
      await api(`/api/statements/${statement.id}`, "PATCH", body);
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <li
      className={`rounded border p-3 ${stale ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge tone={STATUS_TONE[statement.status]}>{statement.status}</Badge>
        {statement.edited && <Badge tone="blue">edited by reviewer</Badge>}
        {stale && <Badge tone="amber">stale</Badge>}
        {uncited && <Badge tone="red">no citation</Badge>}
        {unverified.length > 0 && (
          <Badge tone="amber">
            cites unsupported claim: {unverified.join(", ")}
          </Badge>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            aria-label="Statement text"
            value={text}
            rows={3}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />

          <label className="block text-xs text-slate-600">
            Cited item ids, separated by commas
            <input
              value={citations}
              onChange={(e) => setCitations(e.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() =>
                act({ action: "edit", text, citations: citations.split(",") })
              }
            >
              Save edit
            </Button>
            <Button onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-900">{statement.text}</p>
      )}

      {stale && (
        <p className="mt-2 text-xs text-amber-900">
          Written against version {statement.versionNumber}. Since then:{" "}
          {statement.stale.map((s) => `${s.itemId} was ${s.reason}`).join(", ")}
          . Edit it to re-check it against the current package, or reject it.
        </p>
      )}

      {!editing && (
        <ul className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3">
          {statement.citations.map((id) => (
            <li key={id} className="text-xs text-slate-600">
              <span className="font-semibold text-slate-800">{id}</span>{" "}
              {itemText.get(id) ?? <em>no longer in the package</em>}
            </li>
          ))}
        </ul>
      )}

      {!editing && (
        <div className="mt-3 flex flex-wrap gap-2">
          {statement.status !== "approved" && (
            <Button
              onClick={() => act({ action: "approve" })}
              disabled={stale || uncited}
            >
              Approve
            </Button>
          )}
          {statement.status !== "rejected" && (
            <Button variant="danger" onClick={() => act({ action: "reject" })}>
              Reject
            </Button>
          )}
          {statement.status !== "pending" && (
            <Button onClick={() => act({ action: "reset" })}>
              Undo decision
            </Button>
          )}
          <Button onClick={() => setEditing(true)}>Edit</Button>
        </div>
      )}
      <div className="mt-2">
        <ErrorNote message={error} />
      </div>
    </li>
  );
}

export function ReviewTab({ view, onChanged }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const { analysis, statements } = view;
  const blocked = hasFailures(view.latest.checks);
  const itemText = new Map(
    allItems(view.latest.package).map((i) => [i.id, i.text]),
  );
  // Plain cross-reference: which statements lean on an item flagged as unsupported.
  const unsupportedIds = new Set(
    analysis?.unsupportedClaims.map((u) => u.itemId),
  );
  const outdated =
    analysis !== null && analysis.versionNumber < view.latest.number;
  const staleCount = statements.filter((s) => s.stale.length > 0).length;

  async function run() {
    if (
      analysis &&
      !window.confirm(
        "Re-running replaces the current statements and their review decisions. Continue?",
      )
    ) {
      return;
    }
    setRunning(true);
    setError(null);
    try {
      await api(`/api/releases/${view.id}/analyze`, "POST");
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-700">
            {analysis ? (
              <>
                Analysis of version {analysis.versionNumber}, run{" "}
                {formatDate(analysis.createdAt)} using{" "}
                {analysis.mode === "mock"
                  ? "the built-in mock (no API key set)"
                  : analysis.model}
                .
              </>
            ) : (
              <>
                No analysis yet. The AI drafts statements; you decide which ones
                are kept.
              </>
            )}
          </div>
          <Button variant="primary" onClick={run} disabled={running || blocked}>
            {running
              ? "Analysing…"
              : analysis
                ? `Re-run on version ${view.latest.number}`
                : "Run analysis"}
          </Button>
        </div>
        {view.aiMode === "mock" && (
          <p className="mt-2 text-xs text-slate-500">
            Mock mode: set ANTHROPIC_API_KEY or GEMINI_API_KEY in .env.local to
            use a real model. The mock uses keyword rules and goes through the
            same guardrails and review steps.
          </p>
        )}
        {blocked && (
          <p className="mt-2 text-sm text-red-800">
            The package has failing required-section checks. Fix them on the
            Package tab first.
          </p>
        )}
        {outdated && (
          <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            The package is now at version {view.latest.number}. {staleCount}{" "}
            statement(s) cite items that changed and are marked stale. The
            findings below describe version {analysis.versionNumber}.
          </p>
        )}
        <div className="mt-2">
          <ErrorNote message={error} />
        </div>
      </Card>

      {analysis && (
        <>
          {analysis.guardrailNotes.length > 0 && (
            <Card title="Guardrail notes">
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                {analysis.guardrailNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="User impact of each change">
              <ul className="space-y-2">
                {analysis.classifications.map((c) => (
                  <li key={c.itemId} className="text-sm">
                    <span className="mr-1.5 font-semibold">{c.itemId}</span>
                    <Badge tone={IMPACT_TONE[c.impact]}>{c.impact}</Badge>{" "}
                    <span className="text-slate-600">{c.rationale}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card
              title={`Claims not supported by QA evidence (${analysis.unsupportedClaims.length})`}
            >
              {analysis.unsupportedClaims.length === 0 && (
                <p className="text-sm text-slate-500">None found.</p>
              )}
              <ul className="space-y-3">
                {analysis.unsupportedClaims.map((u, index) => (
                  <li key={index} className="text-sm">
                    <span className="font-semibold">{u.itemId}</span>{" "}
                    <span className="text-slate-900">“{u.claim}”</span>
                    <p className="text-slate-600">{u.reason}</p>
                    {u.relatedQaIds.length > 0 && (
                      <p className="text-xs text-slate-500">
                        Partly related evidence: {u.relatedQaIds.join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card
            title={`Missing release information (${analysis.missingInformation.length})`}
          >
            {analysis.missingInformation.length === 0 && (
              <p className="text-sm text-slate-500">None found.</p>
            )}
            <ul className="space-y-2">
              {analysis.missingInformation.map((m, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <Badge tone={IMPACT_TONE[m.severity]}>{m.severity}</Badge>
                  <span className="text-slate-700">
                    {m.description}
                    {m.relatedItemIds.length > 0 && (
                      <span className="text-xs text-slate-500">
                        {" "}
                        [{m.relatedItemIds.join(", ")}]
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {KINDS.map(({ kind, title, hint }) => {
            const rows = statements.filter((s) => s.kind === kind);
            return (
              <Card
                key={kind}
                title={title}
                aside={<span className="text-xs text-slate-500">{hint}</span>}
              >
                {rows.length === 0 && (
                  <p className="text-sm text-slate-500">No statements.</p>
                )}
                <ul className="space-y-3">
                  {rows.map((s) => (
                    <Statement
                      key={`${s.id}-${s.text}-${s.citations.join()}`}
                      statement={s}
                      itemText={itemText}
                      unverified={
                        kind === "risk"
                          ? []
                          : s.citations.filter((c) => unsupportedIds.has(c))
                      }
                      onChanged={onChanged}
                    />
                  ))}
                </ul>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
