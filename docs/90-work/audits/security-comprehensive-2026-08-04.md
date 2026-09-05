# Комплексний аудит безпеки — 2026-08-04

> **Поточні статуси перенесених знахідок:** [єдиний реєстр верифікації](verification/findings.json). Цей документ зберігає історичні результати; нові спроби та виправлення ведуться в реєстрі.

> **Last touched:** 2026-09-05 by @Skords-01. **Next review:** 2027-01-01.
> **Status:** Active — 26 із 50 знахідок закрито кодом у тій самій гілці
> (`claude/security-audit-1d5302`, 41 файл). Не закриті: пункти, позначені нижче як
> продуктове рішення (paywall, анонімність AI-ендпоінтів), ті, що потребують заміру
> на живому проді (`TRUST_PROXY`), і великі роботи (шифрування мобільної SQLite,
> міграція Expo SDK, обсяг GDPR-видалення). Перелік застосованих правок — у git-дифі
> гілки; цей документ описує стан НА МОМЕНТ АУДИТУ і навмисно не переписувався
> постфактум, щоб лишитись відтворюваним знімком.

Snapshot-аудит на HEAD `a618e9317` (гілка `claude/security-audit-1d5302`). Статичний, read-only:
жодних інсталяцій, запусків тестів чи звернень до продакшену. Усе, що потребує живого середовища,
явно позначено як неперевірене.

**Метод.** 14 незалежних вимірів аудиту → адверсаріальна верифікація кожної знахідки окремим
агентом → панель із трьох суддів переоцінює severity трьома різними лінзами → окремі агенти
будують композитні ланцюги атаки → критики перевіряють самі спростування і шукають прогалини
покриття. Сирих знахідок 63; після верифікації лишилось 50; 13 спростовано (з них 6 спростувань
критик визнав хибними). Ключові твердження перечитані вручну перед публікацією.

## Головне

Кодова база **добре захищена за периметром і слабка в чотирьох системних місцях**: ланцюг
постачання CI, ідентифікація клієнта для лімітів, відкликання доступу, і розсинхрон «контроль
оголошено в документі ↔ контроль є в коді». Жодної класичної SQL-ін'єкції, XSS чи IDOR у самому
застосунку не знайдено — і це не через брак пошуку, а тому що вони справді закриті
(див. § «Що перевірено і тримається»).

Єдина знахідка, що не потребує від атакувальника **нічого**, крім публікації npm-пакета, — §1.0.
Решта вимагає або передумови (вкрадена сесія, доступ до пристрою), або продуктового рішення.

Найважливіше — **не окремі знахідки, а те, що з них складається**. Панель суддів підняла severity
рівно там, де фаза 1 дивилась на дефект ізольовано.

## Пріоритет 1 — до відкриття бети

### 1.0 Компрометований devDependency → auto-merge → секрети CI → `main` → прод

Найсерйозніша знахідка аудиту. Не потребує ані доступу до репозиторію, ані зовнішнього PR — лише
публікації зловмисної патч-версії **будь-якої** devDependency. Кожну ланку перечитано вручну.

1. `renovate.json:134-140` — `matchDepTypes:["devDependencies"]`, `matchUpdateTypes:["patch","pin","digest"]`,
   `automerge:true`, `platformAutomerge:true`. `minimumReleaseAge` **відсутній** — ні на верхньому
   рівні, ні в цьому правилі. Вікно на виявлення компрометованого релізу — нульове.
2. Renovate створює гілку **в самому репо**, тож подія `pull_request` є same-repo і секрети
   передаються (fork-PR їх не отримав би).
3. `ci.yml:25-30` — `TURBO_TOKEN`/`TURBO_TEAM` оголошені на рівні workflow і видимі всім ~11 job-ам.
4. `ci.yml:53,78,…` — `pnpm install --frozen-lockfile` **без `--ignore-scripts`**. pnpm 9.15.1
   виконує lifecycle-скрипти; кореневий `.npmrc` містить лише `node-linker=hoisted`, а в
   `package.json → pnpm` немає ані `onlyBuiltDependencies`, ані `neverBuiltDependencies`.
   Postinstall зловмисного пакета виконується.
