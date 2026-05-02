# ADR-0024: Monorepo split — `apps/*` (deployables) + `packages/*` (libraries)

- **Status:** accepted
- **Date:** 2026-04-27
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) — `packages: ["apps/*", "packages/*"]`.
  - [`AGENTS.md`](../../AGENTS.md) — module ownership map (рядки apps/_ + packages/_).
  - [`docs/architecture/apps-status-matrix.md`](../architecture/apps-status-matrix.md) — поточний статус кожного app/package.
  - ADR-0023 — Turborepo як task-runner поверх цього split-у.
  - ADR-0009 — hosting-split (Railway/Vercel) — наслідок цього boundaries-вибору.
  - ADR-0010 — mobile dual-track (Capacitor + Expo) — пояснює `apps/mobile` + `apps/mobile-shell`.

---

## 0. TL;DR

Sergeant — pnpm-workspace монорепо з єдиною деклaративною межею:

| Кошик        | Що живе                                                                                 | Чи деплоюється напряму         | Може імпортувати з                                  |
| ------------ | --------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------- |
| `apps/*`     | Deployable surface (`web`, `server`, `mobile`, `mobile-shell`)                          | **Так** — 1:1 з runtime-target | `apps/*` (тільки сам себе) + будь-який `packages/*` |
| `packages/*` | Reusable libraries (`shared`, `api-client`, домен-пакети, design-tokens, eslint-plugin) | **Ні** (publish-on-demand)     | Тільки інші `packages/*`                            |

Hard rule: **`packages/*` ніколи не імпортує з `apps/*`**. Якщо домен-пакет
стає apps-aware — це сигнал, що його логіка має жити в самому app, або
треба нова межа (новий package).

Це **не** один великий `src/` з фолдер-сегрегацією. **Не** "thin packages
для кожного компоненту" (a-la frontend-microservices). **Не** окремі
git-repo per-app (separate repositories).

---

## Context and Problem Statement

Sergeant історично починався як один Vite SPA з business-логікою в `src/`.
По мірі росту:

1. **Mobile apps** (`apps/mobile` Expo, `apps/mobile-shell` Capacitor) почали
   потребувати тих самих **доменних правил** (kcal-math, fizруck-вікно,
   finyk-лімітів), що й web. Два варіанти: дублювати, або винести спільне.
2. **API-клієнт** (HTTP-обгортка з типами над `apps/server`) переплутався з
   UI-кодом — фронт-зміни тягли API-зміни і навпаки. Контракт `web ↔ server`
   потребував окремого артефакту.
