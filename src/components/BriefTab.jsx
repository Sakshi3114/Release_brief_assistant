"use client";

import { useState } from "react";
import { Badge, Button, Card, ErrorNote, api, formatDate } from "./ui";

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function BriefTab({ view, onChanged }) {
  const [reviewer, setReviewer] = useState("");
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(0);
  const blockers = view.briefBlockers;
  const approved = view.statements.filter(
    (s) => s.status === "approved" && s.stale.length === 0,
  ).length;
  const brief = view.briefs[selected] ?? view.briefs[0];

  async function generate() {
    setError(null);
    try {
      await api(`/api/releases/${view.id}/brief`, "POST", { reviewer });
      setSelected(0);
      onChanged();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Generate the reviewed brief">
        {blockers.length > 0 ? (
          <>
            <p className="mb-2 text-sm text-slate-700">
              The brief can&apos;t be generated until these are resolved:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-red-800">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              The brief is assembled by code from the {approved} statement(s)
              you approved for version {view.latest.number}. Rejected statements
              are left out. No AI runs at this step.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm text-slate-700">
                Reviewer name
                <input
                  value={reviewer}
                  onChange={(e) => setReviewer(e.target.value)}
                  className="mt-1 block rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
              <Button
                variant="primary"
                onClick={generate}
                disabled={!reviewer.trim()}
              >
                Generate brief
              </Button>
            </div>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          A brief records that the communication was reviewed. It does not
          approve the release or deploy anything.
        </p>
        <div className="mt-2">
          <ErrorNote message={error} />
        </div>
      </Card>

      {brief && (
        <Card
          title={`Brief for version ${brief.versionNumber}`}
          aside={
            <div className="flex flex-wrap items-center gap-2">
              {brief.versionNumber < view.latest.number && (
                <Badge tone="amber">package changed since</Badge>
              )}
              {view.briefs.length > 1 && (
                <select
                  aria-label="Choose a brief"
                  value={selected}
                  onChange={(e) => setSelected(Number(e.target.value))}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                >
                  {view.briefs.map((b, index) => (
                    <option key={b.id} value={index}>
                      v{b.versionNumber} · {b.reviewer} ·{" "}
                      {formatDate(b.createdAt)}
                    </option>
                  ))}
                </select>
              )}
              <Button
                onClick={() =>
                  download(
                    `release-brief-v${brief.versionNumber}.md`,
                    brief.markdown,
                  )
                }
              >
                Download .md
              </Button>
            </div>
          }
        >
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-800">
            {brief.markdown}
          </pre>
        </Card>
      )}
    </div>
  );
}