5. `ci.yml:344-347` — job `coverage` має **`contents: write`**, а `actions/checkout` скрізь іде з
   дефолтним `persist-credentials: true` (єдиний виняток — `extended-e2e.yml:218`). Postinstall
   читає `.git/config` і забирає `GITHUB_TOKEN` із правом запису.
6. Auto-merge у `main` чіпає `pnpm-lock.yaml` → `deploy-api.yml:20-34` → ghcr `:latest`
   (`:62-92`) → вебхук Coolify (`:94-113`) → прод.

**Чесно про часткові розриви.** `Dockerfile.api:84,129` ставить `--ignore-scripts` **і** `--prod`,
тож сам образ postinstall не виконає і devDeps у нього не потраплять — заразити прод-код можна
лише вкраденим write-токеном, не через образ. Другий можливий розрив — branch protection на `main`
(з файлів репо не перевіряється; `CODEOWNERS` відсутній).

**Найдешевша ланка для розриву:** `pnpm.onlyBuiltDependencies: []` у кореневому `package.json` —
одна строфа, що покриває всі 27 workflow одразу. Це той самий захист, який образ уже має, а CI — ні.

Той самий отруєний lockfile веде далі: `mobile-shell-ios-release.yml:57-75` тримає
`APPLE_BUILD_CERTIFICATE_BASE64`, `APPLE_P12_PASSWORD`, `APPLE_KEYCHAIN_PASSWORD` і
`APP_STORE_CONNECT_API_KEY_BASE64` на **job-level** `env`, а `pnpm install` на рядку 113-114
виконується вже після цього — postinstall бачить усі значення. Наслідок: підпис довільного `.ipa`
і завантаження в TestFlight. У сусідньому `mobile-shell-android-release.yml:130-136` секрети вже
винесені на step-level — патерн у репо є, просто не застосований до iOS.

### 1.1 Увесь per-IP rate-limit веб-трафіку схлопнутий в один бакет

`apps/web/middleware.ts:22` — `matcher: "/api/:path*"`, тобто **весь** API-трафік браузера йде
через Vercel Edge. Middleware виставляє `x-forwarded-host` і `x-forwarded-proto` (рядки 80–81),
але **не** `x-forwarded-for`. З `TRUST_PROXY` за замовчуванням `1` (`apps/server/src/config.ts:44`)
бекенд бачить IP egress-вузла Vercel як `req.ip` для кожного веб-користувача.

Наслідки, кожен підтверджений кодом:

- `rateLimit.ts:257` і `aiQuota.ts:341` будують `ip:${getIp(req)}` — усі анонімні бакети продукту
  ключуються на одному значенні, спільному для всієї веб-аудиторії.
- `AUTH_RATE_LIMIT_MAX=5/60s` стає **глобальним**: 5 запитів за хвилину від однієї людини
  блокують вхід і скидання пароля всім одразу. Це DoS усієї авторизації ціною 5 rps.
- Анонімна AI-квота `DEFAULT_ANON_LIMIT=3/добу` (`aiQuota.ts:210`) — 3 на добу на всіх.
- Зловживання стає неатрибутованим: жоден per-IP сигнал не відрізняє абʼюзера від решти.

ADR-0074 сам позначає це як незакрите: «TRUST_PROXY калібрування під Traefik | TBD».
**Фікс:** визначити фактичну довжину ланцюга проксі й або пробросити реальний client IP через
middleware, або перейти на ключування за сесією там, де вона є. Спершу вимір, потім число.

### 1.2 CORS прода безумовно довіряє localhost із `Allow-Credentials: true`

`apps/server/src/http/cors.ts:17-30` — `DEFAULT_ORIGINS` містить `localhost`/`127.0.0.1` на портах
5173/4173/5000/8081 **без жодного гейта на `NODE_ENV`**; `getAllowedOrigins()` (42–48) завжди їх
мержить; `setCorsHeaders` (110–113) віддає `ACAO=origin` + `ACAC=true`. У проді кукі йдуть
`sameSite:none; secure:true` (`auth.ts:74-80`), тож браузер шле їх крос-сайтово.

