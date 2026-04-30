# Contributing у Sergeant

> **Last validated:** 2026-04-30 by @devin-ai-integration[bot]. **Next review:** 2026-07-29.
> **Status:** Active

> **Ціль:** zero-to-running за ≤ 5 хвилин на будь-якій машині з Docker.

---

## Передумови

| Tool        | Версія           | Інсталяція                                                    |
| ----------- | ---------------- | ------------------------------------------------------------- |
| **Node.js** | 20.x             | [nodejs.org](https://nodejs.org/) або `volta install node@20` |
| **pnpm**    | 9.15.1           | `corepack enable && corepack prepare pnpm@9.15.1 --activate`  |
| **Docker**  | Будь-який свіжий | [docker.com](https://docs.docker.com/get-docker/)             |

Перевірте runtime перед інсталяцією:

```bash
node --version  # має бути v20.x
pnpm --version  # має бути 9.15.1
```

Repo pins `"packageManager": "pnpm@9.15.1"` — Corepack автоматично підхоплює точну версію pnpm. CI також працює на Node 20; Node 22 може давати engine warning і відрізнятися від CI.

Якщо ти користуєшся [Volta](https://volta.sh/), `package.json` містить `volta` блок з точними версіями `node@20.20.2` + `pnpm@9.15.1` — `volta` автоматично перемикає toolchain при `cd` у репо. Альтернатива — `nvm use` (підхопить `.nvmrc`).

---

## Перед стартом

1. Прочитайте [`AGENTS.md`](AGENTS.md), якщо змінюєте код або правила проєкту. Там зібрані hard rules, module ownership map, performance budgets і anti-patterns з минулих багів.
2. Визначте area/scope зміни: `web`, `server`, `mobile`, `api-client`, domain package, docs тощо.
3. Якщо задача збігається з playbook trigger — спочатку відкрийте відповідний playbook і йдіть по checklist. Повний індекс із тригерами та 🌳-маркерами decision-tree формату — в [`docs/playbooks/README.md`](docs/playbooks/README.md) (single source of truth — щоб не дрейфувало). Часті entry-points: `add-api-endpoint`, `add-sql-migration`, `add-feature-flag`, `add-react-query-hook`, `add-hubchat-tool`, `add-new-page-route`, `bump-dep-safely`, `onboard-external-api`, `hotfix-prod-regression`, `rotate-secrets`, `investigate-alert`.

---

## 5-хвилинний quickstart

```bash
# 1. Clone & install
git clone https://github.com/Skords-01/Sergeant.git
cd Sergeant
pnpm install --frozen-lockfile

# 2. Environment
cp .env.example .env
# Defaults працюють з коробки для локального dev (Postgres creds, ports, CORS).
# Для AI-фіч заповніть ANTHROPIC_API_KEY; решта — опційна.
# Лише для локального dev — вимикає AI-quota accounting, щоб HubChat не палив
# спільний денний ліміт під час ітерацій:
echo "AI_QUOTA_DISABLED=1" >> .env

# 3. База даних
pnpm dev:db                 # docker compose up -d (Postgres 16 на :5432) + прогон SQL-міграцій
# (або окремо: `pnpm db:up`, потім `pnpm db:migrate`)

# 4. Dev-сервери (два термінали)
pnpm dev:server             # Express API  → http://localhost:3000
pnpm dev:web                # Vite dev     → http://localhost:5173  (proxies /api → :3000)
```

Відкрийте <http://localhost:5173> — ви маєте побачити Hub dashboard.

### Teardown

```bash
pnpm db:down                # зупинити й видалити Postgres-контейнер (дані зберігаються у volume)
```

---

## Environment та секрети

- Скопіюйте `.env.example` у `.env`; реальний `.env` **ніколи не комітьте**.
- `DATABASE_URL=postgresql://hub:hub@localhost:5432/hub` працює з локальним Docker Postgres.
- `ANTHROPIC_API_KEY` потрібен тільки для AI-фіч; без нього базовий local dev має запускатися.
- `VITE_*` змінні потрапляють у frontend bundle. Не кладіть у `VITE_*` DB URLs, private API keys, session secrets або приватні tokens.
- Frontend secrets живуть у Vercel тільки якщо вони справді публічні для browser bundle; backend secrets — у Railway.
- Для VAPID, Resend, USDA, Sentry і production CORS дивіться коментарі в [`.env.example`](.env.example) та [`docs/integrations/railway-vercel.md`](docs/integrations/railway-vercel.md).

---

## Щоденні команди

| Команда                          | Що робить                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm lint`                      | ESLint (усі apps + packages) + import checker + plugin-тести                        |
| `pnpm typecheck`                 | TypeScript type-check по всьому monorepo                                            |
| `pnpm test`                      | Vitest для всіх packages                                                            |
| `pnpm test:coverage`             | Vitest з per-package coverage floors                                                |
| `pnpm format`                    | Prettier — auto-fix                                                                 |
| `pnpm format:check`              | Prettier — лише перевірка (CI використовує саме це)                                 |
| `pnpm build`                     | Turbo build (усі apps)                                                              |
| `pnpm check`                     | `format:check` + `lint` + `typecheck` + `test` + `build` — повний CI-набір локально |
| `pnpm gen`                       | Plop-генератори (`migration`, `rq-hook`, `hubchat-tool`, `endpoint`, `adr`)         |
| `pnpm gen:adr`                   | Новий ADR — авто-нумерація з `docs/adr/NNNN-*.md`                                   |
| `pnpm docs:check-links`          | Сканує всі `*.md` на биті `[text](target)` лінки (internal + external cache)        |
| `pnpm docs:gen-playbook-index`   | Перегенеровує `docs/playbooks/INDEX.md` з рядка `**Trigger:**` кожного playbook     |
| `pnpm docs:check-playbook-index` | CI mode — fail якщо `INDEX.md` застарів (локально додавайте `--check`)              |
| `pnpm docs:freshness-dashboard`  | Збирає звіт `dist/freshness-dashboard.html` (з кольорами, sortable)                 |
| `pnpm lint:ai-legacy`            | CI gate: exit 1 якщо є прострочений / malformed `// AI-LEGACY: expires …` маркер    |
| `pnpm ai-legacy:dashboard`       | Збирає звіт `dist/ai-legacy-dashboard.html` (по всіх `AI-LEGACY` маркерах у коді)   |
| `pnpm ci:validate-pr-body`       | Валідовує `$PR_BODY` проти `.github/PULL_REQUEST_TEMPLATE.md`                       |

### Scoped команди

```bash
pnpm --filter @sergeant/web dev
pnpm --filter @sergeant/server dev
pnpm --filter <package> exec vitest run <path>
```

---

## Робота з HubChat локально

HubChat tools визначаються на сервері в `apps/server/src/modules/chat/toolDefs/<domain>.ts` і виконуються на клієнті в `apps/web/src/core/lib/chatActions/<domain>Actions.ts` (див. `AGENTS.md` → _Architecture: AI tool execution path_). Сервер — тонкий pass-through до Anthropic, який повертає `tool_use` блоки; localStorage / API write-и робить клієнтський executor.

### Тригерити tool call без браузера

```bash
# Попередньо: відкрий http://localhost:5173, залогінся, скопіюй значення
# better-auth.session_token з DevTools → Application → Cookies.

curl -X POST http://localhost:3000/api/chat \
  -H "Cookie: better-auth.session_token=<token>" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"залогуй 200мл води"}],"context":""}'
```

Якщо відповідь містить блоки `tool_use` але `localStorage` не змінився — це **норма**: сервер лише визначив tool call, виконання відбувається в `executeAction` на клієнті після рендеру відповіді в HubChat. Для перевірки повного циклу без UI треба вручну прогнати `tool_result` через другий `/api/chat` запит (див. continuation handler у `chat.ts`, `max_tokens: 2500`).

### Пов'язані playbookи

- [`docs/playbooks/add-hubchat-tool.md`](docs/playbooks/add-hubchat-tool.md) — як додати новий tool.
- [`docs/playbooks/tune-system-prompt.md`](docs/playbooks/tune-system-prompt.md) — як міняти `SYSTEM_PREFIX` без поломки tool-calling.
- [`docs/playbooks/debug-chat-tool.md`](docs/playbooks/debug-chat-tool.md) — секвенція перевірок коли «асистент каже що зробив, але нічого не сталось».

---

## Тестування за типом зміни

Виконуйте мінімальний значущий набір тестів під час розробки, а перед review — `pnpm check`, коли це доречно.

| Тип зміни                  | Мінімальна локальна верифікація                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docs-only                  | `pnpm format:check` або `pnpm exec prettier --check <file>`                                                                                                                                                                                                                                                                                                            |
| Web UI (`apps/web`)        | Точковий Vitest/RTL тест, `pnpm --filter @sergeant/web build`, скріншот у PR для видимих UI-змін                                                                                                                                                                                                                                                                       |
| Server/API (`apps/server`) | Точковий server Vitest, response shape snapshot за потреби, оновити `packages/api-client` types                                                                                                                                                                                                                                                                        |
| DB-міграція                | За playbook `add-sql-migration`, прогнати `pnpm db:up` + `pnpm --filter @sergeant/server db:migrate:dev`                                                                                                                                                                                                                                                               |
| React Query hook           | Використовувати centralized keys з `apps/web/src/shared/lib/queryKeys.ts`, тестувати cache invalidation path                                                                                                                                                                                                                                                           |
| HubChat tool               | Оновити server tool definition, client executor, видиму action card / quick action якщо user-facing. Точковий Vitest: `pnpm --filter @sergeant/web exec vitest run src/core/lib/chatActions` + `pnpm --filter @sergeant/server exec vitest run src/modules/chat`. Якщо додав tool у `toolDefs/` — онови список tools у `SYSTEM_PREFIX` (`systemPrompt.ts` рядки 7–14). |
| Mobile (`apps/mobile`)     | Точковий mobile Vitest; пам'ятати про відомі флакі-тести нижче                                                                                                                                                                                                                                                                                                         |
| Mobile shell               | Прогнати потрібну Capacitor / mobile-shell build-команду й слідкувати за результатами Android/iOS workflow                                                                                                                                                                                                                                                             |
| Bump залежності            | Окремий PR, lockfile install, тести для зачепленого package, переглянути вивід `pnpm audit` / license-check                                                                                                                                                                                                                                                            |

Для UI-змін додавайте у PR-опис скріншот або запис, коли це доречно.

---

## Pre-commit хуки

[Husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged) автоматично запускаються на кожен commit:

- **JS/TS файли** → `eslint --fix --max-warnings=0` + `prettier --write`
- **JSON/MD/CSS/HTML/YAML** → `prettier --write`

Хуки інсталюються `pnpm install` через `prepare` script. **Не пропускайте їх**: `--no-verify` заборонено за `AGENTS.md` hard rule #7.

### Лінт commit-повідомлень (commitlint)

Хук `commit-msg` запускає [commitlint](https://commitlint.js.org/) — він enforce-ить Conventional Commits з точним scope-enum з `AGENTS.md` rule #5. Commit з невідомим або відсутнім scope відхиляється **до** того, як потрапляє в історію.

#### Перевірити локально

```bash
# Лінт останнього коміту
pnpm exec commitlint --last

# Лінт діапазону (зручно перед push-ем стеку)
pnpm exec commitlint --from HEAD~3 --to HEAD
```

#### CI

Job `commitlint` у `.github/workflows/ci.yml` валідує кожен commit у PR проти `origin/<base>`. Якщо хоч один commit падає — job падає.

#### Bypass

Bypass-нути commitlint не можна — `--no-verify` заборонено (`AGENTS.md` hard rule #7). Якщо в scope-enum потрібен новий запис — оновлюйте `AGENTS.md` і `commitlint.config.js` у тому самому PR.

---

## Commit-повідомлення

Ми тримаємось [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <short description>

feat(web): add weekly digest filter
fix(server): coerce mono balance id to number
docs(root): clarify local setup
chore(config): tune shared eslint config
```

Дозволені types: `feat`, `fix`, `docs`, `chore`, `refactor`, `perf`, `test`, `build`, `ci`.

Повний список дозволених scopes — у [`AGENTS.md` § Hard rules #5](AGENTS.md) (single source of truth). Також enforced через [`commitlint.config.js`](commitlint.config.js). Не вигадуй нові scopes (`app`, `core`, `monorepo`, `all`).

Якщо PR справді охоплює кілька scopes — використовуйте найбільш user-visible scope і поясніть решту в тілі PR.

---

## CI Pipeline

Кожен push/PR тригерить `.github/workflows/ci.yml`.

| Job            | Що робить                                                                       |
| -------------- | ------------------------------------------------------------------------------- |
| **commitlint** | Conventional Commits + scope-enum валідація (тільки PR)                         |
| **check**      | Install, audit, license policy check, `pnpm check`, bundle-size guard           |
| **coverage**   | `pnpm test:coverage`, coverage HTML/JSON артефакти                              |
| **a11y**       | Playwright Chromium install + axe-core accessibility checks                     |
| **smoke-e2e**  | Реальний Postgres service, міграції, API-сервер, Vite preview, Playwright smoke |

### CI gotchas

- `pnpm audit --audit-level=critical --prod` — блокуючий.
- `pnpm audit --audit-level=high --prod` і full-tree `--audit-level=high` — **блокуючі**. Якщо PR має лейбл `audit-exception`, обидва кроки скіпаються (див. [Audit exception workflow](#audit-exception-workflow) нижче).
- `pnpm licenses:check` — блокуючий, потребує щоб `THIRD_PARTY_LICENSES.md` збігався з lockfile.
- `pnpm --filter @sergeant/web exec size-limit` — блокуючий.
- `a11y` ставить Playwright Chromium з system dependencies.
- `smoke-e2e` прогоняє міграції через `pnpm --filter @sergeant/server db:migrate:dev`.
- Для Detox Android/iOS і mobile-shell Android/iOS білдів існують окремі workflows. Слідкуйте за ними, коли чіпаєте `apps/mobile` чи `apps/mobile-shell`.

### Performance budgets

CI падає, коли bundle-budgets регресують:

| Метрика                      | Бюджет       |
| ---------------------------- | ------------ |
| `apps/web` JS total (brotli) | **≤ 615 kB** |
| `apps/web` CSS (brotli)      | **≤ 22 kB**  |

Якщо легітимна фіча потребує вищого ліміту — підіймайте число у тому ж PR і відмічайте в описі.

### Відомі флакі mobile-тести

Ці два тести падають на `main` і **не повинні блокувати merge**, якщо ваш PR не чіпає `apps/mobile`:

- `apps/mobile/src/core/dashboard/WeeklyDigestFooter.test.tsx`
- `apps/mobile/src/core/settings/HubSettingsPage.test.tsx`

> `OnboardingWizard.test.tsx` був де-флакнутий у коміті [`53853e00`](https://github.com/Skords-01/Sergeant/commit/53853e00) (PR-7.E 1/3) — заміна never-resolving `AccessibilityInfo.isReduceMotionEnabled()` mock-а на `mockResolvedValue(false)` врегулювала непогашений microtask, що взаємодіяв з React `act()` flushing під CI-навантаженням.

Канонічний список — у [`AGENTS.md` → _Pre-existing flaky tests_](AGENTS.md#pre-existing-flaky-tests-do-not-block-merge); оновлюйте обидва файли разом, коли стабілізуєте чи додаєте записи.

### Audit exception workflow

Коли `pnpm audit --audit-level=high` падає в CI через вразливість, для якої немає фіксу:

1. **Задокументуйте** вразливість у [`docs/security/audit-exceptions.md`](docs/security/audit-exceptions.md) — додайте посилання на advisory, affected package, severity, причину, mitigation, due date й owner-а.
2. **Додайте лейбл `audit-exception`** до PR. Це скіпає два high-severity audit-кроки, залишаючи critical-only audit блокуючим.
3. **Зніміть лейбл**, як тільки вразливість закрита й запис прибрано з exceptions-файлу.

> Лейбл `audit-exception` — це escape hatch, а не чек у відкриту. Кожний exception мусить бути затреканий у `docs/security/audit-exceptions.md` з due date, щоб не дрейфував безкінечно.

---

## Очікування до Pull Request-а

1. **Branch naming:** `devin/<unix-ts>-<area>-<desc>` або `<your-name>/<short-desc>`.
2. **Заповніть PR template** (`.github/PULL_REQUEST_TEMPLATE.md`) — особливо секції _How to test_ та _How AI-tested this PR_.
3. **Усі чеки зелені** перед запитом review: відповідні чеки локально, CI на PR.
4. **Тримайте PR сфокусованим** — одна логічна зміна на PR.
5. **Не змішуйте dependency bumps** з фіча-роботою; робіть окремі PR.
6. **Українська мова для нових/оновлених prose-доків де практично.** Code identifiers, commands, API names, commit scopes, stack terms і external quotes лишайте у вихідній мові, коли це зрозуміліше.

### Чек-лист PR перед review

- [ ] Назва бранчу за конвенцією.
- [ ] PR template заповнений: що змінилось, чому, як тестувати.
- [ ] Відповідні локальні чеки перелічені у PR.
- [ ] UI-зміни мають скріншот / запис, коли це практично.
- [ ] Жодних секретів, `.env`, токенів чи приватних ключів не закомічено.
- [ ] Bumps залежностей не змішані з фіча-роботою.
- [ ] Зміни API response shape оновлюють server, `packages/api-client` і тести разом.
- [ ] DB-зміни виконують sequential migration rules і не мають небезпечних one-shot drops.
- [ ] Нові постійні правила репо додані до `AGENTS.md`; інакше — “No” у шаблоні.
- [ ] Не додано новий `AI-DANGER` маркер без обґрунтування.
- [ ] Якщо додано HubChat tool — список tools у `SYSTEM_PREFIX` (`apps/server/src/modules/chat/toolDefs/systemPrompt.ts` рядки 7–14) оновлено.

### Hard rules (з `AGENTS.md`)

Це non-negotiable. Повний контекст — в `AGENTS.md`.

1. **Coerce `bigint` → `number`** у кожному server-серіалізаторі (`pg` повертає bigints як string-и).
2. **React Query keys** лише через factories у `apps/web/src/shared/lib/queryKeys.ts` — ніколи не хардкодженими масивами.
3. **Зміни API-контракту** мусять оновити `packages/api-client` types ТА додати тест.
4. **SQL-міграції** — sequential `NNN_*.sql` у `apps/server/src/migrations/` — без gap-ів.
5. **Conventional Commits** з дозволеним type/scope-набором вище.
6. **Без force-push у main.** `--force-with-lease` на feature-branches — ок.
7. **Не пропускати pre-commit хуки** (`--no-verify` заборонено).
8. **Tailwind opacity steps** мусять бути на зареєстрованій шкалі (`0,5,8,10,15,…,100`). Off-scale значення мовчки дропаються.
9. **Saturated brand fills behind `text-white`** мусять використовувати `-strong` companion для WCAG AA.
10. **Lifecycle markers** — кожен файл декларує свій статус. Нові components/hooks, закомічені до інтеграції, ОБОВ'ЯЗКОВО мають JSDoc-блок `@scaffolded` з `@owner` + `@nextStep`. Документи додають `> **Status:** Active | Scaffolded | Deprecated | Archived`. PR-и для dead-code cleanup ОБОВ'ЯЗКОВО прогоняють `pnpm dead-code:files` (який враховує markers) — ніколи не видаляйте `@scaffolded`-файл лише тому, що в нього нуль importer-ів.
11. **Без свавільних hex-кольорів у `className`** — raw `<utility>-[#hex]` обходить design-system token layer. Використовуйте семантичні tokens (`bg-success-soft`, `text-fg`, …). Нові відтінки додавайте у preset, а не inline на місці виклику. Enforced `sergeant-design/no-hex-in-classname` (`error`).
12. **Module-accent containment** — всередині `apps/<app>/src/modules/<X>/` дозволені лише accent-utilities модуля `<X>`. Cross-module shells (`core/`, `shared/`, `stories/`) — exempt. Enforced `sergeant-design/no-foreign-module-accent` (`error`).
13. **Без raw-palette light/dark `className`-пар** — className, що поєднує raw-palette light utility (`bg-amber-50`, `text-coral-100`, `border-teal-200/50`, …) з `dark:` raw-palette override (`dark:bg-amber-500/15`, `dark:text-coral-900/30`, `dark:border-teal-800/30`), кодує обидві теми вручну й мовчки ламається при наступній palette-міграції (баг [#814](https://github.com/Skords-01/Sergeant/pull/814)). Підіймайте пару (light, dark) у design-system token layer (`bg-success-soft`, `bg-finyk-surface`, `text-brand-strong`, `border-routine-soft-border`, …). Dark-side-only «латки» на семантичному light і `dark:bg-white/N` glass-washes лишаються свідомо. Enforced `sergeant-design/no-raw-dark-palette` (`error`, scoped до `apps/web/**/*.{ts,tsx,js,jsx}` — semantic-заміни залежать від CSS-змінних `--c-{family}-soft*` у `apps/web/src/index.css`, які NativeWind не споживає). Повна історія міграції — у [`docs/design/DARK-MODE-AUDIT.md`](docs/design/DARK-MODE-AUDIT.md).
14. **Видимі focus-індикатори мусять бути на `focus-visible:`, не `focus:`** — `focus:ring-*` / `focus:bg-*` / `focus:border-*` стріляють на кожен focus event, включаючи pointer-клік, через що focus-індикатор блимає при кожній mouse-взаємодії. `focus-visible:` — сучасний primitive, що стріляє лише при keyboard / assistive-tech focus. Єдина легітимна `focus:` utility — `focus:outline-none` (канонічний reset, що йде в парі з `focus-visible:ring-*`). Не-кольорові `focus:` utilities (`focus:not-sr-only`, `focus:fixed`, `focus:px-4`, `focus:text-sm`, `focus:font-semibold`, …) — ок. Enforced `sergeant-design/prefer-focus-visible` (`error`, scoped до `apps/web/**/*.{ts,tsx,js,jsx}` — React Native не виставляє `:focus-visible` pseudo-class). Див. `AGENTS.md` § Hard Rule #14.
15. **Читай governance перед написанням коду; оновлюй документацію разом із кодом** — читай `AGENTS.md`, `CONTRIBUTING.md`, `CLAUDE.md` й відповідний playbook перед написанням коду. Документація — частина change-set: коли код / контракти рухаються, оновлюйте відповідні документи в тому ж PR (api-client types, design-system, playbooks, freshness headers). Повна must-update таблиця — `AGENTS.md` § Hard Rule #15.

---

## Структура проєкту (швидка довідка)

```text
Sergeant/
├── apps/
│   ├── web/            # Vite + React 18 SPA (frontend)
│   ├── server/         # Express + PostgreSQL + Better Auth (API)
│   ├── mobile/         # Expo 52 + React Native 0.76
│   ├── mobile-shell/   # Capacitor wrapper for web app
│   └── console/        # Telegram bot (grammy + Anthropic) — internal ops/marketing
├── packages/
│   ├── shared/         # @sergeant/shared
│   ├── api-client/     # @sergeant/api-client
│   ├── config/         # @sergeant/config
│   ├── design-tokens/  # @sergeant/design-tokens
│   ├── insights/       # @sergeant/insights
│   └── ...domain/      # finyk-domain, fizruk-domain, nutrition-domain, routine-domain
├── docs/               # Roadmaps, architecture docs, playbooks
├── AGENTS.md           # AI-agent rules & repo conventions
├── docker-compose.yml  # Local Postgres
└── .env.example        # All env vars with descriptions
```

---

## Деплой

| Target       | Платформа | Нотатки                                                                     |
| ------------ | --------- | --------------------------------------------------------------------------- |
| **Frontend** | Vercel    | Preview deploy на кожен PR; free tier може rate-limit-ити.                  |
| **Backend**  | Railway   | `Dockerfile.api`. Pre-deploy прогоняє `pnpm db:migrate`. Health: `/health`. |

Покрокові інструкції — у [`docs/integrations/railway-vercel.md`](docs/integrations/railway-vercel.md).

---

## Потрібна допомога?

- Перегляньте існуючі docs у [`docs/`](docs/) і playbooks у [`docs/playbooks/`](docs/playbooks/).
- Прочитайте [`AGENTS.md`](AGENTS.md) для повного набору repo-конвенцій і AI-marker syntax.
- Відкрийте issue або запитайте у PR-коментарі.
