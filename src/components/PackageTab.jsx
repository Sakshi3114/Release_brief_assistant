"use client";

import { useMemo, useState } from "react";
import { validatePackage } from "@/lib/validation";
import { SECTIONS } from "@/lib/model";
import { Badge, Button, Card, ErrorNote, api } from "./ui";

const CHECK_TONE = { pass: "green", fail: "red", warn: "amber" };

const normalise = (draft) =>
  JSON.stringify(
    SECTIONS.map((s) =>
      draft[s.key]
        .filter((i) => i.text.trim())
        .map((i) => [i.id, i.text.trim()]),
    ),
  );

export function ChecksList({ checks }) {
  return (
    <ul className="space-y-2">
      {checks.map((check) => (
        <li key={check.id} className="flex items-start gap-2 text-sm">
          <Badge tone={CHECK_TONE[check.status]}>{check.status}</Badge>
          <span>
            <span className="font-medium text-slate-900">{check.label}.</span>{" "}
            <span className="text-slate-600">{check.message}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PackageTab({ view, onSaved }) {
  const [draft, setDraft] = useState(() =>
    structuredClone(view.latest.package),
  );
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const dirty = normalise(draft) !== normalise(view.latest.package);

  // Same function the server runs; here it only previews the result while typing.
  const checks = useMemo(() => {
    const preview = Object.fromEntries(
      SECTIONS.map((s) => [
        s.key,
        draft[s.key]
          .filter((i) => i.text.trim())
          .map((i) => ({ id: i.id ?? "new item", text: i.text })),
      ]),
    );
    return validatePackage(preview);
  }, [draft]);

  const update = (key, items) =>
    setDraft((current) => ({ ...current, [key]: items }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/releases/${view.id}/versions`, "POST", draft);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        {SECTIONS.map((section) => (
          <Card
            key={section.key}
            title={section.label}
            aside={
              <Button
                onClick={() =>
                  update(section.key, [...draft[section.key], { text: "" }])
                }
              >
                Add item
              </Button>
            }
          >
            {draft[section.key].length === 0 && (
              <p className="text-sm text-slate-500">No items yet.</p>
            )}
            <ul className="space-y-2">
              {draft[section.key].map((item, index) => (
                <li
                  key={item.id ?? `new-${index}`}
                  className="flex items-start gap-2"
                >
                  <span className="mt-2 w-12 shrink-0">
                    <Badge tone={item.id ? "neutral" : "blue"}>
                      {item.id ?? "new"}
                    </Badge>
                  </span>
                  <textarea
                    aria-label={`${section.label} item ${item.id ?? "new"}`}
                    value={item.text}
                    rows={2}
                    onChange={(e) =>
                      update(
                        section.key,
                        draft[section.key].map((it, i) =>
                          i === index ? { ...it, text: e.target.value } : it,
                        ),
                      )
                    }
                    className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />

                  <Button
                    variant="danger"
                    onClick={() =>
                      update(
                        section.key,
                        draft[section.key].filter((_, i) => i !== index),
                      )
                    }
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Card
          title={
            dirty
              ? "Checks (unsaved draft)"
              : `Checks (version ${view.latest.number})`
          }
        >
          <ChecksList checks={checks} />
          <p className="mt-3 text-xs text-slate-500">
            These checks are rule-based code. No AI is involved.
          </p>
        </Card>
        <Card>
          <div className="space-y-2">
            <Button
              variant="primary"
              onClick={save}
              disabled={!dirty || saving}
            >
              {saving ? "Saving…" : `Save as version ${view.latest.number + 1}`}
            </Button>
            <p className="text-xs text-slate-500">
              Saving adds a new version and keeps the old ones. Statements that
              cite an item you changed or removed will be marked stale.
            </p>
            <ErrorNote message={error} />
          </div>
        </Card>
      </aside>
    </div>
  );
}