Це не теоретично. `requireCsrfHeader.ts:12-15` прямо декларує, що вся модель захисту тримається на
тому, що «preflight зупиняється на нашому CORS allowlist» — localhost-записи руйнують цю
передумову. Аудиторія бети — розробники й тестери, а 5173/8081 — дефолтні порти Vite та Metro:
досить, щоб жертва запустила чужий репозиторій і відкрила `localhost:5173`.

Ланцюг, який верифікатор перечитав по ланках: сторінка на localhost → `fetch` з `credentials:
'include'` → **`GET /api/auth/list-sessions`** (GET-запити в Better Auth не проходять origin-check)
→ сирі session-токени → 7-денний bearer-доступ до банківських даних **поза браузером жертви**.
Окремо F1 виглядає як «занадто широкий CORS у dev-портах»; у ланцюгу це ексфільтрація
довгоживучого креденшела.

**Фікс (тривіальний):** обгорнути localhost-записи в `isDeployedProduction()` — той самий патерн,
що вже застосовано в `auth.ts getTrustedOrigins()`. Дві знахідки (F1 і F3) — один патч.

> **Суміжне, умовне.** Приклад `ALLOWED_ORIGIN_REGEX` у `cors.ts:12` і запінений тестом
> `cors.test.ts:110` — `^https://sergeant(?:-[a-z0-9-]+)?\.vercel\.app$` — приймає **будь-який**
> сторонньо-реєстрований `sergeant-*.vercel.app`. Тест перевіряє `attacker.vercel.app` → false, але
> `sergeant-evil.vercel.app` → true. З репо не видно, чи цей рядок реально стоїть у проді, тож це
> небезпечний приклад у доках, а не підтверджена дірка. Задокументоване значення в
> `env-vars.md:359` — інше й безпечне.

### 1.3 Неавтентифіковані платні ендпоінти

- `apps/server/src/routes/weekly-digest.ts:12` — ланцюг `setModule → rateLimitExpress(10/год) →
requireAnthropicKey → requireAiQuota → handler`. **`requireSession()` відсутній.** Перечитано
  вручну.
- `apps/server/src/routes/chat.ts:19-41` — те саме: `/api/chat` без `requireSession()`.
- `resolveProTier` (`aiQuota.ts:622-648`) для анонімів **безумовно повертає premium-модель** ще
  до перевірки бюджету. Тобто задокументована в `run-beta-wave.md` «справжня стеля вартості»
  ($5/добу, `ANTHROPIC_BUDGET_HARD_USD`) деградує **платних** користувачів, а анонімних — ні.
  Приблизно 130 неавтентифікованих запитів перетинають стелю і псують якість моделі всім
  передплатникам до кінця київської доби.
- `routes/barcode.ts:17-23` і `routes/food-search.ts:14-21` — теж без сесії, і вони проксюють на
  чужі ключі власника. За коментарем у `barcode.ts:349-351` ліміт UPCitemdb — 100 запитів/добу;
  при дозволених 30 req/хв він вигоряє за ~3.5 хвилини.

У поєднанні з 1.1 жоден із цих лімітів не є лімітом.

**Фікс:** додати `requireSession()` у ланцюг (як у `routes/coach.ts:30-35`); перенести
анонімну гілку `resolveProTier` **під** перевірку бюджету. Якщо анонімний доступ потрібен
продукту — це продуктове рішення, і воно має бути записане явно, а не жити як пропущений middleware.

### 1.4 Підписка ніколи не спливає

`apps/server/src/modules/billing/getUserPlan.ts:54-58` — `SELECT` читає `current_period_end`, але
фільтрує лише `status IN ('active','trialing','past_due')` і **ніколи не порівнює з `NOW()`**.
Обидва шляхи ведуть до безстроковості: `plata.ts:387-394` ставить `cancel_at_period_end = TRUE` без
зміни статусу, а воркер (`plataScheduler.ts:84-87`) шукає рядки з `cancel_at_period_end = FALSE`;
переведення в `past_due` (там же, 125–129) виводить рядок із поля зору назавжди.

Вага наслідку: `effectiveLimits.ts` дає Pro `aiRequestsPerDay = null`, а `assertAiQuota`
(`aiQuota.ts:365-369`) на `null` повертає `true` — Pro означає буквально **безлімітні
premium-виклики**, які бюджет-гвард не блокує.

