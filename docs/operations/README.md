# 03 · Operations — деплой, спостережуваність, runbook-и

> **Last touched:** 2026-10-03 by @claude (ops/: Renovate-runbook прибрано, ADR-0103). **Next review:** 2027-01-01.
> **Status:** Active

Експлуатаційний шар: як деплоїти, як стежити, як діяти в інцидент. Жанр —
**informational**. Межа deploy / runbooks / playbooks: `deploy/` — довідник
по платформах, а аварійні процедури для людини (runbook-и) і покрокові
агент-рецепти (playbook-и) живуть разом у
[`docs/start/instructions/`](../start/instructions/README.md) — окремого
каталогу `runbooks/` тут немає (див. таблицю жанрів нижче).

| Розділ                                             | Що тут                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| [`deploy/`](./deploy/README.md)                    | Deploy-walkthrough-и (Hetzner/Coolify, Vercel, monorepo-фільтрація).  |
| [`observability/`](./observability/README.md)      | Алерти, SLO, логи, інженерні метрики, дашборди.                       |
| [`ops/`](./ops/README.md)                          | Recurring ops-runbook-и (політика Docker-образу Hub API).             |
| [`postmortems/`](./postmortems/README.md)          | Розбори інцидентів і follow-up-памʼять.                               |
| [`instructions/`](../start/instructions/README.md) | DR-grade процедури (DB backup/restore, ротація ключів шифрування, …). |

## Контракт жанрів

Три споріднені жанри — різний тригер, різна аудиторія:

| Жанр           | Де живе                    | Тригер (коли читати)                                                 | Аудиторія                                        | Куди додавати нове                                                                                         |
| -------------- | -------------------------- | -------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Deploy-doc** | `docs/operations/deploy/`  | Налаштовуєш платформу або вперше деплоїш поверхню                    | Інженер, що конфігурує Coolify / Vercel          | Новий файл у `deploy/`, рядок у [`deploy/README.md`](./deploy/README.md)                                   |
| **Runbook**    | `docs/start/instructions/` | Інцидент або DR-вправа — потрібна точна команда для **нашого** infra | On-call-інженер під тиском                       | Новий файл `<surface>-<operation>.md`, рядок у [`instructions/README.md`](../start/instructions/README.md) |
| **Playbook**   | `docs/start/instructions/` | Виконуєш повторювану задачу — хочеш канонічний порядок кроків        | Розробник або агент, що стартує типовий сценарій | Новий файл у `playbooks/`, рядок у [`playbook-catalog.md`](../start/instructions/playbook-catalog.md)      |

Ключова різниця: **playbook** каже _що_ і _коли_ (агностик до infra), **runbook** каже _як саме_ виконати на нашому стеку (Coolify Postgres, pgBouncer, key-ring), **deploy-doc** — довідник по платформах і їхніх налаштуваннях.

Єдина таксономія runbook / playbook описана в [`instructions/README.md`](../start/instructions/README.md).

---

Назад до кореня: [`docs/README.md`](../README.md).
