# Playbook: Тестове відновлення бекапу

> **Last touched:** 2026-08-16 by @github-actions[bot]. **Next review:** 2026-11-29.
> **Status:** Active

**Trigger:** планова репетиція відновлення (recovery rehearsal), перевірка довіри до бекапів, або сигнал, що снапшоти існують, але давно не перевірялися на придатність.

## Owner surface

- Primary surface: готовність до відновлення (recovery readiness)
- Governing skill: `sergeant-data-and-migrations`

## Required context

- Прочитай [disaster-recovery.md](../../04-governance/security/disaster-recovery.md) і [service-catalog.md](../../02-engineering/architecture/service-catalog.md), щоб мати свіжі цифри RPO/RTO та перелік критичних поверхонь.

## Steps

### 1. Обери обсяг репетиції

- Повне відновлення БД, часткове відновлення таблиць, або тільки валідація метаданих (`pg_dump --schema-only` diff).
- Візьми репрезентативний бекап / снапшот із поточної каденції — той, який імовірно довелося б використати в реальному інциденті.

### 2. Виконай репетицію

- Розгорни бекап у безпечне середовище за конкретними командами з [`docs/03-operations/runbooks/database-backup-restore.md`](../../03-operations/runbooks/database-backup-restore.md) §2.
- Перевір: підключення до інстансу, стан міграцій (§4.1), row count критичних таблиць (§4.2) і 1–2 ключові доменні записи (наприклад, відомий `users.id` + його `transactions`).
- Заміряй фактичний час відновлення відносно очікуваного RTO.

### 3. Зафіксуй докази

- Запиши таймстамп бекапу, тривалість відновлення і будь-які ручні кроки, що знадобилися (вручну переведений `READ ONLY`, додатковий `vacuum analyze`, тощо).
- Якщо репетиція провалилася або виявилася занадто повільною — одразу заведи follow-up issue, не відкладай.

## Verification

- [ ] Джерело бекапу однозначно ідентифіковане
- [ ] Відновлення відбулося в безпечному середовищі (не в проді)
- [ ] Порівняння RPO/RTO зафіксоване (фактичні цифри проти цільових)
- [ ] Створено follow-up issue для будь-якого виявленого розриву

## When not to use this playbook

- Уже триває live production incident і потрібне реальне відновлення — використовуй [restore-from-backup.md](./restore-from-backup.md).
- Задача — тільки ротація секретів або повторний деплой runtime-інфраструктури.

## Related playbooks and skills

- [restore-from-backup.md](./restore-from-backup.md)
- [run-weekly-operator-digest.md](./run-weekly-operator-digest.md)
- Skill: `sergeant-deploy-and-observability`

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                                   | Merged     |
| ------------------------------------------------------ | ----------------------------------------------------------------------- | ---------- |
| [#799](https://github.com/Skords-01/Sergeant/pull/799) | fix(finyk-domain): одна таблиця ручних категорій і колір для надходжень | 2026-08-16 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