Це живе **вже сьогодні**, незалежно від того, що `LIQPAY_ENABLED`/`PLATA_ENABLED` за замовчуванням
`false`: `scripts/billing/grant-beta-pro.mjs:133-147` роздає бета-тестерам `status='trialing'` з
`current_period_end = NOW() + N days` і в коментарі обіцяє, що «бета закриється сама». Не закриється.

**Фікс (один рядок):** `AND (current_period_end IS NULL OR current_period_end > NOW())`.

### 1.5 Серверного paywall у проді немає

`apps/server/src/modules/billing/requirePlan.ts:32-35` — `if (!env.STRIPE_ENABLED) { next(); return; }`,
дефолт `false`. Перечитано вручну. Рунбук `run-beta-wave.md:47` фіксує це як цільовий стан прода й
називає компенсацією клієнтський гейт — але `useFeatureGate` (`apps/web/src/core/billing/useFeatureGate.ts:55-66`)
це React-хук, який просто відкриває модалку. Прямий HTTP-запит його не бачить.

Уточнення проти початкової оцінки: Vision-ендпоінти **справді** захищені (`requirePlan(pool,"pro")`
у `routes/nutrition.ts` плюс `requireAiQuota`, free = 5/добу), а `AI_MEMORY_ENABLED` за
замовчуванням вимкнено. Тобто «безлімітний доступ до всього» — перебільшення; але Pro-поверхні,
які покладаються лише на `requirePlan`, відкриті. Окремо: `monoAutoSync` продається як Pro-фіча,
а `routes/mono-webhook.ts:75` не має жодного plan-гейта.

### 1.6 Відновлювальний контур не відновлює

Три дефекти однієї сімʼї, і разом вони гарантують, що після компрометації **жоден доступний жертві
контроль не виселяє атакера**:

- `auth.ts:346-356` — скидання пароля не відкликає сесії. `revokeSessionsOnPasswordReset` у
  better-auth 1.6.23 дефолтиться в `false`, а `grep` по всьому репо дає 0 збігів. Хук на
  `hooks.before` (`auth.ts:542-549`) покриває **лише** `/change-password`. Вкрадена сесія живе
  весь 7-денний TTL саме після дії, яку користувач виконує, щоб її вбити.
- `auth.ts:395-401` — `cookieCache.maxAge = 300`. Відкликана сесія ще 5 хвилин проходить
  `requireSession()`. За ці 5 хвилин один `GET /api/me/export` віддає повний дамп.
- `modules/push/push.ts:170-176` — `ON CONFLICT (platform, token) DO UPDATE SET user_id = $1`
  перезаписує власника push-пристрою без перевірки.

**Фікс:** `revokeSessionsOnPasswordReset: true` — одне поле. Плюс `disableCookieCache` для
чутливих поверхонь (`/api/me/export`, `DELETE /api/me`, `/api/mono/*`).

### 1.7 Coolify та ops-стек

- `docs/03-operations/observability/dashboards/ops-home.json:59` — публічна адреса prod-VPS і
  посилання на адмін-панель Coolify по **plaintext HTTP**, закомічені в публічний репозиторій.
- `ops/docker-compose.ops.yml:111` — Grafana з анонімним доступом і паролем, що дефолтиться на
  `admin`, з публікацією порту на `0.0.0.0`.

**Фікс:** привести до fail-fast форми `${GF_ADMIN_PASSWORD:?...}`, `GF_AUTH_ANONYMOUS_ENABLED=false`,
прив'язати публікації до `127.0.0.1`. Адмін-панель — за TLS і за firewall.

## Пріоритет 2 — до або одразу після запуску

