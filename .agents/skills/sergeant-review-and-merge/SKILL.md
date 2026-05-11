---
name: sergeant-review-and-merge
description: Use when reviewing a Sergeant PR, preparing for merge, checking commit scope, validating docs freshness, or deciding if a change is safe to ship; also for rollback safety checks; UA: ревʼю PR і мердж.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# Ревʼю і мердж у Sergeant

Спершу — production-safety, потім — поліровка. Ревʼю в Sergeant не вважається завершеним, поки governance-ризики репо не перевірені поряд з якістю коду.

## Two-stage review

Ревʼю Sergeant PR розділене на **дві окремі стадії**. Не змішуй їх — спершу переконайся, що diff робить те, що мав, потім оцінюй, чи робить це якісно. Stage 2 без passed Stage 1 — марнування часу: якщо implementation не відповідає spec, code-quality критика буде нерелевантна після переробки.

### Stage 1 — Spec compliance

Питання цієї стадії: **«Чи реалізує diff те, що описано в spec/issue/playbook?»** Без імен змінних, без стилю, без оптимізацій.

- Знайди канонічне джерело істини для зміни:
  - product-facing: spec у `docs/design/specs/` або issue з acceptance-критеріями;
  - infra/governance: playbook у `docs/playbooks/` або initiative у `docs/initiatives/`;
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
- `.agents/**`, `docs/agents/**`, `.github/**`

## Verification gate

**NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.**

Перед тим як написати «Done», «Fixed», «Ready to merge», «Tests pass», або будь-яке інше completion claim — прогони відповідну перевірку **щойно**, в поточному стані коду. Не покладайся на попередні прогони, кеш або памʼять.

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

Перед claim «Done» або «Ready to merge» виконай цей чекліст:

1. **Lint:** `pnpm lint` — exit 0, вставити останній рядок виводу.
2. **Typecheck:** `pnpm typecheck` — exit 0.
3. **Tests:** `pnpm test` (або surface-specific `pnpm --filter @sergeant/<app> test`) — exit 0, жодних skip/pending.
4. **Build:** `pnpm build` — exit 0.
5. **Surface-specific smoke:** якщо зміна торкається UI — відкрий у браузері і перевір; якщо API — curl/Postman; якщо migration — `pnpm db:migrate` на чистій БД.
6. **Вставити evidence** у PR comment або повідомлення: command + вивід (скорочений, але достатній щоб рецензент бачив факт прогону).

Якщо будь-який крок не пройшов — **не клейми completion**. Фікси проблему і повтори gate.

## Пріоритети знахідок

- Ризик breakage або data loss
- Drift контракту або відсутнє покриття тестами
- Deploy- або rollback-небезпека
- Прогалини в доках, підтримуваності, ясності

## Playbooks

- `docs/playbooks/release.md` — canonical release-playbook (web + API, Capacitor shell, Expo) з decision-tree.
- `docs/playbooks/declare-incident.md` — ескалація, коли merge зламав прод.
- Каталог: `docs/agents/agent-skills-catalog.md`.
