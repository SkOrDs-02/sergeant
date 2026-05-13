# Web deep-dive — Security, observability, testing & DevX

> **Last validated:** 2026-05-04 by @Skords-01.
> **Status:** Active
> **Scope:** PII у логах, Sentry↔requestId correlation, CSP, contract тести, mutation testing, Storybook, C4-діаграми, CHANGELOG, Hard Rules registry, agent onboarding, audit docs status.
> **Related:** [`00-overview.md`](./00-overview.md), `docs/audits/`, `docs/security/`, `docs/agents/`.

Це найширша частина: безпека (2 точки), спостережуваність (3 точки), тестування (3 точки), DevX (3 точки) і документація (3 точки). Всі — high-leverage, низько-середні витрати, **жодна не чіпає продакшн-код**.

---

## 6.1 [Good] CSRF: cookie-mode → Origin/SameSite + double-submit

**Що бачу.** При cookie-based auth є `Origin`/`Sec-Fetch-*` checks + double-submit (`X-CSRF-Token`). Це **best practice 2026 року**. Лишити як є.

---

## 6.2 [Good] Auth-mail rate limiting + IP-bucket on `/auth/sign-in/*`

**Що бачу.** Скоро auth-mail-у буде окремий BullMQ-queue з backoff. На `/auth/sign-in/email` — окремий IP rate-limit (від credential stuffing). Solid.

---

## 6.3 [Bad] Better Auth із Redis у v8 prelude — це тимчасовий контракт, не підкріплений тестом

**Що бачу.** В `apps/server/src/auth/secondaryStorage.ts` коментар каже: «після v8.x prelude, Better Auth створює сесію у secondary, але читає primary». Це contract-bug, і ми робимо workaround.

**Чому це дороге.** Якщо Better Auth апгрейднеться, наш workaround стане silent no-op (редис-сесії припинять оновлюватись), і це знайдеться **тільки на проді** через session-loss.

**Recommendation / fix points.**

1. **Snapshot test contract-у Better Auth:**

   ```ts
   it('Better Auth still requires Redis-write workaround in vX', () => {
     const session = await createSession();
     const fromPrimary = await prismaPrimary.session.findUnique(...);
     const fromRedis = await redis.get(`session:${session.id}`);
     // Якщо upstream фіксить bug — обидва are present, тест падає
     expect(fromPrimary).not.toBeNull();
     expect(fromRedis).not.toBeNull(); // якщо це починає бути null — workaround можна видалити
   });
   ```

2. Додати у `package.json` postinstall step, який вилогує warning, якщо Better Auth version бампнувся вище за tested-against version:

   ```js
   if (semver.gt(betterAuthVersion, "8.x.y")) {
     console.warn(
       "⚠️  Re-validate apps/server/src/auth/secondaryStorage.ts workaround",
     );
   }
   ```

3. В `docs/security/auth-secondary-storage.md` явно записати «тестовано проти Better Auth v8.x.y, при upgrade — re-validate».

---

## 6.4 [Bad → Partially Done] No CSP / no SRI / no Permissions-Policy on Vercel

