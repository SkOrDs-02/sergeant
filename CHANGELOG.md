# Changelog

> **Last validated:** 2026-05-02 by @Skords-01. **Next review:** 2026-07-31.
> **Status:** Active

Усі помітні зміни проєкту документуються тут.

Формат — [Keep a Changelog](https://keepachangelog.com/uk/1.1.0/),
версіювання — [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Автоматизація:** проєкт використовує Conventional Commits + commitlint.
> Наступний крок — підключити автоматичну генерацію changelog
> (наприклад, `changesets` або `conventional-changelog-cli`).

## [Unreleased]

### Fixed

- **AI memory: default `VOYAGE_EMBEDDING_MODEL` переведено з `voyage-3-lite` на
  `voyage-3.5-lite`.** Виявлено на activation 2026-05-02: Voyage API для
  `voyage-3-lite` повертає **тільки 512-вимірні** embeddings, тоді як наша
  схема `ai_memories.embedding HALFVEC(1024)` (міграція 025) і `VOYAGE_EMBEDDING_DIM=1024`
  очікують 1024d → перший же `remember()` валився б на `400 — Value '1024' supplied
for argument 'output_dimension' is not valid`. Воно не було помітно поки прапор
  `AI_MEMORY_ENABLED=false`, але блокувало production rollout. Перевірив: 1024d
  нативно підтримують `voyage-3.5-lite` (lite-наступник, той самий ціновий тір
  ~$0.02/1M tokens), `voyage-3`, `voyage-3.5`, `voyage-3-large`. Default
  переведено на `voyage-3.5-lite` у `apps/server/src/env.ts`, `.env.example`
  отримав warning, ADR-0028 / integrations doc / runbook / SQL-коментарі / тести
  оновлено. Production Railway env уже override-ить через `VOYAGE_EMBEDDING_MODEL=voyage-3.5-lite`
  — цей PR робить дефолт self-consistent для свіжих deploy-ів і dev-environment-ів.

- **CI: baseline-failures cluster (n8n / pgvector / Argos / iOS / Popover).** На
  main одночасно червоніли 5 чеків — жоден не блокувався gating-required, але
  усі ламали `git_pr_checks` для будь-якого PR.
  - `check`: `pnpm ops:n8n:validate` валив повідомлення «workflows in git must
    be inactive by default». Сім файлів у `ops/n8n-workflows/` мали
    `"active": true` (`07-morning-briefing-push`, `08-weekly-financial-digest`,
    `09-habit-streak-alert`, `10-debt-receivable-reminder`,
    `16-posthog-daily-metrics`, `60-growth-funnel-snapshot`,
    `63-growth-acquisition-snapshot`). Контракт `validate-n8n-workflows.mjs`
    каже: інстанс активуємо в n8n UI після перевірки credentials, JSON у git
    мусить бути inactive. Усі сім переведено на `"active": false`.
  - `Test coverage (vitest)` + `Critical-flow E2E (Playwright)`: міграція
    `apps/server/src/migrations/025_ai_memories_pgvector.sql` робить
    `CREATE EXTENSION IF NOT EXISTS vector;`, але `services.postgres` у
    `.github/workflows/ci.yml` (i `extended-e2e.yml`) використовував
    `postgres:16-alpine`, який pgvector не вміє → `db:migrate:dev` падав з
    `extension "vector" is not available`. Образ змінено на
    `pgvector/pgvector:pg16` (SHA-pinned manifest digest, multi-arch).
    Решта тестів — побічно failing через cross-test pollution (sqlite jsdom
    state, button-in-button DOM violation у Popover, hub/fizruk action
    timing) — не блокують міграцію і трекаються окремо.
  - `Visual regression (Argos)`: `playwright.visual.config.ts` піднімає лише
    `vite preview`, тож рендер `welcome` / `hub` / `finyk` сторінок
    бомбардував proxy запитами `/api/v1/{me,coach/insight,coach/memory,
metrics/web-vitals}` — а API серверу не було, vite сипав
    `ECONNREFUSED 127.0.0.1:3000` сотнями і networkidle timeout зривав
    скріншоти. `.github/workflows/visual-regression.yml` тепер дзеркалить
    `critical-flow` job: піднімає pgvector-postgres, виконує `db:migrate:dev`,
    стартує `@sergeant/server dev` і `@sergeant/web preview` у фоні,
    очікує `/health` і preview-порт, далі запускає `test:visual` з
    `PW_SKIP_WEBSERVER=1` (щоб конфіг не стартував preview вдруге).
  - `Build iOS Simulator (Debug)`: `pnpm exec cap add ios` падав на
    «Could not find the ios platform. You must install it in your project
    first, e.g. w/ npm install @capacitor/ios». `apps/mobile-shell` мав
    `@capacitor/android` але не `@capacitor/ios`. Додав
    `@capacitor/ios@^7.6.2` (узгоджено з @capacitor/android) — тепер
    `cap add ios` сам ставить шаблон, а наступний `cap sync ios` коректно
    підхоплює `apps/mobile-shell/ios` Podfile.
  - `apps/web/src/shared/components/ui/Popover.test.tsx`: тест
    `renders trigger and hides panel when closed` рендерив
    `<Popover trigger={<button>Open</button>}>`, що Popover обгортав у
    `<div role="button">…</div>` — у DOM з'являлось два «button» з
    accessible name `Open`, `getByRole("button", { name: "Open" })`
    падав з `Found multiple elements`. Виправлено в тесті: тригер тепер
    `<span>Open</span>`, як і у решті тестів цього файлу — це й
    реальний production-патерн (споживач Popover-у дає неінтерактивний
    зміст, аріа-семантику дає сам Popover).

- **Web: відновлено strict-pipeline (`tsc -p tsconfig.strict.json`) — два regression-блокери після PR #1330.**
  Pull-to-refresh feature злетів зі strict-null pipeline: 3 помилки на двох
  файлах ламали Phase 1–3 typecheck.
  - `shared/components/ui/PullToRefresh.tsx:88` — `useRef<HTMLDivElement>(null)`
    робить `current` read-only під strict; коли `setScrollEl` пробує
    переприсвоїти ref, TypeScript падає з `TS2540`. Тип ref-а уточнено
    як `useRef<HTMLDivElement | null>(null)` — runtime поведінка
    незмінна, ref залишається mutable як і має бути для DOM-callback-у.
  - `core/auth/ResetPasswordPage.tsx:139,170` — після `feat: useFormValidation`
    spread `{...pwValidation.getFieldProps("password")}` опинявся **після**
    `className={INPUT_CLS}` і клобрив явний клас (повертає
    `{ error, className: "border-danger …", onBlur }`). На сторінці reset
    password обидва інпути пароля втрачали `INPUT_CLS` стилі, як тільки
    в полі з'являлась validation-помилка. Зафіксено: дістаємо
    `passwordFieldProps` / `confirmFieldProps` явно, зливаємо
    `INPUT_CLS` з `getFieldProps().className` через `cn()`, проброс
    `onBlur` явно. Це і реальний стилевий баг, і прибирає `TS2783`.
- **Railway: hub-api Docker-build падав на `Could not resolve "@sergeant/db-schema/pg"`.**
  Після того як `apps/server` отримав залежність від workspace-пакета
  `@sergeant/db-schema` (Drizzle ORM wiring), `Dockerfile.api` залишився
  без оновлення: ні `packages/db-schema/package.json`, ні самих джерел
  не копіювалось у builder-стейдж, у `pnpm install` не було
  `--filter @sergeant/db-schema...`, а `tsc -p tsconfig.build.json`
  для db-schema не виконувався до серверного `pnpm build`. Як
  наслідок, кожен Railway-deploy main-гілки падав на esbuild-resolve
  в `apps/server/src/modules/waitlist/waitlistService.ts:5`. Старий
  образ продовжував обслуговувати трафік, нові міграції/код — ні,
  а юзер на `/sign-in` отримував 5xx (тепер рендериться як
  «Сервер тимчасово недоступний» завдяки фіксу translateAuthError).
  Тепер builder копіює `packages/db-schema` повністю, ставить його
  у `pnpm install --filter`, виконує `pnpm --filter @sergeant/db-schema build`
  до `pnpm build` сервера; runtime отримує лише `package.json`-маніфест
  (esbuild bundle уже містить db-schema).
- **Auth: «Помилка входу» без деталей при rate-limit / 5xx.** На сторінці
  входу після кількох невдалих спроб (або 500-серверної помилки) юзер
  бачив generic рядок `Помилка входу` замість осмисленого повідомлення.
  Корінь — два бекенд-респонси (`apps/server/src/http/errorHandler.ts`
  і `apps/server/src/http/rateLimit.ts`) повертали тільки поле `error`,
  тоді як Better Auth client (`better-fetch`) читає `message` при
  десеріалізації не-2xx body, тож на фронт приходило
  `result.error.message === undefined`. Тепер обидва респонси дублюють
  значення в полях `error` **та** `message` (back-compat). Паралельно
  переписав `translateAuthError` у `apps/web/src/core/auth/AuthContext.tsx`
  — тепер мапимо за стабільним Better Auth `error.code`
  (`INVALID_EMAIL_OR_PASSWORD`, `USER_ALREADY_EXISTS`, `RATE_LIMIT`,
  `INTERNAL`, …), а не парсимо англійський `message` regex-ами. Це
  заодно виправило фальш-збіг `/invalid email/i` усередині
  `"Invalid email or password"`, через який юзер з неправильним
  паролем бачив «Невірний формат email.».

### Added

- **AI memory: retrieval layer (PR3 of ADR-0028).** Завершує цикл pgvector
  AI memory після foundation (PR1) і ingestion (PR2). Додає три entry-points:
  (a) HubChat tool `recall_memory` — Anthropic-асистент може explicit-but
  попросити top-K схожих memories через нову async-action гілку
  (`ASYNC_CHAT_ACTION_NAMES` whitelist у
  `apps/web/src/core/lib/chatActions/serverActions.ts` — щоб не ламати sync-tests
  інших tool-ів). (b) `POST /api/ai-memory/recall` — sync read-path
  (`apps/server/src/modules/ai-memory/recallRoute.ts`), 401 без сесії, 503 при
  `AI_MEMORY_ENABLED=false` / `MissingVoyageApiKeyError` / `VoyageHttpError(5xx)`,
  400 на невалідний payload (empty query, oversized, top_k>50, unknown source).
  (c) RAG-injection у `/api/chat` (`ragContext.buildRagContext()`) — implicit
  augmentation на першому турі (НЕ на tool-result-турі) з top-K
  `AI_MEMORY_RAG_TOP_K=4`, timeout 1500ms, graceful no-op на будь-яку помилку
  щоб Anthropic-call ніколи не валився через RAG. Master-flag `AI_MEMORY_ENABLED`
  лишається керівником: при `false` обидві гілки no-op-лять без HTTP-викликів
  до Voyage/БД. `recall_memory` додано у `ASSISTANT_CAPABILITIES` (єдиний
  source-of-truth для tool-ів) → автоматично потрапляє у "Пам'ять"-список
  SYSTEM_PROMPT, тому `SYSTEM_PROMPT_VERSION` піднято з `v6` до `v7`. Доку оновлено
  у [`docs/integrations/voyage-pgvector.md`](./docs/integrations/voyage-pgvector.md)
  і [`docs/adr/0028-pgvector-ai-memory.md`](./docs/adr/0028-pgvector-ai-memory.md).

- **CI: container image scan (Trivy).** Новий workflow
  `.github/workflows/container-scan.yml` збирає `Dockerfile.api` і
  сканує отриманий образ на CVE рівнів CRITICAL/HIGH; SARIF
  завантажується в GitHub Code Scanning (`category: trivy-image`) і
  доступний як артефакт. Тригери: PR (на зміни Dockerfile / serverside
  пакетів), push to main, schedule (04:00 UTC) і workflow_dispatch.
  Триаж — див. [`docs/security/container-scan.md`](./docs/security/container-scan.md).

### Changed

- **Web: strict TS rollout — Phase 2.** `apps/web/tsconfig.strict.json`
  розширено з `src/shared/**` до 10 директорій
  (`src/shared`, `src/test`, `src/core/{auth, cloudSync, components,
hints, hooks, observability, pricing, profile}`). Cross-file
  SpeechRecognition type-collision між `useSpeech.ts` та
  `VoiceMicButton.tsx` виправлено зняттям глобальної
  `declare global Window` augmentation на користь приватного
  `WindowWithSpeech` cast у `useSpeech.ts`. Жодних змін у runtime-коді,
  лише типи + один тестовий null-guard у
  `useCloudSync.behavior.test.ts`. Деталі — у
  [`docs/tech-debt/frontend.md`](./docs/tech-debt/frontend.md) §11.
