# I6 — Document the STRIDE threat model per module

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** Closed (2026-05-06, doc-only) — see Resolution log.

| Field          | Value                             |
| -------------- | --------------------------------- |
| **Severity**   | Informational / hardening         |
| **Sprint**     | [Sprint 4](./sprint-4.md)         |
| **Owner**      | platform                          |
| **Effort**     | 1 person-day                      |
| **Status**     | **Closed** (2026-05-06, doc-only) |
| **Discovered** | 2026-05-03 deep security review   |

## Summary

Future contributors and reviewers benefit from an explicit threat model
that documents which STRIDE category each module is most exposed to and
which controls mitigate it. The 53 hardening cards in this directory are
the _findings_; the threat model is the _map_ against which those findings
are explained.

## Recommendation

Author `docs/security/threat-model.md` with a section per module:

- **Server (Express + Better Auth)** — STRIDE table; controls; residual
  risk.
- **Web (Vite SPA)** — XSS surface, CSP posture, supply-chain risk.
- **Mobile shell (Capacitor)** — local storage, deep-link surface,
  device-binding.
- **Console / OpenClaw (Telegram bot)** — allowlist fail-closed, command
  surface, AI cost guardrails.
- **Mono integration** — webhook auth, OAuth tokens, replay window.
- **Data store (Postgres + SQLite)** — encryption at rest, key rotation,
  ownership checks.

## Correction points

- [`docs/security/threat-model.md`](../threat-model.md) (new) — STRIDE
  tables for each of the six modules called out in the
  recommendation, plus a system-context section, a cross-cutting
  controls table, and an `## Acceptance` section explaining how the
  document stays in sync with the hardening backlog.
- [`docs/security/README.md`](../README.md) — link added to the
  document index alongside `vulnerability-sla.md`.

The `threat-model.svg` data-flow diagram is intentionally deferred:
the per-module tables already pin down trust boundaries (Public ↔
SPA/Mobile ↔ Hub API ↔ Postgres + external APIs), and a separate
diagram would re-state the same content while drifting from the
living tables. If a vendor pentest ([I8](./I8-periodic-external-pentest.md))
later asks for a diagram, regenerate it from the tables — don't author
it by hand.

## Verification

- **Living doc:** every new finding card cross-references the relevant
  STRIDE row in [`docs/security/threat-model.md`](../threat-model.md).
  Section `## Acceptance` of that document specifies the contract;
  reviewers reject hardening PRs that touch a new surface without first
  adding the row to the threat model.
- **Review cadence:** the document carries the canonical
  `> **Last validated** … **Next review** …` freshness header (auto-bumped
  by `scripts/docs/bump-last-validated.mjs`); the freshness guard
  re-flags it every 90 days for a re-audit.

## Cross-references

- [`../README.md`](../README.md)
- All cards in [`./README.md`](./README.md) — the threat model summarises
  them.

## Resolution log

### 2026-05-06 — closed (doc-only)

Added [`docs/security/threat-model.md`](../threat-model.md), a STRIDE map for
the web PWA, API, mobile clients, Console/OpenClaw, n8n workflows, and data
stores. The document links the highest-risk paths back to the existing
hardening cards, secret register, Vercel COEP matrix, and DR runbooks.
