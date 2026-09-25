# Аудит документації та governance: правила, ієрархія, рішення, enforcement

> **Status:** Active - більшість знахідок закрито (розділ 11); розділ 9 і DG-32 чекають рішень власника.
> **Last touched:** 2026-09-23 by @claude (перший прогін). **Next review:** 2026-12-23.
> **Spec-lint:** skip - реєстр знахідок аудиту, не специфікація реалізації.

## 1. Що перевірено і як

**Обсяг:** `AGENTS.md`, `CLAUDE.md` і вкладені `AGENTS.md`/`CLAUDE.md`, реєстр Hard Rules (`hard-rules.json`, `rules/*.md`, матриця), корпус ADR (95 файлів), `.agents/skills/**`, `.claude/agents` і `.codex/agents`, `agent-graph.json`, продуктові канони, трекери (`open-work`, `STATUS`, `today`), доки операцій і безпеки, `CONTRIBUTING.md`, Husky і `package.json`.

**Метод, три шари:**

1. **Механічний.** Прогнано 46 власних docs/governance-гейтів репо (`lint:*`, `docs:check-*`, `design:check-md`, статична частина `lint:skills`) з фіксацією exit code.
2. **Смисловий.** Сім незалежних read-only аудиторів за вимірами: enforcement, ієрархія і джерело істини, корпус ADR, свіжість і трекери, агентний шар, продуктові канони, вибіркова перевірка дотримання норм. Далі критик повноти, який шукав непокриті зони і спростовував завищені знахідки (4 знахідки знижено або знято, див. DG-27 і розділ 10).
3. **Ручна звірка.** Найважчі твердження перевірено окремо (`agent:route`, склад ланцюжка `pnpm lint`, «приватне/публічне», ADR-0081, наявність `pre-push`).

**База:** HEAD `5e4dd7fac` гілки `claude/ku-83a06a`, на 18 комітів позаду `origin/main`. Дельта торкається переважно `apps/server` і трьох доків; кожну знахідку в зачеплених файлах звірено через `git show origin/main:<шлях>`.

## 2. Головний висновок

Структура governance сильна. Три реєстри Hard Rules збігаються, 37 скілів відповідають вузлам графа і таблиці роутингу 1:1, граф ADR консистентний (95 файлів, двосторонні supersede, пропуски номерів задокументовані), канони всіх п'яти модулів мають журнали рішень і маркери.

