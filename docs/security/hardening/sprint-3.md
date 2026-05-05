# Sprint 3 — Medium-severity backlog and SAST onboarding

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-03.
> **Status:** Active (H4 Phase 1 + M2 + M4 + M5 + M6 + M7 + M8 + M12 + M13 closed 2026-05-04 — PR [#1679](https://github.com/Skords-01/Sergeant/pull/1679) ships the Better Auth side of the key-rotation infra + runbook; PR [#1682](https://github.com/Skords-01/Sergeant/pull/1682) parameterises trust-proxy via `TRUST_PROXY` env; the M4 + M5 + M13 batched hardening PR ships boot-time Groq-model allowlist, canonical-only audio MIME normaliser, and a circuit-breaker + counter for `requireSessionSoft` lookup failures; the M7 + M12 batched hardening PR ships chat `MAX_TOOL_ITERATIONS=8` cap with `chat_tool_iteration_cap_hit_total{boundary}` metric and `/api/metrics/web-vitals` body cap (10 KB), tightened rate-limit (50 r/min), explicit metric-name allowlist regression coverage, and reusable `lib/uaNormalise.ts` helper; the M6 + M8 batched hardening PR ships server-side magic-byte validation for nutrition photo endpoints (`lib/imageMagic.ts` + `nutrition_photo_rejected_total{endpoint,reason}`) and tool*result envelope `<tool_output tool="…">…</tool_output>` with prompt-injection scanner (`modules/chat/toolOutputWrapping.ts` + `chat_prompt_injection_attempt_total{tool}` + system prompt v8). H4 Phase 2 (Mono `mono_connection.token*\*` migration) and the M13 client-side push back-off both tracked as follow-ups.)

Sprint 3 finishes the High-severity backlog (H4 encryption-key rotation —
deferred from Sprint 2 because it requires a DB migration), drains the
Medium queue (M2, M4–M21), and adds the two informational items that pay
back fastest in CI signal: I1 CodeQL and I2 secret-scanning push protection.

The Sprint 3 cards are deliberately leaner than Sprint 1 / Sprint 2 — each
Medium ships in a few hours, so the cards stay close to "title, evidence,
fix, verify" and avoid pages of impact narrative. H4 keeps the long form
because it is a High and touches data at rest.

## Scope

| ID                                             | Title                                                | Severity | Owner    | Effort                                                                                                                                                                                                                                                       |
| ---------------------------------------------- | ---------------------------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [H4](./H4-encryption-key-rotation.md)          | No rotation procedure for AES-256-GCM data keys      | High     | backend  | 1.5 d _(Phase 1 closed 2026-05-04 — PR [#1679](https://github.com/Skords-01/Sergeant/pull/1679); Phase 2 follow-up open)_                                                                                                                                    |
| [M2](./M2-trust-proxy-parameterize.md)         | `trust proxy = 1` hard-coded                         | Medium   | backend  | 0.25 d _(closed 2026-05-04 — PR [#1682](https://github.com/Skords-01/Sergeant/pull/1682))_                                                                                                                                                                   |
| [M4](./M4-groq-model-allowlist.md)             | `GROQ_TRANSCRIBE_MODEL` env-injectable, no allowlist | Medium   | backend  | 0.1 d _(closed 2026-05-04 — batched M4 + M5 + M13 hardening PR)_                                                                                                                                                                                             |
| [M5](./M5-audio-mime-normalize.md)             | Audio MIME aliases without normalization             | Medium   | backend  | 0.1 d _(closed 2026-05-04 — batched M4 + M5 + M13 hardening PR)_                                                                                                                                                                                             |
| [M6](./M6-image-magic-byte-check.md)           | Photo endpoints accept base64 without magic check    | Medium   | backend  | 0.5 d _(closed 2026-05-04 — batched M6 + M8 hardening PR)_                                                                                                                                                                                                   |
| [M7](./M7-chat-tool-iteration-cap.md)          | Chat loop has no `MAX_TOOL_ITERATIONS` cap           | Medium   | backend  | 0.25 d _(closed 2026-05-04 — batched M7 + M12 hardening PR)_                                                                                                                                                                                                 |
| [M8](./M8-prompt-injection-tool-output.md)     | Tool-result blocks not wrapped to defang prompts     | Medium   | backend  | 0.5 d _(closed 2026-05-04 — batched M6 + M8 hardening PR)_                                                                                                                                                                                                   |
| [M9](./M9-per-ip-secondary-rate-limit.md)      | Mass-account abuse can scale rate-limit linearly     | Medium   | backend  | 0.5 d                                                                                                                                                                                                                                                        |
| [M10](./M10-csrf-token-check.md)               | No CSRF token on state-changing routes               | Medium   | backend  | 0.5 d _(closed 2026-05-04 — PR [#1784](https://github.com/Skords-01/Sergeant/pull/1784); batched with M14 + M19)_                                                                                                                                            |
| [M11](./M11-eslint-plugin-security.md)         | No SAST lint rules for non-literal SQL/FS calls      | Medium   | platform | 0.25 d _(closed 2026-05-04 — `eslint-plugin-security` wired for server+console with companion `no-restricted-syntax` selector and `Linter`-driven plugin test)_                                                                                              |
| [M12](./M12-web-vitals-hardening.md)           | `web-vitals` ingest needs cap, allowlist, normaliser | Medium   | backend  | 0.25 d _(closed 2026-05-04 — batched M7 + M12 hardening PR)_                                                                                                                                                                                                 |
| [M13](./M13-require-session-soft-loud-fail.md) | `requireSessionSoft` swallows DB errors as 401       | Medium   | backend  | 0.25 d _(server-side closed 2026-05-04 — batched M4 + M5 + M13 hardening PR; client-side push back-off follow-up)_                                                                                                                                           |
| [M14](./M14-internal-push-ip-allowlist.md)     | `/api/push/send` has no IP allowlist                 | Medium   | backend  | 0.25 d _(closed 2026-05-04 — PR [#1784](https://github.com/Skords-01/Sergeant/pull/1784); batched with M10 + M19)_                                                                                                                                           |
| [M15](./M15-console-allowlist-fail-closed.md)  | Confirm `CONSOLE_BOT_TOKEN` allowlist is fail-closed | Medium   | console  | 0.1 d _(closed 2026-05-04 — `isUserAllowed` aligned with OpenClaw fail-closed pattern + regression matrix)_                                                                                                                                                  |
| [M16](./M16-telegram-markdown-v2.md)           | Telegram `parse_mode: "Markdown"` legacy             | Medium   | console  | 0.25 d _(closed 2026-05-04 — PR [#1765](https://github.com/Skords-01/Sergeant/pull/1765); call-sites migrated to MarkdownV2 + ESLint plugin rule `sergeant-design/no-legacy-telegram-parse-mode` blocks regressions + HELP_TEXT snapshot test locks output)_ |
| [M17](./M17-console-global-rate-cap.md)        | Console rate-limit per-user, no global cap           | Medium   | console  | 0.25 d _(closed 2026-05-05 — batched M17 + L8 + L10 hardening PR; secondary global bucket on `FixedWindowRateLimiter` + `console.global_rate_cap_hit_total{boundary}`)_                                                                                      |
| [M18](./M18-openclaw-per-call-usd-cap.md)      | OpenClaw daily $5 budget without per-call cap        | Medium   | console  | 0.1 d _(closed 2026-05-04 — PR [#1760](https://github.com/Skords-01/Sergeant/pull/1760); pre-flight cost estimator + guard in `tools/console/src/openclaw/policy.ts`; metric `openclaw.per_call_cap_hit_total` wired)_                                       |
| [M19](./M19-mobile-deeplink-sanitize.md)       | Mobile shell deep-link query/fragment unsanitised    | Medium   | mobile   | 0.25 d _(closed 2026-05-04 — PR [#1784](https://github.com/Skords-01/Sergeant/pull/1784); batched with M10 + M14)_                                                                                                                                           |
| [M20](./M20-mobile-back-button-confirm.md)     | `App.exitApp()` on back without unsaved-state check  | Medium   | mobile   | 0.25 d                                                                                                                                                                                                                                                       |
| [M21](./M21-coep-stripe-compatibility.md)      | `COEP: require-corp` may break Stripe / OAuth iframe | Medium   | frontend | 0.25 d                                                                                                                                                                                                                                                       |
| [I1](./I1-codeql-workflow.md)                  | Add CodeQL SAST workflow                             | Info     | platform | 0.5 d _(closed 2026-05-04 — `.github/workflows/codeql.yml` SHA-pinned with `security-extended` + `security-and-quality` suites; runbook + triage in `docs/security/codeql.md`)_                                                                              |
| [I2](./I2-secret-scanning-push-protection.md)  | Enable secret-scanning + push protection             | Info     | platform | 0.1 d _(closed 2026-05-04)_                                                                                                                                                                                                                                  |

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

- **H4 Phase 1:** Better Auth `account.{accessToken,refreshToken,idToken}` reads
  legacy `enc:v1:` and writes versioned `enc:v2:k<N>:…` ciphertext; dual-key
  ring honours `BETTER_AUTH_TOKEN_ENC_KEYS=v1:…,v2:…` +
  `BETTER_AUTH_TOKEN_ENC_KEY_CURRENT_VERSION`; lazy re-encrypt observed via
  `auth_token_lazy_reencrypt_total`; rotation runbook published in
  [`docs/runbooks/encryption-key-rotation.md`](../../runbooks/encryption-key-rotation.md).
  _Closed 2026-05-04 — PR [#1679](https://github.com/Skords-01/Sergeant/pull/1679)._
- **H4 Phase 2 (open):** Mono `mono_connection.token_*` migration
  `040_token_key_version.sql` + `mono/crypto.ts` keyRing wiring; success metric
  is the same shape (zero rows un-decryptable, `mono_token_lazy_reencrypt_total`
  drains to zero after the retire-old window).
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
