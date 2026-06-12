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

## Контракт жанрів

Три споріднені жанри — різний тригер, різна аудиторія:

| Жанр           | Де живе                        | Тригер (коли читати)                                                 | Аудиторія                                        | Куди додавати нове                                                                                    |
| -------------- | ------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **Deploy-doc** | `docs/03-operations/deploy/`   | Налаштовуєш платформу або вперше деплоїш поверхню                    | Інженер, що конфігурує Railway / Vercel          | Новий файл у `deploy/`, рядок у [`deploy/README.md`](./deploy/README.md)                              |
| **Runbook**    | `docs/03-operations/runbooks/` | Інцидент або DR-вправа — потрібна точна команда для **нашого** infra | On-call-інженер під тиском                       | Новий файл `<surface>-<operation>.md`, рядок у [`runbooks/README.md`](./runbooks/README.md)           |
| **Playbook**   | `docs/00-start/playbooks/`     | Виконуєш повторювану задачу — хочеш канонічний порядок кроків        | Розробник або агент, що стартує типовий сценарій | Новий файл у `playbooks/`, рядок у [`playbook-catalog.md`](../00-start/playbooks/playbook-catalog.md) |

Ключова різниця: **playbook** каже _що_ і _коли_ (агностик до infra), **runbook** каже _як саме_ виконати на нашому стеку (Railway Postgres, pgBouncer, key-ring), **deploy-doc** — довідник по платформах і їхніх налаштуваннях.

Детальніший опис розмежування runbook / playbook — у [`runbooks/README.md § Runbook vs playbook`](./runbooks/README.md#runbook-vs-playbook-vs-incident-workflow). Канонічний каталог playbooks — [`00-start/playbooks/README.md`](../00-start/playbooks/README.md).

---

Назад до кореня: [`docs/README.md`](../README.md).
