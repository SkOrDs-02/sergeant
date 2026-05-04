# 0012 — Perfect TS strictness rollout (`noUncheckedIndexedAccess` + 4 opt-in flags)

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Proposed (Phase 6a in-flight у [`docs/tech-debt/frontend.md` §11.1](../tech-debt/frontend.md))
> **Priority:** P1 (Sprint 2–4 — після 0010 revenue-first launch стабілізації)
> **Owner:** `@Skords-01`
> **ETA:** 4 sprints (≈4 тижні), **15–17 PRs** загалом
> **Sources:** [`docs/tech-debt/frontend.md` §11.1](../tech-debt/frontend.md) (Phase 6a baseline-experiment, 2026-05-03 measurement) + Phase 4/5/5c TS rollout уроки + ADR-кандидат «Per-flag strictness gate via tsconfig-guard allowlist».

## TL;DR

TypeScript-міграція в Sergeant закрита: **0 production `.js`/`.jsx`** у `apps/{web,server,console,mobile,mobile-shell}/src` + `packages/**/src`, `pnpm strict:coverage` = **13/13 = 100%** (canonical `strict: true` + `allowJs: false` усюди). Залишок до «ідеального стрікту» — **5 опт-ін прапорів TypeScript**, що ловлять реальні класи runtime-багів (index-out-of-range, optional-property mismatch, fall-through cases, dynamic property access). Ця ініціатива розкладає їхній rollout на **6 фаз / ~15-17 PR-ів** з per-phase baseline + `tsconfig-guard` allowlist + жорсткий критерій DONE («жодного нового override-у дозволено»).

## Чому зараз

