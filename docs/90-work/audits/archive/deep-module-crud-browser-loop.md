# Deep module CRUD browser loop

> **Last validated:** 2026-07-19 by Codex. **Next review:** ніколи (read-only архів).
> **Status:** Archived (read-only). Fast-forward archived 2026-07-20 (90-day gate skipped за рішенням founder-а). Source: `docs/90-work/audits/deep-module-crud-browser-loop.md`.

## Мета

Дати браузерний доказ, що ключові модулі Sergeant не лише монтуються, а реально
дозволяють користувачу створити, змінити, видалити або відновити власні дані.
Цей loop закриває gap з `browser-user-journey-loop.md`, де core modules були
перевірені переважно як cold-load/shell smoke.

## Жорсткі правила

1. **Cold-load не рахується як CRUD.** Passed ставиться тільки після реальної
   мутації даних через UI.
2. **Мінімальний доказ для сценарію:** UI outcome, persistence після reload або
   navigation, і відсутність uncaught `pageerror`.
3. **Production-like browser run:** Playwright проти `vite preview`, не `vite dev`.
4. **Selectors:** role, label, text, testid. CSS/positional selectors заборонені,
   крім documented exception.
5. **No timing sleeps:** не використовувати `waitForTimeout`; чекати видимий стан.
6. **State seeding:** steady-state через `seedFTUX`; auth UI не проходити у
   `beforeEach`.
7. **Storage checks без coupling:** якщо прямий storage key нестабільний,
   перевіряти факт persistence через reload/UI; key-specific assertion додавати
   тільки коли key є canonical source of truth.
8. **Findings не замітати:** кожен failure отримує id `DCRUD-xxx`, тип
   `product bug` / `UX bug` / `test harness bug` / `env gap`, reproduction і
   post-fix retest.
9. **No full-readiness claim:** якщо модуль має тільки create, але нема edit/delete
   в UI, це documented partial proof, не “все працює”.

## Покриття loop 4

| Module    | Story                                                                                  | Required proof                                       |
| --------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Finyk     | Користувач додає ручну витрату, редагує її, видаляє і може відновити через undo        | create, edit, delete, undo, reload persistence       |
| Nutrition | Користувач додає продукт у комору, редагує кількість/одиницю, видаляє і може відновити | create, edit, delete, undo, reload persistence       |
| Routine   | Користувач створює звичку, редагує назву, видаляє і може відновити                     | create, edit, delete, undo або documented delete gap |
| Fizruk    | Користувач записує body/journal entry, видаляє і відновлює                             | create, delete, undo, reload persistence             |

## Порядок виконання

1. **Repo baseline**
   - `git status --short --branch`
   - підтвердити робочу гілку/PR;
   - підтвердити, що немає чужих unstaged змін.

2. **Code map**
   - через codebase knowledge graph знайти компонент, submit handler, delete/undo
     handler і route для кожного модуля;
   - зафіксувати selector contract: label/button/dialog names.

3. **Spec design**
   - створити окремий Playwright spec під loop;
   - кожен module scenario робити окремим `test`;
   - використовувати `seedFTUX(page, "post-ftux")`;
   - збирати `pageerror` і fail-ити тест в кінці.

4. **Run**
   - запускати `playwright.smoke.config.ts`, project `chromium`;
   - спочатку targeted spec;
   - після fixes повторити targeted spec;
   - якщо змінювались shared helpers/routes, додати сусідній smoke.

5. **Fix**
   - якщо падає через UX/product bug, виправити мінімально;
   - якщо падає через нестабільний selector, додати accessible label/testid тільки
     там, де role/label немає;
   - якщо падає через env gap, не фіксити продукт без доказу.

6. **Evidence**
   - оновити dated execution log;
   - вказати exact command, result, findings, fixes, retest;
   - не писати ціни, deployment-provider decisions, native/Capacitor плани.

## Handoff prompt

```text
Продовж deep module CRUD browser loop у Sergeant.

Док: docs/90-work/audits/deep-module-crud-browser-loop.md
Execution log: docs/90-work/audits/deep-module-crud-browser-execution-2026-06-30.md

Правила:
- Почни з sergeant-start-here + sergeant-e2e-testing + owner skill для web UI.
- Працюй у поточному repo/worktree; не прив'язуйся до назви старої гілки в handoff.
- Playwright запускай проти preview build.
- Passed тільки якщо є UI mutation + reload/navigation persistence + no pageerror.
- Не використовуй waitForTimeout, CSS/nth selectors, real production data/secrets.
- Кожен failure: DCRUD-xxx, type, reproduction, fix/exception, post-fix retest.

Порядок:
1. Перевір git status.
2. Перевір/онови code map для Finyk, Nutrition, Routine, Fizruk.
3. Запусти targeted deep CRUD spec.
4. Зафікси знайдені product/UX/harness bugs.
5. Повтори targeted spec і сусідній smoke, якщо зачепив shared behavior.
6. Онови execution log.
```
