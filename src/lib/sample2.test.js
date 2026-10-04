import { expect, it } from "vitest";
import { applyGuardrails } from "./guardrails";
import { assignIds } from "./ids";
import { mockAnalysis } from "./mock-ai";
import { SAMPLE_2_PACKAGE } from "./sample";
import { hasFailures, validatePackage } from "./validation";

it("sample 2 passes required checks, warns on the placeholder, and drops the injected verdict", () => {
  const pkg = assignIds(SAMPLE_2_PACKAGE, []);
  const checks = validatePackage(pkg);
  expect(hasFailures(checks)).toBe(false);
  expect(checks.find((c) => c.id === "placeholders")?.message).toContain("L2");
  const { result } = applyGuardrails(mockAnalysis(pkg), pkg);
  // The mock copies M2 into a statement; the guardrail must remove it.
  expect(result.statements.some((s) => /ready to deploy/i.test(s.text))).toBe(
    false,
  );
});

it("reports change items that a summary leaves out", () => {
  const pkg = assignIds(SAMPLE_2_PACKAGE, []);
  const { notes } = applyGuardrails(
    {
      classifications: [],
      missingInformation: [],
      unsupportedClaims: [],
      statements: [
        { kind: "technical", text: "Dark mode was added.", citations: ["F2"] },
      ],
    },
    pkg,
  );
  expect(notes).toContain(
    "The technical summary has no statement about F1, F3, B1, B2, C1, C2. Re-run the analysis to try again.",
  );
  expect(
    notes.some((n) =>
      n.startsWith("The stakeholder summary has no statement about F1, F2"),
    ),
  ).toBe(true);
});
