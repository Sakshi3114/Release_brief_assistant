// Deterministic checks applied to the model's output before anything is stored.
// The model is asked to cite real item ids and to stay out of approval decisions;
// this code enforces both instead of trusting that it did.

import { CHANGE_SECTIONS, allItems } from "./model";

// Narrow on purpose: it should catch a readiness verdict, not a feature that
// happens to be about approvals.
const VERDICT =
  /\b(release|build|version|it) (is|has been) (approved|signed[- ]off|cleared)\b|\b(ready|safe|cleared|good) (to|for) (ship|deploy|release|go[- ]live|production)\b/i;

export function applyGuardrails(raw, pkg) {
  const known = new Set(allItems(pkg).map((i) => i.id));
  const changeIds = new Set(
    CHANGE_SECTIONS.flatMap((key) => pkg[key].map((i) => i.id)),
  );
  const qaIds = new Set(pkg.qa.map((i) => i.id));
  const notes = [];
  let unknownCitations = 0;

  const keepKnown = (ids, allowed = known) => {
    const unique = [...new Set(ids.map((id) => id.trim().toUpperCase()))];
    const kept = unique.filter((id) => allowed.has(id));
    unknownCitations += unique.length - kept.length;
    return kept;
  };

  const classifications = raw.classifications
    .map((c) => ({ ...c, itemId: c.itemId.trim().toUpperCase() }))
    .filter((c) => changeIds.has(c.itemId));
  const droppedClassifications =
    raw.classifications.length - classifications.length;
  if (droppedClassifications > 0) {
    notes.push(
      `Dropped ${droppedClassifications} classification(s) that pointed at an item that isn't a change.`,
    );
  }

  const unsupportedClaims = raw.unsupportedClaims
    .map((u) => ({
      ...u,
      itemId: u.itemId.trim().toUpperCase(),
      relatedQaIds: keepKnown(u.relatedQaIds, qaIds),
    }))
    .filter((u) => known.has(u.itemId));

  const missingInformation = raw.missingInformation.map((m) => ({
    ...m,
    relatedItemIds: keepKnown(m.relatedItemIds),
  }));

  const statements = [];
  let verdicts = 0;
  for (const s of raw.statements) {
    const text = s.text.trim();
    if (!text) continue;
    if (VERDICT.test(text)) {
      verdicts++;
      continue;
    }
    statements.push({ kind: s.kind, text, citations: keepKnown(s.citations) });
  }

  if (verdicts > 0) {
    notes.push(
      `Removed ${verdicts} statement(s) that gave a verdict on release approval or readiness.`,
    );
  }
  if (unknownCitations > 0) {
    notes.push(
      `Removed ${unknownCitations} citation(s) to item ids that don't exist in this version.`,
    );
  }
  const uncited = statements.filter((s) => s.citations.length === 0).length;
  if (uncited > 0) {
    notes.push(
      `${uncited} statement(s) have no valid citation and can't be approved until one is added.`,
    );
  }

  // Coverage: every change should appear in both summaries. The model can leave
  // items out, so this is counted here and shown to the reviewer.
  for (const kind of ["technical", "stakeholder"]) {
    const covered = new Set(
      statements.filter((s) => s.kind === kind).flatMap((s) => s.citations),
    );
    const missing = [...changeIds].filter((id) => !covered.has(id));
    if (missing.length > 0) {
      notes.push(
        `The ${kind} summary has no statement about ${missing.join(", ")}. Re-run the analysis to try again.`,
      );
    }
  }

  return {
    result: {
      classifications,
      missingInformation,
      unsupportedClaims,
      statements,
    },
    notes,
  };
}