| #   | Знахідка                                                                                                                                                                                                                                                                                                                                       | Місце                                          | Фікс                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| F19 | Прод-деплой через `workflow_dispatch` з довільної гілки, без environment protection; `container-scan.yml` — окремий workflow без `needs:`, тож **Trivy біжить паралельно й не гейтить деплой**; `:latest` мутабельний, `provenance:`/`sbom:` відсутні                                                                                          | `.github/workflows/deploy-api.yml:19-35,77-92` | `environment: production` з required reviewer на job `build-and-push`  |
| —   | `post-deploy-smoke`: job env `STAGING_SESSION_COOKIE` + `TARGET_BASE_URL` з `deployment_status.environment_url`; `scripts/post-deploy-smoke.mjs:238-246` шле куку на будь-який хост із payload. Гейт — денайліст, не алоулист; порожній `environment_url` теж проходить. **Ззовні не експлуатується** — потрібен токен із `deployments: write` | `post-deploy-smoke.yml:57-66`                  | алоулист хостів перед відправкою куки                                  |
| F28 | `redactKeysRecursively` повертає **нередаговане** піддерево при повторному посиланні на той самий обʼєкт — обхід єдиного глибокого редактора Pino                                                                                                                                                                                              | `obs/logger.ts:101-107`                        | `WeakMap` як мемо-кеш замість `WeakSet` як cycle-guard                 |
| F6  | Telegram bot token у **path** вихідного URL не редагується нічим; `beforeSendTransaction` у Sentry відсутній, тож span/transaction-події взагалі не скрабляться                                                                                                                                                                                | `obs/sensitiveUrl.ts:37`, `sentry.ts:401-410`  | додати префікс `api.telegram.org` у редактор + `beforeSendTransaction` |
| F30 | CSRF-гейт блокує вебхуки LiqPay і Plata **до** перевірки підпису — код верифікації недосяжний                                                                                                                                                                                                                                                  | `http/requireCsrfHeader.ts:71-87`              | додати обидва шляхи в `EXEMPT_PATH_PREFIXES`                           |
| F5  | Prometheus label-cardinality DoS: сире `op.table` з тіла запиту потрапляє в лейбл на duplicate-гілці, до наявного cardinality-guard                                                                                                                                                                                                            | `modules/sync/syncV2.ts:294-302`               | `OP_LOG_TABLE_REGISTRY[op.table] ? op.table : "__unknown__"`           |
| F4  | Автентифікований SSRF: push-endpoint приймає довільний URL, `/api/push/test` повертає сиру мережеву помилку як оракул                                                                                                                                                                                                                          | `lib/webpushSend.ts:222`                       | allowlist push-сервісів на запису й на відправці                       |
| F34 | Renovate автомержить dev-залежності без cooldown — нульове вікно на виявлення компрометованого релізу                                                                                                                                                                                                                                          | `renovate.json:138`                            | `minimumReleaseAge` для не-security оновлень                           |
| F44 | Відсутній `BETTER_AUTH_URL` у проді тихо знімає `Secure` з session-cookie; startup-гейт цього не ловить                                                                                                                                                                                                                                        | `env/env.ts`                                   | fail-closed, як уже зроблено для `METRICS_TOKEN` (`env.ts:723`)        |

## Поверхні поза межами 14 вимірів

Критик повноти знайшов те, куди не заглядав жоден вимір. Перевірено вручну.

**n8n-воркфлоу — системна SQL-ін'єкція.** У `ops/n8n-workflows/` **пʼять** воркфлоу інтерполюють
тіло вебхука прямо в SQL-літерал з `options: {}` (без параметризації):

| Файл                              | Вузол                | Небезпечний фрагмент                                                                                 |
| --------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `01-billing-pipeline.json`        | Update DB → Pro      | `UPDATE users SET plan='pro' ... WHERE stripe_customer_id = '{{ $json.body.data.object.customer }}'` |
| `02-failed-payment-recovery.json` | Downgrade → Free     | `UPDATE users SET plan='free' ... WHERE stripe_customer_id = '{{ ... }}'`                            |
| `06-mono-webhook-enrichment.json` | Check monthly budget | `WHERE user_id = '{{ $('Mono Webhook').item.json.body.user_id }}'`                                   |
| `98-error-handler.json`           | Insert / cooldown    | `'{{ $json.workflow.id }}'`, `'{{ $json.error_signature }}'`                                         |

Вебхук-вузли n8n за замовчуванням без автентифікації, і в ланцюгу вузлів 06 **немає** перевірки
підпису перед SQL. У `01` ін'єкція керує таблицею `users` і полем `plan`.

