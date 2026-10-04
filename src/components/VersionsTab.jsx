"use client";

import { useEffect, useState } from "react";
import { SECTIONS } from "@/lib/model";
import { Badge, Card, ErrorNote, api, formatDate } from "./ui";

const DIFF_TONE = {
  added: "green",
  removed: "red",
  modified: "amber",
  unchanged: "neutral",
};

export function VersionsTab({ view }) {
  const latest = view.latest.number;
  const [from, setFrom] = useState(Math.max(1, latest - 1));
  const [to, setTo] = useState(latest);
  const [diff, setDiff] = useState(null);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api(`/api/releases/${view.id}/diff?from=${from}&to=${to}`)
      .then((data) => {
        if (cancelled) return;
        setDiff(data);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [view.id, from, to]);

  const changed = diff?.filter((d) => d.status !== "unchanged") ?? [];
  const visible = showUnchanged ? (diff ?? []) : changed;
  // Statements whose cited items differ in the latest version.
  const stale = view.statements.filter((s) => s.stale.length > 0);

  const select = (value, onChange, label) => (
    <label className="text-sm text-slate-700">
      {label}{" "}
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded border border-slate-300 px-2 py-1 text-sm"
      >
        {view.versions.map((v) => (
          <option key={v.number} value={v.number}>
            Version {v.number}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      <Card title="Saved versions">
        <ul className="space-y-1 text-sm text-slate-700">
          {view.versions.map((v) => (
            <li key={v.number}>
              <span className="font-medium text-slate-900">
                Version {v.number}
              </span>{" "}
              saved {formatDate(v.createdAt)}
              {v.number === latest && " (latest)"}
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Compare two versions"
        aside={
          <div className="flex flex-wrap items-center gap-3">
            {select(from, setFrom, "From")}
            {select(to, setTo, "To")}
            <label className="text-sm text-slate-700">
              <input
                type="checkbox"
                checked={showUnchanged}
                onChange={(e) => setShowUnchanged(e.target.checked)}
                className="mr-1"
              />
              Show unchanged
            </label>
          </div>
        }
      >
        <ErrorNote message={error} />
        {diff && changed.length === 0 && (
          <p className="text-sm text-slate-500">
            {from === to
              ? "Pick two different versions to compare."
              : "No differences between these versions."}
          </p>
        )}
        {SECTIONS.map((section) => {
          const rows = visible.filter((d) => d.section === section.key);
          if (rows.length === 0) return null;
          return (
            <div key={section.key} className="mb-4 last:mb-0">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {section.label}
              </h3>
              <ul className="space-y-2">
                {rows.map((d) => (
                  <li key={d.id} className="text-sm">
                    <span className="mr-1.5 font-semibold">{d.id}</span>
                    <Badge tone={DIFF_TONE[d.status]}>{d.status}</Badge>
                    {d.status === "modified" ? (
                      <div className="mt-1 space-y-1">
                        <p className="rounded bg-red-50 px-2 py-1 text-red-900 line-through">
                          {d.before}
                        </p>
                        <p className="rounded bg-emerald-50 px-2 py-1 text-emerald-900">
                          {d.after}
                        </p>
                      </div>
                    ) : (
                      <span className="ml-1.5 text-slate-700">
                        {d.after ?? d.before}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </Card>

      <Card
        title={`Statements made stale by package changes (${stale.length})`}
      >
        {stale.length === 0 ? (
          <p className="text-sm text-slate-500">
            None. Every statement still matches the items it cites in version{" "}
            {latest}.
          </p>
        ) : (
          <ul className="space-y-2">
            {stale.map((s) => (
              <li key={s.id} className="text-sm">
                <p className="text-slate-900">{s.text}</p>
                <p className="text-xs text-amber-900">
                  Written against version {s.versionNumber}:{" "}
                  {s.stale.map((r) => `${r.itemId} was ${r.reason}`).join(", ")}
                  .
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
