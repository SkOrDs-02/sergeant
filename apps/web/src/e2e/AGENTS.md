# AGENTS: apps/web/src/e2e

> **Last touched:** 2026-09-29 by @claude (створено за спекою `e2e-repeatable-states.md`). **Next review:** 2026-12-29.
> **Status:** Active

Тестовий міст «повторюваних станів» для E2E-лейнів (mobile 44px/overflow, a11y axe). Існує лише в білді з `VITE_E2E_SEED=true`; у прод-бандлі його немає, це перевіряє `scripts/ci/check-e2e-seed-boundary.mjs`. Спека: [`docs/work/specs/e2e-repeatable-states.md`](../../../../docs/work/specs/e2e-repeatable-states.md).

## Contents

- `installScenarioBridge.ts` - виставляє `window.__sergeantScenario` (`apply(world)`, `snapshot()`); підключається з `main.tsx` під гейтом `import.meta.env.VITE_E2E_SEED === "true"`.
- `world.ts` - тип клієнт-локальної частини світу, парсер від `unknown`, резолвер `daysAgo` (device-local день-ключ, ADR-0078).
- `writers.ts` - адаптери до канонічних писачів модулів (комора, routine, fizruk, ліміти Фініка); вантажиться динамічно лише в `apply()`.
- `world.test.ts` - юніт-тести парсера й резолвера.

Серверна частина світів живе поза цією текою: `apps/web/tests/fixtures/worlds/*.json` і `apps/web/tests/utils/scenario.ts` (`installWorld`, `applyScenario`).

## Guidelines

- Імпорт із `e2e/` дозволений лише всередині `apps/web/src/e2e/**` і з `apps/web/src/main.tsx` (гейт `scripts/check-imports.mjs`).
- Пиши тільки через канонічні писачі модулів (той самий шлях, що в проді). Прямі записи в SQLite/localStorage повз домен заборонені: тест перестає ловити регресії реального шляху.
- Писачі не імпортуй статично в міст: це тягне модульний код у бут кожної сторінки тестового білда.
- `apply()` чекає auth і готовність кожного писача та відхиляється з іменем кроку; не заміняй очікування таймаутом.
- Дати задавай відносними (`daysAgo`), а не фіксованими.
- Нових станів не вигадуй без узгодження вмісту з module-owner скілом (`sergeant-module-*`); лейни й хелпери - `sergeant-e2e-testing`.
