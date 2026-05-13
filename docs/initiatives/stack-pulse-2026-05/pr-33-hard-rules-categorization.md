# PR-33: 21 hard rules — categorize

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Closed — implemented via 3 enforcement-categories (`blocker-invariant` / `lint-enforced-convention` / `active-initiative`) instead of 5 subject-categories. See [ADR-0045](../../adr/0045-hard-rules-taxonomy.md), [`docs/governance/hard-rules-matrix.md`](../../governance/hard-rules-matrix.md), [`docs/governance/rules/`](../../governance/rules/) per-rule files, AGENTS.md `Hard rules` section, and `pnpm lint:hard-rules-registry` 3-way sync gate.

|                    |                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------- |
| **Severity**       | Low (L6) — також закриває R9 redundancy                                               |
| **Linked finding** | L6, R9 (`00-overview.md`)                                                             |
| **Owner**          | @Skords-01                                                                            |
| **Effort**         | 0.5–1 день                                                                            |
| **Risk**           | None (pure docs / governance reorganization)                                          |
| **Touches**        | `docs/governance/hard-rules.json`, `docs/governance/hard-rules-matrix.md`, AGENTS.md  |
| **Trigger**        | (resolved) categorization landed pre-22nd rule; new rules додаються через схему JSON. |

## Контекст

`docs/governance/hard-rules.json` зараз має **21 entry** (`rg -c "\"id\":"`). Audit згадував 17, drift +4. Рули перемішують категорії:

- Engineering hygiene (Hard Rule #4 two-phase migrations, #20 PAT-block)
- Security (CSP, env)
- Design / UX (probably few)
- Process (PR templates, code-review)

При читанні `AGENTS.md` рендер всіх 21 rule-ом у row inline → перевантажує.

## Scope

### 1. Categorization

Розбити 21 rules на ~5 categories:

- **Engineering** — code-level invariants (two-phase migrations, no global state, etc.).
- **Security** — CSP, secrets, auth-rate-limit.
- **Operability** — observability, logging, CI gates.
- **Design** — UX patterns, accessibility, naming.
- **Process** — PR review, commit conventions.

### 2. Schema update

`docs/governance/hard-rules.schema.json`:

```jsonc
{
  "rule": {
    "type": "object",
    "required": ["id", "category", "title", "rationale", "enforcement"],
    "properties": {
      "category": {
        "enum": ["engineering", "security", "operability", "design", "process"],
      },
    },
  },
}
```

### 3. Per-category navigation

`AGENTS.md` rendering:

```markdown
### Hard Rules (21 total)

- **Engineering** (8): #4 two-phase migrations, #11 ..., ...
- **Security** (5): #6 fail-closed rate-limit, #20 PAT-block у prod, ...
- **Operability** (4): ...
- **Design** (2): ...
- **Process** (2): ...

Full list → [`docs/governance/hard-rules.md`](./docs/governance/hard-rules.md)
```

### 4. Per-category enforcement table

`docs/governance/hard-rules.md` — table з тричі sortable: by id, by category, by enforcement-strictness (CI-gate, manual-review, advisory).

## Out of scope

- Видалення / merging duplicate rules — окремий audit (хоча 21→17 в audit-у говорить про можливий drift).
- Cross-reference з ESLint plugin rules — окремий PR.

## Acceptance criteria (DoD)

- [x] `hard-rules.schema.json` має `category` field required (`required: ["id", "title", "scope", "severity", "category", "enforced_by"]`).
- [x] `hard-rules.json` всі 21 entry мають `category` (8 `blocker-invariant` + 11 `lint-enforced-convention` + 2 `active-initiative`).
- [x] Per-rule canonical bodies живуть у [`docs/governance/rules/`](../../governance/rules/) (з BAD/GOOD прикладами); за-rule машино-читабельна матриця — [`docs/governance/hard-rules-matrix.md`](../../governance/hard-rules-matrix.md).
- [x] AGENTS.md `Hard rules` section містить таксономію + per-rule таблицю (`#`, `Rule`, `Category`, `Per-rule file`).
- [x] 3-way sync gate (`pnpm lint:hard-rules-registry` через `scripts/check-hard-rules-registry-sync.mjs`) валідує що `AGENTS.md ↔ hard-rules.json ↔ docs/governance/rules/*` не дрейфують.

> **Implementation note:** Реалізовано як **3 enforcement-категорії**, не 5 subject-категорій. Категорії описують _як_ правило enforcing-ається (runtime invariant / linter / sunset-allowlist), не _яку_ область покриває (engineering / security / etc.). Логіку рішення зафіксовано в [ADR-0045](../../adr/0045-hard-rules-taxonomy.md) — subject-домен явно винесено за scope (`scope` field у `hard-rules.json` його несе окремо).

## Тести

- Schema-validation у CI (`ajv-cli`).
- Smoke: всі 21 rule-и рендеряться у new MD без duplicate references.

## Rollout

- Single PR. Pure docs / governance reorganization.

## Risks & mitigations

| Risk                                                                 | Mitigation                                                             |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Rule категорія ambiguous (e.g. CSP — security чи operability?)       | ADR-style decision у PR description; default — більш restrictive class |
| Tooling що читає `hard-rules.json` (e.g., Devin Knowledge) ламається | Schema breaking-change handled у sequenced PR; consumer updated first  |

## Touchpoints (file:line)

- `docs/governance/hard-rules.json` — додати `category` per entry
- `docs/governance/hard-rules.schema.json` — schema update
- `docs/governance/hard-rules.md` — re-render
- `AGENTS.md` — Hard Rules section refresh
- `scripts/check-hard-rules-doc.mjs` — validation script (якщо є)

## Refs

- [JSON Schema enum validation](https://json-schema.org/understanding-json-schema/reference/generic.html#enum)
- ADR-0035 hard rules policy (якщо є)
