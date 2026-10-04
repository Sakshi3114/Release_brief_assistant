"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, ErrorNote, api, formatDate } from "@/components/ui";

export default function Home() {
  const router = useRouter();
  const [releases, setReleases] = useState(null);
  const [name, setName] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    api("/api/releases")
      .then(setReleases)
      .catch((e) => setError(e.message));
  }, []);

  async function create(body) {
    setError(null);
    try {
      const { id } = await api("/api/releases", "POST", body);
      router.push(`/releases/${id}`);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">
          Release brief assistant
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Enter a release package, let AI draft cited summaries, then review
          each statement before a brief is produced.
        </p>
      </header>

      <Card title="Start a release">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            create({ name });
          }}
        >
          <label className="text-sm text-slate-700">
            Release name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Billing Portal 2.4"
              className="mt-1 block w-64 rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Create
          </Button>
          <Button onClick={() => create({ sample: true })}>
            Load sample 1 (billing)
          </Button>
          <Button onClick={() => create({ sample: 2 })}>
            Load sample 2 (team chat)
          </Button>
        </form>
        <div className="mt-2">
          <ErrorNote message={error} />
        </div>
      </Card>

      <Card title="Releases">
        {releases === null && !error && (
          <p className="text-sm text-slate-500">Loading…</p>
        )}
        {releases?.length === 0 && (
          <p className="text-sm text-slate-500">No releases yet.</p>
        )}
        <ul className="divide-y divide-slate-100">
          {releases?.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <Link
                href={`/releases/${r.id}`}
                className="font-medium text-slate-900 underline"
              >
                {r.name}
              </Link>
              <span className="text-slate-500">
                version {r.latestVersion} · created {formatDate(r.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
