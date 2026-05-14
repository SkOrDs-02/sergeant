# DB index audit — template

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active (template only)

Цей файл — **template** для one-time index-audit snapshot-ів проти
production-replica DB. Цей snapshot спеціально **не запускався проти
production** під час релізного PR — Devin не має credentials до Railway
production replica, а dev / CI database контейнер свіжо створений і
дає 0 seq-scan / купу false-positive zero-scan indexes (всі recently
created → не використовувалися фізично). Корисний signal вимагає
production-traffic, накопиченого хоча б за 7 днів після останнього
`pg_stat_reset()` / Postgres restart.

## Як згенерувати реальний snapshot

```bash
# 1. Виставити DATABASE_URL (read-only replica preferred):
export DATABASE_URL=postgresql://devin-audit:***@prod-replica.example.com:5432/sergeant

# 2. Запустити одну з форм:
pnpm db:index-audit > /tmp/index-audit.md            # на stdout
pnpm db:index-audit --write                           # запис у
                                                      # docs/runbooks/db-index-audit-YYYY-MM-DD.md

# 3. Зробити PR-у docs/runbooks/db-index-audit-YYYY-MM-DD.md з триage-нотатками
#    у нижній секції "Triage notes".
```

> `pg_stat_user_indexes.idx_scan` лічиться **з моменту останнього
> `pg_stat_reset()` АБО останнього restart-у Postgres** (Railway restart
> процесу зануляє лічильники). Перед серйозним rely-ом на zero-scan signal
> перевір:
> `SELECT stats_reset FROM pg_stat_database WHERE datname = current_database();`

## Чому НЕ автоматизовано CI-snapshot-ом

- Snapshot stat-counter-ів — implementation detail Postgres-runtime; CI
  не має stable доступу до prod-replica і не повинен рятувати-від-падіння
  pull-request, який не торкається схеми.
- `lint:db-indexes` (static, heuristic) запускається у CI як **WARN-only**
  гейт — він ловить нові FK / lookup columns БЕЗ index-у на час merge-у.
  Це доповнює, а не замінює, runtime snapshot.

## Розділи реального report-у

Скрипт `scripts/db-index-audit.mjs` генерує цю структуру:

1. **Heavy seq-scan tables** — tables з `seq_scan` ≥ 1, `live_rows ≥ 1000`,
   `seq_scan / max(idx_scan, 1) ≥ 0.5`. Сортовано за `seq_scan desc`.
2. **Unused indexes** — non-unique / non-primary indexes з `idx_scan = 0`.
   Сортовано за `pg_relation_size` desc (найбільші waste-кандидати — нагорі).
3. **Overlapping indexes** — пари (`a`, `b`) на одній table, де `a.columns`
   є prefix-ом `b.columns`. Heuristic — Postgres-planner МОЖЕ використати
   довший для лук-апів shorter-а, але це залежить від INCLUDE-stored
   columns, partial WHERE, index method. Manual confirm-уй з `EXPLAIN`.
4. **Triage notes** — заповнюються в PR-у з рішеннями (add / drop / keep
   з reason).

## Cross-links

- Runbook recipe + decision tree: [`operations-runbook.md § 9`](./operations-runbook.md#9-index-hygiene)
- Hard Rule #4 (sequential / two-phase DROP): [`docs/governance/rules/04-sql-migrations-sequential-two-phase.md`](../governance/rules/04-sql-migrations-sequential-two-phase.md)
- Static heuristic linter: `pnpm lint:db-indexes --all`