**Пом'якшення, яке я перевірив і яке справді діє:** усі файли в репо мають `active: false`
(активних воркфлоу в репо — 0). Тобто це закладена міна, а не відкрита дірка: ризик реалізується в
момент активації через `pnpm n8n:import` + перемикач в UI. Стан задеплоєного інстансу n8n з репо
не видно.

Суміжне: `05-renovate-pr-auto-handler.json` — підроблений GitHub-вебхук дає auto-approve довільного
PR токеном власника (обхід required-review); жоден із 7 вебхуків n8n не має ані auth, ані перевірки
підпису. `04-daily-backup-verification.json` не перевіряє жодного бекапу — питає decommissioned
Railway і рахує рядки в таблиці, дропнутій міграцією 046.

**GDPR.** `modules/me/dataRights.ts` — видалення акаунта лишає 14 user-scoped таблиць (включно з
даними про здоровʼя), а експорт не віддає жодного модульного датасету.

**Агентський тулінг у публічному репо.** `.claude/settings.json` закомічений і має в `allow`
`Bash(node *)`, `Bash(cat *)`, `Bash(find *)`, `Bash(grep *)` при **порожньому** `deny`.
`Bash(node *)` — це виконання довільного коду. Ризик тут не продакшн, а машина мейнтейнера:
у поєднанні з prompt injection через вміст репо (issue, PR-body, README залежності) це готовий
примітив. `.mcp.json` тягне MCP-сервери через `npx -y` без пінінгу; секретів у ньому **немає**
(PAT і Postgres-URL — посилання на env, не літерали). Окремий пункт про запис
`sergeant-agent-find`, що вказував на неіснуючий скрипт у `scripts/agent/`, знято
2026-08-05: у `.mcp.json` лишились три сервери (`github`, `postgres`, `codebase-memory`),
мертвого запису немає.

## Інструменти та версії

Питання було прямим, тож ось фактичний стан, зібраний із `package.json` 17 воркспейсів,
`pnpm-lock.yaml`, `.nvmrc`, `Dockerfile.api`, `docker-compose.yml` і 27 CI-воркфлоу.

**Рантайми.** Node: `engines 22.x` усюди, Volta й `.nvmrc` — 22.19.0, у CI `setup-node "22"`
приблизно в 40 місцях, **але** `pact-drift.yml:63` і `post-deploy-smoke.yml:75` досі на `"20"`.
Docker builder — `node:22.16.0-alpine` (застарілий патч), runtime — `gcr.io/distroless/nodejs22-debian13:nonroot`
за **плаваючим тегом**, без digest. Лінія Node 22 у підтримці до квітня 2027, актуальні релізи
22.22.x/22.23.x — тобто відставання патчів, не EOL. Postgres — `pgvector/pgvector:pg17` запінений
по digest однаково в compose і в 4 воркфлоу; прод за ADR-0074 на pg18 (дрейф задокументований).
pnpm 9.15.1.

