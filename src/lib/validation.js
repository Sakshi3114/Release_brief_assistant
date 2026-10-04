// Deterministic checks on a release package. No AI is involved here, so the same
// input always gives the same result. Runs on the server (authoritative) and in
// the browser (live preview while editing).

import { CHANGE_SECTIONS, SECTIONS } from "./model";

const NONE =
  /^(none|n\/a|not applicable|nothing|no known (limitations?|issues?))\.?$/i;
const PLACEHOLDER = /\b(tbd|tbc|todo|xxx|lorem ipsum)\b/i;

export const isNone = (text) => NONE.test(text.trim());

const label = (key) => SECTIONS.find((s) => s.key === key).label;

/** Sections that must be filled in. `allowNone` means an explicit "None" counts. */
const REQUIRED = [
  { key: "qa", allowNone: false },
  { key: "limitations", allowNone: true },
  { key: "migration", allowNone: true },
  { key: "affectedUsers", allowNone: false },
];

export function validatePackage(pkg) {
  const checks = [];

  const changeCount = CHANGE_SECTIONS.reduce(
    (n, key) => n + pkg[key].length,
    0,
  );
  checks.push({
    id: "changes-present",
    label: "At least one change",
    status: changeCount > 0 ? "pass" : "fail",
    message:
      changeCount > 0
        ? `${changeCount} change item(s) across features, bug fixes and changed behaviour.`
        : "Add at least one completed feature, bug fix or changed behaviour.",
  });

  for (const { key, allowNone } of REQUIRED) {
    const items = pkg[key];
    const real = items.filter((i) => !isNone(i.text));
    let status = "pass";
    let message = `${items.length} item(s).`;
    if (items.length === 0) {
      status = "fail";
      message = allowNone
        ? `Required. If there are none, add an item that says "None" so the gap is deliberate.`
        : "Required. Add at least one item.";
    } else if (!allowNone && real.length === 0) {
      status = "fail";
      message = `"None" is not accepted here. Add at least one real item.`;
    }
    checks.push({ id: `required-${key}`, label: label(key), status, message });
  }

  const everything = SECTIONS.flatMap((s) => pkg[s.key]);

  const placeholders = everything
    .filter((i) => PLACEHOLDER.test(i.text))
    .map((i) => i.id);
  if (placeholders.length > 0) {
    checks.push({
      id: "placeholders",
      label: "Placeholder text",
      status: "warn",
      message: `Placeholder text (TBD, TODO or similar) in ${placeholders.join(", ")}.`,
    });
  }

  const tooShort = everything
    .filter((i) => !isNone(i.text) && i.text.trim().length < 12)
    .map((i) => i.id);
  if (tooShort.length > 0) {
    checks.push({
      id: "too-short",
      label: "Very short items",
      status: "warn",
      message: `${tooShort.join(", ")} may be too short to summarise accurately.`,
    });
  }

  const seen = new Map();
  const duplicates = [];
  for (const item of everything) {
    const norm = item.text.trim().toLowerCase().replace(/\s+/g, " ");
    if (isNone(norm)) continue;
    const first = seen.get(norm);
    if (first) duplicates.push(`${item.id} repeats ${first}`);
    else seen.set(norm, item.id);
  }
  if (duplicates.length > 0) {
    checks.push({
      id: "duplicates",
      label: "Duplicate items",
      status: "warn",
      message: `${duplicates.join("; ")}.`,
    });
  }

  const migrationIsNone =
    pkg.migration.length > 0 && pkg.migration.every((i) => isNone(i.text));
  if (pkg.changedBehaviour.length > 0 && migrationIsNone) {
    checks.push({
      id: "behaviour-without-migration",
      label: "Changed behaviour without migration notes",
      status: "warn",
      message:
        'Behaviour changed but migration notes say "None". Confirm users need to do nothing.',
    });
  }

  return checks;
}

export const hasFailures = (checks) => checks.some((c) => c.status === "fail");
