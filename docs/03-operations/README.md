# 03 · Operations — деплой, спостережуваність, runbook-и

> **Last validated:** 2026-06-12 by @claude. **Next review:** 2026-09-10.
> **Status:** Active

Експлуатаційний шар: як деплоїти, як стежити, як діяти в інцидент. Жанр —
**informational**. Межа deploy / runbooks / playbooks: `deploy/` — довідник
по платформах, `runbooks/` — аварійні процедури для людини, а покрокові
агент-рецепти живуть у [`00-start/playbooks/`](../00-start/playbooks/README.md).

| Розділ                                        | Що тут                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| [`deploy/`](./deploy/README.md)               | Deploy-walkthrough-и (Railway, Vercel, monorepo-фільтрація).                |
| [`observability/`](./observability/README.md) | Алерти, SLO, логи, інженерні метрики, дашборди.                             |
| [`ops/`](./ops/README.md)                     | Recurring ops-runbook-и (Renovate maintainer workflow, dependency hygiene). |
| [`postmortems/`](./postmortems/README.md)     | Розбори інцидентів і follow-up-памʼять.                                     |
| [`runbooks/`](./runbooks/README.md)           | DR-grade процедури (DB backup/restore, ротація ключів шифрування, …).       |

Назад до кореня: [`docs/README.md`](../README.md).
