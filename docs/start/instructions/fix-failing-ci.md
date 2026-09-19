# Playbook: Fix Failing CI on a PR

> **Last touched:** 2026-09-19 by @claude. **Next review:** 2027-01-13.
> **Status:** Active
> **Runtime-specific:** no

**Trigger:** один або кілька CI checks червоні на PR: `commitlint`, `check`, `bundle-budgets`, `knip-scan`, `coverage`, `a11y`, `landing-quality`, migration/secret/actionlint gates, mobile jobs.

## Owner surface

- Primary surface: failing workflow or package
- Governing skill: `sergeant-bugfix-and-regression`

## Required context

- Почни з `sergeant-start-here`, потім відкрий `sergeant-bugfix-and-regression`.
- Якщо CI red пов'язаний із docs або governance, звір [review-checklist.md](../../governance/governance/review-checklist.md).
- Якщо red походить від migrations або deploy, переключись у відповідний specialist skill.

## Steps

### 1. Відтвори те, що впало

- Визнач конкретний job і step.
- Запусти локально той самий command.
- Не патч blind; спочатку побач реальну помилку.

### 2. Визнач class проблеми

- `commitlint` / naming
- formatting / lint
- typecheck
- tests
- docs/governance/governance index or schema
- build/runtime-specific job
- **бандл-бюджети** — джоба `Bundle budgets (size-limit + eager)`; окремий playbook, бо
  спокуса «підняти стелю» майже завжди помилкова: [`fix-red-bundle-budget.md`](./fix-red-bundle-budget.md)
- **мертвий код** — джоба `Dead Code (Knip)`; часто це хибне спрацювання конфігу,
  а не справжній борг: [`cleanup-dead-code.md § Хибні спрацювання`](./cleanup-dead-code.md#хибні-спрацювання-knip)
- **якість лендінга** — джоба `Landing quality (axe + Lighthouse)` і деплой лендінга
  через Actions: [`verify-site-claims.md`](./verify-site-claims.md)
- **гейт не впав, а НЕ ВИКОНАВСЯ** — див. нижче, це окремий клас

> **Зелений ≠ перевірено.** GitHub Actions пропускає всі наступні кроки джоби, щойно
> один упав, тож гейт, що стоїть нижче за червоний крок, просто не виконується — і в
> логах це виглядає **не як провал, а як тиша**. Так у цьому репо два ратчетні гейти
> мовчали тижнями. Те саме робить `needs:` на рівні джоб: залежна не стартує ані на
> червоному `check`, ані коли його скасував новий пуш, і обидва випадки у звіті
> виглядають однаково невинно. Якщо борг накопичився під зеленим CI — це не тріаж
> червоного, а [`audit-ci-gates.md`](./audit-ci-gates.md).

**Локальний еквівалент.** `pnpm check` = `format:check && lint && check:typecheck-and-test && build`
— той самий матрикс, що в джобі `check`. Пам'ятай, що `pnpm lint` — це ланцюг із
~50 окремих `node scripts/…` перевірок: коли червоніє «lint», дивись, ЯКИЙ зі скриптів
назвався в логах, і запускай саме його.

### 3. Зроби мінімальний fix

- Лагодь root cause, а не лише симптом у логах.
- Якщо проблема в процесі або docs surface, виправ джерело істини, а не generated artifact вручну.
- Якщо падіння походить від flaky test, виріши чи це справжній regression чи треба інший playbook.

### 4. Запусти цільову перевірку повторно

- Спочатку failing command.
- Потім близькі за залежністю commands.
- Потім повернись до базового verification набору для touched surface.

## Verification

- [ ] Локально відтворено той самий failing command
- [ ] Failing command став green
- [ ] Базовий verification набір для touched surface green
- [ ] Якщо торкались docs/governance, індекси та sync gates теж green

## When not to use this playbook

- Це прод-інцидент або live degradation.
- Це довготривале dependency upgrade effort, а не конкретний red check.

## Related playbooks and skills

- [hotfix-prod-regression.md](./hotfix-prod-regression.md)
- [investigate-alert.md](./investigate-alert.md)
- [audit-ci-gates.md](./audit-ci-gates.md) — дзеркальний playbook: «CI зелений, але нічого не перевірено»
- [fix-red-bundle-budget.md](./fix-red-bundle-budget.md) — червоні `size-limit` / eager
- [stabilize-flaky-test.md](./stabilize-flaky-test.md) — коли червоне не відтворюється
- Skill: `sergeant-bugfix-and-regression`

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                                                                           | Merged     |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------- |
| [#57](https://github.com/zaebal-beep/sergeant/pull/57) | fix(root): закрити знахідки наскрізного аудиту — валідація AI-шару, метрика конфліктів синку, браузерні дефекти | 2026-09-16 |
| [#51](https://github.com/zaebal-beep/sergeant/pull/51) | docs(agents): пʼять нових playbook-ів під повторювані поломки і ревізія наявних                                 | 2026-09-15 |

_Auto-derived from `docs/governance/pr-ledger/index.json`. Top 2 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