**Фреймворки.** express 5.2.1, better-auth 1.6.23, drizzle-orm 0.45.2, zod 4.4.3, helmet 8.2.0,
pg 8.22.0, react 18.3.1, react-router 7.18.1, vite 8 (web) / 7 (landing), vitest 4.1.10,
playwright 1.61.1, typescript 6.0.3, @sentry/* 8.55.1. Єдине справжнє відставання з безпековим
значенням — **expo 52.0.49 + react-native 0.76.9**: SDK 52 вийшов у листопаді 2024, актуальний —
57, підтримка ~рік на реліз, тож апстрім-патчі туди не приходять. Пом'якшення реальне:
`apps/mobile/AGENTS.md` фіксує статус «internal dev-client, ще не для store», а основною мобільною
поверхнею за ADR-0052 є Capacitor-шелл `apps/mobile-shell` (Capacitor 7.6.x).

**Залежності.** `pnpm audit` по повному дереву: 7 advisory — 1 high (react-router, затрековано з
дедлайном), 3 moderate, 3 low. Але **три `pnpm.overrides` не закривають те, що мають**:

- `"tar": ">=7.5.19"` не закриває GHSA-r292-9mhp-454m (вразливі `<=7.5.20`) — lockfile лишається
  на вразливій 7.5.20. Треба `^7.5.21`.
- `"dompurify@<3.4.11": "3.4.11"` пінить рівно ту версію, яку advisory покриває (`<=3.4.11`).
- `"protobufjs@>=7.0.0 <7.6.4"` виключає з діапазону саму вразливу 7.6.4.

Плюс `audit-exceptions.md:253` описує три overrides, яких у `package.json` немає, і lint їхню
staleness не ловить.

**Security-тулінг — що налаштовано і що фактично гейтить.**

| Тул                      | Стан                                                                   | Реально гейтить?                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| CodeQL                   | `security-extended,security-and-quality`, на кожен PR + push + щотижня | так                                                                                                                    |
| Trivy (container-scan)   | CRITICAL/HIGH, `exit-code: 1`                                          | гейтить **merge**, але не `deploy-api.yml`                                                                             |
| gitleaks                 | на кожен PR, `fetch-depth: 0`                                          | так; pre-commit чесно задокументований як fail-open                                                                    |
| ledger-гейт `pnpm audit` | PR-time, critical не піддається waiver-у                               | **fail-open**: нерозпарсений JSON = «чисто» (`scripts/ci/audit-exceptions.mjs:131`)                                    |
| OSV-Scanner              | nightly, SARIF                                                         | **ні** — SARIF osv-scanner не містить `level="error"`, а справжній exit code відкинуто (`nightly-audit.yml:95-99,119`) |
| Renovate                 | `vulnerabilityAlerts` без затримки, `pinDigests` для actions           | так                                                                                                                    |

Тобто з трьох заявлених SCA-шарів один декоративний, а другий тихо перетворюється на no-op при
будь-якому збої формату чи мережі — причому рапортує успіх.

## Що перевірено і тримається

Це не формальність: перелічене нижче — те, що атакувальник спробує першим, і воно закрите.
Не витрачайте на це час у ремедіації.

- **Секретів у git немає.** gitleaks на кожен PR по повній історії; `.gitleaksignore` — рівно два
  записи, обидва з письмовим обґрунтуванням, жоден не відтворює значення секрету.
- **Усі 27 воркфлоу SHA-пінять сторонні actions**, з коментарем-версією. Renovate тримає
  `pinDigests: true`. `actionlint` встановлюється з перевіркою SHA256, а не `curl | bash`.
- **`Dockerfile.api` виконує обидва `pnpm install` з `--ignore-scripts`.** Runtime — distroless
  nonroot (uid 65532) без shell і без пакетного менеджера. Єдиний доданий бінарник — статичний
  busybox для Coolify pre-deploy, задокументований на 20 рядків із rationale.
- **`GET /metrics` fail-closed:** процес падає на старті без `METRICS_TOKEN`, порівняння —
  constant-time. `TRUST_PROXY=true` заборонено на рівні boot.
- **`/api/internal/*` fail-closed:** 503 без ключа, 401 через constant-time compare.
- **Сервер не роздає статику взагалі** (`servesFrontend: false`), тож `/.env` і `/.git` на API
  недосяжні за побудовою.
- **OAuth account-linking безпечний** за дефолтом better-auth (`requireLocalEmailVerified=true`);
  Sergeant його не переоприділяє.
- **`requireVerifiedEmail()` стоїть на `/api/mono/connect`** безумовно — найгостріший вектор
  «squat-email → чужий банк» закритий.
- **Per-account rate-limit по SHA-256(email)** поверх per-IP: розподілена credential-stuffing атака
  на один акаунт не масштабується кількістю IP.
- **Circuit breaker AI-квоти fail-closed** — «покласти БД, щоб дістати безлімітний Anthropic» не
  замикається.
- **Nutrition-бекап не IDOR:** ключ сховища деривується з user id через `safeBackupKeyFromToken`.
- **Немає abort-and-refund трюку:** `refundQuotaOnUpstreamFailure` не викликається після того, як
  токени пішли в стрім.
- **`apiVersionRewrite` змонтований до helmet/CORS/CSRF**, тож `/api/v1`-аліас не обходить
  path-префіксні middleware.

Окремо по CI, де перевірка була вичерпною по всіх 27 workflow:

- **Script injection — жодного.** Усі `${{ github.event.* }}` або є числами/SHA/enum, або передані
  через `env:` і вжиті як shell-змінні.
- **`pull_request_target` — рівно один** (`pr-backlinks.yml:34`), і він безпечний: `checkout ref: main`
  тягне довірений код, плюс `if: merged == true`, а заголовок PR іде через `env`.
- **`storybook-deploy` ззовні не експлуатується.** `id-token: write` + `pages: write` реальні, але
  тригер — `pull_request` (не `_target`), тож fork-PR отримує read-only `GITHUB_TOKEN` і нуль
  секретів; job `deploy` гейтований `if: push && refs/heads/main`. Це питання найменших привілеїв,
  не вразливість — фаза 1 оцінила його завищено.
- **Жоден секрет не досяжний із fork-PR** у жодному з 27 workflow.
- **Жоден workspace-пакет не має власних lifecycle-скриптів** — лише кореневий `prepare: husky`.
- **`osv-scanner` без checksum — ланцюг мілкий:** job має тільки `contents:read` +
  `security-events:write`, не робить install і не має інших секретів. Максимум — підроблений SARIF,
  що ховає CVE.

## Обмеження цього аудиту

Чесно про те, чого він не покриває:

- **Нічого не запускалось.** Ані тестів, ані лінтерів, ані `pnpm audit` у CI-режимі. Усі висновки —
  з читання коду. Динамічної перевірки (реальні запити до стенду) не було.
- **Прод-конфіг невидимий.** Значення env у Coolify недоступні, тому твердження про `TRUST_PROXY`,
  `ALLOWED_ORIGIN_REGEX`, `STRIPE_ENABLED`, `REQUIRE_EMAIL_VERIFICATION` спираються на дефолти в
  коді й на рунбуки. Це найбільша невизначеність звіту.
- **Стан задеплоєного n8n невідомий** — з репо видно лише `active: false` у файлах.
- **Branch protection на `main` з файлів репо не перевіряється** — це налаштування GitHub, а не
  код. Від нього залежить, чи замикається ланцюг §1.0 до кінця. `CODEOWNERS` у репо відсутній.
- **Побіжно оглянуті:** `apps/landing`, `packages/insights`, `scripts/`+`tools/` як виконуваний
  CI-код, класи «стан і відновлення» (конкурентність між репліками, ретраї платежів, часткові збої).
- **Rule #22 сканер SKILL.md** — regex-блоклист по shell-патернах; природномовна prompt injection
  ним не ловиться, а `.claude/agents`, commands і `.codex/agents` не скануються взагалі.

## Рекомендований порядок робіт

Відсортовано за «дешево закрити ÷ дорого пропустити»:

1. `pnpm.onlyBuiltDependencies: []` у кореневому `package.json` — одна строфа, що розриває
   найсерйозніший ланцюг (§1.0) для всіх 27 workflow.
2. `minimumReleaseAge` для не-security оновлень у `renovate.json` — прибирає нульове вікно
   auto-merge (§1.0).
3. `revokeSessionsOnPasswordReset: true` — одне поле (§1.6).
4. `AND current_period_end > NOW()` у `getUserPlan` — один рядок (§1.4).
5. Загейтити localhost-origin-и на `isDeployedProduction()` (§1.2).
6. `requireSession()` на `/api/weekly-digest` і `/api/chat`; анонімну гілку `resolveProTier` — під
   бюджет-гвард (§1.3).
7. Apple-секрети iOS-релізу — на step-level `env` (§1.0).
8. `"tar": "^7.5.21"`, виправити `dompurify` і `protobufjs` overrides (§ Інструменти).
9. `environment: production` на `deploy-api` + `needs:` на container-scan (§ Пріоритет 2).
10. Виміряти фактичний `req.ip` на проді й полагодити ідентифікацію для лімітів (§1.1).
11. Grafana/Coolify: fail-fast пароль, вимкнути анонімний доступ, прибрати публічні порти (§1.7).
12. Перевести SQL у n8n-воркфлоу на параметризовані запити **до** будь-якої активації.
13. Полагодити два fail-open гейти (ledger `pnpm audit`, OSV SARIF) — інакше решта висновків про
    залежності недостовірна.

Пункти 1–8 — це разом менше двох годин роботи й закривають найдорожчі сценарії.
