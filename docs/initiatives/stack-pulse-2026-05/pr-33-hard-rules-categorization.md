# PR-33: 21 hard rules → 5 categorized "Hard Areas"

> **Last validated:** 2026-05-07 by Devin. **Next review:** 2026-08-05.
> **Status:** Planned

|                    |                                                                                |
| ------------------ | ------------------------------------------------------------------------------ |
| **Severity**       | Low (L6) — також закриває R9 redundancy                                        |
| **Linked finding** | L6, R9 (`00-overview.md`)                                                      |
| **Owner**          | TBD (sponsor: @Skords-01)                                                      |
| **Effort**         | 0.5–1 день                                                                     |
| **Risk**           | None (pure docs / governance reorganization)                                   |
| **Touches**        | `docs/governance/hard-rules.json`, `docs/governance/hard-rules.md`, AGENTS.md  |
| **Trigger**        | next time someone додає 22-ге правило і doc стає harder-to-skim                |

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
        "enum": ["engineering", "security", "operability", "design", "process"]
      }
    }
  }
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

- [ ] `hard-rules.schema.json` має `category` field required.
- [ ] `hard-rules.json` всі 21 entry мають `category`.
- [ ] `hard-rules.md` rendering з 5 sections + summary table.
- [ ] AGENTS.md categorized navigation.
- [ ] `scripts/check-hard-rules-doc.mjs` (existing або new) валідує schema.

## Тести

- Schema-validation у CI (`ajv-cli`).
- Smoke: всі 21 rule-и рендеряться у new MD без duplicate references.

## Rollout

- Single PR. Pure docs / governance reorganization.

## Risks & mitigations

| Risk                                                                  | Mitigation                                                            |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Rule категорія ambiguous (e.g. CSP — security чи operability?)        | ADR-style decision у PR description; default — більш restrictive class |
| Tooling що читає `hard-rules.json` (e.g., Devin Knowledge) ламається  | Schema breaking-change handled у sequenced PR; consumer updated first  |

## Touchpoints (file:line)

- `docs/governance/hard-rules.json` — додати `category` per entry
- `docs/governance/hard-rules.schema.json` — schema update
- `docs/governance/hard-rules.md` — re-render
- `AGENTS.md` — Hard Rules section refresh
- `scripts/check-hard-rules-doc.mjs` — validation script (якщо є)

## Refs

- [JSON Schema enum validation](https://json-schema.org/understanding-json-schema/reference/generic.html#enum)
- ADR-0035 hard rules policy (якщо є)