3. **Дизайн-токени** (Tailwind preset, color scale, opacity-allowlist) мали
   жити в одному місці і споживатися всіма apps + ESLint-плагіном
   `valid-tailwind-opacity` ([rule #8 в AGENTS.md](../../AGENTS.md)).
4. **Custom ESLint plugin** (6 правил для project invariants) мусив жити
   окремо від `apps/web/.eslintrc`, інакше lint-цикл стає
   "lint щоб написати lint-rule".
5. **Cross-platform domain logic** (`finyk-domain`, `fizruk-domain`,
   `nutrition-domain`, `routine-domain`) — pure-functions math з типами,
   що не залежать ні від React, ні від Express. Це **природний** package-boundary.

Без формальної межі ці артефакти або злипаються в один моноліт (і тягнуть
non-деплоєвні залежності в bundle), або розповзаються по апп-фолдерах
(і дублюються).

## Considered Options

1. **Single `apps/*` + `packages/*` split (поточний).** pnpm-workspace
   глобом `["apps/*", "packages/*"]`; чітке правило "apps deploy, packages
   ні".
2. **Багатошарова структура (`apps/`, `domain/`, `infra/`, `tools/`).**
   Більш виразно для "чистої архітектури", але кожен новий шар = ще один
   workspace-glob, ще одна категорія для онбордінгу.
3. **Одна папка `src/` (no monorepo).** Просто, поки apps один. З моменту
   `apps/server` + `apps/mobile` — катастрофа: bundle-роздуття, циклічні
   імпорти.
4. **Окремі репо per-app (poly-repo).** Чисті межі, але `@sergeant/shared`
   стає npm-publish-and-bump циклом між репо. Для команди з 1 мейнтейнера
   — overhead убʼє швидкість.
5. **Nx-style "applications + libraries" (`apps/`, `libs/`).** Те саме що
   варіант 1 з іншим naming. Не вибрано через консистентність з більшістю
   pnpm/turbo-екосистеми (де префекційна назва — `packages/`).

## Decision

**Option 1.** Workspace-конфіг — двозначний:

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

### `apps/*` (5)

| App                 | Deployable target                                          | Bundle-ID / domain   |
| ------------------- | ---------------------------------------------------------- | -------------------- |
| `apps/web`          | Vite SPA → Vercel + Capacitor + Replit                     | `app.sergeant.local` |
| `apps/server`       | Express API → Railway (Docker)                             | `*.up.railway.app`   |
| `apps/mobile`       | Expo SDK 52 (RN 0.76) → APNs/FCM                           | `com.sergeant.app`   |
| `apps/mobile-shell` | Capacitor 7 WebView shell of `apps/web`                    | `com.sergeant.shell` |
| `apps/console`      | Telegram bot (grammy + Anthropic) — internal ops/marketing | n/a                  |

### `packages/*` (10)

| Package                         | Що містить                                                                                                        | Споживачі                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `@sergeant/shared`              | Zod-схеми, типи, common business logic (kcal math, date helpers, локаль-string-и). Pure TS, no React, no Express. | All 5 apps + домен-пакети |
| `@sergeant/api-client`          | HTTP-клієнт для `apps/server`, типи responses 1:1 з server-handlers (rule #3).                                    | `apps/web`, `apps/mobile` |
| `@sergeant/config`              | Базова `tsconfig.base.json`, eslint-base, prettier-base.                                                          | All apps + packages       |
| `@sergeant/design-tokens`       | Tailwind preset, кольори, opacity-allowlist (rule #8), брендова палітра.                                          | `apps/web`, `apps/mobile` |
| `@sergeant/insights`            | Cross-module аналітика (correlation, recommendations).                                                            | `apps/web`                |
| `@sergeant/finyk-domain`        | Гроші: budget, transactions, currency math.                                                                       | `apps/web`, `apps/mobile` |
| `@sergeant/fizruk-domain`       | Тренування, sets, прогресія.                                                                                      | `apps/web`, `apps/mobile` |
| `@sergeant/nutrition-domain`    | Калорії, макроси, OFF/USDA нормалізація-shared types.                                                             | `apps/web`, `apps/mobile` |
| `@sergeant/routine-domain`      | Звички, streaks, Kyiv-day boundary.                                                                               | `apps/web`, `apps/mobile` |
| `eslint-plugin-sergeant-design` | 6 кастомних ESLint-правил (`valid-tailwind-opacity`, `no-raw-local-storage`, `ai-marker-syntax`, ...).            | Root ESLint config        |

### Hard rules (формалізація межі)

1. **`packages/*` не імпортує з `apps/*`.** Перевіряється `scripts/check-imports.mjs`
   (запускається в `pnpm lint`). Порушення → CI red.
2. **`apps/*` не імпортує одне з одного.** `apps/web` не бачить
   `apps/server/src/*` (тільки через `@sergeant/api-client`). Той же
   import-checker.
3. **Кожен `packages/*` має свій `package.json`** з власною версією, scripts
   (`build`, `typecheck`, `test`), і `exports`-полем (ESM-only).
4. **Module ownership map в [`AGENTS.md`](../../AGENTS.md)** — таблиця 1:1
   з фактичною структурою. Якщо додаєш package — додай рядок у map.
5. **Naming:** `@sergeant/<scope>` для всіх packages окрім ESLint plugin
   (`eslint-plugin-sergeant-design` — npm convention для plugin-ів).

## Rationale

**Чому два кошика, а не три-чотири шари:** complexity budget. Два кошики
вистачає, щоб виразити інваріант "що деплоюється vs що ні". Третій шар
(`tools/`, `infra/`) — premature: тулзи живуть у `scripts/` (root-level),
infra — у `Dockerfile.api` + `vercel.json` + `railway.toml`.

**Чому `packages/*` плоский, а не вкладений (`packages/domain/finyk`):**
pnpm + turbo ці глоби однаково підтримують, але плоский список простіше
читати в `pnpm-workspace.yaml` і в `pnpm install` output. На 10 packages
ще не той рівень, де hierarchy дає вигоду.

**Чому домен-пакети розділені, а не один `@sergeant/domain`:** modularity

- tree-shaking. `apps/mobile` (RN bundle) не повинен включати finyk-логіку,
  якщо користувач не зайшов у Finyk-таб. Розділення дозволяє це
  [з-коробки на bundler-рівні].

**Чому `@sergeant/api-client` окремо, а не всередині `apps/server`:**
циклічна залежність. Якщо клієнт живе в server-папці, `apps/web` мав би
імпортувати з `apps/server` — порушується hard-rule #2.

**Чому `eslint-plugin-sergeant-design` не `@sergeant/eslint-plugin`:**
ESLint resolver шукає `eslint-plugin-*` за naming convention.
Перейменувати — означає писати ручний resolver. Не варте.

**Audit-quote:** [2026-04-26 audit](../audits/2026-04-26-sergeant-audit-devin.md),
пункт 1: "5 apps + 9 `@sergeant/*` packages (+ `eslint-plugin-sergeant-design` = 10 total), `pnpm-workspace.yaml` чітко як `apps/*` +
`packages/*`. … Domain packages — справжня доменна ізоляція, не fake." (`apps/console` додано після audit-у — Telegram-bot для ops/marketing.)

## Consequences

### Positive

- **Чітка межа deployable / library.** Новий контрибʼютор за 1 хв розуміє,
  куди класти код.
- **Cross-platform code reuse.** Web + mobile діляться 80% business-logic
  через `@sergeant/*-domain` пакети.
- **Bundle-discipline.** `apps/web` не може випадково затягнути
  `apps/server/express` у фронтовий bundle (workspace-боундарі це
  блокують на pnpm-резолвер-рівні).
- **Server-client contract enforcement.** `@sergeant/api-client` як
  окремий артефакт робить rule #3 (api-contract triple-edit з AGENTS.md)
  природним: змінив `apps/server/src/modules/<X>/handler.ts` —
  `@sergeant/api-client/src/endpoints/X.ts` мусить bumpнутися в тому ж PR.
- **Independent test stacks.** Кожен package може мати свій test-runner
  (Vitest для більшості, `node --test` для ESLint-plugin) — без global
  test-orchestrator.
- **Package-graph навігація.** `pnpm why @sergeant/finyk-domain` показує
  всіх consumer-ів за секунду.

### Negative

- **Cognitive overhead на старті.** Новий розробник побачить 13
  `package.json` і подумає "де ж справжній код?". Mitigation —
  [`docs/architecture/apps-status-matrix.md`](../architecture/apps-status-matrix.md)
  - `AGENTS.md` ownership map.
- **Dep-version drift.** Кожен `package.json` може мати свою версію React
  / TypeScript. Mitigation — `pnpm-workspace.yaml` overrides у root +
  Renovate auto-PR з grouping.
- **Custom-importer-checker.** `scripts/check-imports.mjs` — наша власна
  мала-тулза замість якогось зрілого `dependency-cruiser`. Поки
  достатньо, але якщо правил стане більше 5 — мігруємо на dep-cruiser.
- **`apps/mobile-shell` boundaries слабкі.** Capacitor-shell — це
  ефективно тільки `apps/web` build copy + Capacitor configs. Цей boundary
  тестово не enforced (див. ADR-0010). Mitigation: тести на shell-side
  вручну при release.

### Neutral

- Не використовуємо pnpm-`workspace:*` `peerDependencies` для cross-package
  shared deps (наприклад, React) — мейнтейнимо вручну в кожному
  `package.json`. На цьому розмірі не біль.
- `node_modules` hoist policy — pnpm default (`hoist-pattern[]=*`). Не
  торкаємось.
- Один `tsconfig.base.json` у `packages/config/` — не реалізує full
  TypeScript project references; кожен package самостійно `tsc`-будиться
  через turbo. Project references — пункт майбутнього розгляду
  (audit `PR-1.A`).

## Compliance

- **`scripts/check-imports.mjs`** запускається у `pnpm lint`:
  - блокує `apps/X` → `apps/Y` (з винятком: `apps/mobile-shell` → `apps/web`
    для Capacitor build).
  - блокує `packages/X` → `apps/*` без винятків.
- **Module ownership map в `AGENTS.md`** — codeowners review при додаванні
  app/package.
- **PR-template** (auto-applied від `.github/PULL_REQUEST_TEMPLATE.md`) має
  чек-лист "якщо торкнувся API → onbump @sergeant/api-client".
- **Conventional Commits scope enum** (rule #5) явно перерахований по
  apps + packages — інакша scope (`monorepo`, `app`, `core`, `all`)
  блокується commitlint-ом.

## Links

- [pnpm — workspace globs](https://pnpm.io/workspaces)
- [Monorepo Tools — comparison matrix](https://monorepo.tools/) — навіщо `apps/`+`packages/` стандартизована форма.
- [`docs/audits/2026-04-26-sergeant-audit-devin.md`](../audits/2026-04-26-sergeant-audit-devin.md) — пункт 1, "Архітектура монорепи".
- ADR-0023 — Turbo task-runner, що залежить від цього split-у.
