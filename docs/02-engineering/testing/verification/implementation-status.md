# Фактична готовність комплектів

> **Last validated:** 2026-09-05 by Codex. **Next review:** 2026-10-05.
> **Status:** Active

Бібліотека реалізує v1 [спеки](../../../90-work/planning/specs/repeatable-verification.md). Це маршрут повторюваної перевірки й обліку, а не твердження, що вся продуктова матриця вже пройдена. Результати продуктового тестування записуються лише у runs.

## Що реально є

| Комплект   | Покриття v1                                                                           |
| ---------- | ------------------------------------------------------------------------------------- |
| journeys   | expense pilot, повна route/deep-link матриця, CRUD lifecycle, FTUX/entitlement/states |
| logic      | незалежний expense oracle й крос-модульні формули/дати/межі                           |
| ai         | expense grounding, tool safety/errors, memory/coach/digest/vision/provenance          |
| experience | visual responsive/dark/overflow, keyboard/a11y/copy, окремі три anti-slop тести       |
| data       | fresh-device pull, offline/LWW/isolation/logout, API/security/integrations            |
| technical  | regression lanes, budgets/SLO, повна test matrix і flake protocol                     |

У `catalog.json` 19 версіонованих сценаріїв; кожен має preconditions, кроки, очікування, докази, cleanup і pitfalls. `routes.md` фіксує канонічні та compatibility URL. Профілі розділяють одного user на двох devices і двох users для isolation; наведено рецепти чинних seed-light/seed-rich без коміту credentials.

CLI має list/init/record/validate/report/compare/close. Він робить snapshot карток, строгий metadata/source/path контроль, lock+atomic write, SHA-256 доказів, append-only attempts, immutable closed run, повні reports/compare і вимагає latest live pass для verified. 14 інтеграційних сценаріїв покривають round-trip та негативні інваріанти.

Реєстр містить 239 імпортованих записів із 19 активних історичних джерел і 3 свіжі знахідки пілота. Два закриті live runs з однаковим seed показують expense/reload pass і повторюваний sync fail; другий прогін додав live AI та visual/anti-slop докази. Обидва outcomes `incomplete`, бо незалежний CALC oracle не виконано; це збережено як blocker, а не замасковано pass.

## Продовження

1. Дотріажити імпортовані `unrated`/кластери; web-qa-pre-beta не імпортовано через відсутній локальний source snapshot.
2. Діагностувати три свіжі finding ID з handoff повтору, виконати незалежний CALC oracle.
3. Після виправлень створити новий live run із baseline `pilot-2026-09-05-b`, повторити сценарії та перевести finding у verified лише через latest linked pass.