> **Status update (2026-05-03):** CSP **report-only** + розширений `Permissions-Policy` приземлено у [#1551](https://github.com/Skords-01/Sergeant/pull/1551). Залишилось: 1-2 тижні моніторингу Sentry-репортів → narrow rules → enforcing; SRI для third-party scripts (поки нема — додамо в lint, якщо з'являться).

**Що бачу.** `apps/web/vercel.json` (або `vercel.config.ts`) — є security headers (X-Frame-Options тощо), але **повноцінного CSP немає**. Для PWA з inline-styles від Tailwind / framer-motion це норма (CSP-level-3 з `'unsafe-inline'` уже не виглядає страшно), але **ці headers не задані взагалі**.

**Чому це дороге.** При XSS у будь-якій третій-party залежності або у власному коді (особливо в Markdown-render компонентах) — атака успішна без жодних обмежень.

**Recommendation / fix points.**

1. Розкатати **CSP report-only** з широкими правилами:

   ```
   Content-Security-Policy-Report-Only: default-src 'self';
     script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline';
     style-src 'self' 'unsafe-inline';
     connect-src 'self' https://*.sentry.io https://api.sergeant.app;
     img-src 'self' data: blob: https:;
     report-uri https://sentry.io/api/...;
   ```

2. 1-2 тижні дивитись звіти у Sentry. Звузити правила. Перевести в enforcing.
3. Додати `Permissions-Policy: camera=(), microphone=(), geolocation=()` (якщо ці APIs не використовуються — заборонити).
4. SRI для third-party scripts (наразі здається, що їх нема — добре, але якщо колись додасться, форсити SRI lint-ом).

**Cost / impact.** ~1 година роботи, найвищий security-leverage серед low-cost fix-ів. **Один з топ-3 у roadmap.**

---

## 6.5 [Bad → Done] PII у логах: `Pino` без redact, `requestId` корелюється тільки за timestamp

> **Status update (2026-05-03):** Pino redact list розширено до 50+ paths (req/res headers, root tokens, 1-2 рівні wildcard, email/phone), Sentry `beforeSend` тепер робить рекурсивний `scrubPII()` через спільний `redactKeyNames` контракт, requestId додається тегом до всіх Sentry-подій з ALS-контексту, ErrorBoundary показує requestId з кнопкою «копіювати» на 5xx/network/parse — у [#1551](https://github.com/Skords-01/Sergeant/pull/1551). Залишилось (окремі PR-и): `docs/security/pii-handling.md` зі списком заборонених полів і ESLint-правило проти `console.log` з email-rg.

**Що бачу.** Я не побачив у Pino-конфігурації `redact: ['email', 'phone', 'password', '*.user.email', ...]`. Якщо на Sentry приходять exceptions з body — там може бути PII.

**Чому це найвищий ROI fix у roadmap.** GDPR / DSAR — це **legal liability**, не «nice-to-have». PII у логах = sub-processor data sharing з Sentry, який не обумовлений у DPA.

**Recommendation / fix points.**

1. **Pino redact list** (10 хвилин):

   ```ts
   const logger = pino({
     redact: {
       paths: [
         "req.body.password",
         "req.body.email",
         "req.body.phone",
         "req.headers.authorization",
         "req.headers.cookie",
         "res.body.email",
         "res.body.phone",
         "user.email",
         "user.phone",
         "*.email",
         "*.phone",
         "*.password",
         "x-csrf-token",
       ],
       censor: "[REDACTED]",
     },
   });
   ```

2. **Sentry `beforeSend` hook** (15 хвилин):

   ```ts
   Sentry.init({
     beforeSend(event) {
       if (event.request?.data) {
         event.request.data = redactPII(event.request.data);
       }
       if (event.user) {
         event.user = { id: event.user.id }; // тільки ID, без email
       }
       return event;
     },
   });
   ```

3. Тест: «Sentry payload не містить email/phone/password у будь-якому полі» — recursive scan на `event.request`, `event.contexts`, `event.extra`, `event.breadcrumbs`.
4. Документ `docs/security/pii-handling.md` зі списком полів, які **ніколи** не повинні з'являтися у логах.
5. ESLint-правило: `console.log` / `console.error` з email-rg → fail.

**Cost / impact.** **30 хвилин — найвищий ROI security-fix у проєкті. Чому це не зроблено вчора?**

---

## 6.6 [Good] `CONTRIBUTING.md` Conditional Requests

**Що бачу.** При роботі з ETag / Last-Modified — є чіткі вимоги. Лишити.

---

## 7.1 [Good] CI-freshness gate, hard rules registry

`scripts/ci-freshness-gate.mjs` форсить `Last validated: YYYY-MM-DD` маркер у документах і fail-ить, якщо вони старіші за 90 днів. **Це **рідкість і це треба пропагувати** як зразок.**

---

## 7.2 [Bad] Test pyramid heavy на unit, легкий на integration

**Що бачу.** Багато unit-тестів на pure functions (`coverage` високе). Менше тестів, які справді сценарно проходять `web → server → db`. Це класична інверсія піраміди.

**Чому це дороге.** Bugs живуть на стиках: «формат, який сервер очікує», «status code, який клієнт обробляє», «headers, які middleware виставляє». Unit-тести цього не ловлять.

**Recommendation / fix points.**

1. Завести `apps/server/tests/integration/` з **handful** ключових сценаріїв:
   - sign-in → cookie set → /api/me returns user.
   - chat request → AI tool-call → finyk-row inserted in DB.
   - sync push offline batch → server applies → server returns ok with `serverIds`.
   - upload backup → restore → diff-check.
   - rate-limit hit → 429 with retry-after.
2. Use `@sergeant/test-helpers` (вже є) для уніфікованого test-app builder.
3. Запустити Playwright (E2E) у preview-deploy mode — раз на нічний CI, не на кожен PR (повільно).
4. Додати `tests/contract/` для web↔server (див. §7.4).

---

## 7.3 [Bad] Mutation testing не використовується

**Що бачу.** Coverage висока, але **coverage без mutation testing — це міф**. Можна мати 100% coverage і нульовий sense, бо тести просто викликають функцію без assertion-ів.

**Recommendation.**

1. Stryker (`@stryker-mutator/core`) on critical packages:
   - `apps/server/src/jobs/cloudSync*` (там, де сервер apply-ить op-log v2);
   - `apps/web/src/core/cloudSync/*` (там, де клієнт queue/dedup);
   - `packages/safe-storage/*` (там, де LWW resolution).
2. CI step `pnpm stryker run --concurrency 4` — раз на тиждень або на PR-и, що чіпають ці модулі.
3. Threshold: 70% mutation score on cloudSync, 50% — overall.
4. Документ `docs/testing/mutation.md` з пояснення «що це і чому».

---

## 7.4 [Bad] No contract tests web↔server

> **2026-05-04 update.** Запущено мінімальний contract layer для `/api/me`:
>
> - Канонічні фікстури — `packages/shared/src/contract-fixtures/me.ts` (4 кейси: `minimal`, `full`, `legacyNoCreatedAt`, `unverified`).
> - Consumer side — `apps/web/src/test/contract/me.contract.test.ts` (api-client + `MeResponseSchema`).
> - Producer side — `apps/server/src/routes/me.contract.test.ts` (route handler через supertest).
> - 17 contract assertions, 0 production code touched. Pattern документовано в `packages/shared/src/contract-fixtures/README.md`. Наступні endpoint-и розширюють той самий каталог.

**Що бачу.** Pact / OpenAPI-validation немає. Кожна сторона припускає shape — це причина drift-у §4.7.

**Recommendation.**

1. Поки немає OpenAPI (§4.7) — мінімально:

   ```ts
   // apps/web/tests/contract/auth.contract.test.ts
   it('GET /api/me response matches MeResponseSchema', async () => {
     const response = await fetch('http://localhost:4000/api/me', { ... });
     const body = await response.json();
     expect(MeResponseSchema.safeParse(body).success).toBe(true);
   });
   ```

2. Run у CI з реальним server-mock (не unit-mock).
3. Після §4.7 (OpenAPI generation) — це стає `pnpm api:check`-крок, який валідовує shape automatically.

---

## 8.1 [Good] Custom ESLint rules, hard rules

`packages/sergeant-design` — рідкісне досягнення. Лишити, інвестувати ще: domain-specific rules > generic rules.

---

## 8.2 [Good] CONTRIBUTING.md з реальними прикладами

OK.

---

## 8.3 [Bad] `WEB_FE_AGENT.md` 1300+ LOC — agent context overload

**Що бачу.** Файл великий і починає містити overlap з `AGENTS.md`, `docs/conventions/`, `docs/audits/*`.

**Recommendation.**

1. Розбити на:
   - `docs/agents/web-fe.md` (workflow, tools, examples) — 300 LOC max.
   - `docs/agents/web-fe-conventions.md` (наслідки code style) — symlink на `docs/conventions/web.md`.
   - `docs/agents/web-fe-troubleshooting.md` (FAQ) — 200 LOC max.
2. Маркер «Last reviewed by human: YYYY-MM-DD» зверху.
3. CI-freshness gate (§7.1) уже є — застосувати до agent-docs.

---

## 8.4 [Mixed] Pre-commit hooks: lint-staged eslint+prettier — добре. Але…

`.husky/pre-commit` робить лінт + типчек subset-у. Чого нема:

- `validate-i18n.mjs` (якщо буде i18n-system у §3.8 з 01-frontend-ergonomics) — fail на хардкоди.
- `validate-csp.mjs` (якщо буде CSP у §6.4) — fail на inline scripts.
- `pnpm dedupe --check` — щоб lockfile не розкуйовдився.

**Recommendation.** Розширювати pre-commit поетапно, як з'являються нові invariant-и.

---

## 8.5 [Bad] No automated agent-onboarding доку

**Що бачу.** Коли новий agent (Devin / Claude / etc.) клонує проєкт, що йому читати першим? Я бачу `AGENTS.md`, `WEB_FE_AGENT.md`, `CONTRIBUTING.md`, `docs/conventions/`, `docs/audits/` — це 30+ файлів. **Жодного «start-here» з структурою.**

**Recommendation.**

1. `docs/agents/start-here.md` — onboarding-checklist:
   ```md
   1. Read `AGENTS.md` (Hard Rules) — required.
   2. Read `docs/conventions/web.md` — required for FE work.
   3. Read `docs/conventions/server.md` — required for BE work.
   4. Skim `docs/audits/2026-04-28-comprehensive-audit.md` — context.
   5. Run `pnpm dev` — verify setup works.
   6. Run `pnpm test` — verify CI passes locally.
   ```
2. Лінк з `README.md` під «For agents» секцією.
3. Snapshot test «всі required files exist» — щоб renaming не зламало onboarding.

---

## 8.6 [Bad → Foundation] Storybook відсутній

> **Update 2026-05-04 (foundation step):** [#1647](https://github.com/Skords-01/Sergeant/pull/1647) підняв **Storybook 10** прямо в `apps/web` (`.storybook/main.ts` + `preview.tsx`, framework `@storybook/react-vite`, glob `src/**/*.stories.@(ts|tsx)`). Додано перші stories для `Button` / `Badge` / `Card` (включно з module brand-варіантами finyk/fizruk/routine/nutrition). `viteFinal` хук викидає `vite-plugin-pwa` з конфігу — workbox precache рветься на Storybook manager bundle (~3.18 MB > дефолтний 2 MiB ліміт). Scripts: `pnpm --filter @sergeant/web storybook` (dev на :6006), `pnpm --filter @sergeant/web build-storybook` (статика у `storybook-static/`). Розширення каталогу + Chromatic / Playwright VRT — Phase 1.2+ ініціативи [0007](../../initiatives/archive/_0007-design-system-tooling.md).
>
> **Update 2026-05-04 (follow-up #1):** [#1678](https://github.com/Skords-01/Sergeant/pull/1678) розширив каталог 3 → 8 компонентів — додано `Banner` (status-soft tokens × 4 variants + `AllVariants` для contrast-аудиту), `Skeleton` / `SkeletonText` (Pulse / Shimmer / TextLines / CardPlaceholder / StaggeredList), `Tooltip` (Default + 4 placements + Disabled + LongContent), `DataState` (усі 5 канонічних станів: Loaded / LoadingDefault / LoadingShapeAware / Empty / ErrorDefault / ErrorCustom / Stale), `Modal` (Default з footer + Sizes + ForceConfirm + BodyOnly). Всі interactive Modal-stories делегують render до named Demo-компонентів — `react-hooks/rules-of-hooks` v7 не пускає `useState` всередині arrow-`render`. `Toast` навмисно НЕ додано — потребує provider-у в `.storybook/preview.tsx`, окремий PR. На шляху до цілі ≥ 20 компонентів.
>
> **Update 2026-05-04 (follow-up #2 — round 7):** [#1695](https://github.com/Skords-01/Sergeant/pull/1695) розширив каталог 8 → **12** компонентів — додано stories для core form-controls + navigation: `Input` (9 stories: states / sizes / variants / live char-counter), `Spinner` (4 stories: sizes / inline / OnBrandSurface для контрасту на module-токенах), `Switch` (6 stories: states + `SettingsList`; обгортка `ScreenReaderAnnouncerProvider` бо `useAnnounce()` без contexts падає; `ControlledDemo`-патерн для hooks-у в render), `Tabs` (6 stories: variants + `Pill` / `Fill` + module-кольори + disabled tab). Підняли coverage до 60 % від цілі (12/20). Залишилось `Avatar`, `Segmented`, `Toast` (потребує provider у preview.tsx), і module-specific компоненти.
>
> **Update 2026-05-04 (follow-up #3 — round 8):** [#1732](https://github.com/Skords-01/Sergeant/pull/1732) розширив каталог 12 → **16** компонентів — додано stories для display + form-control + data-readout + navigation primitives: `Avatar` (6 stories + 2 grids: image+initials fallback, status-dot online/busy/offline, всі 5 sizes у grid, edge-cases для `getInitials` — порожнє ім'я / 1 слово / non-Latin), `Select` (5 stories + 1 grid: 3 variants × 3 sizes + error / disabled), `Stat` (6 stories + 2 grids: `default` + 3 status variants + 4 module variants + 3 sizes + icon + alignment), `Segmented` (3 stories + 2 module-grids: 5 variants × 2 styles solid/soft × 2 sizes). Coverage 80 % від цілі (16/20). Залишилось `Toast` (потребує provider у preview.tsx), і module-specific компоненти. Storybook-build verified: `pnpm --filter @sergeant/web build-storybook` clean (~5 s).

**Що бачу.** 76 UI-компонентів. Jolt у вкладенні `apps/web/src/shared/ui/*`. Нема Storybook, нема альтернативи (Ladle / Histoire). Ускладнює:

- Рев'ю UI-змін без локального запуску всього застосунку;
- Visual regression tests (Chromatic / percy.io);
- Onboarding designer-а без full-stack клонування.

**Recommendation / fix points.**

1. Storybook 8 + auto-generate stories from component path. Run на Vercel preview як `apps/web-storybook`.
2. Prioritize:
   - `<DataState>` (з §3.2 у 01-frontend-ergonomics) — стандарт для всіх loading/empty/error cases.
   - `<Form>` примітиви (з §3.1).
   - `<Modal>` (з §3.5) — focus management, ESC, backdrop.
3. Visual regression — раз на quarter, не на кожен PR.
4. Документ `docs/ui/storybook.md` зі стандартами «що писати у story» (controls, args, parameters).

---

## 9.1 [Good] `docs/audits/*` структура

Періодичні аудити з timestamps — добре. Цей фрейм (поточний deep-dive) лежить у `docs/audits/` як `web-deep-dive` піджанр — окремо від генеральних аудитів, але в тій самій таксономії (раніше — окрема `docs/diagnostics/` секція; злито 2026-05-05). **Lifecycle:** Active → Superseded by next deep-dive on same topic.

---

## 9.2 [Bad] No C4 diagrams (System / Container / Component)

**Що бачу.** Багато текстових архітектурних доків. Жодної діаграми (PlantUML / Mermaid / Excalidraw).

**Recommendation.**

1. **System context (C1).** 1 діаграма: User → Sergeant Web (PWA) → Server → Postgres + Redis + AI Provider + Sentry + Email. Показує external systems.
2. **Containers (C2).** 1 діаграма: Web (Vercel) ↔ API (Express) ↔ Worker (BullMQ in-process, §1.6) + Postgres + Redis.
3. **Components (C3).** 1-2 діаграми для найскладніших modules (CloudSync, Chat tool-use loop).

   Mermaid-format в `docs/architecture/diagrams/` — auto-render у GitHub.

4. **Key flows (sequence diagrams).** Sign-in cookie flow, sync push/pull, chat tool-use cycle, reminder fire — 4 діаграми.

**Cost / impact.** 1 день роботи, перманентно покращує context-onboarding для будь-кого нового (агент чи людина).

> **Update 2026-05-04 ([#1602](https://github.com/Skords-01/Sergeant/pull/1602)):** done. `docs/architecture/diagrams/` додано:
>
> - **C1** — [`c1-system-context.md`](../../architecture/diagrams/c1-system-context.md): User ↔ Web/Mobile/Mobile-Shell ↔ Server ↔ Postgres/Redis/Anthropic/Sentry/n8n/Mono/SMTP/APNs/FCM/Telegram.
> - **C2** — [`c2-containers.md`](../../architecture/diagrams/c2-containers.md): deploy-топологія Vercel ↔ Railway (Server + n8n + Console + Postgres + Redis), BullMQ workers in-process, network boundaries.
> - **C3** — [`c3-cloudsync.md`](../../architecture/diagrams/c3-cloudsync.md) + [`c3-chat-tool-use.md`](../../architecture/diagrams/c3-chat-tool-use.md).
> - **Flows** — 4 sequence-діаграми: [sign-in](../../architecture/diagrams/flow-signin.md), [cloudsync](../../architecture/diagrams/flow-cloudsync.md), [chat tool-use](../../architecture/diagrams/flow-chat-tool-use.md), [reminder fire](../../architecture/diagrams/flow-reminder-fire.md).
>
> Усі `docs/architecture/README.md` посилання оновлено. Mermaid рендериться auto-renderom GitHub.

---

## 9.3 [Bad] CHANGELOG / RELEASE NOTES відсутні

**Що бачу.** GitHub releases — порожні (або не використовуються), `CHANGELOG.md` відсутній. Конвенціональні commits (commitlint) — є, але з них не генерується нічого user-facing.

**Recommendation.**

1. `changesets/changelog-github` (вже використовується в багатьох monorepo) → генерує CHANGELOG автоматично з conventional commits.
2. `pnpm changeset` руками для feature-PR-ів, які важно описати юзеру (а не agent-у).
3. CHANGELOG → опубліковувати у `apps/web/src/shared/components/whatsNew/` як in-app компонент (юзер бачить «що нового» при апгрейді PWA).
4. Документ `docs/release-process.md` з процесом «PR → merge → changeset → release-PR → publish».

---

## 11. Audit docs status table

> **2026-05-04 update.** `docs/audits/README.md` тепер має суцільну таблицю Status / Implemented / Outstanding / Tracker для всіх живих файлів + ad-hoc діагностик секцію. Додано «Як читати таблицю» + «Process» (CI freshness + quarterly recompilation). Більше не треба шукати по гіту, чи аудит ще актуальний.

**Що бачу.** `docs/audits/*` має 8+ файлів, але без status-індикатора («Active», «Implemented», «Superseded»). Reader не знає, чи це актуальна gap-list, чи історія.

**Recommendation.**

1. У `docs/audits/README.md` — таблиця:

   | File                                         | Date       | Status                | Implemented Items | Outstanding |
   | -------------------------------------------- | ---------- | --------------------- | ----------------- | ----------- |
   | `2026-04-28-sergeant-comprehensive-audit.md` | 2026-04-28 | Partially Implemented | 12/18             | 6           |
   | `2026-04-28-implementation-roadmap.md`       | 2026-04-28 | Active                | —                 | —           |
   | ...                                          | ...        | ...                   | ...               | ...         |

2. CI-freshness gate (§7.1) — позначати «stale» через 180 днів без оновлення status.
3. При implementation item-у — оновлювати «Outstanding» count.

---

## Прив'язка до roadmap (00-overview)

| Item у roadmap                                  | Section тут                              |
| ----------------------------------------------- | ---------------------------------------- |
| Pino redact для PII (top ROI 5.00)              | §6.5                                     |
| Sentry tag `requestId` (ROI 3.00)               | §6.5 + §4.4 у 03-backend-and-performance |
| CSP report-only (ROI 3.00)                      | §6.4                                     |
| `docs/audits/README.md` status table (ROI 2.00) | §11                                      |
| Better Auth contract test                       | §6.3                                     |
| Mutation testing on CloudSync                   | §7.3                                     |
| Contract tests web↔server                       | §7.4                                     |
| Storybook (75+ UI components)                   | §8.6                                     |
| Agent onboarding `start-here.md`                | §8.5                                     |
| C4 diagrams                                     | §9.2                                     |
| CHANGELOG / release notes                       | §9.3                                     |
| Pre-commit i18n / CSP validators                | §8.4                                     |

> **Tracker hook.** Security items (§6.x) → `docs/security/`. Observability (§4.4 reuse, requestId) → `docs/observability/`. Testing (§7.x) → `docs/testing/`. DevX (§8.x) і docs (§9.x, §11) → `docs/agents/` і `docs/audits/`.
