# Security Hardening Backlog

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Active

Беклог посилення безпеки (security hardening) — структурований список знахідок із внутрішнього security-review від 2026-05-03. Кожна знахідка живе у власному файлі-картці (`<id>-<slug>.md`), згрупована у спринти за пріоритетом усунення.

Це **не** аудит у класичному сенсі (як файли у `docs/audits/`) — це **робочий беклог**: кожна картка має `Status` (`Open` / `In progress` / `Closed`), власника та точку виправлення. Закрита картка лишається як historical record і не видаляється.

## Чому це не «audit»

| Папка                                    | Призначення                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `docs/audits/`                           | Snapshot-аудити в момент часу (UX, doc-hygiene, comprehensive). Закриваються одним «implementation-roadmap». |
| `docs/security/hardening/` (**цей док**) | Living беклог security-знахідок. Одна знахідка = одна картка. Картки переходять `Open → Closed` поступово.   |
| `docs/security/`                         | Канонічні security-політики (access policy, vulnerability SLA, disaster recovery). Не беклог.                |

Якщо в майбутньому з'явиться повторний security-review — він додає нові картки сюди (з incremental id-ами, наприклад `C3-...`, `H10-...`), а не створює окремий audit-файл.

## Зведений рейтинг (54 знахідки)

| Severity                  | Кількість |
| ------------------------- | --------- |
| Critical                  | 2         |
| High                      | 9         |
| Medium                    | 21        |
| Low                       | 14        |
| Informational / hardening | 8         |

## Spring roadmap

| Sprint                                   | Що закриваємо                              | Effort |
| ---------------------------------------- | ------------------------------------------ | ------ |
| [Sprint 1](./sprint-1.md) — 1–2 тижні    | C1, C2, H1, H2                             | ~2.5d  |
| [Sprint 2](./sprint-2.md) — тиждень 3–4  | H3, H5, H6, H7, H8, H9, M1, M3             | ~5d    |
| [Sprint 3](./sprint-3.md) — місяць 2     | I1 (CodeQL), I2, M4–M21 batched            | ~7d    |
| [Sprint 4](./sprint-4.md) — місяць 2.5–3 | L1–L14 cleanup, I3 (SBOM), I6 threat-model | ~5d    |

Окремі sprint-overview-файли (`sprint-N.md`) тримають narrative-опис, чому саме ці картки разом, що міряємо як «success», та залежності між картками.

## Картки за severity

### Critical

| ID                                       | Title                                       | Status                              | Sprint                    |
| ---------------------------------------- | ------------------------------------------- | ----------------------------------- | ------------------------- |
| [C1](./C1-mono-webhook-secret-in-url.md) | Monobank webhook secret leaks via URL path  | In progress (Phase 1 shipped 05-04) | [Sprint 1](./sprint-1.md) |
| [C2](./C2-frontend-csp.md)               | Frontend SPA не має Content-Security-Policy | In progress (Phase 1 shipped 05-04) | [Sprint 1](./sprint-1.md) |

### High

