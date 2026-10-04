// Stand-in for the model when no ANTHROPIC_API_KEY is set, so the whole workflow
// can be run and graded without a key. It uses keyword heuristics, returns the
// same shape as the real model, and goes through the same guardrails. Its prose
// is deliberately plain; it is labelled "mock" everywhere in the UI.

import { isNone } from "./validation";
import { CHANGE_SECTIONS } from "./model";

const STOPWORDS = new Set(
  "about after again also been before being could does each every from have into more most must only other over same should some such than that their them then there these they this those through under very were what when where which while will with would your users user added adds fixed fixes when now all new".split(
    " ",
  ),
);

const tokens = (text) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w))
      // Crude plural stripping so "invoices" matches "invoice".
      .map((w) => w.replace(/s$/, "")),
  );

const overlap = (a, b) => [...a].filter((w) => b.has(w)).length;

const ABSOLUTE =
  /\b(all|every|fully|always|never|100%|any|guaranteed|no (issues|impact|downtime))\b/i;
const HIGH =
  /\b(breaking|removed?|deprecat\w*|must|required?|data loss|security|crash\w*|payment|billing|outage)\b/i;

const firstSentence = (text) =>
  text.trim().replace(/\s+/g, " ").replace(/\.$/, "");

export function mockAnalysis(pkg) {
  const changes = CHANGE_SECTIONS.flatMap((key) =>
    pkg[key].map((item) => ({ ...item, section: key })),
  );
  const qa = pkg.qa.filter((i) => !isNone(i.text));
  const coverage = new Map(
    changes.map((c) => [
      c.id,
      qa.filter((q) => overlap(tokens(c.text), tokens(q.text)) >= 2),
    ]),
  );
  const groups = pkg.affectedUsers.map((u) => u.id);

  const classifications = changes.map((c) => {
    const impact = HIGH.test(c.text)
      ? "high"
      : c.section === "bugFixes"
        ? "low"
        : "medium";
    return {
      itemId: c.id,
      impact,
      rationale:
        impact === "high"
          ? "The wording suggests users must act or an existing workflow changes."
          : impact === "medium"
            ? "Users are likely to notice this change."
            : "Most users are unlikely to notice this change.",
    };
  });

  const unsupportedClaims = [];
  for (const c of changes) {
    const covering = coverage.get(c.id) ?? [];
    if (covering.length === 0) {
      unsupportedClaims.push({
        itemId: c.id,
        claim: firstSentence(c.text),
        reason:
          "No QA item mentions this change, so there is no evidence it was tested.",
        relatedQaIds: [],
      });
    } else if (
      ABSOLUTE.test(c.text) &&
      !covering.some((q) => ABSOLUTE.test(q.text))
    ) {
      unsupportedClaims.push({
        itemId: c.id,
        claim: firstSentence(c.text),
        reason:
          "The item makes an absolute claim, but the related QA evidence covers only specific cases.",
        relatedQaIds: covering.map((q) => q.id),
      });
    }
  }

  const missingInformation = [];
  const migrationIsNone = pkg.migration.every((i) => isNone(i.text));
  for (const c of pkg.changedBehaviour) {
    if (migrationIsNone) {
      missingInformation.push({
        description: `${c.id} changes existing behaviour but there is no migration or configuration note for it.`,
        severity: "high",
        relatedItemIds: [c.id],
      });
    }
  }
  for (const q of qa) {
    if (!/\d|pass|fail/i.test(q.text)) {
      missingInformation.push({
        description: `${q.id} does not state a result or how much was tested.`,
        severity: "medium",
        relatedItemIds: [q.id],
      });
    }
  }

  const statements = [];
  for (const c of changes) {
    const covering = (coverage.get(c.id) ?? []).map((q) => q.id);
    const verb =
      c.section === "features"
        ? "Feature"
        : c.section === "bugFixes"
          ? "Bug fix"
          : "Behaviour change";
    statements.push({
      kind: "technical",
      text: `${verb}: ${firstSentence(c.text)}.${covering.length ? ` QA evidence: ${covering.join(", ")}.` : ""}`,
      citations: [c.id, ...covering],
    });
    statements.push({
      kind: "stakeholder",
      text:
        c.section === "features"
          ? `New in this release: ${firstSentence(c.text)}.`
          : c.section === "bugFixes"
            ? `We resolved an issue: ${firstSentence(c.text)}.`
            : `Something works differently now: ${firstSentence(c.text)}.`,
      citations: [c.id, ...groups.slice(0, 1)],
    });
  }
  for (const m of pkg.migration.filter((i) => !isNone(i.text))) {
    statements.push({
      kind: "technical",
      text: `Action needed: ${firstSentence(m.text)}.`,
      citations: [m.id],
    });
  }
  for (const l of pkg.limitations.filter((i) => !isNone(i.text))) {
    statements.push({
      kind: "risk",
      text: `Known limitation: ${firstSentence(l.text)}.`,
      citations: [l.id],
    });
  }
  for (const u of unsupportedClaims) {
    statements.push({
      kind: "risk",
      text: `${u.itemId} is not backed by the QA evidence supplied: ${u.reason}`,
      citations: [u.itemId, ...u.relatedQaIds],
    });
  }

  return { classifications, missingInformation, unsupportedClaims, statements };
}
