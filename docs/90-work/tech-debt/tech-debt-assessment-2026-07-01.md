# Tech-debt assessment 2026-07-01 — групи, інструкції до фіксу, burndown-план

> **Last validated:** 2026-07-01 by @claude. **Next review:** 2026-08-31.
> **Status:** Active

> **Методологія:** повний прогін механічних гейтів (pnpm lint, knip, janitors doc-drift/dep-cycles, lint:ai-legacy) + воркфло з 11 підагентів (6 verify-агентів звіряли кожну групу з живим кодом точними вимірами — ESLint per-rule прогони, effective-LOC через саме правило `max-lines`, pairwise diff; 5 instruct-агентів писали рецепти). Числа в цьому документі — виміряні 2026-07-01 на HEAD, не переписані зі старих доків.

## Executive summary

Механічний стан репо здоровий: **lint зелений, Knip — 0 знахідок, janitors чисті, AI-LEGACY — 0 маркерів, typecheck 17/17 workspace зелений** (після фіксу 5 pre-existing помилок main у цьому ж PR). Значна частина «відкритого» боргу зі старих трекерів виявилась стейловими доками — код уже пофікшений (metrics-label split, OFF/USDA normalizers, coverage floor 85, devcontainer Node 22, @types/node, trivyignore). Реальний залишок — 5 груп нижче, відсортовані за пріоритетом.

**Виконано в цьому PR (гілка `claude/tech-debt-assessment-1b6rfr`):**

