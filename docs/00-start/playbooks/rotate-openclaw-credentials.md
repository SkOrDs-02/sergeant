# Playbook: Ротація OpenClaw GitHub credentials

> ⚠️ **OpenClaw повністю decommissioned ([ADR-0075](../../04-governance/adr/0075-openclaw-gateway-decommissioned.md), 2026-07-20).** OpenClaw GitHub-інтеграції, Gateway і Telegram-бота більше не існує в коді — жодного живого кроку з цього файлу виконувати нема чим. Файл стиснуто до redirect-стаба; повний історичний runbook — у git history цього файлу.

> **Last touched:** 2026-08-08 by @claude. **Next review:** 2026-11-06.
> **Status:** Deprecated (OpenClaw decommissioned — ADR-0075)

**Redirect:** актуальний плейбук для будь-якої ротації секретів — [`rotate-secrets.md`](./rotate-secrets.md).

## Що лишається чинним

Hard Rule #20 (No OpenClaw PATs in production) **не скасовано** ADR-0075 — `assertStartupEnv()` у [`apps/server/src/env/**`](../../../apps/server/src/env/) досі fail-closed блокує prod-старт, якщо в secret-store лежить залишковий `OPENCLAW_GITHUB_PAT` чи `Git_PAT`. Якщо шукаєш саме цю перевірку — дивись [rule 20](../../04-governance/governance/rules/20-no-openclaw-pats-in-production.md), не цей файл.

## Споріднені документи

- [`rotate-secrets.md`](./rotate-secrets.md) — канонічний плейбук ротації секретів.
- [ADR-0075](../../04-governance/adr/0075-openclaw-gateway-decommissioned.md) — decommission rationale.
- [`playbook-catalog.md` § Deprecated redirect anchors](./playbook-catalog.md#deprecated-redirect-anchors).

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                                                                                   | Merged     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------- |
| [#508](https://github.com/Skords-01/Sergeant/pull/508) | fix(docs): reconcile canonical docs with current repo                                                                   | 2026-07-29 |
| [#334](https://github.com/Skords-01/Sergeant/pull/334) | docs(root): reconcile docs with code after 2026-07-20 audit (Railway->Coolify, CI gates, dual-write, domain invariants) | 2026-07-21 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 2 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
