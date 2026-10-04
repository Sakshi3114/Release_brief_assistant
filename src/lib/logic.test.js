import { describe, expect, it } from "vitest";
import { briefBlockers } from "./brief";
import { diffPackages } from "./diff";
import { applyGuardrails } from "./guardrails";
import { assignIds } from "./ids";
import { mockAnalysis } from "./mock-ai";
import { SAMPLE_PACKAGE } from "./sample";
import { snapshotHashes, staleReasons } from "./staleness";
import { emptyPackage } from "./model";
import { hasFailures, validatePackage } from "./validation";

const sample = () => assignIds(SAMPLE_PACKAGE, []);

describe("validatePackage", () => {
  it("passes the sample package", () => {
    expect(hasFailures(validatePackage(sample()))).toBe(false);
  });

  it("fails every required section on an empty package", () => {
    const failed = validatePackage(emptyPackage())
      .filter((c) => c.status === "fail")
      .map((c) => c.id);
    expect(failed).toEqual([
      "changes-present",
      "required-qa",
      "required-limitations",
      "required-migration",
      "required-affectedUsers",
    ]);
  });

  it("accepts an explicit None for limitations but not for QA", () => {
    const pkg = sample();
    pkg.limitations = [{ id: "L1", text: "None" }];
    pkg.qa = [{ id: "QA1", text: "N/A" }];
    const byId = Object.fromEntries(
      validatePackage(pkg).map((c) => [c.id, c.status]),
    );
    expect(byId["required-limitations"]).toBe("pass");
    expect(byId["required-qa"]).toBe("fail");
  });

  it("warns when behaviour changed but migration notes say None", () => {
    const pkg = sample();
    pkg.migration = [{ id: "M1", text: "None" }];
    expect(
      validatePackage(pkg).some((c) => c.id === "behaviour-without-migration"),
    ).toBe(true);
  });
});

describe("assignIds", () => {
  it("numbers new items per section", () => {
    const pkg = sample();
    expect(pkg.features.map((i) => i.id)).toEqual(["F1", "F2"]);
    expect(pkg.qa.map((i) => i.id)).toEqual(["QA1", "QA2", "QA3"]);
  });

  it("keeps existing ids and never reuses a removed one", () => {
    const v1 = sample();
    const v2 = assignIds({ ...v1, features: [v1.features[0]] }, [v1]);
    const v3 = assignIds(
      {
        ...v2,
        features: [...v2.features, { text: "A new feature for everyone." }],
      },
      [v1, v2],
    );
    expect(v3.features.map((i) => i.id)).toEqual(["F1", "F3"]);
  });

  it("ignores an id the client made up", () => {
    const pkg = assignIds(
      { ...emptyPackage(), features: [{ id: "F99", text: "Invented id." }] },
      [],
    );
    expect(pkg.features[0].id).toBe("F1");
  });
});

describe("staleness", () => {
  it("is not stale when cited items are unchanged", () => {
    const pkg = sample();
    expect(staleReasons(snapshotHashes(pkg, ["F1", "QA1"]), pkg)).toEqual([]);
  });

  it("reports changed and removed items, and ignores whitespace-only edits", () => {
    const v1 = sample();
    const hashes = snapshotHashes(v1, ["F1", "F2", "QA1"]);
    const v2 = sample();
    v2.features[0].text = "Customers can download invoices as PDF or CSV.";
    v2.features[1].text = `  ${v2.features[1].text}  `;
    v2.qa = v2.qa.filter((i) => i.id !== "QA1");
    expect(staleReasons(hashes, v2)).toEqual([
      { itemId: "F1", reason: "changed" },
      { itemId: "QA1", reason: "removed" },
    ]);
  });
});

describe("diffPackages", () => {
  it("classifies added, removed, modified and unchanged items", () => {
    const v1 = sample();
    const v2 = sample();
    v2.features[0].text = "Changed text for the first feature.";
    v2.bugFixes = v2.bugFixes.slice(0, 1);
    v2.limitations.push({ id: "L2", text: "A second limitation was found." });
    const status = Object.fromEntries(
      diffPackages(v1, v2).map((d) => [d.id, d.status]),
    );
    expect(status.F1).toBe("modified");
    expect(status.F2).toBe("unchanged");
    expect(status.B2).toBe("removed");
    expect(status.L2).toBe("added");
  });
});

describe("applyGuardrails", () => {
  const raw = {
    classifications: [
      { itemId: "F1", impact: "medium", rationale: "ok" },
      { itemId: "QA1", impact: "low", rationale: "not a change item" },
    ],
    missingInformation: [],
    unsupportedClaims: [
      {
        itemId: "F2",
        claim: "all sizes",
        reason: "partly tested",
        relatedQaIds: ["QA3", "F1"],
      },
    ],
    statements: [
      {
        kind: "technical",
        text: "PDF download was added.",
        citations: ["f1", "QA1", "F42"],
      },
      { kind: "stakeholder", text: "Everything is great.", citations: ["Z9"] },
      {
        kind: "risk",
        text: "This release is approved and ready to ship.",
        citations: ["F1"],
      },
    ],
  };

  it("drops unknown citations, normalises ids and keeps uncited statements unapprovable", () => {
    const { result, notes } = applyGuardrails(raw, sample());
    expect(result.statements[0].citations).toEqual(["F1", "QA1"]);
    expect(result.statements[1].citations).toEqual([]);
    expect(result.classifications.map((c) => c.itemId)).toEqual(["F1"]);
    expect(result.unsupportedClaims[0].relatedQaIds).toEqual(["QA3"]);
    expect(notes.length).toBeGreaterThan(0);
  });

  it("removes statements that give a readiness or approval verdict", () => {
    const { result } = applyGuardrails(raw, sample());
    expect(result.statements).toHaveLength(2);
    expect(result.statements.some((s) => /approved/.test(s.text))).toBe(false);
  });
});

describe("mockAnalysis", () => {
  it("flags the sample's unsupported claims and only cites real items", () => {
    const pkg = sample();
    const { result } = applyGuardrails(mockAnalysis(pkg), pkg);
    const flagged = result.unsupportedClaims.map((u) => u.itemId);
    expect(flagged).toEqual(expect.arrayContaining(["F2", "B2", "C1"]));
    expect(flagged).not.toContain("B1");
    expect(result.statements.every((s) => s.citations.length > 0)).toBe(true);
  });
});

describe("briefBlockers", () => {
  const statement = (over) => ({
    id: 1,
    kind: "technical",
    text: "t",
    originalText: "t",
    citations: ["F1"],
    status: "approved",
    edited: false,
    versionNumber: 1,
    stale: [],
    ...over,
  });
  const analysis = {
    versionNumber: 1,
    mode: "mock",
    model: null,
    createdAt: "",
    classifications: [],
    missingInformation: [],
    unsupportedClaims: [],
    guardrailNotes: [],
  };
  const checks = validatePackage(sample());

  it("allows a brief when everything is decided and fresh", () => {
    const statements = [
      statement({}),
      statement({ id: 2, kind: "stakeholder" }),
    ];
    expect(briefBlockers(checks, analysis, statements)).toEqual([]);
  });

  it("blocks on pending and on stale approved statements", () => {
    const statements = [
      statement({ status: "pending" }),
      statement({
        id: 2,
        kind: "stakeholder",
        stale: [{ itemId: "F1", reason: "changed" }],
      }),
    ];
    expect(
      briefBlockers(checks, analysis, statements).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("blocks when no analysis exists", () => {
    expect(briefBlockers(checks, null, [])).toContain(
      "No analysis has been run yet.",
    );
  });
});
