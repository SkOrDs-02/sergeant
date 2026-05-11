# pnpm Overrides Policy

> **Last validated:** 2026-05-11 by @claude. **Next review:** 2026-08-09.
> **Status:** Active

## Мета

`pnpm.overrides` у кореневому `package.json` — механізм примусового вирівнювання transitive
залежностей. Без нього пакети можуть тягнути кілька мажорних версій однієї бібліотеки у дерево,
що призводить до bundle-bloat, TypeScript-конфліктів або security-вразливостей.

## Правила

1. **Кожен запис `pnpm.overrides` повинен мати відповідний рядок у [`pnpm-overrides.md`](../../pnpm-overrides.md)**
   у корені репозиторію з обґрунтуванням, датою перевірки та умовою видалення.

2. **Тільки single-major pin** — діапазон `^N` або `>=N.0.0 <N+1`. Широкі діапазони (`>=N`)
   мовчки пропускають два мажори одночасно; це виявляє `pnpm lint:pnpm-overrides`.

3. **Quarterly review** — кожен override переглядається раз на квартал. Дата
   `Last reviewed:` у `pnpm-overrides.md` не повинна бути старішою за 90 днів.
   Перевірку автоматизовано у `scripts/check-pnpm-overrides-staleness.mjs`
   (`pnpm lint:overrides`).

4. **Умова видалення обовʼязкова** — секція `Drop when:` у `pnpm-overrides.md` повинна
   описувати конкретну умову (наприклад: "всі воркспейси явно пінять власну версію").

5. **Без `>=` без обґрунтування** — якщо override містить `>=` замість `^`, у записі
   `pnpm-overrides.md` має бути explicit пояснення, чому точна мажорна прив'язка неможлива.

## Quarterly Review Cadence

| Квартал | Дата перевірки |
| ------- | -------------- |
| Q1 2026 | 2026-03-01     |
| Q2 2026 | 2026-06-01     |
| Q3 2026 | 2026-09-01     |
| Q4 2026 | 2026-12-01     |

Відповідальний: будь-який контриб'ютор, що відкриває stack-pulse PR у цьому кварталі,
або ops-maintainer (@Skords-01).

## Enforcement

- `pnpm lint:pnpm-overrides` — перевіряє, що кожен override вирішується в один мажор
  (`scripts/check-pnpm-overrides.mjs`).
- `pnpm lint:overrides` — перевіряє, що `Last reviewed:` у `pnpm-overrides.md` не
  старіший за 90 днів (`scripts/check-pnpm-overrides-staleness.mjs`).

## References

- [`pnpm-overrides.md`](../../pnpm-overrides.md) — документація кожного override.
- [`scripts/check-pnpm-overrides.mjs`](../../scripts/check-pnpm-overrides.mjs) — drift guard.
- [`scripts/check-pnpm-overrides-staleness.mjs`](../../scripts/check-pnpm-overrides-staleness.mjs) — staleness check.
