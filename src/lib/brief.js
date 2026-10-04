// The final brief is assembled by code from statements a human approved.
// No AI runs here, so nothing unreviewed can reach the brief.

import { hasFailures } from "./validation";
import { allItems } from "./model";

/** Reasons the brief can't be generated yet. Empty means it can. */
export function briefBlockers(checks, analysis, statements) {
  const blockers = [];
  if (hasFailures(checks))
    blockers.push("The release package has failing required-section checks.");
  if (!analysis) {
    blockers.push("No analysis has been run yet.");
    return blockers;
  }
  const pending = statements.filter((s) => s.status === "pending").length;
  if (pending > 0)
    blockers.push(
      `${pending} statement(s) still need a decision (approve or reject).`,
    );
  const staleApproved = statements.filter(
    (s) => s.status === "approved" && s.stale.length > 0,
  ).length;
  if (staleApproved > 0) {
    blockers.push(
      `${staleApproved} approved statement(s) are stale. Edit or reject them, or re-run the analysis.`,
    );
  }
  const usable = statements.filter(
    (s) => s.status === "approved" && s.stale.length === 0,
  );
  if (!usable.some((s) => s.kind === "technical"))
    blockers.push("No approved technical statement.");
  if (!usable.some((s) => s.kind === "stakeholder"))
    blockers.push("No approved stakeholder statement.");
  return blockers;
}

export function buildBrief(input) {
  const { releaseName, versionNumber, pkg, statements, reviewer, date } = input;
  const approved = statements.filter(
    (s) => s.status === "approved" && s.stale.length === 0,
  );
  const rejected = statements.filter((s) => s.status === "rejected").length;
  const edited = approved.filter((s) => s.edited).length;

  const list = (kind) => {
    const rows = approved.filter((s) => s.kind === kind);
    if (rows.length === 0) return "_None approved._";
    return rows
      .map((s) => `- ${s.text} [${s.citations.join(", ")}]`)
      .join("\n");
  };

  const cited = new Set(approved.flatMap((s) => s.citations));
  const sources = allItems(pkg)
    .filter((i) => cited.has(i.id))
    .map((i) => `- **${i.id}**: ${i.text.trim().replace(/\s+/g, " ")}`)
    .join("\n");

  return `# Release brief: ${releaseName}

Package version ${versionNumber} · Reviewed by ${reviewer} on ${date}

> This brief records a human review of release communication. It is not a release approval and does not authorise deployment.

## For internal technical users

${list("technical")}

## For stakeholders and clients

${list("stakeholder")}

## Known risks and limitations

${list("risk")}

## Sources cited

${sources || "_None._"}

## Review record

- ${approved.length} statement(s) approved, ${edited} of them edited by the reviewer, ${rejected} rejected.
- Every statement above was drafted by AI and then approved by ${reviewer}.
- Identifiers in square brackets refer to the release items listed under "Sources cited".
`;
}