Слабке місце одне, але системне. **Переїзд на Bitbucket 2026-09-22/23 прибрав шар enforcement, а документація про це не знає.** `bitbucket-pipelines.yml` немає, 33 воркфлоу в `.github/workflows/` не виконуються ніде, і `AGENTS.md` у рядку 376 сам це визнає («не шукай там CI»). Водночас той самий файл, `hard-rules.json`, ADR-0082, `release-policy.md` і скіли далі описують ці воркфлоу як блокуючі гейти. Наслідки вже видно: три Hard Rules (#4, #6, #26) не мають жодного робочого механізму, п'ять гейтів червоні на `main` (розділ 3), а найсвіжіші рішення (хостинг, деплой, міграції) живуть лише прозою в `AGENTS.md`, без ADR.

## 3. Механічні гейти: 41 зелений, 5 червоних (з них 1 хибний)

| Гейт                                    | Результат   | Причина                                                                                                                        |
| --------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `lint:codex-agents`                     | ❌ (хибний) | CRLF у робочій копії 11 файлів `.claude/agents/*.md`, у git вони LF; див. поправку в кінці § 11                                |
| `design:check-md`                       | ❌          | `DESIGN.md` не регенеровано після зміни `packages/design-tokens/tokens.js` (коміт 2026-09-22 «розвести кольори макросів»)      |
| `docs:check-links`                      | ❌          | `docs/work/specs/planning/product-knowledge-backlog.md:1752` посилається на `apps/web/src/core/db/sqlite.ts:33`, якого немає   |
| `docs:check-inventory`                  | ❌          | `docs/work/specs/data/documentation-inventory.json` не регенеровано                                                            |
| `lint:skills` (статична частина)        | ❌          | застарілий `computedHash` для `sergeant-security-audit` у `skills-lock.json` (скіл змінено 2026-09-20 без `pnpm skills:lock`)  |
| решта 41 (реєстри, ADR-граф, freshness) | ✅          | `lint:hard-rules-registry`, `lint:governance-sync`, `lint:agent-graph`, `docs:check-adr-graph`, `docs:check-pr-ledger` та інші |

Усі п'ять червоних з'явились 20-22 вересня, тобто вже після блокування GitHub. Кожен із цих гейтів стоїть у CI або в `pnpm lint`, а локальний Husky їх не запускає. Це прямий доказ до DG-1: дрейф потрапляє в `main`, бо його нікому зловити.

Окремо: зелений `lint:repo-slug` хибний, див. DG-10.

## 4. Карта enforcement: заявлено проти фактичного

| Правило / гейт                                                                                       | Заявлено                                    | Що працює сьогодні                                                       |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| #1 bigint → number                                                                                   | тести в `pnpm check`                        | лише ручний `pnpm check`                                                 |
| #3 API-контракт                                                                                      | CI `api:check-openapi`                      | `pnpm lint` + lint-staged `--openapi` (локально працює)                  |
| **#4 міграції**                                                                                      | CI `lint:migrations` (`ci.yml:1186`)        | **нічого**: немає ні в `pnpm lint`, ні в lint-staged                     |
| #5 Conventional Commits                                                                              | CI commitlint + hook                        | лише `.husky/commit-msg`                                                 |
| **#6 без force push**                                                                                | GitHub branch protection                    | **не задокументовано**; дзеркало Hetzner без підтвердженого захисту      |
| #7 Husky                                                                                             | hook                                        | hook (працює, `set -e`); з 2026-09-23 є ще `pre-push`                    |
| #10 lifecycle, AI-LEGACY                                                                             | ESLint + CI `lint:ai-legacy`, knip          | ESLint через lint-staged; ai-legacy і knip лише в мертвих воркфлоу       |
| **#15 governance, мова доків**                                                                       | CI `governance-sync`, `hard-rules-registry` | **нічого** автоматичного; мовної перевірки governance-доків немає зовсім |
| #18, #21                                                                                             | ESLint                                      | lint-staged (працює)                                                     |
| #19, #22, #23                                                                                        | `pnpm lint`                                 | ручний `pnpm lint`                                                       |
| #25 AUTO-GENERATED                                                                                   | lint-staged derived checks                  | працює                                                                   |
| **#26 pr-ledger**                                                                                    | `.github/workflows/pr-backlinks.yml`        | було **нічого**; з 2026-09-23 Bitbucket API + `pre-push` (§ 13)          |
| Бюджети bundle / eager / LCP / 44px                                                                  | «CI gates fail on regression»               | **нічого**                                                               |
| `lint:eslint-config-diff`, coverage-ratchet, `dedupe --check`, CodeQL, container-scan, backup-verify | CI                                          | **нічого**                                                               |

## 5. Знахідки

Шкала: **critical** - правило або рішення заявлене як діюче, але не діє, або доки ведуть агента до неможливої дії; **high** - суперечність джерел істини або живе рішення без запису; **medium** - застаріле, продубльоване чи не на своєму місці; **low** - косметика.

### Critical

### DG-1. CI не існує, а правила й бюджети описані як CI-гейти

**Докази.** `AGENTS.md:376`: «не шукай там CI»; `bitbucket-pipelines.yml` відсутній і в HEAD, і в `origin/main`. Водночас `AGENTS.md:87` («Same matrix runs in CI»), `:161` («блокуючий PR-гейт Mobile UI audit»), `:179` («CI gates fail on regression»), `:355` («commitlint CI gate»), `docs/README.md:35` («падає в CI»), `docs/governance/adr/0082-private-storage-repo-posture.md:30-31` (ci.yml, codeql, container-scan, pr-backlinks «лишаються»), `docs/governance/governance/release-policy.md:12,29,40` («required checks green»), записи `kind: ci` у `hard-rules.json`.

**Що зробити.** Дешеві node-перевірки, які жили тільки в `ci.yml`, перенести в ланцюжок `pnpm lint` або в новий Husky `pre-push`: `lint-migrations`, `check-hard-rules-registry`, `check-governance-sync`, `eslint-print-config-diff`, `pnpm dedupe --check`. У `hard-rules.json` переписати `enforced_by` на реальний шар або позначити «suspended». Рішення про повноцінний CI - розділ 9.

### DG-2. Hard Rule #4 (міграції, blocker-invariant) не має enforcement, а деплой застосовує міграції до живої БД

**Докази.** `hard-rules.json:84-88` → `lint:migrations`; скрипт викликається лише в `.github/workflows/ci.yml:1186-1189`, його немає в ланцюжку `lint` (`package.json:30`) і в lint-staged (`package.json:187-208`). `Dockerfile.api:62-64` і `:316`: ENTRYPOINT виконує `migrate.js && exec index.js`. `scripts/deploy-api.mjs` на `origin/main` лише тригерить Coolify без жодного pre-flight. Навіть поки CI працював, `_runner-report.md:27` фіксує щонайменше 3 колізії номерів міграцій на `main`.

**Що зробити.** `node scripts/lint-migrations.mjs` у `pnpm lint` плюс lint-staged-запис для `apps/server/src/migrations/**`. `deploy-api.mjs` має відмовляти в деплої, якщо `lint:migrations` червоний на коміті, що деплоїться.

### DG-3. Hard Rule #26 (pr-ledger) неможливо виконати: ledger стоїть з 2026-09-17

**Докази.** `hard-rules.json:418-427`: механізм `.github/workflows/pr-backlinks.yml`. Писач `scripts/ci/update-pr-backlinks.mjs:371,376` викликає `gh`, а `AGENTS.md` каже, що `gh` з Bitbucket не працює. `--check` у `pnpm lint` перевіряє лише узгодженість схеми (`:503`), а не повноту, тому гейт зелений. Останній `merged_at` у `docs/governance/pr-ledger/index.json`: 2026-09-17; після цього ~25 комітів по канонічних доках, включно з ADR-0098, без записів. Записи несуть `repo: "zaebal-beep/sergeant"`, а нумерація PR на Bitbucket почалась з #1, тож номери колізуватимуть.

**Що зробити.** Рішення власника (розділ 9): зняти #26 окремим ADR або портувати писача на Bitbucket API і додати в схему поле хоста. До того позначити правило як не enforced.

**Закрито 2026-09-23** (власник обрав порт). Писач бере метадані з Bitbucket API, ключ запису став трійкою `host` + `repo` + `number`, а тригером служить `pre-push`: після пуша хук питає, скількох змерджених PR бракує, і називає `pnpm docs:sync-pr-ledger`. Реєстр дочитано, розрив від 2026-09-17 закритий. Деталі нижче в § 13.

### DG-4. Hard Rule #6 (force push у main) спирається на неіснуючий GitHub-захист

**Докази.** `hard-rules.json:130-134`, `rules/06-no-force-push-to-main.md:17`: «GitHub branch protection». `operations-runbook.md:37,378,384` і `hard-rules-matrix.md:44` так само. Про Bitbucket-обмеження є одне речення в `AGENTS.md` на `origin/main`, без правила й ADR. `origin` має **два** pushurl (Bitbucket і bare-дзеркало `167.233.98.92:/srv/git/sergeant.git`), і git пушить у кожен незалежно: force push, відхилений Bitbucket, може переписати `main` на дзеркалі, з якого Coolify збирає прод. Налаштування `receive.denyNonFastForwards` дзеркала з репо не видно, тому впевненість середня.

**Що зробити.** Перевірити й увімкнути `receive.denyNonFastForwards=true` і `denyDeletes` на дзеркалі; записати обидва механізми в правило #6 з датою перевірки.

### DG-5. Обов'язковий вхідний скіл вимагає запустити видалену команду

**Докази.** `.agents/skills/sergeant-start-here/SKILL.md:15`: «`pnpm agent:route`». У `package.json` такого скрипта немає; `docs/start/agents/decisions.md:27`: «`agent:route` retired 2026-09-19». Кожна нова сесія отримує цю інструкцію першою.

**Що зробити.** Замінити рядок на посилання на таблицю роутингу `AGENTS.md`. Варто додати лінт, що звіряє кожен `pnpm <script>` у SKILL.md з `package.json`.

### High

### DG-6. Немає ADR для трьох живих рішень: Bitbucket, робота без CI, ручний деплой

**Докази.** `grep -il bitbucket docs/governance/adr/*.md` порожній; останній ADR 0098. Рішення існують лише прозою в `AGENTS.md` (§ «Де живе код», на `origin/main` ще § «Прод не оновлюється сам») і в аудиті `2026-09-23-dead-github-remotes.md`, який покриває лише remote-и. ADR-0074 досі Accepted з «image is built and published through GHCR» (`0074:14-15`); Vercel-частина ADR-0009 обґрунтована preview на кожен PR (`0009:29,49,80`), а `deploy-vercel.mjs` каже, що preview неможливі. `decisions.md` не має рядків після 2026-08-28 (немає 0094-0098 і хостингу).

**Що зробити.** Новий ADR (наступний вільний номер, 0100) «Хостинг коду на Bitbucket; CI призупинено; ручний деплой»: розглянуті варіанти, доля 33 воркфлоу, які гейти переїхали локально, які свідомо втрачено, supersede ADR-0074, часткове supersede ADR-0009 і 0082 §7-8, механізму 0061. Рядок у `decisions.md`.

### DG-7. Опис деплою суперечить сам собі в семи місцях

**Докази.** `AGENTS.md:396-397` (і на `origin/main`): «Vercel (preview deploy on each PR)», «образ білдить GitHub Actions (`deploy-api.yml`) → `ghcr.io`», «Pre-deploy: … Coolify `pre_deployment_command`». Нова секція того ж файлу на `origin/main` каже: CI немає, деплой через `pnpm deploy:api`/`deploy:web`, міграції в ENTRYPOINT. Стару версію повторюють `.agents/skills/sergeant-deploy-and-observability/SKILL.md:14,19-25` (заголовок «актуально», назва застосунку `sergeant-api` проти `sergeant-api-v2` у скрипті), `docs/engineering/architecture/repo-map.md:74`, `docs/start/agents/onboarding.md:66`, `apps/server/AGENTS.md:79,102`, `docs/start/instructions/operations-runbook.md:39,71,113,133,146` (rollback через «revert PR → deploy-api.yml rebuild»), ADR-0074.

**Що зробити.** Одним PR переписати всі сім місць під фактичний потік (`deploy:status` / `deploy:api` / `deploy:web`, збірка на сервері з дзеркала, без GHCR, без автодеплою на merge).

### DG-8. Три несумісні версії того, де виконуються міграції

**Докази.** ADR-0013 (основа Hard Rule #4), рядки 27, 58, 163, 203: «Railway pre-deploy запускає міграції». `AGENTS.md:397`: «Coolify `pre_deployment_command`». `Dockerfile.api:62-64`: ENTRYPOINT, «а НЕ Coolify `pre_deployment_command` - той крутиться у старому контейнері й бачить старі .sql».

**Що зробити.** Зафіксувати ENTRYPOINT-рішення в ADR (разом із DG-6 або окремо), перевірити обґрунтування двофазного DROP під новий порядок, виправити `AGENTS.md:397`.

### DG-9. Гейти самих правил не запускаються ніде, а мовну частину Rule #15 не перевіряє ніщо

**Докази.** Ручна звірка ланцюжка `lint` у `package.json`: `check-hard-rules-registry`, `check-governance-sync`, `eslint-print-config-diff`, `lint-migrations` відсутні (0 входжень). Вони жили лише в `ci.yml:187,194,251,1186`. `AGENTS.md` називає `lint:hard-rules-registry` «3-way sync gate», а `eslint-config-diff` «кроком CI у джобі `check`». Мовної перевірки governance-доків немає зовсім (`check-playbook-language` дивиться лише playbook-и).

**Що зробити.** Входить у виправлення DG-1.

### DG-10. `lint:repo-slug` зелений, бо не бачить переїзду, який мав ловити

**Докази.** `docs/governance/governance/repo-identity.json`: `"current": "klas149/Sergeant"` (заблокований GitHub-акаунт). `scripts/docs/repo-identity.mjs:36` розпізнає лише `github.com`; для Bitbucket-origin `live` стає `undefined`, `scripts/check-repo-slug.mjs:113` пропускає перевірку, `:166` друкує OK. Шапка гейта (`:21-22`) описує саме цей випадок: «репо переїхало, а реєстр не оновили».

**Що зробити.** Навчити парсер `bitbucket.org` (або падати на нерозпізнаному origin), оновити реєстр.

### DG-11. П'ять гейтів червоні на `main` без жодного сигналу

**Докази.** Розділ 3. Дрейф датований 2026-09-20…22.

**Що зробити.** `pnpm codex:sync-agents`, `node scripts/gen-design-md.mjs`, `pnpm skills:lock`, `pnpm docs:gen-inventory`, виправити посилання в `product-knowledge-backlog.md:1752`. Один механічний PR. Сам факт свідчить на користь DG-1.

### DG-12. Бюджети продуктивності і 44px заявлені блокуючими, але не перевіряються

**Докази.** `size-limit` і `check-eager-bundle.mjs` лише в `ci.yml:426,438`; LCP `error` лише в `lighthouse-ci.yml:43-89`; 44px-аудит лише в `ci.yml:905`. Жодного з них немає в `pnpm check` (`package.json:86`) чи `pnpm lint`. `AGENTS.md` § Verification: «`pnpm --filter @sergeant/web size` (blocking)».

**Що зробити.** Або окрема локальна команда (наприклад `pnpm check:web-budgets`) як обов'язковий крок перед PR, або чесна позначка «ручна перевірка, не enforced з 2026-09-23».

### DG-13. `pnpm check` «заблокований політикою», якої ніде немає

**Докази.** `docs/STATUS.md:18` на `origin/main`: «Локальний `pnpm check` заблокований політикою слабкого заліза». Жодного ADR, правила чи рядка в `AGENTS.md`; `AGENTS.md` § Verification і Quick commands вимагають `pnpm check` перед PR. Разом із DG-1 це означає, що ні CI, ні задокументований локальний ланцюжок гарантовано не виконуються.

**Що зробити.** Записати фактичну політику верифікації (мінімальний набір перевірок перед PR і обов'язкові гейти перед `deploy:api`) в `AGENTS.md` і в ADR про хостинг (DG-6).

### DG-14. Архів історії рішень прив'язаний до коміту, досяжного лише з мертвого GitHub

**Докази.** 301 посилання `github.com/Skords-01/Sergeant/blob/…` у 120 md-файлах, 63 з них у 33 ADR. Опорний коміт `d068c73a2f21881d5c1305544fe99f3ea8be81f4` є лише в `oldgh/codex/docs-00-05-drift`; він не предок `origin/main` і відсутній на `bitbucket/*` та `hetzner/*`. ADR-0081 обіцяє збереження через «Git history or stable permalinks». Аудит мертвих remote-ів має статус «архівний пуш не зроблено, чекає рішення власника» і цей коміт не згадує.

**Що зробити.** Першим кроком запушити `d068c73a` (і `d1a37e0b`) у Bitbucket як `refs/archive/*`, потім переписати permalink-и на Bitbucket або на форму `git show <sha>:<шлях>`. Додати це в аудит мертвих remote-ів як P0.

### DG-15. ADR-0081 названо підставою для зняття 9 Hard Rules, але він їх не згадує

**Докази.** `AGENTS.md` § Hard rules і `rules/README.md:28`: «#8, #9, #11–#14, #16, #17 та #24 retired рішенням ADR-0081». `grep -i 'hard rule\|правил'` по `0081-repository-simplification.md` порожній; ADR має 33 рядки лише з Decision і Consequences.

**Що зробити.** Короткий супровідний ADR або доповнення: номер правила, чим воно перевірялось, чому зняте, що замінює.

### DG-16. Застарілі статуси ADR

**Докази.** 0030 (Telegram-канали для n8n) Accepted, хоча ADR-0090 вивів n8n, а `ops/n8n-workflows` немає. 0046 (Storybook VRT) Accepted, хоча ADR-0082 прибрав механізм. 0057 має банер «Historical», але статус Accepted. 0003 (Stripe refund) Proposed з 2026-04-27, білінг на LiqPay/Plata. 0044 (Renovate + Dependabot) не працює на Bitbucket. 0072 досі вирішує `.kilo/harness-versions.json` і `harness-a-b.yml`, обидва прибрані.

**Що зробити.** Позначити 0030 → Superseded by 0090, 0046 → by 0082, 0057 → Deprecated з посиланням на 0075; 0003 прийняти в нейтральній редакції або відхилити; 0044 і 0072 закрити в ADR про хостинг (DG-6).

### DG-17. Rule #15: англомовні governance- і security-політики

**Докази.** Без жодного кириличного речення: `docs/governance/security/access-policy.md` (шапка «2026-09-11 by @claude»), `docs/governance/governance/incident-severity-policy.md`, `release-policy.md`, `security-incident-policy.md`, `docs/governance/security/access-matrix.md`, `rate-limit-failure-mode.md`, `docs/operations/postmortems/TEMPLATE.md`. Також англомовні ADR 0005, 0062, 0074, 0081, 0089, 0093. `rules/15-…md:87` відносить governance-доки до українськомовних.

**Що зробити.** Перекласти або явно внести у виняток із причиною (як `lang-reason` у скілах).

### DG-18. `AGENTS.md` суперечить сам собі щодо видимості репо

**Докази.** `AGENTS.md:368`: «приватне репо, з 2026-09-23». `AGENTS.md:392`: «репо публічне, не комітьте реальні user ID».

**Що зробити.** Виправити `:392`. Заборону комітити user ID варто лишити, але з іншим обґрунтуванням: репо вже раз змінювало власника і хост.

### Medium

### DG-19. Половина `AGENTS.md` - журнал ратчетів, і він вантажиться в кожну сесію

**Докази.** 85 238 B файлу; § Performance budgets (рядки 177-344) займає 44 042 B (51.7%), з них 37 884 B (44.4%) - 14-15 датованих записів «Ратчет/Знахідка/Повернення», не в хронологічному порядку. `CLAUDE.md` імпортує все через `@AGENTS.md`. Частково продубльовано в `tech-debt/frontend.md` і `fix-red-bundle-budget.md`. Політика ратчетів (запас 1-2%, заміряти перед підняттям, eager лише вниз) - живе рішення без ADR.

**Що зробити.** Лишити таблицю бюджетів і правило підняття ліміту (~3 KB); журнал перенести в окремий лог; уроки (catch-all `manualChunks`, «останнє eager-ребро», «замір перед ратчетом») - буллетами в `fix-red-bundle-budget.md` або в ADR «Політика бюджетів бандла».

### DG-20. Частина політики живе лише в обгортці `CLAUDE.md`

**Докази.** Заборона глобальних engineering-агентів для правок `apps/**` і `packages/**` є тільки в `CLAUDE.md` § Notes (0 входжень в `AGENTS.md`, `.agents`, `.codex`). `AGENTS.md` каже, що `CLAUDE.md` «must not duplicate policy»; Codex читає лише `AGENTS.md` і цього правила не бачить.

**Що зробити.** Перенести в `AGENTS.md` у нейтральному до харнеса формулюванні, у `CLAUDE.md` лишити вказівник.

### DG-21. Сигнал «Red CI on main → stop» ніколи не спрацює

**Докази.** `sergeant-start-here/SKILL.md:31-37` робить `pnpm snapshot` кроком 0.1; `tools/agent-snapshot/snapshot.mjs:141,222` кличе `gh`. Секція завжди буде `[gh unavailable]`.

**Що зробити.** Замінити сигнал на `pnpm deploy:status` і результат останнього локального прогону; прямо написати, що віддаленого CI-сигналу немає.

### DG-22. Репо-конфіг MCP підключає мертвий GitHub-сервер

**Докази.** `.mcp.json:4-9` і `.codex/config.toml:1-4` оголошують `github`. У цій сесії харнес повідомив `github (CONNECT_TIMEOUT) … 120000ms`: кожен старт сесії платить таймаутом.

**Що зробити.** Прибрати сервер з обох файлів.

### DG-23. Bitbucket мерджить merge-комітами, а доки припускають squash

**Докази.** `origin/main`: `d94ba0210`, `866b6e254`, `c5106fb24` та інші мають по 2 батьки («Merged in … (pull request #N)»). `AGENTS.md:357`: «Example commit subjects (= squash-merge PR titles)»; рядок роутингу «PR review, squash-merge». Commitlint такі subject-и ігнорує за замовчуванням, тож Rule #5 не порушено, але заголовок PR більше не потрапляє в `main`.

**Що зробити.** Або squash стратегією за замовчуванням у Bitbucket, або оновити § Commit and PR conventions і все, що рахує «один коміт = один PR».

### DG-24. Локальні запобіжники обіцяють CI-підстраховку, якої немає

**Докази.** `scripts/pre-commit-gitleaks.mjs:17-20,86`: без gitleaks або з `SERGEANT_SKIP_GITLEAKS=1` виходить з кодом 0, бо «CI will still scan this commit»; те саме в `CONTRIBUTING.md:101`. `pre-commit-derived-artifacts.mjs:64-66` і `CONTRIBUTING.md:185`: «перевірка просто переїжджає на PR». `CONTRIBUTING.md:23` радить клонувати з заблокованого `github.com/SkOrDs-02/sergeant`; `:32,121` описують `--frozen-lockfile` і `dedupe --check` як enforced «в CI».

**Що зробити.** gitleaks: fail-closed або гучне попередження; прибрати формулювання «CI зловить»; оновити URL клонування.

### DG-25. Щотижнева перевірка відновлення бекапу зупинилась, DR-док мовчить

**Докази.** `.github/workflows/db-backup-verify.yml:12-14` (cron щонеділі) не виконується. `docs/governance/security/disaster-recovery.md:20` пов'язує RPO/RTO зі свіжістю репетиції відновлення. `operations-runbook.md:39` називає GHCR джерелом rollback-образу, хоча Coolify збирає з дзеркала.

**Що зробити.** Записати в DR-док, що автоперевірка зупинилась у вересні 2026; назвати фактичне джерело rollback; запланувати ручну репетицію.

### DG-26. Правило незмінності ADR суперечить практиці

**Докази.** `adr/README.md:46` і `sergeant-adr/SKILL.md:29`: «append-only». 28 ADR переписано на місці 2026-09-04 («Last validated: 2026-09-04»); 0001, 0021, 0028 мають секції «Поточне рішення». 88 ADR несуть «Next review», 28 прострочено, хоча README виключає ADR з freshness. Формат: 0062, 0081, 0089, 0093 мають лише Decision/Consequences без контексту й альтернатив, всупереч `TEMPLATE.md`.

**Що зробити.** Обрати одну модель: дозволити секцію «Поточний стан» з рядком «Amended YYYY-MM-DD» і статусом «Partially superseded», або повернути суворе supersede. Прибрати «Next review» з шаблону, якщо freshness не стосується ADR. Для нових ADR вимагати Context + Options + Decision (можна лінтити в `check-adr-graph`).

### DG-27. Блок «Фокус зараз» у `STATUS.md` зіпсований (одноразово)

**Докази.** `origin/main:docs/STATUS.md:13-33`: два різні фокус-знімки й уламок HTML-коментаря. Критик спростував версію «генератор дублює щоразу»: `scripts/docs/generate-status.mjs:104-120` уже виправлено, файл стабільний, не росте. Старший знімок (`:18`) до того ж застарів («робота йде через hetzner-дзеркало»).

**Що зробити.** Одноразово вручну почистити FOCUS-блок.

### DG-28. Примітка до ADR-0094 стверджує, що typecheck і Jest «гейтять main»

**Докази.** `AGENTS.md:57`: «`typecheck` і Jest далі гейтять `main`». Жоден механізм не гейтить `main` (DG-1).

**Що зробити.** «Входять у локальний `pnpm check`, не гейт `main`».

### DG-29. `docs/README.md` і індекси відстають від структури

**Докази.** Мітки розділів у `docs/README.md` старі (`adr/`, `copy/`, `agents/` замість фактичних шляхів); рядки `playbooks/` (`:82`) і `instructions/` (`:84`) ведуть в одне місце; `:105` лишає «Legacy»-вхід `superpowers/`. `docs/work/specs/site-ia/` (10 сторінок) і `docs/work/specs/data/` не проіндексовані ні там, ні в `docs/work/specs/README.md`. Парасольковий канон `docs/product/model/product-overview.md` лежить поза `docs/product/modules/` і не згаданий в `AGENTS.md` § See also.

**Що зробити.** Переназвати рядки фактичними шляхами, злити дубль, проіндексувати `site-ia`, `data` і `product-overview.md`.

### DG-30. AI-LEGACY і шаблон PR прив'язані до GitHub

**Докази.** `lint:ai-legacy --require-issue` потребує `GITHUB_TOKEN` (`scripts/check-ai-legacy.mjs:36-39`) і живе лише в `ai-legacy-scan.yml`. Rule #15 перелічує `.github/PULL_REQUEST_TEMPLATE.md`, який Bitbucket не підставляє. Живих маркерів `AI-LEGACY: expires` поза тестами немає, тож вплив поки малий.

**Що зробити.** Зняти вимогу issue або перевести на інший трекер; згадати шаблон у curl-рецепті створення PR.

### Low

### DG-31. Дрібний дрейф

- `CLAUDE.md:24`: список sub-tree bridge-ів неповний (є ще `packages/{dualwrite-core,finyk-domain,fizruk-domain,nutrition-domain,routine-domain}/CLAUDE.md`).
- `sergeant-start-here/SKILL.md:20` не згадує `apps/landing`; `:83` досі згадує retired janitors.
- `docs/governance/adr/README.md:166`: «наступний номер - 0096», а 0096-0098 уже є; `:178` називає `check-adr-graph` гейтом у `docs-automation.yml`, хоча він у `pnpm lint`; назва 0085 в індексі не збігається з H1.
- `docs/start/agents/decisions.md`: 5 із 7 посилань на джерела ведуть на `github.com/…/blob/…` (див. DG-14).
- `docs/work/specs/audits/product-knowledge-overview.md:~10`: текст посилання `docs/product/modules/product-overview.md`, фактичний шлях `docs/product/model/product-overview.md`.
- § Module ownership map: усі 6 рядків мають Secondary «TBD» без дедлайну. Або прийняти соло-власність явно, або дати дату.
- Гілки поза soft-правилом іменування: `recover/*`, `silpo-catchup`, `techdebt-catchup`.
- Нагадування: вказівник `sergeant-hubchat` видаляється після 2026-10-28 (`decisions.md`, рядок 2026-08-28).
- Кореневі коміти `db318e58a` («base: …») і `00627cc7d` («merge: …») поза enum Rule #5. Критик підтвердив, що це одноразова пересадка історії при переїзді (коміт без батьків, створений plumbing-командою), а не систематичний обхід Husky. Варто згадати в ADR про хостинг (DG-6).

### DG-32. `deploy-api.mjs` не має ні dry-run, ні підтвердження: будь-який запуск і є продакшн-деплоєм

**Докази.** Інцидент під час виправлень за цим аудитом. Сабагент перевіряв новий pre-flight і запустив `node scripts/deploy-api.mjs` напряму. Скрипт після pre-flight одразу відправив POST у Coolify, і о 2026-09-23T01:08:56Z пройшов деплой `en1osxvx14tqcktgxmqgjqlv` застосунку `sergeant-api-v2`, якого ніхто не санкціонував. Наслідки обмежені: деплой перевикотив той самий коміт `d94ba0210`, що вже стояв на проді (попередній деплой `rdczmw0lqwdaszgkjfruuizg` о 00:16Z), збірка з кешу тривала 33 с, статус `finished`. Код і схема не змінились, фактичний ефект: перезапуск контейнера. Та сама властивість небезпечна в загальному випадку: міграції виконуються в ENTRYPOINT, тож «тестовий» запуск на новішому `main` змінив би схему живої БД.

**Що зробити.** Вимагати явний прапорець (наприклад `--yes`), без якого скрипт показує, що саме задеплоїть (коміт, застосунок), і виходить; `pnpm deploy:api` передає прапорець свідомо. В інструкціях для агентів (`AGENTS.md` § «Прод не оновлюється сам», скіл деплою) прямо заборонити запускати `deploy:*` заради перевірки коду. Рішення про UX - за власником.

## 6. Що зроблено добре

- **Реєстри узгоджені.** `AGENTS.md` ↔ `hard-rules.json` ↔ `rules/*.md` збігаються; 17 правил, 8 blocker / 9 lint-enforced, як заявлено.
- **Агентний шар без дрейфу у складі.** 37 скілів = 37 вузлів графа = рядки таблиці роутингу; `.claude/agents` і `.codex/agents` мають однаковий набір із 27 імен; `harness-versions.json` 6.5.8 збігається з останнім записом змін; кожен скіл має `lang` і `lang-reason`.
- **Граф ADR чистий.** `check-adr-graph`: 95 ADR, двосторонні supersede-ланцюжки (0018→0053, 0010→0052→0094, OpenClaw→0055→0075, 0009→0074), пропуски 0029/0040/0056 задокументовані й внесені в whitelist.
- **Канони модулів повні.** П'ять канонів з маркерами, журналами рішень і `[ІНТЕРВ'Ю]`; інфра-модулі без канону - задокументоване рішення, а не пропуск.
- **Свіжість.** Лише 6 із 478 доків старші за 90 днів, і всі мають статус Reference/Done; жодного простроченого «Next review» у `docs/` (окрім ADR, див. DG-26).
- **Husky справді fail-closed:** `set -e`, коректний exit code з lint-staged, commitlint локально.
- **Відвертість про кризу.** `AGENTS.md` чесно описує блокування GitHub і пояснює, чому архівні remote-и не видаляються; на `origin/main` з'явився `deploy:status` з явною межею автономії.

## 7. Поза репо: особистий `~/.claude/CLAUDE.md`

Це не знахідки репо, але вони впливають на кожну сесію агента:

- Спеки для Sergeant спрямовано в `docs/90-work/planning/specs/`, а copy-канон у `docs/01-product/copy/style-guide.uk.md`. Обох каталогів немає; фактичні шляхи: `docs/work/specs/` і `docs/product/copy/style-guide.uk.md`. Замість загального скіла `spec` у репо є власний `sergeant-spec`.
- «4 apps + 13 packages»: насправді 5 застосунків.
- Згадки Railway і `gh auth` застаріли.
- MEMANTO (`localhost:8080`) під час цього прогону не відповідав.

## 8. Рекомендований порядок дій

1. **Один механічний PR (DG-5, DG-11, DG-18, DG-22, DG-28, DG-31):** прибрати `agent:route`, регенерувати 4 артефакти, виправити посилання, «приватне/публічне», прибрати GitHub MCP, дрібниці. Ризик мінімальний.
2. **PR «повернути гейти» (DG-1, DG-2, DG-9, DG-10, DG-24):** перенести CI-only node-перевірки в `pnpm lint` або `pre-push`, `lint-migrations` у lint-staged, pre-flight у `deploy-api.mjs`, fail-closed gitleaks, виправити `repo-slug`, переписати `enforced_by`.
3. **ADR про хостинг + вирівнювання доків деплою (DG-6, DG-7, DG-8, DG-13, DG-16, DG-25):** одне рішення про хостинг, CI, деплой, міграції й політику верифікації; потім сім місць з DG-7 і статуси старих ADR.
4. **Архів (DG-14):** запушити опорні коміти в Bitbucket до будь-якого прибирання GitHub-remote-ів.
5. **Гігієна (DG-15, DG-17, DG-19, DG-20, DG-26, DG-29):** супровідний ADR до 0081, мова політик, схуднення `AGENTS.md`, перенесення політики з `CLAUDE.md`, модель незмінності ADR, індекси.

## 9. Рішення, потрібні від власника

1. **CI.** Bitbucket Pipelines, self-hosted runner на Hetzner, чи лише локальні гейти (`pre-push` + pre-flight у `deploy-api.mjs`)? Від цього залежить формулювання ADR про хостинг (DG-6) і `enforced_by` усіх правил.
2. **Hard Rule #26.** Зняти окремим ADR чи портувати писача ledger на Bitbucket API?
3. **Стратегія merge у Bitbucket:** squash за замовчуванням (тоді заголовок PR знову стає subject-ом на `main`) чи merge-коміти (тоді оновити § Commit and PR conventions)?
4. **Англомовні політики (DG-17):** перекласти чи оформити виняток із Rule #15?
5. **Secondary reviewer:** прийняти соло-власність явно чи дати дедлайн?
6. **Архівний пуш** опорних комітів `d068c73a` і `d1a37e0b` у Bitbucket.

## 10. Межі аудиту і спростовані знахідки

**Не перевірялось:** чим замінено CodeQL, container-scan, nightly-audit і Dependabot (лише зафіксовано, що вони зупинились); фактичні налаштування branch restriction у Bitbucket і `receive.*` на дзеркалі Hetzner (з репо не видно); runtime-поведінка застосунку.

**Знижено або знято критиком повноти:**

- `STATUS.md` не дублюється на кожному прогоні: генератор уже виправлено, псування одноразове (DG-27, знижено до medium).
- «Bitbucket merge-subject-и не пройдуть commitlint» - хибно: `@commitlint/is-ignored/lib/defaults.js:22` уже ігнорує `Merged in … (pull request #N)`.
- Застарілі шляхи в особистому `CLAUDE.md` - не суперечність джерел істини репо (перенесено в розділ 7).
- Коміти `base:` і `merge:` - одноразова пересадка історії, а не систематичний обхід Husky (DG-31).

## 11. Стан виправлень (гілка `claude/docs-governance-fixes`, 2026-09-23)

**Закрито:** DG-1 (формулювання в `AGENTS.md`, `hard-rules.json`, per-rule файлах, `release-policy.md`, `apps/web/AGENTS.md`, `docs/README.md`; чисті CI-записи позначено `SUSPENDED`), DG-2 (`lint-migrations` у `pnpm lint` і lint-staged, pre-flight у `deploy-api.mjs`), DG-5, DG-7, DG-8 (у доках; ADR-0013 не чіпали), DG-9 (`check-hard-rules-registry` і `check-governance-sync` у `pnpm lint`), DG-10, DG-11, DG-12 (бюджети позначено ручними), DG-15 ([ADR-0099](../../../governance/adr/0099-retired-hard-rules-registry.md)), DG-16 (0030, 0046, 0057), DG-18, DG-19 (`AGENTS.md` 88 → 57 KB, журнал у [`bundle-budget-ratchet-log.md`](../tech-debt/bundle-budget-ratchet-log.md)), DG-20, DG-21, DG-22, DG-24, DG-25, DG-27, DG-28, DG-29, частина DG-31.

**Свідомо не додано:** `eslint-print-config-diff` у ланцюжок `pnpm lint` (2 хв 41 с на прогін), `docs:check-freshness-coverage` і `dead-code:files` (не заміряні).

**Чекає рішень власника:** DG-4, DG-6 (ADR про хостинг, наступний номер 0100), DG-13, DG-14, DG-17, DG-23, DG-26, DG-30, DG-32, ADR-0003/0044/0072, secondary reviewer.

**Повний `pnpm lint` на гілці** зупиняється на кроках, які червоні на `main` і без цих змін (файли, що їх валять, у гілці не змінювались). Першим прогоном аудиту їх не зловлено, бо вони поза docs/governance-набором:

- `check-inline-error-responses`: борг `apps/server` 75 > 66 (code) і 125 > 113 (requestId).
- `check-vi-mock-cap`: `apps/server/src/routes/me.route.test.ts` і `apps/web/src/core/profile/ProfilePage.test.tsx` по 6 `vi.mock`.
- `check-design-conventions`: `apps/web/src/core/app/DbBusyScreen.tsx:38`, клас `text-muted-foreground`.
- `check-workspace-readme-scripts`: `apps/server/README.md` не описує `eval:tools:jev`.
- `check-floating-promises-baseline`: на Windows падає з `ERR_UNSUPPORTED_ESM_URL_SCHEME` (імпорт абсолютного шляху без `file://`), тож на машині власника ланцюжок `pnpm lint` червоний завжди.

Решта 60 кроків ланцюжка зелені, включно з трьома новими.

**Поправка до розділу 3.** Червоний `lint:codex-agents` виявився артефактом робочої копії, а не дрейфом репо. 11 файлів `.claude/agents/*.md` у цьому worktree мали CRLF, хоча blob-и в git і `.gitattributes` (`eol=lf`) - LF. Після зняття CR у робочій копії гейт зелений без жодного коміту. Реальних червоних гейтів на `main` у початковому прогоні було чотири, не п'ять.

## 12. Зміни на `main` під час роботи (мердж 2026-09-23)

Поки тривав аудит, власник змерджив PR #11 і #12, і вони зачіпають ту саму територію:

- **З'явився `.husky/pre-push`** ([`scripts/pre-push-merged-pr.mjs`](../../../../scripts/pre-push-merged-pr.mjs)): не дає пушити в гілку, чий PR на Bitbucket уже змерджено, і освіжає `main` у трунку на кожному вдалому пуші. Під час першого прогону аудиту цього хука не було, тому § 4 казала, що локально працює лише `pre-commit` і `commit-msg`. Тепер pre-push існує, і це готове місце для перевірок, які не влізли в `pnpm lint` через час (наприклад `eslint-print-config-diff`, 2 хв 41 с). Сам хук не є lint-гейтом: він ловить інший клас помилки, коли коміт їде в закриту гілку.
- **`deploy-api.mjs` тепер зводить дзеркало Hetzner з Bitbucket перед деплоєм** (свідомо без force). Pre-flight міграцій із цього PR став першим кроком того самого скрипта; обидві перевірки живуть поряд і жодна не скасовує другої.

Обидві зміни підсилюють висновок § 2: заміна мертвого CI будується з локальних хуків, і рішення власника (розділ 9, пункт 1) визначить, скільки саме туди переїде.

## 13. Hard Rule #26 повернуто в дію (2026-09-23)

Власник обрав варіант «портувати писача на Bitbucket API і чіпляти на `pre-push`». Зроблено:

- **Джерело метаданих.** `scripts/ci/update-pr-backlinks.mjs` більше не кличе `gh`. PR читаються з Bitbucket API, час мержу береться з `closed_on`, список файлів - посторінковий `diffstat` зі звіркою проти поля `size` (та сама перевірка `assertCompleteFileList`, що двічі ловила тихий недолік у GitHub-версії).
- **Ключ запису.** Був номер PR, став `host` + `repo` + `number`. Bitbucket нумерує з одиниці, у реєстрі вже лежать номери 29..3665 із трьох GitHub-репо: на Bitbucket-#29 старий ключ мовчки перезаписав би чужий запис. Обидва нові поля опційні, тож 60 наявних записів лишились недоторканими.
- **Тригер.** `pre-push` після вдалого пуша питає, скількох змерджених PR бракує, і називає команду. Саме попередження, а не блок: запис у реєстр змінює файли, які треба комітити окремо, тож писати їх посеред чужого пуша означало б лишати брудне дерево після успішного `git push`.
- **Памʼять про оглянуте.** Більшість PR канонічних доків не чіпає і запису не отримує. Без окремого списку `examined` хук нагадував би про ті самі одинадцять PR вічно, а нагадування, яке не можна погасити, за тиждень читається як шум. Зберігається перелік номерів, а не «найбільший оглянутий»: PR зі старішим номером може змерджитись пізніше за новіший.
- **Реєстр дочитано.** Розрив від 2026-09-17 закритий: 12 змерджених Bitbucket-PR оглянуто, один із них (#6) торкався канонічного документа й отримав запис із робочим посиланням на `pull-requests`.

**Чого свідомо не зроблено.** Перевірку повноти не додано в `pnpm lint`. Реєстр відстає щоразу, коли власник мерджить PR, тож `--stale` усередині `lint` робив би ланцюжок червоним у всіх і завжди - рівно той стан «червоний завжди = вимкнений», проти якого написана решта цього аудиту. Повнота лишається на `pre-push`, а `--check` у `lint` і далі стереже форму.

**Побічна знахідка.** Bitbucket не віддає логін автора взагалі: ні `nickname`, ні git-поля мерж-коміта не містять хендла, лише справжнє імʼя власника. Тому в нових записах `author` - слуг робочого простору (`@skords01`). Поле ніде не рендериться, тож PII у трекованому файлі не дало б жодної користі. Заразом виправлено схему реєстру: її `repo` мав `enum` з одним слугом і вже розходився з даними, бо схему ніхто не виконує в рантаймі.

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                              | Title                                                                   | Merged     |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------- |
| [#13](https://bitbucket.org/skords01/sergeant/pull-requests/13) | docs(agents): вирівняти governance з фактом після переїзду на Bitbucket | 2026-09-23 |

_Auto-derived from `docs/governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
