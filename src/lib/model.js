// Shared constants and helpers for the release package.
// This file must stay free of Node-only imports: the browser uses it too.
//
// The shapes of the main objects used across the app:
//
//   item       { id: "F1", text: "..." }
//              The id is assigned by the server and never reused.
//   package    { features: [item], bugFixes: [item], changedBehaviour: [item],
//                qa: [item], limitations: [item], migration: [item], affectedUsers: [item] }
//   check      { id, label, status: "pass" | "fail" | "warn", message }
//   analysis   { classifications:    [{ itemId, impact, rationale }],
//                missingInformation: [{ description, severity, relatedItemIds }],
//                unsupportedClaims:  [{ itemId, claim, reason, relatedQaIds }],
//                statements:         [{ kind, text, citations }] }
//              kind is "technical", "stakeholder" or "risk".
//   statement  { id, kind, text, originalText, citations, edited, versionNumber,
//                status: "pending" | "approved" | "rejected",
//                stale: [{ itemId, reason: "changed" | "removed" }] }
//   item diff  { id, section, status: "added" | "removed" | "modified" | "unchanged",
//                before, after }

export const SECTIONS = [
  { key: "features", label: "Completed features", prefix: "F" },
  { key: "bugFixes", label: "Bug fixes", prefix: "B" },
  { key: "changedBehaviour", label: "Changed behaviour", prefix: "C" },
  { key: "qa", label: "QA summary", prefix: "QA" },
  { key: "limitations", label: "Known limitations", prefix: "L" },
  { key: "migration", label: "Migration or configuration notes", prefix: "M" },
  { key: "affectedUsers", label: "Affected user groups", prefix: "U" },
];

/** Sections whose items describe a change shipped in the release. */
export const CHANGE_SECTIONS = ["features", "bugFixes", "changedBehaviour"];

export function emptyPackage() {
  return {
    features: [],
    bugFixes: [],
    changedBehaviour: [],
    qa: [],
    limitations: [],
    migration: [],
    affectedUsers: [],
  };
}

export function allItems(pkg) {
  return SECTIONS.flatMap((s) =>
    pkg[s.key].map((item) => ({ ...item, section: s.key })),
  );
}