| ID                                       | Title                                                    | Status                                                                                                       | Sprint                    |
| ---------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------- |
| [H1](./H1-mobile-bearer-storage.md)      | Bearer token у мобільному shell без явного Keychain-AC   | Closed (Phase 1, 2026-05-04)                                                                                 | [Sprint 1](./sprint-1.md) |
| [H2](./H2-dependabot.md)                 | Немає Dependabot / Renovate                              | Closed (2026-05-04)                                                                                          | [Sprint 1](./sprint-1.md) |
| [H3](./H3-session-revoke-and-binding.md) | Сесія 30d без revoke-on-password-change і device-binding | Closed (2026-05-04) — PR [#1669](https://github.com/Skords-01/Sergeant/pull/1669)                            | [Sprint 2](./sprint-2.md) |
| [H4](./H4-encryption-key-rotation.md)    | Немає сценарію ротації `*_TOKEN_ENC_KEY`                 | Phase 1 closed (2026-05-04) — PR [#1679](https://github.com/Skords-01/Sergeant/pull/1679); Phase 2 follow-up | [Sprint 3](./sprint-3.md) |
| [H5](./H5-trusted-origins-exp-scheme.md) | `exp://` як trusted origin у production                  | Closed (2026-05-04)                                                                                          | Sprint 2                  |
| [H6](./H6-email-verification.md)         | Email verification disabled                              | Closed (2026-05-04, partial)                                                                                 | Sprint 2                  |
| [H7](./H7-vercel-config-drift.md)        | `vercel.json` SSOT drift                                 | Closed (2026-05-04)                                                                                          | Sprint 2                  |
| [H8](./H8-corp-per-route.md)             | Helmet `CORP: cross-origin` глобально                    | Closed (2026-05-04)                                                                                          | Sprint 2                  |
| [H9](./H9-transcribe-usd-cap.md)         | Transcribe per-user USD-cap відсутній                    | Closed (2026-05-04, partial)                                                                                 | Sprint 2                  |

### Medium / Low / Informational

Окремі картки з'являються у `sprint-2.md` … `sprint-4.md`. Повний список — у [Sprint roadmap](#spring-roadmap) вище.

Закриті Medium / Low картки (хронологічно):

| ID                                             | Title                                                   | Status                                                                                                     | Sprint                    |
| ---------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------- |
| [M2](./M2-trust-proxy-parameterize.md)         | `trust proxy = 1` hard-coded                            | Closed (2026-05-04) — PR [#1682](https://github.com/Skords-01/Sergeant/pull/1682)                          | [Sprint 3](./sprint-3.md) |
| [M4](./M4-groq-model-allowlist.md)             | `GROQ_TRANSCRIBE_MODEL` env-injectable, no allowlist    | Closed (2026-05-04) — batched M4 + M5 + M13 hardening PR                                                   | [Sprint 3](./sprint-3.md) |
| [M5](./M5-audio-mime-normalize.md)             | Audio MIME aliases without normalization                | Closed (2026-05-04) — batched M4 + M5 + M13 hardening PR                                                   | [Sprint 3](./sprint-3.md) |
| [M13](./M13-require-session-soft-loud-fail.md) | `requireSessionSoft` swallows DB errors as 401          | Closed (2026-05-04, server-side) — batched M4 + M5 + M13 hardening PR; client-side push back-off follow-up | [Sprint 3](./sprint-3.md) |
| [M7](./M7-chat-tool-iteration-cap.md)          | Chat loop has no `MAX_TOOL_ITERATIONS` cap              | Closed (2026-05-04) — batched M7 + M12 hardening PR                                                        | [Sprint 3](./sprint-3.md) |
| [M12](./M12-web-vitals-hardening.md)           | `web-vitals` ingest body cap, allowlist + UA normalise  | Closed (2026-05-04) — batched M7 + M12 hardening PR                                                        | [Sprint 3](./sprint-3.md) |
| [M6](./M6-image-magic-byte-check.md)           | Photo endpoints accept base64 without magic-byte check  | Closed (2026-05-04) — batched M6 + M8 hardening PR                                                         | [Sprint 3](./sprint-3.md) |
| [M8](./M8-prompt-injection-tool-output.md)     | Tool-result blocks not wrapped vs prompt injection      | Closed (2026-05-04) — batched M6 + M8 hardening PR                                                         | [Sprint 3](./sprint-3.md) |
| [M11](./M11-eslint-plugin-security.md)         | No SAST lint rules for non-literal SQL/FS calls         | Closed (2026-05-04) — PR [#1747](https://github.com/Skords-01/Sergeant/pull/1747)                          | [Sprint 3](./sprint-3.md) |
| [M15](./M15-console-allowlist-fail-closed.md)  | Confirm `CONSOLE_BOT_TOKEN` allowlist is fail-closed    | Closed (2026-05-04) — PR [#1742](https://github.com/Skords-01/Sergeant/pull/1742)                          | [Sprint 3](./sprint-3.md) |
| [M16](./M16-telegram-markdown-v2.md)           | Telegram `parse_mode: "Markdown"` is the legacy variant | Closed (2026-05-04) — PR [#1765](https://github.com/Skords-01/Sergeant/pull/1765)                          | [Sprint 3](./sprint-3.md) |
| [M18](./M18-openclaw-per-call-usd-cap.md)      | OpenClaw daily $5 budget without per-call cap           | Closed (2026-05-04) — PR [#1760](https://github.com/Skords-01/Sergeant/pull/1760)                          | [Sprint 3](./sprint-3.md) |
| [I1](./I1-codeql-workflow.md)                  | Add CodeQL SAST workflow                                | Closed (2026-05-04) — PR [#1749](https://github.com/Skords-01/Sergeant/pull/1749)                          | [Sprint 3](./sprint-3.md) |
| [M10](./M10-csrf-token-check.md)               | No CSRF token check on state-changing routes            | Closed (2026-05-04) — PR [#1784](https://github.com/Skords-01/Sergeant/pull/1784) (batched M10 + M14 + M19) | [Sprint 3](./sprint-3.md) |
| [M14](./M14-internal-push-ip-allowlist.md)     | Internal `/api/push/send` has no IP allowlist           | Closed (2026-05-04) — PR [#1784](https://github.com/Skords-01/Sergeant/pull/1784) (batched M10 + M14 + M19) | [Sprint 3](./sprint-3.md) |
| [M19](./M19-mobile-deeplink-sanitize.md)       | Mobile shell deep-link query/fragment unsanitised       | Closed (2026-05-04) — PR [#1784](https://github.com/Skords-01/Sergeant/pull/1784) (batched M10 + M14 + M19) | [Sprint 3](./sprint-3.md) |

## Cross-references

- [docs/security/vulnerability-sla.md](../vulnerability-sla.md) — SLA на реакцію + дедлайн усунення.
- [docs/security/audit-exceptions.md](../audit-exceptions.md) — затверджені винятки з security findings.
- [docs/governance/security-incident-policy.md](../../governance/security-incident-policy.md) — incident-policy.
- [docs/audits/](../../audits/) — snapshot-аудити (НЕ ці картки).

## Як працювати з цим беклогом

1. **Беремо найвищий-severity Open-card** (Critical → High → Medium → Low) і ставимо у sprint.
2. **Status: Open → In progress** + assignee у frontmatter картки.
3. **Створюємо feature-branch + PR**. У PR-описі: `Closes docs/security/hardening/<ID>-<slug>.md`.
4. **Після merge**: `Status: Closed` + дата + коментар «Resolved in PR #NNN».
5. **Картка не видаляється** — лишається як historical record (як ADR).

Картки можна додавати **тільки** через PR (один тимчасовий branch може додавати кілька карток одночасно). Severity — за CVSS v3.1 з product-context override (як у [vulnerability-sla.md](../vulnerability-sla.md)).
