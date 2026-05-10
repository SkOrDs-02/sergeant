---
name: sergeant-review-and-merge
description: Use when reviewing a Sergeant PR, preparing for merge, checking commit scope, validating docs freshness, or deciding if a change is safe to ship; UA: ревʼю PR і мердж.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# Ревʼю і мердж у Sergeant

Спершу — production-safety, потім — поліровка. Ревʼю в Sergeant не вважається завершеним, поки governance-ризики репо не перевірені поряд з якістю коду.

## Чекліст ревʼю

- Для зачепленої поверхні застосовано правильний specialist skill
- Тести покривають змінену поведінку, а не лише деталі імплементації
- Зміни API-форми йшли разом із `api-client` і тестами
- Migration safety явно обговорена, якщо змінювався SQL
- Доки оновлені лише там, де насправді змінився canonical doc
- Commit scope відповідає `AGENTS.md`
- Без `--no-verify`, без skip-hook-ів, без небезпечного порядку деплою

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
