# 0001 — Module decomposition + `max-lines` guard

> **Status:** In progress (Phase 1 done — guard live, allowlist locked)
> **Priority:** P0 (Sprint 1)
> **Owner:** `@Skords-01`
> **ETA:** 2 weeks (5 PRs)
> **Phase 1 PR:** [#1555](https://github.com/Skords-01/Sergeant/pull/1555) — merged 2026-05-03
> **Sources:** Design Review 2026-05-03 §2.1, §3.1, §12; [`docs/tech-debt/frontend.md`](../tech-debt/frontend.md)

## TL;DR

`apps/web` накопичила кілька **бог-файлів** (≥600 LOC), у яких одночасно живуть стейт, ефекти, бізнес-правила, навігація і UI. Ризик регресій у них зростає експоненційно. Ставимо **lint-гард `max-lines: [error, 600]`** для `apps/web/src/**/*.{ts,tsx}` (з cooldown-allowlist), декомпонуємо топ-7 порушників і фіксуємо це як hard-rule в `AGENTS.md`. Без цього `core/` і `modules/finyk/` далі мутуватимуть у «другу столицю» бізнес-логіки.

## Чому зараз

- Топ-15 файлів `apps/web/**` мають ≥600 LOC, найбільший — 745. Сумарно це ~12k LOC «гарячої» логіки в монолітних файлах.
- Аналогічна декомпозиція вже зроблена для `chat/agent.ts` сервера ([`apps/server/src/modules/chat/agent.ts`](../../apps/server/src/modules/chat/agent.ts)) — патерн `agent.handlers.ts`/`agent.tools.ts`/`agent.cache.ts` доведений в продакшні.
- Tech-debt frontend.md уже має `LARGE_FILES` як «зону спостереження» — час перетворити її на жорсткий KPI.
- Без lint-гарда декомпозиція — це постійний «уторгований борг» (зробили — наповзло знову).

## Скоуп

**In:**

- ESLint правило `max-lines: [error, 600]` для `apps/web/src/**/*.{ts,tsx}` (skipBlankLines + skipComments).
- Allowlist в `eslint.config.js` для існуючих файлів-моноліттів — кожен з deadline-коментарем (issue link).
- Декомпозиція 7 пріоритетних файлів (див. таблицю нижче) кожен в окремому PR.
- Оновлення [`AGENTS.md`](../../AGENTS.md) → секція "Hard rules" з пунктом `max-lines`.
- Оновлення [`docs/tech-debt/frontend.md`](../tech-debt/frontend.md) — переніс `LARGE_FILES` з «watching» в «in progress», з посиланням сюди.

**Out:**

- Декомпозиція файлів сервера (>600 LOC у `apps/server/src/modules/chat/agent.ts` уже зроблено — інші ліворуч від цієї межі).
- Файли `apps/mobile/**` — окремий скоуп для ініціативи 0002.
- Тести й сторібуки до декомпонованих кусків (буде в [0007 — Design-system tooling](./0007-design-system-tooling.md)).

## План змін

### Фаза 1 — guard rail (1 PR)

- `eslint.config.js`: додати правило `max-lines` для `apps/web/src/**/*.{ts,tsx}`.
- Зібрати поточний список порушників → винести в `overrides` allowlist із `// TODO(0001-module-decomposition): deadline 2026-06-15`.
- `pnpm lint` має пройти зелено.
- Оновити `AGENTS.md` "Hard rules" → новий пункт **#11. `max-lines: 600` для web TS/TSX** (приклад + посилання сюди).
- Оновити `docs/tech-debt/frontend.md` — `LARGE_FILES` перевести у статус **In progress**, додати посилання на цю ініціативу.

### Фаза 2 — Top-7 декомпозиція (5 PR-ів, по 1–2 файли)

| #   | Файл                                                                                                                                             | LOC   | Розкладається на                                                                                                                                           | Trigger PR                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1   | [`apps/web/src/modules/routine/RoutineApp.tsx`](../../apps/web/src/modules/routine/RoutineApp.tsx)                                               | 745   | `useRoutineAppState.ts` (state-machine), `RoutineHeader.tsx`, `RoutineTimeline.tsx`, `RoutineActions.tsx`                                                  | PR `decomp-routine-app`        |
| 2   | [`apps/web/src/modules/finyk/hooks/useStorage.ts`](../../apps/web/src/modules/finyk/hooks/useStorage.ts)                                         | 685   | `useFinykStorageReader.ts`, `useFinykStorageWriter.ts`, `useFinykMigration.ts`, `useFinykBackupSync.ts` (≤200 LOC each)                                    | PR `decomp-finyk-storage`      |
| 3   | [`apps/web/src/core/lib/chatActions/types.ts`](../../apps/web/src/core/lib/chatActions/types.ts)                                                 | 672   | core лишає тільки `ChatActionDefinition`, `ChatActionRegistry`, `ChatActionResult`. Domain-types → `modules/{finyk,fizruk,...}/chatActions/types.ts`       | PR `decomp-chat-actions-types` |
| 4   | [`apps/web/src/sw.ts`](../../apps/web/src/sw.ts)                                                                                                 | 643   | `sw/precache.ts`, `sw/notifications.ts`, `sw/scheduler.ts`, `sw/idb.ts`. Entry `sw.ts` ≤ 60 LOC.                                                           | PR `decomp-sw`                 |
| 5   | [`apps/web/src/shared/components/ui/Icon.tsx`](../../apps/web/src/shared/components/ui/Icon.tsx)                                                 | 660   | `Icon.tsx` (registry + типи) + per-icon файли в `shared/components/ui/icons/*.tsx`; tree-shake-friendly. Деталі в [0007](./0007-design-system-tooling.md). | PR `decomp-icon`               |
| 6   | [`apps/web/src/modules/finyk/FinykApp.tsx`](../../apps/web/src/modules/finyk/FinykApp.tsx)                                                       | 559   | `useFinykAppState.ts` (xstate / `useReducer`) + `FinykAppLayout.tsx`. Більшість `useEffect` (12!) → переходи стейт-машини.                                 | PR `decomp-finyk-app`          |
| 7   | [`apps/web/src/modules/fizruk/components/Workouts.tsx`](../../apps/web/src/modules/fizruk/components/Workouts.tsx) (~605) + `LogCard.tsx` (~580) | ~1185 | `useWorkoutSession.ts`, `WorkoutTimer.tsx`, `WorkoutSetList.tsx`, `WorkoutSummary.tsx`. `LogCard` → split per workout-type.                                | PR `decomp-fizruk-workouts`    |

### Фаза 3 — закрити allowlist (1 PR)

- Видалити з ESLint `overrides` allowlist (секція з `TODO(0001-…)`).
- Перевірити `pnpm lint` зелений.
- Оновити цю ініціативу: статус → **Done**, додати **Outcome** в кінці.

## Критерії DONE

- [ ] `pnpm lint` падає на будь-якому новому файлі ≥600 LOC у `apps/web/src/**/*.tsx`.
- [ ] У `apps/web/src/**` лишається ≤2 файли в allowlist (тільки ті, що мають документований план в roadmap-і).
- [ ] Декомпонований `RoutineApp` не має `any`-типів та використовує `useReducer`/state-machine для головного потоку.
- [ ] Декомпонований `Icon.tsx`: `pnpm bundle:analyze` показує −15…−25 KB у chunk-і `shared` (бо мертві іконки тепер tree-shake-аються).
- [ ] CI job `lint:tech-debt-freshness` пройшов і `LARGE_FILES` зник з `frontend.md` watching-листа.
- [ ] У `AGENTS.md` додано пункт #11 (`max-lines`) з прикладом і покликанням сюди.

## Ризики та митиґація

| Ризик                                                                            | Мітигація                                                                                                                                                                                       |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Регресія у `RoutineApp` / `FinykApp` через зміну порядку effects                 | Перед декомпозицією зафіксувати `screen.test.tsx` happy-path (RTL + MSW). Кожен PR проганяє ці тести перед merge.                                                                               |
| Конфлікти з паралельними feature-PR-ами в `modules/finyk/`                       | Запланувати декомпозицію `finyk` після `routine` (менш активний модуль). У час фази 2 для `finyk` повідомити в `#dev-channel`, заморозити cosmetic PR-и в FinykApp на 1 sprint.                 |
| Великий `chatActions/types.ts` має transitive consumers поза модулями            | Перенести типи поетапно з `re-export shim` в core (1 PR — додати shim, 1 PR — рухати імпорти, 1 PR — видалити shim). Гард: `lint:imports` перевірить, що нові імпорти йдуть з модульних шляхів. |
| Вибух bundle-розміру при tree-shake icons (lazy-import per icon = багато chunks) | Використати `vite`-у `manualChunks` для core-icon-set (часто-використовувані 30 іконок) — лишити в одному chunk-і. Решта tree-shake. Перевірити Lighthouse perf на головних сторінках.          |
| Allowlist залишиться «назавжди»                                                  | Кожен запис в allowlist має `TODO(0001-…): deadline YYYY-MM-DD`. CI job `lint:todo-freshness` падає, коли deadline пройшов.                                                                     |

## Метрики

| Метрика                                                                | Baseline (2026-05-03) | Target (2026-06-15) |
| ---------------------------------------------------------------------- | --------------------- | ------------------- |
| Файлів `apps/web/src/**` ≥600 LOC                                      | 16                    | ≤ 2                 |
| Найбільший файл                                                        | 745 LOC               | ≤ 600 LOC           |
| Bundle `shared` chunk (brotli)                                         | 92 KB                 | ≤ 75 KB             |
| Сумарний LOC у Top-15 порушниках                                       | ~12 200               | ≤ 7 500             |
| `useEffect`/`useState` у `FinykApp.tsx` (як проксі-метрика «бог-кмп.») | 12 / 9                | ≤ 4 / 3             |

## Власник, ревʼюери та комунікація

- **Lead:** `@Skords-01`.
- **Reviewers:** хто туди регулярно пише (per CODEOWNERS).
- **Heads-up:** перед стартом фази 2 — пост у `#dev-channel`, lock cosmetic PR-ів у `RoutineApp` / `FinykApp`.

## Посилання

- Design Review 2026-05-03 — `/home/ubuntu/sergeant-design-audit-2026-05-03.md` §2.1, §3.1, §12 (red-flags table)
- [`docs/tech-debt/frontend.md`](../tech-debt/frontend.md) — секція **LARGE_FILES**
- [`AGENTS.md`](../../AGENTS.md) — Hard rules (де треба додати #11)
- ADR-кандидат: «Component-size discipline + `max-lines` lint guard» (буде створений у фазі 1)
- Прецедент: декомпозиція `apps/server/src/modules/chat/agent.ts` (агент розклали на handlers / tools / cache)

## Outcome

### Фаза 1 — guard rail (DONE — 2026-05-03)

**PR:** [#1555 — `docs(docs): initiative 0001 phase 1 — max-lines guard for apps/web`](https://github.com/Skords-01/Sergeant/pull/1555) (merged 2026-05-03).

Що увімкнули:

- **`max-lines: [error, 600]`** для `apps/web/src/**/*.{ts,tsx}` у [`eslint.config.js`](../../eslint.config.js)
  (`skipBlankLines: true`, `skipComments: true`, `max: 600`). Тести й Storybook-and-fixtures-стек
  виключено окремою конфіг-секцією — вони можуть бути довшими і це нормально.
- **Allowlist** з 7 файлів-моноліттів (kept в одному `overrides` блоці з заголовним
  коментарем `// TODO(0001-module-decomposition): deadline 2026-06-15`). Кожен файл там
  явно перелічений — не glob — щоб новий ≥600-LOC файл не «пролазив» через широкий патерн.
  Список збігається з табличкою «Фаза 2 — Top-7 декомпозиція» вище.
- **Hard Rule #18** додано у [`AGENTS.md`](../../AGENTS.md), [`CONTRIBUTING.md`](../../CONTRIBUTING.md)
  та [`docs/governance/hard-rules.json`](../governance/hard-rules.json) одночасно (Hard Rule #15
  тримає ці три файли синхронізованими — `pnpm lint:hard-rules-registry` падає при дрейфі).
  Текст правила: _“У `apps/web/src/**` не може з'явитися новий файл ≥600 LOC. Декомпонуйте
  по доменах перед merge — або додавайте до allowlist у `eslint.config.js` із deadline-коментарем
  і посиланням на цю ініціативу.”_
- **`docs/tech-debt/frontend.md` § LARGE_FILES** перенесено зі стану _Watching_ у
  _In progress_, з посиланням сюди. `pnpm lint:tech-debt-freshness` тепер питає
  оновлення цієї секції, поки allowlist не порожній.

Метрики Phase 1 (Phase 2 ще попереду):

| Метрика                                        | Baseline (2026-05-03) | Phase 1 (post-#1555)                | Target (2026-06-15) |
| ---------------------------------------------- | --------------------- | ----------------------------------- | ------------------- |
| Файлів `apps/web/src/**` ≥600 LOC (CI-видимих) | 16                    | **0** (всі в allowlist із deadline) | ≤ 2                 |
| Найбільший файл                                | 745 LOC               | 745 LOC (поки в allowlist)          | ≤ 600 LOC           |
| Net-new ≥600-LOC файлів дозволяється у CI      | n/a (без правила)     | **0**                               | 0                   |

Що далі (Phase 2, окремі PR-и за табличкою «Top-7 декомпозиція»):

1. PR `decomp-routine-app` (RoutineApp.tsx 745 → ≤200 LOC по компонентах)
2. PR `decomp-finyk-storage` (useStorage.ts 685 → 4 hooks по ≤200 LOC)
3. PR `decomp-chat-actions-types` (672 → core-only лишаються base-types, domain-types у модулях)
4. PR `decomp-sw` (sw.ts 643 → entry ≤60 LOC, інше у `sw/*.ts`)
5. PR `decomp-icon` (Icon.tsx 660 → tree-shake-friendly, lazy per icon)

Phase 3 (закриття allowlist) запланована після останнього PR Phase 2 — об’єднаний
PR `decomp-finalize` видаляє `overrides` allowlist цілком і закриває цю ініціативу
як **Done**.

Відхилення від плану: жодних — Phase 1 пройшла рівно за описом, без зсувів.
