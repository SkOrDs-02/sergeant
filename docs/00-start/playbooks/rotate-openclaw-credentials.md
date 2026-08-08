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
