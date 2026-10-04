"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BriefTab } from "./BriefTab";
import { PackageTab } from "./PackageTab";
import { ReviewTab } from "./ReviewTab";
import { VersionsTab } from "./VersionsTab";
import { Badge, ErrorNote, api } from "./ui";

const TABS = ["Package", "Review", "Versions", "Brief"];

export function Workspace({ id }) {
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("Package");

  const reload = useCallback(() => {
    api(`/api/releases/${id}`)
      .then((data) => {
        setView(data);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!view) {
    return (
      <main className="mx-auto w-full max-w-6xl p-4">
        {error ? (
          <ErrorNote message={error} />
        ) : (
          <p className="text-sm text-slate-500">Loading…</p>
        )}
      </main>
    );
  }

  const pending = view.statements.filter((s) => s.status === "pending").length;
  const stale = view.statements.filter((s) => s.stale.length > 0).length;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 p-4">
      <header className="space-y-2">
        <Link href="/" className="text-sm text-slate-600 underline">
          All releases
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-900">{view.name}</h1>
          <Badge>version {view.latest.number}</Badge>
          {pending > 0 && <Badge tone="blue">{pending} to review</Badge>}
          {stale > 0 && <Badge tone="amber">{stale} stale</Badge>}
        </div>
        <nav className="flex gap-1 border-b border-slate-200">
          {TABS.map((name) => (
            <button
              key={name}
              onClick={() => setTab(name)}
              aria-current={tab === name ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                tab === name
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {name}
            </button>
          ))}
        </nav>
      </header>

      <ErrorNote message={error} />

      {/* Keyed on the version so the editor resets to the saved package after a save. */}
      {tab === "Package" && (
        <PackageTab key={view.latest.number} view={view} onSaved={reload} />
      )}
      {tab === "Review" && <ReviewTab view={view} onChanged={reload} />}
      {tab === "Versions" && (
        <VersionsTab key={view.latest.number} view={view} />
      )}
      {tab === "Brief" && <BriefTab view={view} onChanged={reload} />}
    </main>
  );
}