1. `fix(server)`: 5 typecheck-помилок, що ламали `pnpm check` на main — `chat.ts:450/516` (exactOptionalPropertyTypes на `userId`, фікс через conditional spread) + `cross-domain-routes.contract.test.ts:258/268/278` (`createNutritionRouter()` без обов'язкового `{ pool }`).
2. `refactor(server)`: `chat/tools.ts:93` `console.log` при module load → `logger.info` (циклічний імпорт відсутній — перевірено весь ланцюжок залежностей logger.ts; застереження sentry-before-logger стосується лише apps/web).
3. Ratchet Hard Rule #18 (server): allowlist `eslint.server-maxlines-allowlist.json` 12 → 6 — знято 6 файлів, які вже під 600 effective LOC (перевірено прямим прогоном ESLint із опціями правила): `rateLimit.ts` (435), `alerts/store.ts` (517), `auth.ts` (419), `strategicGoals.ts` (490), `ingestQueue.ts` (453), `env/env.ts` (559).
4. Doc-reconcile: 10+ стейлових пунктів у `backend.md` / `frontend.md` / `technical-assessment-2026-06-05.md` синхронізовано з кодом.

---

## Група 1 — Server max-lines burndown (Hard Rule #18) — P2, ~5-6 PR

Залишок allowlist (6 файлів, effective LOC виміряний правилом):

| Файл                               | raw / eff       | Понад ліміт                    |
| ---------------------------------- | --------------- | ------------------------------ |
| `routes/internal/openclaw.ts`      | 1819 / **1379** | +779 (найбільший)              |
| `modules/openclaw/tools.ts`        | 1373 / **994**  | +394                           |
| `modules/billing/stripe.ts`        | 1013 / **835**  | +235                           |
| `obs/metrics.ts`                   | 1301 / **673**  | +73                            |
| `modules/sync/fizruk/applySync.ts` | 654 / **623**   | +23 (найменший реальний борг)  |
| `modules/chat/chat.ts`             | 887 / **600**   | рівно на ліміті, zero headroom |

Регресійний фон чистий: жоден не-allowlisted файл сервера не перевищує 550 eff (найближчі: `chat/aiQuota.ts` ~538, `sync/finyk/applySync.ts` ~536).

**Порядок і шви декомпозиції** (один PR = один файл/кластер, scope `server`, allowlist-запис видаляється в тому самому PR; перед перенесенням exported symbol — grep імпортів по monorepo, де можливо — re-export зі старого файлу):

1. **`sync/fizruk/applySync.ts` (+23).** 5 незалежних exported-функцій; винести `applyFizrukMeasurements` + `applyFizrukCustomExercises` у сусідній `applyMisc.ts`, re-export. Не змінювати сигнатури/порядок SQL; прогнати sync-тести.
2. **`obs/metrics.ts` (+73).** Уже секціонований банерами. `metrics/registry.ts` (register + statusClass + startPoolSampler + metricsHandler) + винести секції Sync (~9 метрик) у `metrics/sync.ts` і BullMQ-джоби у `metrics/jobs.ts`; `metrics.ts` — барель `export *`. Ризик: подвійна реєстрація метрики кине помилку на старті — після зміни підняти сервер і смикнути `/metrics`.
3. **`chat/chat.ts` (600, zero headroom).** Винести SSE-streaming блок (`SSE_HEARTBEAT_MS`, `StreamIterationResult`, `streamOneIterationToSse`, `streamAnthropicToSse`, ~200 eff) у `chatStream.ts`. Гарячий шлях — прогнати `chat.stream.test.ts` + ручний SSE-прогін; прочитати AI-DANGER-маркери перед перенесенням.
4. **`billing/stripe.ts` (+235).** Три шви: webhook-конвеєр → `stripeWebhook.ts`; PostHog lifecycle capture → `stripeLifecycle.ts`; checkout/portal/status лишаються. `verifyStripeSignature` — re-export. Платіжний код: тільки переміщення, нуль змін логіки.
5. **`openclaw/tools.ts` (+394).** Доменні блоки: `telegram-history.ts`, `external-metrics.ts`, `decisions.ts`, за потреби `db-query.ts`; error-класи → `errors.ts`; `tools.ts` — барель. SQL-sandbox (`FORBIDDEN_SQL_FUNCTION_RE`, `assertNoForbiddenSqlConstructs`) — security-чутливий, переносити байт-в-байт.
6. **`routes/internal/openclaw.ts` (+779).** Каталог `routes/internal/openclaw/`: `schemas.ts` (~55 Zod-схем), `helpers.ts`, 6 суб-роутерів за префіксом шляху, `index.ts` з `createOpenClawInternalRouter`. Можна двома PR: G1 = schemas+helpers (файл впаде до ~860 eff), G2 = суб-роутери + зняття з allowlist. PAT-чутлива поверхня (Hard Rule #20) — auth-перевірки не чіпати.

`env/env.ts` НЕ декомпозувати: навмисний single-inventory Zod-схеми, 96% raw-обсягу — коментарі, які правило пропускає; headroom 41 eff LOC — правило тепер охороняє файл.

**Verification per PR:** `pnpm --filter @sergeant/server lint && … typecheck && … test`; повний `pnpm check` перед merge; для metrics — локальний `/metrics`; для chat — SSE-прогін.

## Група 2 — react-hooks v7: 5 вимкнених правил — P2, 6-7 PR

Виміряні кількості порушень (web / mobile+shell / разом), проти стейлового scoreboard у `eslint.baseline.js:163-171`:

| Правило                       | web | mobile | разом   | scoreboard каже                                |
| ----------------------------- | --- | ------ | ------- | ---------------------------------------------- |
| `immutability`                | 3   | 4      | **7**   | 7 ✅ точний                                    |
| `preserve-manual-memoization` | 9   | 4      | **13**  | 9 (стейл)                                      |
| `purity`                      | 13  | 2      | **15**  | 17 (web покращився органічно)                  |
| `set-state-in-effect`         | 77  | 44     | **121** | 78 (без mobile)                                |
| `refs`                        | 59  | 322    | **381** | 37 (~10× недооблік; mobile взагалі не мірявся) |

**Порядок: від найменшого count** — кожне увімкнене правило одразу стає ratchet-ом. У першому ж PR переписати scoreboard з обов'язковим web/mobile-розбиттям (саме відсутність mobile-колонки породила 10× розрив).

1. **`immutability` (7):** мутації props/state → іммутабельні копії (`[...arr]`, `{...obj}`, `toSorted`); у RQ — тільки `setQueryData` з новим об'єктом. Ядро: `ManualExpenseSheet.tsx` (2), mobile `Sheet.tsx` (3).
2. **`preserve-manual-memoization` (13):** повні deps з простих виразів; складні вирази — у змінну перед хуком; жирний memo → кілька вузьких або `select` у useQuery. Ядро: `finyk/pages/overview/useOverviewData.ts` (5 в одному файлі).
3. **`purity` (15):** `Date.now()`/`Math.random()`/LS-read у рендері → event handler / lazy `useState(() => …)` / `useSyncExternalStore` / `useId()`. Ядро: `FirstEntryCelebrationModal.tsx` (6 — ймовірно конфеті-генерація).
4. **`set-state-in-effect` (121, стек 2-3 PR):** derived state → обчислення в рендері; reset-на-open у шітах/діалогах → патерн `key` або prev-value-during-render; sync з RQ-data → `initialData`/`select`/`key={data.id}`; підписки → `useSyncExternalStore`. Фліп правила — лише в останньому PR стека.
5. **`refs` (381, найбільший, стек 3-4 PR):** ~137 з 322 mobile-порушень сидять у 5 файлах `apps/mobile/src/components/ui/*` (AnimatedList 38, EmptyState 30, AnimatedCheckbox 27, StreakFlame 26, CoachTip 16) — Animated/Reanimated-патерн, один структурний рефактор примітивів зріже ~40% усього числа. Web-ядро: `HubSearch.tsx` (18). Для UI-змін — скріншот/запис до/після: рефактор refs в Animated-коді ламає анімації при зеленому lint.

**Чого НЕ робити:** blanket file-level disable; вмикати як `warn`; «фіксити» setState перенесенням у setTimeout; фліпати правило в одному PR із сотнею фіксів; міряти лише web.

**Verification:** per-rule нуль-чек перед фліпом: `npx eslint apps/web/src --rule '{"react-hooks/<rule>":"error"}' --no-inline-config` + те саме для `apps/mobile/src apps/mobile-shell/src`; потім `pnpm check`; анти-обхід — `grep -rn "eslint-disable.*react-hooks"` не повинен зрости.

## Група 3 — eslint-disable burndown — P2-P3, 4-5 PR

Виміряно **215** production-рядків (web 155 / server 27 / mobile 27 / packages 6); ціль «<100» нереалістична — ~115 рядків by-design (exhaustive-deps 46, no-eyebrow-drift 38, prefer-kyiv-time 22, no-cyrillic-jsx 9 — усі з обґрунтуваннями і власними треками). Реалістична модель: **механічний burndown 215 → ~200** + методологія наступного аудиту має рахувати лише недокументовані disable.

Реальні цілі фіксу (недокументовані сайти):

1. **P1, окремий швидкий PR:** 1 сайт `security/detect-non-literal-fs-filename` без обґрунтування — перевірити на path-traversal через `sergeant-security-audit`; якщо шлях user-controlled без sanitize — це security finding, не lint-косметика.
2. `@typescript-eslint/no-non-null-assertion` — 4 недокументовані з 11: `foo!.bar` → explicit guard / `?.` / типізований інваріант із коментарем.
3. `no-restricted-syntax` (5 з 29) + `no-raw-storage-key` (3 з 16) — мігрувати на дозволений API (`useLocalStorageState`, storage-adapter, key-factory) або задокументувати з посиланням на трек.
4. **Catalog-sync (docs-only):** `docs/02-engineering/architecture/apps-web-exhaustive-deps.md` дрейфнув — 33 файли з disable проти ~12 задокументованих; 21+ файлів додати (список у verify-звіті: core/hub/_Card.tsx, AuthContext, CommandPalette_, useFinykInsights, useNutritionInsights, …), 2 стейлові рядки (`pages/Overview.tsx`, `pages/Analytics.tsx` — перейменовані) виправити; кожен запис — 1 речення чому deps навмисно неповний, без шаблонних фраз.

## Група 4 — Рекласифіковано: dualWrite/residualImport — НЕ дублікати

Verify-агент спростував F-004/F-005 з assessment 2026-06-05: pairwise diff копій `residualImport.ts` = 209-467 рядків на файлах 110-310 LOC (2-4× власного розміру — текстуально майже нічого не збігається); `dualWrite/` — 4 незалежні пайплайни (1442-2170 LOC кожен, різна структура каталогів), спільний лише архітектурний патерн (best-effort try/catch, ON CONFLICT + LWW guard). OFF/USDA normalizers на сервері — вже уніфіковані в `lib/normalizers/`. **Висновок:** «вилучення у спільний фреймворк» — це побудова generic-фреймворку (усвідомлене архітектурне рішення через `sergeant-backend-architecture`), а не dedup; не брати як «чистку дублікатів».

## Група 5 — Дрібні self-contained + заблоковані

| Пункт                                           | Статус                             | Дія                                                                                                                                                    |
| ----------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `chat/tools.ts` console.log (F-008)             | ✅ виконано в цьому PR             | —                                                                                                                                                      |
| Grafana Alloy Dockerfile digest-pin (INFRA-004) | Відкрито, P4                       | `docker inspect --format='{{index .RepoDigests 0}}' grafana/alloy:v1.17.0` → `FROM grafana/alloy:v1.17.0@sha256:…` + AI-NOTE як оновлювати; scope `ci` |
| `OptimizedImage.tsx` unused (UX-017)            | 🚫 Blocked-reason: by-design       | Файл несе `@scaffolded` + «Do NOT delete» + `@owner` + `@nextStep` (CDN/loader story). НЕ видаляти                                                     |
| Lighthouse warn→error (T5)                      | 🚫 Blocked-reason: data-gated      | Чекає baseline-збору LCP; коли буде — `lighthouserc.json` LCP → `["error",{maxNumericValue:3000}]`                                                     |
| Mobile coverage floor 30 (TC-03)                | Відкрито, P3                       | Піднімати ratchet-ом у міру дописування тестів; великий effort, окрема ініціатива                                                                      |
| UI-примітиви 155→179 файлів (UX-011)            | Відкрито, P4, регресує             | Консолідація — окремий design-цикл                                                                                                                     |
| `sync_op_log` партиціювання                     | 🚫 Blocked: multi-instance trigger | План в ADR-0065, не брати                                                                                                                              |

## Довідка: що перевірено і чисте (не борг)

- Knip: 0 знахідок; janitors doc-drift/dep-cycles: чисто; AI-LEGACY: 0 маркерів; дійсних TODO у production-коді: 1 (`rateLimit.ts` M9, dep-blocked).
- `.trivyignore`: 0 активних suppression-ів; devcontainer Node 22; `@types/node` уніфікований; OTel-стек повністю видалений (ADR-0035 revert) — пункт про version sprawl неактуальний.
- Coverage floor web = 85 (CI-гейт), no-strict-bypass allowlist порожній, production-`any` = 3 by-design.
