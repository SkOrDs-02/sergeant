---
name: sergeant-review-and-merge
description: Use when reviewing a Sergeant PR, preparing for merge, checking commit scope, validating docs freshness, or deciding if a change is safe to ship; also for rollback safety checks; UA: ревʼю PR і мердж.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Ревʼю і мердж у Sergeant

Спершу — production-safety, потім — поліровка. Ревʼю в Sergeant не вважається завершеним, поки governance-ризики репо не перевірені поряд з якістю коду.

## Two-stage review

Ревʼю Sergeant PR розділене на **дві окремі стадії**. Не змішуй їх — спершу переконайся, що diff робить те, що мав, потім оцінюй, чи робить це якісно. Stage 2 без passed Stage 1 — марнування часу: якщо implementation не відповідає spec, code-quality критика буде нерелевантна після переробки.

### Stage 1 — Spec compliance

Питання цієї стадії: **«Чи реалізує diff те, що описано в spec/issue/playbook?»** Без імен змінних, без стилю, без оптимізацій.

- Знайди канонічне джерело істини для зміни:
  - product-facing: spec у `docs/90-work/planning/specs/` або issue з acceptance-критеріями;
  - infra/governance: playbook у `docs/00-start/playbooks/` або initiative у `docs/90-work/initiatives/`;
  - bugfix: regression-тест + опис відтворення з `sergeant-bugfix-and-regression`.
- Звір кожен acceptance-критерій з кодом. Кожен пункт або вкритий diff-ом, або явно out-of-scope з поясненням у PR.
- Перевір, що зачеплені surfaces покриті правильним specialist skill (тригери merge-готовності нижче).
- Зміни форми API ↔ `packages/api-client` ↔ contract-тест їдуть разом — Hard Rule #3.
- Migration safety явно обговорена, якщо змінювався SQL — Hard Rule #4 (two-phase DROP).
- Доки оновлені лише там, де насправді змінився canonical doc — без changelog-dump-ів.

**Якщо Stage 1 не проходить — відправ на доопрацювання і не починай Stage 2.** Інакше code-quality нотатки втратять контекст після переробки.

### Stage 2 — Code quality

Питання цієї стадії: **«Чи можна підтримувати цей diff наступні 6 місяців без болю?»** Тільки після того, як Stage 1 показав, що diff відповідає spec.

- Тести покривають змінену поведінку, а не лише деталі імплементації; regression-тест дійсно червонів **до** фіксу (див. Red Flags нижче).
- Boundaries поважаються: де код мав жити в monorepo, там і живе (звір через `sergeant-monorepo-boundaries`).
- Назви, типи, відсутність `any`/`getattr`/`setattr`, без dead-code, без AI-marker-у `AI-LEGACY` без дедлайну.
- Commit scope відповідає `commitlint.config.js` enum (Hard Rule #5).
- Без `--no-verify`, без skip-hook-ів, без небезпечного порядку деплою — Hard Rules #6, #7.
- Lifecycle markers на місці там, де Knip міг би хибно зловити scaffolded-файл — Hard Rule #10.

## Тригери merge-готовності

Звертай особливу увагу, коли diff торкається:

- `apps/server/src/migrations/**`
- `apps/server/src/modules/**` разом із `packages/api-client/**`
- `apps/web/src/shared/lib/api/queryKeys.ts`
- `apps/web/src/core/lib/hubChat*`
- auth-обвʼязки, env-доків або deploy-доків
- `.agents/**`, `docs/00-start/agents/**`, `.github/**`

## Verification gate

**NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.**

Перед тим як написати «Done», «Fixed», «Ready to merge», «Tests pass», або будь-яке інше completion claim — прогони відповідну перевірку **щойно**, в поточному стані коду. Не покладайся на попередні прогони, кеш або памʼять.

Повний перелік заборонених формулювань і proving-команд — у `sergeant-verify-before-done`. Нижче — витяг, який найчастіше спрацьовує саме на PR-межі.

### Red Flags — заборонені формулювання до прогону

| Red Flag                                      | Чому небезпечно                                               | Що робити замість                              |
| --------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| «Tests pass»                                  | Кеш Vitest / stale CI — може не відображати поточний стан     | Прогнати `pnpm test` щойно, вставити вивід     |
| «Linter clean»                                | lint-staged міг не зачепити всі файли                         | Прогнати `pnpm lint` на повному scope           |
| «Build succeeds»                              | Incremental build може не зловити нову помилку                | Прогнати `pnpm build` і вставити exit code      |
| «Bug fixed»                                   | Без свіжого regression-тесту — це гадання                     | Показати failing → passing тест або curl-вивід  |
| «Regression test works»                       | Тест може бути green-by-default (не тестує assertion)         | Спочатку зламай assertion — переконайся, що тест справді червоніє |
| «Test passes, ship it»                        | Якщо ти не бачив RED перед GREEN — тест може не тестувати fix | Прогони тест **до** фіксу, переконайся що він червоний з правильної причини, потім фіксуй і дивись GREEN |
| «Should pass now» / «Looks correct»           | Лінгвістичний маркер невпевненості — ніколи не є evidence     | Прогони команду, покажи результат              |
| «Iʼm confident this is right»                 | Впевненість ≠ верифікація — модель/людина помиляється         | Прогони команду, покажи результат              |

### Gate function

**Канон гейта живе в [`sergeant-verify-before-done`](../sergeant-verify-before-done/SKILL.md)** — таблиця «claim → proving command», правило повного scope і цитування exit code. Не дублюй його тут і не веди власний список команд: розбіжні списки вже одного разу розійшлись (цей skill колись вимагав `pnpm lint && typecheck && test && build` без `format:check`, тож PR міг пройти гейт і впасти в CI на prettier).

Одна команда, що покриває весь матрицю: **`pnpm check`** (= `format:check && lint && check:typecheck-and-test && build`) — той самий набір, що й у CI.

Цей skill додає поверх канону лише те, що специфічне для **PR-межі**:

1. **Merge-state, не локальний стан.** `git fetch origin main` і перевіряй на результаті злиття — зелень на застарілій базі не є доказом (`origin/main` рухається під довгою сесією).
2. **Surface smoke:** UI → відкрий у браузері; API → curl; migration → `pnpm db:migrate` на чистій БД.
3. **Evidence у PR:** command + скорочений вивід у коментарі, щоб рецензент бачив факт прогону, а не твоє слово.
4. **Крос-поверхневий PR** (3+ governed surfaces) → `sergeant-review-squad`; повна per-surface картина тестів → `sergeant-qa-squad`.

Якщо будь-який крок не пройшов — **не клейми completion**. Фікси проблему і повтори gate.

## Пріоритети знахідок

- Ризик breakage або data loss
- Drift контракту або відсутнє покриття тестами
- Deploy- або rollback-небезпека
- Прогалини в доках, підтримуваності, ясності

## Playbooks

- `docs/00-start/playbooks/release.md` — canonical release-playbook (web + API, Capacitor shell, Expo) з decision-tree.
- `docs/00-start/playbooks/declare-incident.md` — ескалація, коли merge зламав прод.
- Каталог: `docs/00-start/agents/agent-skills-catalog.md`.