- TS-міграція як «file-rename» закрита 2026-05-03 (PR [#1454](https://github.com/Skords-01/Sergeant/pull/1454) Phase 5c). Більше немає причин відкладати strictness-tuning.
- `noUncheckedIndexedAccess` уже flipped у [`packages/config/tsconfig.base.json`](../../packages/config/tsconfig.base.json), **9/13 пакетів** мігровано (PR-и [#1635](https://github.com/Skords-01/Sergeant/pull/1635) shared, [#1681](https://github.com/Skords-01/Sergeant/pull/1681) nutrition-domain, [#1689](https://github.com/Skords-01/Sergeant/pull/1689) insights, [#1750](https://github.com/Skords-01/Sergeant/pull/1750) finyk-domain — merged 2026-05-04). Залишок — **4 пакети** з override `false`: `apps/web`, `apps/server`, `apps/mobile`, `packages/fizruk-domain`. Без формального roadmap-у вони лишатимуться в allowlist-у `tools/tsconfig-guard/allowlist.json` нескінченно (`expires: 2026-09-30` уже видно як hard deadline).
- Інші 4 прапори (`exactOptionalPropertyTypes`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`) — ще не flipped; baseline не виміряний. Кожен новий PR без guard-а потенційно вносить регрес.
- Sprint-1 ranking: P0 ініціативи закриті (0001–0005, 0008 у фазі 5). Sprint 2–4 — час підіймати «foundation» якість.

## Скоуп

**In:**

- Per-flag rollout 5 опт-ін прапорів strict-mode у канонічному порядку (impact descending → ascending complexity):
  1. `noUncheckedIndexedAccess` — закрити залишок **4 пакетів** (`apps/web`, `apps/server`, `apps/mobile`, `packages/fizruk-domain`).
  2. `exactOptionalPropertyTypes`.
  3. `noImplicitReturns` + `noFallthroughCasesInSwitch` (один PR — пов'язані семантично).
  4. `noPropertyAccessFromIndexSignature`.
  5. `noUnusedLocals` + `noUnusedParameters` — переніс із ESLint у TS (uniformity).
- Розширення [`tools/tsconfig-guard`](../../tools/tsconfig-guard/check.mjs) для нових прапорів (`GUARDED_OPTIONS`).
- Розширення [`scripts/strict-coverage.mjs`](../../scripts/strict-coverage.mjs) — нові columns у markdown table + summary.
- Cleanup `as unknown as X` у production коді (тести залишаємо — Phase 7 опційно).
- Оновлення `docs/tech-debt/frontend.md` §11.1 — кожна row у статусі-таблиці отримує PR-link і final coverage.
- Оновлення hard-rule registry: `noUncheckedIndexedAccess` стає **Hard Rule #19** після завершення Phase 1 (як `max-lines: 600` для `apps/web/src` в Initiative 0001).

**Out:**

- TS 6 bump для `apps/mobile` + `tools/console` — це окремий вектор, BLOCKED на Expo SDK 53. Трекається в [`docs/tech-debt/mobile.md` M9](../tech-debt/mobile.md).
- `as unknown as X` у тестах (~50 файлів) — Phase 7 опційно, окрема міні-ініціатива якщо ROI виправдає.
- ESLint `consistent-type-imports`, `consistent-type-exports` — це окрема ініціатива по import-style (поза скоупом strictness).
- `tsconfig.sw.json` (service worker) — окремий target з власним lifecycle.

## План змін

### Phase 6a — `noUncheckedIndexedAccess` rollout (11 PR-ів — IN PROGRESS, 4 done)

Pre-existing baseline (виміряно 2026-05-03 через `npx tsc -p tsconfig.json --noEmit` per-workspace; PR [#1750](https://github.com/Skords-01/Sergeant/pull/1750) finyk-domain merged 2026-05-04 — baseline для апів/`fizruk-domain` залишився актуальним):

| Workspace                | Errors | Files | PR                                                                                                          | Статус     |
| ------------------------ | -----: | ----: | ----------------------------------------------------------------------------------------------------------- | ---------- |
| `packages/shared`        |     26 |     7 | [#1635](https://github.com/Skords-01/Sergeant/pull/1635)                                                    | ✅ Done    |
| `packages/nutrition`     |     31 |     9 | [#1681](https://github.com/Skords-01/Sergeant/pull/1681)                                                    | ✅ Done    |
| `packages/insights`      |     ✅ |     — | [#1689](https://github.com/Skords-01/Sergeant/pull/1689)                                                    | ✅ Done    |
| `packages/finyk-domain`  |     73 |    18 | [#1750](https://github.com/Skords-01/Sergeant/pull/1750)                                                    | ✅ Done    |
| `packages/api-client`    |     45 |     9 | (вже ✅ через base inheritance — без override)                                                              | ✅ Done    |
| `packages/fizruk-domain` |     31 |    12 | PR `decomp-strict-fizruk-domain`                                                                            | 🟡 Pending |
| `apps/mobile`            |     25 |    14 | PR `decomp-strict-mobile`                                                                                   | 🟡 Pending |
| `apps/server`            |    335 |    57 | PR `decomp-strict-server-{auth,modules,routes}` (split на 3 sub-PR — занадто великий single PR)             | 🟡 Pending |
| `apps/web`               |    625 |   147 | PR `decomp-strict-web-{core,modules-finyk,modules-fizruk,modules-routine,modules-nutrition,shared}` (6 PRs) | 🟡 Pending |

**Очікувано (Phase 6a residual):** 1 (`fizruk-domain`) + 1 (`mobile`) + 3 (`server` split) + 6 (`web` split) = **11 PR-ів**.

> **Phase 6a closure criterion:** `tools/tsconfig-guard/allowlist.json` для `noUncheckedIndexedAccess` пустий, override `false` зник у всіх tsconfig-ах apps + packages, `pnpm strict:coverage` показує **13/13 = 100%** для `noUncheckedIndexedAccess` column.

> **Coordination:** PR-и проти `apps/server` + `apps/web` бажано розводити в часі від великих `0010-revenue-first-launch` Stripe/auth/paywall PR-ів — конфлікти merge будуть болючі. Phase 6a закінчується одночасно з або після 0010 Phase 4 (auth migration).

### Phase 6b — `exactOptionalPropertyTypes` baseline + rollout (1–3 PR)

`?:` більше не приймає явний `| undefined`:

```ts
// До: інтерфейс приймав обидва — `value: undefined` і відсутність ключа.
interface Config {
  value?: string;
}
const c1: Config = { value: undefined }; // ✅ OK з default strict
const c2: Config = {}; // ✅ OK

// Після (`exactOptionalPropertyTypes: true`): різниця стає семантичною.
const c1: Config = { value: undefined }; // ❌ Error 2375
const c2: Config = {}; // ✅ OK
```

**Очікуваний impact:** ~50–150 помилок (за оцінкою з §11.1; baseline виміряти у відкривному PR).

**План:**

1. **PR `flip-eopt-baseline`:** flip у `packages/config/tsconfig.base.json` + override `false` у всіх 4 апах + 9 пакетах + measure baseline + commit table у `frontend.md §11.1` + extend `tsconfig-guard`. Exit criterion: PR opens, errors per workspace зафіксовані.
2. **PR `flip-eopt-domain`:** виправити 4 domain-pkg + `packages/shared` + `packages/api-client` (≤30 файлів очікувано).
3. **PR `flip-eopt-apps`:** виправити `apps/{web,server,console,mobile}` (~50–100 файлів) — можна розбити на 2 sub-PR якщо більше 50 файлів.

### Phase 6c — `noImplicitReturns` + `noFallthroughCasesInSwitch` (1 PR)

Обидва прапори ловлять схожий клас bug-ів (chat-actions handler-и переважно), очікуваний impact низький (~10–30 помилок). Їх можна підняти разом одним PR `flip-noimplicitreturns-nofallthroughswitch` — flip + fix + guard + coverage script update + frontend.md row update.

### Phase 6d — `noPropertyAccessFromIndexSignature` (1–2 PR)

Робить різницю між `obj.foo` і `obj["foo"]` для index-signature типів (`Record<string, X>`). Вимагає переписати `.foo` → `["foo"]` для index-signature consumer-ів. Очікуваний impact: ~50 помилок, переважно у `Record<string, X>`-сервісах (`apps/server/src/lib/audit*`, `apps/web/src/core/lib/lazyImport.ts`).

**План:**

1. **PR `flip-nopropertyaccessfromindexsignature-baseline`:** flip + measure + extend guard + table.
2. **PR `flip-nopropertyaccessfromindexsignature-fix`:** виправити helper-и + сервіси (можливо разом, якщо <30 файлів).

### Phase 6e — `noUnusedLocals` + `noUnusedParameters` (1 PR)

Зараз enforced через ESLint (`@typescript-eslint/no-unused-vars`). Перенесення у TS дає uniformity (один canonical enforcer). Низький impact — ESLint вже ловить.

**PR `flip-nounused-tsenforce`:** flip у base + видалити `@typescript-eslint/no-unused-vars` з ESLint config (або залишити як «warn» — для preflight UX) + verify `pnpm typecheck` + frontend.md row update.

### Phase 6f — `as unknown as X` cleanup у production (1 PR + опційно Phase 7)

**Phase 6f (in-scope):** скан + ремонт `as unknown as X` у production коді (`apps/*/src/**`). На 2026-05-01 allowlist `no-strict-bypass` був порожній — повторне зростання може критися в нових PR-ах. Audit + fix + bump allowlist threshold у lint.

**Phase 7 (out-of-scope, опційно):** `as unknown as X` у тестах (~50 файлів). Замінити на типізовані mock-helper-и + `vitest-mock-extended`. Окрема ініціатива (TBD), оскільки ROI на test-only коді нижчий.

### Підсумок PR breakdown

| Phase | Назва                                    | PRs           | Cumulative                |
| ----- | ---------------------------------------- | ------------- | ------------------------- |
| 6a    | `noUncheckedIndexedAccess`               | 11 (4 ✅ + 7) | 11                        |
| 6b    | `exactOptionalPropertyTypes`             | 1–3           | 13–15                     |
| 6c    | `noImplicitReturns` + `noFallthroughSw.` | 1             | 14–16                     |
| 6d    | `noPropertyAccessFromIndexSignature`     | 1–2           | 15–18                     |
| 6e    | `noUnusedLocals` + `noUnusedParameters`  | 1             | 16–19                     |
| 6f    | `as unknown as X` cleanup (prod-only)    | 1             | **17–20 PR-ів** (cap 17–) |

> Реалістичний центральний оцінок: **15-17 PR-ів** (7 у 6a residual + 2 у 6b + 1 у 6c + 1 у 6d + 1 у 6e + 1 у 6f + 2-4 buffer на спліт під big-impact-апів).

## Критерії DONE

- [ ] `pnpm strict:coverage` — всі 5 нових columns показують **13 / 13 = 100%** для:
  - `noUncheckedIndexedAccess`
  - `exactOptionalPropertyTypes`
  - `noImplicitReturns` (+ `noFallthroughCasesInSwitch` як partner-flag)
  - `noPropertyAccessFromIndexSignature`
  - `noUnusedLocals` (+ `noUnusedParameters`)
- [ ] `tools/tsconfig-guard/allowlist.json` — порожній. Жодного override-у `false` для нових прапорів. CI-падіння при regress-override.
- [ ] [`docs/tech-debt/frontend.md` §11.1](../tech-debt/frontend.md) — таблиця Status: всі rows `🟢/⏳ → ✅ Done`. Розділ переноситься до архівного post-script.
- [ ] [`AGENTS.md` Hard Rules](../../AGENTS.md) — Hard Rule #19 «Strict-mode flag canonical: `noUncheckedIndexedAccess: true` по всьому monorepo» зафіксований у [`docs/governance/hard-rules.json`](../governance/hard-rules.json).
- [ ] CI ganye `pnpm strict:coverage` post-PR-merge → markdown table попадає в `$GITHUB_STEP_SUMMARY` (як зараз для existing flags).
- [ ] Жодного `as unknown as X` у production-коді (`apps/*/src/**` excluding `**/*.test.ts`/`*.spec.ts`).

## Ризики

| Ризик                                                                      | Mitigation                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Великий PR `apps/web` (625 errors / 147 файлів) — review-неможливо**     | Розбити на 6 sub-PR per-module (`core`/`modules-{finyk,fizruk,routine,nutrition}`/`shared`). Кожен sub-PR зменшує error count приблизно на 1/6.                                                                               |
| **Регрес під час паралельних 0010-PR-ів (Stripe/auth/paywall)**            | Прокоординувати з owner-ом 0010 — Phase 6a `apps/web` PR-и не відкривати, поки 0010 Phase 4 (auth migration) не closed. `tsconfig-guard` allowlist `expires: 2026-09-30` дає buffer 5 місяців.                                |
| **`exactOptionalPropertyTypes` ламає `MonoAccount.balance?: number`**      | У §11.1 row 2 явно зазначено цей edge case. Перед flip — audit Mono-related shapes; для legacy POSTed data додати explicit `value: undefined` semantics через optional `\| null`. ADR-кандидат «Optional vs nullable shapes». |
| **`noUnusedLocals` від TS дублює ESLint `no-unused-vars` → noisy reports** | Перенести правило цілком у TS, видалити з ESLint (або залишити як `warn` для preflight). Frontend.md §11.1 row 5 фіксує цей trade-off.                                                                                        |
| **Mock-cast `as unknown as X` у тестах вимикається занадто рано**          | Phase 7 — опційна; не блокує закриття 0012. Можна окремо оцінити ROI типізованих mock-helper-ів.                                                                                                                              |
| **Зростання `tsconfig-guard` allowlist через regression**                  | `tools/tsconfig-guard` блокує silent override drift. CI падає на будь-який нерегламентований override → не пройде merge.                                                                                                      |

## Власник / ETA

- **Owner:** `@Skords-01`.
- **Reviewers:** хто торкається `apps/{web,server}` (per CODEOWNERS).
- **ETA:** Sprint 2–4 (~4 тижні), після стабілізації Initiative 0010 (revenue-first launch).
  - **Тиждень 1 (post-0010):** PR `flip-noimplicitreturns-nofallthroughswitch` (Phase 6c) + `flip-nounused-tsenforce` (Phase 6e) — XS-PR-и, ~2-3 години кожен. Quick wins.
  - **Тиждень 2:** Phase 6a residual (`fizruk-domain`, `api-client`, `mobile`) — 3 PR-и.
  - **Тиждень 3:** Phase 6a `apps/server` split (3 PR-и) + Phase 6b baseline (`flip-eopt-baseline`).
  - **Тиждень 4:** Phase 6a `apps/web` split (6 PR-и) — паралельно з рештою phase 6b/6d/6f cleanup-ами.
- **Heads-up:** перед стартом Phase 6a `apps/web` — пост у `#dev-channel`, lock cosmetic PR-ів у gating modules.

## Посилання

- [`docs/tech-debt/frontend.md` §11.1 (Що ще лишилось до «ідеального» стрікту)](../tech-debt/frontend.md) — full table з baseline-помилками per-workspace + per-module rollout планом.
- [`docs/tech-debt/backend.md` § Gradual TypeScript migration plan](../tech-debt/backend.md) — archive-marker з посиланням сюди як successor.
- [`packages/config/tsconfig.base.json`](../../packages/config/tsconfig.base.json) — поточний canonical strict baseline.
- [`tools/tsconfig-guard/check.mjs`](../../tools/tsconfig-guard/check.mjs) + [`tools/tsconfig-guard/allowlist.json`](../../tools/tsconfig-guard/allowlist.json) — drift-захист, який буде розширено для кожного нового прапора.
- [`scripts/strict-coverage.mjs`](../../scripts/strict-coverage.mjs) — strict coverage tracker, output у `$GITHUB_STEP_SUMMARY`.
- Прецедент: Phase 4 + Phase 5c TS rollout — PR [#1454](https://github.com/Skords-01/Sergeant/pull/1454) — патерн «flip + measure + guard + frontend.md update» доведений у проді.
- ADR-кандидат: «Per-flag strictness gate via tsconfig-guard allowlist» (буде створений у Phase 6a closure).
- Initiative 0001 (Module decomposition) — структурний шаблон цієї ініціативи.

## Outcome

> Розділ заповнюватиметься per-phase у міру закриття PR-ів. Зразок — Phase 1 закриття у [`0001-module-decomposition.md` § Outcome](./0001-module-decomposition.md#outcome).

### Phase 6a — `noUncheckedIndexedAccess` rollout (IN PROGRESS — 4 of ~12 PRs done as of 2026-05-04)

Done so far:

- [#1635](https://github.com/Skords-01/Sergeant/pull/1635) — `packages/shared` (26 errors / 7 файлів → 0). Patterns: `abTest.ts` (variant pick), `dashboard.ts` (lookup), `dashboardFocus.ts` (selectedKey), `speechParsers.ts` (regex matches → `match[i]?`).
- [#1681](https://github.com/Skords-01/Sergeant/pull/1681) — `packages/nutrition-domain` (31 → 0; 10 errors / 4 файлів закрито через `!` після `findIndex >= 0` guard).
- [#1689](https://github.com/Skords-01/Sergeant/pull/1689) — `packages/insights` (✅ 0 baseline, formal flip; 13 errors / 2 тестових файли закрито через `recs[0]?.x` після `expect(recs).toHaveLength(1)`).
- [#1750](https://github.com/Skords-01/Sergeant/pull/1750) — `packages/finyk-domain` (73 → 0). Merged 2026-05-04.

Naut: **9 / 13 packages done** (post #1750 merge 2026-05-04); **4 left** — `apps/web`, `apps/server`, `apps/mobile`, `packages/fizruk-domain`.

### Phase 6c — `noImplicitReturns` + `noFallthroughCasesInSwitch` (✅ DONE — 1 PR, 2026-05-04)

Baseline (виміряно 2026-05-04 через per-workspace `npx tsc -p tsconfig.json --noEmit`):

| Workspace                           | Errors | Files | Notes                                                                                                                                                |
| ----------------------------------- | -----: | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`                          |      6 |     6 | `useEffect` cleanups з conditional cleanup — `useAppEffects`, `useIosInstallBanner`, `usePwaInstall`, `NutritionApp`, `InputDialog`, `SwipeToAction` |
| `apps/server`                       |      2 |     2 | `auth.ts` Better Auth `session.create.before` hook + `apiCors.ts` middleware                                                                         |
| `apps/mobile` + 10 інших workspaces |      0 |     0 | clean                                                                                                                                                |
| **Total**                           |  **8** | **8** |                                                                                                                                                      |

Жодного `noFallthroughCasesInSwitch` violations — всі `switch`-statement-и у репі коректні.

**Fix pattern:** `useEffect` з conditional cleanup-функцією повертає `(() => void) | undefined`. До `noImplicitReturns` TS приймав implicit-fall-through; тепер вимагається explicit `return undefined;`. Те саме для async-handler-ів і Express middleware — додано explicit `return;` на термінальних branch-ах.

**Coverage update:**

- `packages/config/tsconfig.base.json` — `"noImplicitReturns": true, "noFallthroughCasesInSwitch": true` додано.
- `tools/tsconfig-guard/check.mjs` — `GUARDED_OPTIONS` розширено двома новими прапорами; жоден workspace не має override-у.
- [`docs/tech-debt/frontend.md` §11.1 row 3](../tech-debt/frontend.md) — статус `⏳ pending → ✅ Done`.

### Phase 6e — `noUnusedLocals` + `noUnusedParameters` (✅ DONE — 1 PR, 2026-05-04)

Baseline (виміряно 2026-05-04 через per-workspace `npx tsc -p tsconfig.json --noEmit`):

| Workspace                           | Errors | Files | Notes                                                                                                                              |
| ----------------------------------- | -----: | ----: | ---------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`                          |      1 |     1 | `apps/web/src/core/db/__tests__/sqlite-wasm-fake.ts` — `private cols: string[]` field assigned but never read (dead state in fake) |
| `apps/server` + 11 інших workspaces |      0 |     0 | clean — ESLint `@typescript-eslint/no-unused-vars` rule вже багато років ловив усе                                                 |
| **Total**                           |  **1** | **1** |                                                                                                                                    |

**Fix pattern:** видалив поле `cols` із `FakeRows` test-fake (запис у `CREATE TABLE` branch + reset у `close()`); поле ніде не читалось — це dead state. Замінив на short comment, що пояснює, чому fake не парсить колонки (rows повертаються verbatim).

**Coverage update:**

- `packages/config/tsconfig.base.json` — `"noUnusedLocals": true, "noUnusedParameters": true` додано.
- `tools/tsconfig-guard/check.mjs` — `GUARDED_OPTIONS` розширено двома новими прапорами; жоден workspace не має override-у.
- [`docs/tech-debt/frontend.md` §11.1 row 5](../tech-debt/frontend.md) — статус `⏳ pending → ✅ Done`.

**Чому залишаємо ESLint rule active (doubly-redundant):** `@typescript-eslint/no-unused-vars` ловить деякі edge-cases, які TS пропускає — зокрема JSX-imports у `.tsx` файлах і `_`-prefixed argument convention. Видалення ESLint-rule можна зробити окремим PR-ом після кварталу expirience з TS-enforcement, якщо буде доведено, що ESLint нічого додаткового не знаходить. Поки — обидва.
