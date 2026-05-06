# I6 — Document the STRIDE threat model per module

> **Last validated:** 2026-05-06 by Codex. **Next review:** 2026-08-04.
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

- `docs/security/threat-model.md` (new) — STRIDE tables + diagrams.
- `docs/security/README.md` — link to the new document.
- Optional: a `threat-model.svg` data-flow diagram (Mermaid is
  acceptable).

## Verification

- **Review:** founder + one engineer review the document and tick each
  STRIDE box for each module.
- **Living doc:** every new finding card cross-references the relevant
  STRIDE row.

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
