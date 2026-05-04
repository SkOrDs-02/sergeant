# Playbook: Add a Hard Rule

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Active

**Trigger:** "Add a new Hard Rule" / "Add a new mandatory convention" / any rule that should be enforced across all contributors and AI agents.

---

## Steps

### 1. Claim the next rule number

Before writing content, **pull latest `main`** and find the current highest rule number:

```bash
git pull origin main
grep -E '^### [0-9]+\.' AGENTS.md | tail -1
```

Use `N+1` as your new rule number. Do **not** claim a number without checking first — merge races can cause slot collisions (this happened with PR #1144 / #1146).

### 2. Write the canonical entry in `AGENTS.md`

Add the rule under `## Hard rules (do not break)` in `AGENTS.md`, using this structure:

```md
### N. Short imperative title

> Why a hard rule? One paragraph explaining the problem this prevents,
> ideally linking to a real incident or PR that motivated it.

Explanation of the rule. Include:

- What to do (✅ GOOD example)
- What not to do (❌ BAD example)
- Which ESLint rule enforces it (if any)
- Which paths/modules are affected or exempt
```

Follow the style of existing rules (especially #8–#12 which have `GOOD`/`BAD` code examples).

### 3. Mirror in `CONTRIBUTING.md`

Add a one-line summary to the `### Hard rules (from AGENTS.md)` section in `CONTRIBUTING.md`:

```md
N. **Short title** — one sentence summary. Enforced by `<eslint-rule>` if applicable.
```

The `pnpm lint:hard-rules-registry` CI gate fails the PR if `AGENTS.md`, `CONTRIBUTING.md`, and `docs/governance/hard-rules.json` drift apart — all three move in the same PR (Hard Rule #15).

### 4. Update `CLAUDE.md` (if the rule affects AI workflow)

If the rule changes how AI agents should work (e.g., new pre-flight checks, new commands to run), update the `## Before you write code` section in `CLAUDE.md`.

### 5. Update PR template (if the rule adds a new check)

If the rule introduces a new checkbox-worthy check for PRs, add it to `.github/PULL_REQUEST_TEMPLATE.md` in the appropriate section.

### 6. Add ESLint enforcement (optional but recommended)

If the rule can be mechanically detected:

1. Add or extend a rule in `packages/eslint-plugin-sergeant-design/`.
2. Tests go in `packages/eslint-plugin-sergeant-design/__tests__/`.
3. Run `pnpm lint:plugins` to verify.

### 7. Append to the JSON registry and regenerate the matrix

Add a new entry to [`docs/governance/hard-rules.json`](../governance/hard-rules.json) using the canonical schema:

```json
{
  "id": N,
  "title": "Short imperative title (verbatim from AGENTS.md heading)",
  "scope": ["apps/web/src/**"],
  "severity": "blocker",
  "category": "lint-enforced-convention",
  "enforced_by": [
    { "kind": "eslint-rule", "ref": "sergeant-design/<rule-name>" },
    { "kind": "ci", "ref": "pnpm lint:plugins" }
  ],
  "links": [
    { "type": "agents", "ref": "#N" },
    { "type": "pr", "ref": "#1234" }
  ]
}
```

`kind` must be one of: `ci`, `eslint-rule`, `test`, `hook`, `branch-protection`, `codeowners`, `doc`, `convention`, `pr-template` (see [`hard-rules.schema.json`](../governance/hard-rules.schema.json)).

`category` is **required** since [#1660](https://github.com/Skords-01/Sergeant/pull/1660) (initiative `0009-agent-os-hardening` PR 1.5). It must be one of:

- **`blocker-invariant`** — runtime/process invariant; violation = data loss, outage, or silent regression (e.g. DB migration safety, no-force-push, no-skip-hooks). Pick this for rules whose enforcement is the runtime/process itself.
- **`lint-enforced-convention`** — style or process rule with mechanical enforcement (ESLint plugin, commitlint, governance-sync, freshness). Same `severity: blocker`, but the enforcement gate is a linter, not a runtime invariant. **Most new design / convention rules go here.**
- **`active-initiative`** — rule shipped with an explicit allowlist + deadline (linked `TODO(NNNN-…): YYYY-MM-DD`). Treated as a blocker for new code; existing exceptions tracked separately.

The legend lives at the bottom of [`hard-rules-matrix.md`](../governance/hard-rules-matrix.md) and in the `## Hard rules` preface in `AGENTS.md`. `pnpm lint:hard-rules-registry` and `loadRegistry()` (`scripts/docs/generate-hard-rules-matrix.mjs`) reject rules without a valid `category`.

Then regenerate the index:

```bash
pnpm hard-rules:generate         # rewrites docs/governance/hard-rules-matrix.md
pnpm hard-rules:check            # CI parity check (must succeed)
pnpm lint:hard-rules-registry    # JSON ↔ AGENTS.md ↔ CONTRIBUTING.md sync gate
```

The registry is the **single source of truth for tooling**: the `pnpm hard-rules:list` CLI, the matrix doc, and (later) the monthly policy-review report all read it. Skipping this step makes the rule invisible to automation.

### 8. Bump freshness headers

The pre-commit hook (`scripts/docs/bump-last-validated.mjs`) handles this automatically when you `git add` the touched docs. Verify after `git commit` that the headers were rewritten to today's date.

### 9. Commit and PR

```bash
git add AGENTS.md CONTRIBUTING.md CLAUDE.md \
        docs/governance/hard-rules.json \
        docs/governance/hard-rules-matrix.md \
        .github/PULL_REQUEST_TEMPLATE.md
git commit -m "docs(root): add Hard Rule #N — short title"
```

---

## Verification

- [ ] `grep -E '^### N\.' AGENTS.md` — rule exists with full content.
- [ ] `docs/governance/hard-rules.json` — entry with integer `id: N` exists.
- [ ] New entry has a valid `category` (`blocker-invariant` / `lint-enforced-convention` / `active-initiative`).
- [ ] `pnpm hard-rules:check` — matrix is in sync with the JSON registry.
- [ ] `pnpm lint:hard-rules-registry` — JSON ↔ AGENTS.md ↔ CONTRIBUTING.md in sync.
- [ ] `pnpm hard-rules:list` — new rule appears in CLI dump.
- [ ] `CONTRIBUTING.md` § Hard rules has the one-line mirror.
- [ ] If AI-relevant: `CLAUDE.md` updated.
- [ ] If ESLint-enforced: `pnpm lint:plugins` passes, `pnpm lint` catches violations.
- [ ] `pnpm format:check` — clean.
- [ ] No slot collisions (rule number is unique and sequential).

---

## See also

- [AGENTS.md](../../AGENTS.md) — canonical (human) location for all Hard Rules.
- [docs/governance/hard-rules.json](../governance/hard-rules.json) — machine-readable registry.
- [docs/governance/hard-rules.schema.json](../governance/hard-rules.schema.json) — JSON Schema.
- [docs/governance/hard-rules-matrix.md](../governance/hard-rules-matrix.md) — auto-generated cross-reference.
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — mirror section.
- [CLAUDE.md](../../CLAUDE.md) — AI agent pre-flight.
