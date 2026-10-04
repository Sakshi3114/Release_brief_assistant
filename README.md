# Release brief assistant

A developer enters a structured release package. AI drafts cited summaries for two audiences and points out gaps. A person reviews every statement, and only approved statements reach the final brief.

## Run it

Requires Node 22.13 or later (it uses Node's built-in SQLite module).

```bash
npm install
npm run dev        # http://localhost:3000
```

The app works without an API key: it runs in **mock mode**, where keyword rules stand in for the model. To use a real model, copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY` (Claude) or `GEMINI_API_KEY` (Gemini, which has a free tier). Both providers get the same prompt and their output goes through the same guardrails.

```bash
npm test           # unit tests for the deterministic logic
npm run lint
```

## Try it in five minutes

1. On the home page, choose **Load sample 1 (billing)**. The sample has deliberate gaps. Sample 2 is harder: it adds a claim that QA contradicts and a prompt-injection attempt.
2. **Package** tab: the checks on the right are rule-based. Delete every QA item to see a required section fail.
3. **Review** tab: choose **Run analysis**. It flags `F2` ("all account sizes", but QA tested up to 500 invoices) and `B2` and `C1` (no QA evidence).
4. Approve, reject or edit each statement. Each one lists the items it cites.
5. **Package** tab: change the text of `F1` and save. This creates version 2.
6. **Review** tab: statements citing `F1` are now marked stale and can't be approved until edited.
7. **Versions** tab: compare version 1 with version 2.
8. **Brief** tab: it lists what still blocks the brief. Once resolved, enter a reviewer name and generate it.

## How it is built

Next.js (App Router) in JavaScript, SQLite, and structured JSON output from the model (Claude or Gemini). Zod checks the shape of every request and of the model's reply at run time.

| Path | What it does |
|---|---|
| `src/lib/validation.js` | Deterministic checks on required sections |
| `src/lib/ids.js` | Assigns stable item ids (`F1`, `QA3`) that are never reused |
| `src/lib/ai.js` | The prompt, the output schema and the Claude and Gemini calls |
| `src/lib/guardrails.js` | Checks the model's output before it is stored |
| `src/lib/staleness.js` | Hashes cited items and detects stale statements |
| `src/lib/diff.js` | Compares two versions by item id |
| `src/lib/brief.js` | Decides whether a brief may be generated, and assembles it |
| `src/lib/store.js` | All database access |
| `src/lib/model.js` | Section list and the shapes of the main objects |
| `src/lib/mock-ai.js` | Stand-in for the model when no key is set |
| `src/app/api/` | Route handlers |
| `src/components/` | The four tabs: Package, Review, Versions, Brief |

## Design decisions

**Every item has a stable id, and every AI statement cites ids.** This one choice supports most of the requirements. Citations are checked by code against the ids that exist. Staleness is a hash comparison. Version comparison is a diff keyed on id.

**Code decides what code can decide.** Required-section checks, citation validity, staleness, version diffs and brief assembly involve no AI, so they give the same answer every time and can be unit tested. The model is used only for judgement: impact, gaps, unsupported claims and drafting.

**The model's output is not trusted.** Structured outputs guarantee the shape. `guardrails.js` then removes citations to ids that don't exist, marks uncited statements so they can't be approved, removes any statement that gives a verdict on release readiness, and reports any change that a summary leaves out. What was removed is shown to the reviewer.

**The AI cannot approve or deploy.** It has no tools and no database access. It returns JSON, and every statement is stored as `pending`. The only code that changes a status is `PATCH /api/statements/[id]`, called from the reviewer's buttons. There is no deploy code and no "release approved" field anywhere. The brief states that it is a review record, not a release approval.

**Versions are immutable.** Saving inserts a new row and never updates an old one. An identical save is rejected.

**Stale statements can't be approved.** A statement stores a hash of each item it cites. If an item's text changes or the item is removed, the statement is stale. The reviewer can edit it, which re-pins it to the current version and returns it to `pending`, or reject it, or re-run the analysis.

**The brief is assembled by code.** It is blocked while required checks fail, while any statement is undecided, or while an approved statement is stale. It contains only approved statements, their citations and the cited source text.

**Release text is treated as data.** The package goes in the user message as JSON, and the system prompt tells the model not to follow instructions found inside items.

## Limits and what I would do next

- Re-running the analysis replaces the working set of statements. Earlier statements stay in the database but are not shown. Carrying approved, unaffected statements forward would save reviewer time.
- The findings (impact, missing information, unsupported claims) are shown for the version they were produced for. They are labelled when the package has moved on, but are not tracked item by item the way statements are.
- There is no login. The reviewer's name is typed in when the brief is generated.
- Unsupported-claim detection depends on the model's judgement. An evaluation set of packages with known gaps would be the way to measure it.
- Mock mode exists so the workflow can be run without a key. Its heuristics are not a substitute for the model.

Not built, as the task says they are not required: Git provider integration, deployment, rollback, public changelog publishing.
