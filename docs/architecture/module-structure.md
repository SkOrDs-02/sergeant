# Module structure (`apps/{web,mobile}/src/modules/<domain>/`)

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.
> **Status:** Active

Канонічна структура продуктового модуля в `apps/web` та `apps/mobile` плюс пояснення наявних розбіжностей. Цей doc — це **explainer**, а не enforced-стандарт: межа `apps/*` ↔ `packages/*` enforced через [ADR-0024](../adr/0024-monorepo-apps-packages-split.md), а внутрішня форма модуля еволюціонує під його потреби. Він тут, щоб новий контриб'ютор не намагався вгадати, чому в одному модулі є `pages/`, а в іншому — `domain/`.

Власник кожного модуля та його test-stack живе в [`AGENTS.md` § Module ownership map](../../AGENTS.md#module-ownership-map). Цей doc — про **внутрішнє влаштування** модуля.

---

## Canonical layout

Найпоширеніший shape модуля:

```
apps/<web|mobile>/src/modules/<domain>/
├── <Domain>App.tsx          # Module root (mount point); web — без розширення app-router
├── components/              # UI компоненти модуля. Презентаційні + контейнерні разом — поки модуль маленький
├── hooks/                   # React Query хуки + module-local stateful hooks
├── lib/                     # Pure utils без React (storage adapters, validators, parsers)
├── pages/                   # Top-level screens / routes (web — hash-router, mobile — Expo router screens)
├── index.ts                 # Public API модуля (re-exports тільки те, що мають бачити інші модулі)
└── constants.ts             # (опційно) Module-local константи; не share-аться між модулями
```

Тести лежать **поруч із кодом**, а не в окремому `__tests__/` (виняток нижче). Файл `<Module>App.test.tsx` поруч із `<Module>App.tsx` — перший smoke-тест модуля.

---

## Per-module deviations (та чому)

| Модуль                          | Де відрізняється від canonical                             | Причина                                                                                                                                                                                                                           |
| ------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **web/finyk**                   | Немає `shell/`, є `hubRoutineSync.ts` поруч                | Cross-module sync (HubChat ↔ Routine via Mono webhooks) висить на одному файлі — поки рано виносити в окрему директорію. Routing — react-router у `apps/web/src/core/App.tsx` + локальний hash-router (`hooks/useHashRouter.ts`). |
| **web/fizruk**                  | Має `shell/` (`FizrukRouter`, `FizrukNav`, `FizrukHeader`) | Fizruk — найбільший модуль за поверхнею (5+ pages з під-навігацією: workouts, sets, history, plan, stats). `shell/` тримає nav-mesh окремо від pages.                                                                             |
| **web/nutrition**               | Немає `pages/`, замість того `domain/`                     | Pages-mesh нативно в `components/NutritionBottomNav.tsx` + локальний `lib/nutritionRouter.ts` (hash-router); `domain/` тримає чисту бізнес-логіку backup/restore (не React). Доки 6 screens, окрема `pages/` — overkill.          |
| **web/routine**                 | Немає `pages/`, є `context/`                               | Routine — habit-tracker з global context (`RoutineCalendarContext`) для shared selected-day state між компонентами. Pages-as-tabs через context, а не через router → один файл `RoutineApp.tsx` рендерить усе.                    |
| **mobile/finyk**                | Немає `hooks/`                                             | Mobile-finyk — read-mostly view над web-станом, всі хуки інлайн у components. Якщо додаватиметься mutation-логіка, винесемо в `hooks/` як по канону.                                                                              |
| **mobile/fizruk**               | Має `__tests__/` директорію + `shell/`                     | Жирніший test-suite (RN component snapshots), які зручніше тримати разом. `shell/` симетричний з web/fizruk.                                                                                                                      |
| **mobile/{nutrition, routine}** | `pages/` присутній (на відміну від web)                    | Mobile використовує Expo Router (file-based routing) → `pages/` мапиться 1:1 на routes. На web ці модулі тримають navigation в context/components, бо hash-routing інтегровано тісніше.                                           |

---

## Що це означає для нового модуля

1. **Стартуй з canonical layout** — `components/`, `hooks/`, `lib/`, `pages/`, `<Module>App.tsx`, `index.ts`. Не додавай `shell/` / `domain/` / `context/` за замовчанням.
2. **Додай `shell/`**, коли nav-mesh виходить за межі одного `<Module>App.tsx` (≥3 окремих nav-точок зі своїм state-ом).
3. **Додай `domain/`**, коли в модулі з'являється pure-business-logic (не React, не storage), яку tested-у-isolation і потенційно треба буде винести в `packages/<module>-domain/`.
4. **Додай `context/`**, коли потрібен shared state між sibling-компонентами (тести через `RTL render` з обгорткою).
5. **Mobile-version модуля** ≠ web-version. Структури можуть розходитись (різний router, різний storage). Спільну бізнес-логіку винось у `packages/<module>-domain/` (див. AGENTS.md § Module ownership map).
6. **Тести поруч із кодом** — `Foo.test.tsx` біля `Foo.tsx`. Окрема `__tests__/` директорія — тільки коли є snapshot-suite на 10+ файлів (поки лише `mobile/fizruk`).

---

## Cross-module правила (короткий нагадач)

- **Modules не імпортують один одного напряму.** Cross-module комунікація — через `apps/<web|mobile>/src/core/lib/hubBus.ts` (event bus) або через спільні `packages/<X>-domain/` (тільки чиста логіка, без React).
- **`packages/*` не імпортує з `apps/*`** (Hard rule, [ADR-0024](../adr/0024-monorepo-apps-packages-split.md)).
- **Module Quick Actions** (HubChat) — реєструються через `apps/web/src/shared/lib/modules/moduleQuickActions.ts`; кожен модуль експонує свій action-set через `apps/web/src/core/lib/chatActions/<module>Actions.ts`.
- **Storage** — кожен модуль використовує свій namespace через `createModuleStorage(moduleName)` з `@shared/lib/createModuleStorage` (web) / MMKV-bound еквівалент (mobile).

---

## Related docs

- [`AGENTS.md` § Module ownership map](../../AGENTS.md#module-ownership-map) — owner, test stack, RQ keys factory per module.
- [`ADR-0024`](../adr/0024-monorepo-apps-packages-split.md) — `apps/*` vs `packages/*` boundary.
- [`ADR-0010`](../adr/0010-mobile-dual-track-capacitor-expo.md) — пояснює, чому `apps/mobile` ≠ `apps/mobile-shell`.
- [`ADR-0006`](../adr/0006-rq-keys-factory.md) — Hard rule #2 (RQ keys factory) — що зобов'язана експонувати кожна `<module>/lib/queryKeys.ts`-подібна точка.
- [`docs/architecture/frontend-overview.md`](./frontend-overview.md) — fronend-wide архітектурний overview.
- [`docs/architecture/apps-status-matrix.md`](./apps-status-matrix.md) — статус кожного app/package.
