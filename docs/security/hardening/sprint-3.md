# Sprint 3 — Medium-severity backlog and SAST onboarding

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Planned

Sprint 3 finishes the High-severity backlog (H4 encryption-key rotation —
deferred from Sprint 2 because it requires a DB migration), drains the
Medium queue (M2, M4–M21), and adds the two informational items that pay
back fastest in CI signal: I1 CodeQL and I2 secret-scanning push protection.

The Sprint 3 cards are deliberately leaner than Sprint 1 / Sprint 2 — each
Medium ships in a few hours, so the cards stay close to "title, evidence,
fix, verify" and avoid pages of impact narrative. H4 keeps the long form
because it is a High and touches data at rest.

## Scope

| ID                                             | Title                                                | Severity | Owner    | Effort                      |
| ---------------------------------------------- | ---------------------------------------------------- | -------- | -------- | --------------------------- |
| [H4](./H4-encryption-key-rotation.md)          | No rotation procedure for AES-256-GCM data keys      | High     | backend  | 1.5 d                       |
| [M2](./M2-trust-proxy-parameterize.md)         | `trust proxy = 1` hard-coded                         | Medium   | backend  | 0.25 d                      |
| [M4](./M4-groq-model-allowlist.md)             | `GROQ_TRANSCRIBE_MODEL` env-injectable, no allowlist | Medium   | backend  | 0.1 d                       |
| [M5](./M5-audio-mime-normalize.md)             | Audio MIME aliases without normalization             | Medium   | backend  | 0.1 d                       |
| [M6](./M6-image-magic-byte-check.md)           | Photo endpoints accept base64 without magic check    | Medium   | backend  | 0.5 d                       |
| [M7](./M7-chat-tool-iteration-cap.md)          | Chat loop has no `MAX_TOOL_ITERATIONS` cap           | Medium   | backend  | 0.25 d                      |
| [M8](./M8-prompt-injection-tool-output.md)     | Tool-result blocks not wrapped to defang prompts     | Medium   | backend  | 0.5 d                       |
| [M9](./M9-per-ip-secondary-rate-limit.md)      | Mass-account abuse can scale rate-limit linearly     | Medium   | backend  | 0.5 d                       |
| [M10](./M10-csrf-token-check.md)               | No CSRF token on state-changing routes               | Medium   | backend  | 0.5 d                       |
| [M11](./M11-eslint-plugin-security.md)         | No SAST lint rules for non-literal SQL/FS calls      | Medium   | platform | 0.25 d                      |
| [M12](./M12-web-vitals-hardening.md)           | `web-vitals` ingest needs cap, allowlist, normaliser | Medium   | backend  | 0.25 d                      |
| [M13](./M13-require-session-soft-loud-fail.md) | `requireSessionSoft` swallows DB errors as 401       | Medium   | backend  | 0.25 d                      |
| [M14](./M14-internal-push-ip-allowlist.md)     | `/api/push/send` has no IP allowlist                 | Medium   | backend  | 0.25 d                      |
| [M15](./M15-console-allowlist-fail-closed.md)  | Confirm `CONSOLE_BOT_TOKEN` allowlist is fail-closed | Medium   | console  | 0.1 d                       |
| [M16](./M16-telegram-markdown-v2.md)           | Telegram `parse_mode: "Markdown"` legacy             | Medium   | console  | 0.25 d                      |
| [M17](./M17-console-global-rate-cap.md)        | Console rate-limit per-user, no global cap           | Medium   | console  | 0.25 d                      |
| [M18](./M18-openclaw-per-call-usd-cap.md)      | OpenClaw daily $5 budget without per-call cap        | Medium   | console  | 0.1 d                       |
| [M19](./M19-mobile-deeplink-sanitize.md)       | Mobile shell deep-link query/fragment unsanitised    | Medium   | mobile   | 0.25 d                      |
| [M20](./M20-mobile-back-button-confirm.md)     | `App.exitApp()` on back without unsaved-state check  | Medium   | mobile   | 0.25 d                      |
| [M21](./M21-coep-stripe-compatibility.md)      | `COEP: require-corp` may break Stripe / OAuth iframe | Medium   | frontend | 0.25 d                      |
| [I1](./I1-codeql-workflow.md)                  | Add CodeQL SAST workflow                             | Info     | platform | 0.5 d                       |
| [I2](./I2-secret-scanning-push-protection.md)  | Enable secret-scanning + push protection             | Info     | platform | 0.1 d _(closed 2026-05-04)_ |

**Total effort:** ≈ 6 person-days.

## Rationale

- **H4** lands first because it shapes how M-class items integrate with the
  encryption layer (e.g. M3 redaction interactions with rotated keys).
- **M2, M9, M10** are foundational hardening on the request-handling path and
  pair well in a single PR.
- **M4–M8** cluster around AI/transcription cost and content-safety surfaces.
- **M11, I1, I2** form a "make CI louder" mini-track and ship together so the
  signal/noise ratio is measured against one baseline.
- **M12–M21** are surface-specific paper cuts batched by area (push/console/
  mobile/frontend) so reviewers do not context-switch.

## Success metrics

- **H4:** dual-key migration runs in staging end-to-end with zero rows
  un-decryptable; rotation runbook published in `docs/runbooks/`.
- **M11/I1:** CodeQL produces ≤ 5 findings on the first scheduled run; any
  remaining finding has a triage entry in `docs/security/audit-exceptions.md`.
- **All Mediums:** each card moves to **Closed** with the linked
  implementation PR referenced in the front-matter.

## Cross-references

- [`./README.md`](./README.md) — full backlog index.
- [`./sprint-2.md`](./sprint-2.md) — preceding sprint.
- [`../vulnerability-sla.md`](../vulnerability-sla.md) — Medium SLA = 30 days.
- [`../audit-exceptions.md`](../audit-exceptions.md) — exception ledger for
  any items deferred during Sprint 3.
