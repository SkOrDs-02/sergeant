# Contributing to Sergeant

> **Last touched:** 2026-09-02 by @claude. **Next review:** 2026-12-27.
> **Status:** Active

`CONTRIBUTING.md` - канонічний manual для людей. Repo policy і hard rules описані в [AGENTS.md](./AGENTS.md), а repeatable execution recipes - у [docs/00-start/playbooks/README.md](./docs/00-start/playbooks/README.md).

## Перед стартом

1. Прочитай [AGENTS.md](./AGENTS.md), якщо торкаєшся коду, infra або docs governance.
2. Знайди playbook для свого сценарію в [docs/00-start/playbooks/playbook-catalog.md](./docs/00-start/playbooks/playbook-catalog.md).
3. Якщо зміна торкає API, migrations, HubChat, mobile або deploy surface, працюй за відповідним playbook від початку, а не після факту.

## Setup

Вимоги:

- Node.js `22.x`
- `pnpm 9.15.1` (закріплено через `package.json` → `engines.pnpm: "9.x"` + `packageManager: "pnpm@9.15.1"`; corepack/Volta вмикають саме цю версію)
- Docker для локального Postgres

```bash
git clone https://github.com/SkOrDs-02/sergeant.git
cd sergeant
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev:db
```

### `pnpm install --frozen-lockfile` як дефолт ([L14](docs/04-governance/security/hardening/archive/L14-pnpm-frozen-lockfile-dev.md))

CI завжди ставить deps через `--frozen-lockfile` — тобто падає, якщо `pnpm-lock.yaml` хоч на байт відрізняється від того, що зафіксовано в репі. Це supply-chain hardening: `pnpm install` без прапорця може мовчки переписати lockfile (наприклад, після `pnpm add foo` без `pnpm-lock.yaml` у staged-files), і регресія/malicious-bump просочиться у feature-гілку без рев'ю diff-а в lock-файлі.

Локально дотримуйся того ж паттерна:

```bash
# дефолтний install — точно те, що в lock-файлі
pnpm install --frozen-lockfile

# додавання нової deps — свідомо оновлює lockfile, додай diff у той самий PR
pnpm add <pkg> --filter <workspace>

# bump існуючої deps — свідомо оновлює lockfile, ловиться `pnpm audit` у CI
pnpm update <pkg> --filter <workspace>

# bump усіх deps — використовуй з обережністю, рев'ью diff lockfile-а вручну
pnpm update -r
```

Якщо `pnpm install` (без `--frozen-lockfile`) залишив `git diff pnpm-lock.yaml` непустим, а ти не додавав/оновлював deps свідомо — значить, drift. Скинь зміни (`git checkout -- pnpm-lock.yaml`) і перерозберись, чому твоє локальне дерево не сходиться з lockfile (типово — нова версія `pnpm` сама, або забутий `pnpm install --frozen-lockfile` після `git pull`).

Кожен override у `pnpm.overrides` (root `package.json`) трекається окремо — `pnpm lint:pnpm-overrides` падає, якщо range уже не resolves до одного major-а ([L1](docs/04-governance/security/hardening/archive/L1-uuid-override.md)).

### Worktrees: тримай на тому ж томі, що й pnpm store

Для паралельної роботи над кількома гілками зручно піднімати git-worktree (`git worktree add <path> -b <branch>`). Розміщуй worktree на **тому ж файловому томі, що й твій pnpm store** (`pnpm config get store-dir`) — тоді `pnpm install` усередині worktree робить **hardlink** зі store замість повної копії дерева залежностей, тобто near-zero додаткового диску на кожен worktree.

Hardlink працює лише в межах **одного тому** й лише на ФС, що його підтримує:

- **NTFS / APFS / ext4** — hardlink ок; worktree та store на одному такому томі шерять файли.

> **Примітка (2026-06-10):** Диск `E:` був відформатований з exFAT на NTFS, тому тепер hardlink працює і на ньому. Можна створювати worktree на `E:` без проблеми повних інсталів.

Запуск локально:

```bash
pnpm dev:server
pnpm dev:web
```

Опціонально:

- `pnpm --filter @sergeant/mobile start`

### Локальний secret-scan (gitleaks)

Pre-commit hook (`scripts/pre-commit-gitleaks.mjs`) запускає `gitleaks protect --staged` на staged-зміни — це той самий сканер, що і у CI (`.github/workflows/ci.yml :: secret-scan`, [I5](docs/04-governance/security/hardening/archive/I5-pre-commit-secret-detection.md)). Catching секретів локально (перед тим, як коміт потрапить у reflog) дешевше, ніж на PR-boundary — attacker timeline стартує з моменту локального коміту.

Встанови `gitleaks` один раз:

```bash
# macOS
brew install gitleaks

# Linux — download прямо з GitHub Releases (приклад v8.21.2 / x64)
curl -fsSL -o /tmp/gitleaks.tgz \
  https://github.com/gitleaks/gitleaks/releases/download/v8.21.2/gitleaks_8.21.2_linux_x64.tar.gz
tar -xzf /tmp/gitleaks.tgz -C /tmp gitleaks
sudo mv /tmp/gitleaks /usr/local/bin/gitleaks

# Go install (будь-яка платформа)
go install github.com/gitleaks/gitleaks/v8@latest
```

Перевірка staged-файлів вручну:

```bash
pnpm lint:secrets
```

Якщо `gitleaks` не встановлено, hook логує warning і пропускає скан (CI-gate однаково запустить той самий scanner на PR — defense in depth). Якщо hook ловить false-positive, додай entry у `.gitleaksignore` у **тому самому коміті** — Hard Rule #7 забороняє `--no-verify`. Break-glass для випадку, коли ignore-entry треба написати _після_ блокованого коміту: одноразовий `SERGEANT_SKIP_GITLEAKS=1 git commit …` (логається у stderr).

## Щоденний цикл

1. Визнач surface: `web`, `server`, `mobile`, `ops`, `docs`, `packages/*`.
2. Відкрий playbook або specialist doc для цього surface.
3. Зроби найменший узгоджений change-set.
4. Прожени verification для свого типу зміни.
5. Онови docs/04-governance/governance/playbooks у тому ж PR, якщо поведінка або процес змінилися.

## Verification за типом зміни

Базовий мінімум:

```bash
pnpm lint
pnpm typecheck
pnpm dedupe --check   # P2-1: lockfile-drift guard (див. нижче)
```

`pnpm dedupe --check` падає з non-zero exit, коли `pnpm install` (без `--frozen-lockfile`) ввів дубль транзитивної залежності — типовий шлях drift-а, коли локальний `pnpm add` дозволив новішу мінорну версію того ж пакета поруч зі старою. Фікс — `pnpm dedupe` локально + коміт `pnpm-lock.yaml`-delta у той самий PR. Той же gate стоїть у CI (`format-lint-test-build` matrix у `.github/workflows/ci.yml`, audit item P2-1 у [`docs/90-work/audits/2026-05-13-testing-devx-roast.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/audits/archive/2026-05-13-testing-devx-roast.md)).

Далі додатково за surface:

- `web`: `pnpm test`, локальний smoke через browser, за потреби `pnpm --filter @sergeant/web test`
- `server/api`: `pnpm test`, `pnpm api:check-openapi`. **Detox більше НЕ тригериться на server-зміни**: з web-focus фази 2026-07 `detox-{ios,android}.yml` реагують лише на `apps/mobile/**` і `apps/mobile-shell/**`. Автоматичний захист від response-shape drift — contract-тести Hard Rule #3 + `api:check-openapi`; mobile-регресію по серверній зміні ганяй вручну через `workflow_dispatch`. Якщо shape змінився — онови hand-written типи `packages/api-client/src/endpoints/*` у тому самому PR.
- `migrations`: `pnpm db:migrate`, `pnpm lint:migrations`
- `mobile`: `pnpm --filter @sergeant/mobile test`
- `governance/docs`: `pnpm docs:check-links`, `pnpm docs:check-playbook-schema`, `pnpm docs:check-playbook-index`, `pnpm lint:governance-sync --strict`
- `testing/devx`: звіряйся з [`docs/90-work/planning/pr-plan-testing-devx-2026-05.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/pr-plan-testing-devx-2026-05.md) і починай із [`.agents/skills/sergeant-start-here/SKILL.md`](./.agents/skills/sergeant-start-here/SKILL.md). Базові verification-команди — `pnpm lint`, `pnpm typecheck`, `pnpm test` + relevant filter (`pnpm --filter @sergeant/<workspace> test`); E2E / Detox / VRT — лише якщо змінюються відповідні spec-файли.

Якщо сценарій має окремий playbook, секція `Verification` у playbook має пріоритет над загальним списком вище.

## Playbooks як execution layer

Playbooks - це канонічні покрокові рецепти виконання роботи.

- Каталог: [docs/00-start/playbooks/playbook-catalog.md](./docs/00-start/playbooks/playbook-catalog.md)
- Trigger index: [docs/00-start/playbooks/INDEX.md](./docs/00-start/playbooks/INDEX.md)
- Overview і taxonomy: [docs/00-start/playbooks/README.md](./docs/00-start/playbooks/README.md)

Топові сценарії:

- API зміни: `add-api-endpoint.md`
- DB/schema зміни: `add-sql-migration.md`
- HubChat tools: `add-hubchat-tool.md`
- CI red: `fix-failing-ci.md`
- Prod incident: `hotfix-prod-regression.md`
- Alerts і деградація: `investigate-alert.md`
- Web -> mobile porting: `port-web-screen-to-mobile.md`

## Commit і PR дисципліна

- Conventional Commits обов'язкові.
- Scope обовʼязковий і має бути зі scope-enum — канонічний список у [`commitlint.config.js`](./commitlint.config.js), дзеркало в [AGENTS.md § Commit and PR conventions](./AGENTS.md#commit-and-pr-conventions). Значення поза enum завалить Husky-хук `commit-msg`.
- Не використовуй `--no-verify` (Hard Rule #7).
- Не force-push у `main`/`master`.

### Pre-commit hooks

Husky `pre-commit` запускає два кроки послідовно:

1. `lint-staged` з пайплайнами для staged-файлів (таблиця нижче).
2. `node scripts/pre-commit-gitleaks.mjs` — secret-scan на staged-changes ([I5](docs/04-governance/security/hardening/archive/I5-pre-commit-secret-detection.md); деталі та інсталяція — у §«Локальний secret-scan (gitleaks)» вище).

| Pattern                                         | Команди                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `*.{js,jsx,ts,tsx,mjs,cjs}`                     | `eslint --fix --max-warnings=0 --no-warn-ignored` → `prettier --write`                                                    |
| `*.{ts,tsx}`                                    | `node scripts/staged-typecheck.mjs` (швидкий `tsc --noEmit` per-project)                                                  |
| `*.md`                                          | `node scripts/docs/bump-last-validated.mjs` → `prettier --write` → `node scripts/pre-commit-derived-artifacts.mjs --docs` |
| `packages/shared/src/{openapi,schemas}/**/*.ts` | `node scripts/pre-commit-derived-artifacts.mjs --openapi`                                                                 |
| `docs/04-governance/pr-ledger/index.json`       | `node scripts/pre-commit-derived-artifacts.mjs --ledger`                                                                  |
| `*.{json,css,html,yml,yaml}`                    | `prettier --write`                                                                                                        |

Скрипт `scripts/staged-typecheck.mjs` групує staged TS/TSX за найближчим `tsconfig.json` (apps/web, apps/server, packages/\*…) і викликає `tsc-files --noEmit --skipLibCheck` під cwd кожного sub-project — це уникнення повного `pnpm typecheck` (16 турбо-task-ів) на кожен коміт. На гарячому кеші проходить за 3–8 сек на 10–20 staged файлів. На холодному (після `git pull` зі змінами в `node_modules` або `tsconfig`) — 15–30 сек. Якщо typecheck падає на staged-файлі, виправ помилку — `--no-verify` залишається забороненим.

Останній крок у `*.md`-пайплайні — [`scripts/pre-commit-derived-artifacts.mjs`](./scripts/pre-commit-derived-artifacts.mjs), гейт **похідних артефактів**: файлів, які генеруються з інших файлів репо і комітяться поруч (`docs/open-work.md`, `docs/today.md`, `docs/STATUS.md`, trust-badge у `docs/README.md`, `freshness-dashboard.html`, для `packages/shared/src/{openapi,schemas}/**` — `docs/02-engineering/api/openapi.json`, а для `pr-ledger/index.json` — `STATUS.md` і backlink-блоки в доках). Він нічого не переписує: запускає ті самі `--check`-и, що стоять PR-гейтами, паралельно (~0.7 с на всі шість) і на розбіжності друкує рівно ту команду регенерації, якої бракує. Автофіксу тут немає свідомо — на відміну від `bump-last-validated.mjs`, який дописує в коміт наслідок власної правки (дашборд — чиста функція від дат, які він щойно зсунув), ці артефакти рендеряться зі стану трекерів, `pr-ledger` і всіх zod-схем: тиха регенерація підмішала б у коміт автора чужий стан, якого він не торкався. Дашборд у списку лишається навмисно — у `bump-last-validated` його регенерація best-effort у `try/catch`, і цей гейт ловить саме випадок, коли вона мовчки не спрацювала.

Гейт не додає нового класу блокувань — рівно ці перевірки вже стоять у `contract-tests.yml` і `docs-automation.yml`. Змінюється лише момент: автор бачить розсинхрон на своїй машині до пушу, а не через червоний CI на чужому відкритому PR. Причина появи — ніч 2026-08-29/30, коли `main` зламався шість разів поспіль трьома PR, і щоразу одним механізмом: джерело змінилось, похідний артефакт не перегенеровано. Порядок усередині `*.md`-пайплайну не випадковий: гейт стоїть **після** `bump-last-validated.mjs`, бо той переписує дати у staged-доках і сам може зрушити похідні.

**Чого гейт не ловить.** Він бачить лише твоє дерево. Другий механізм розсинхрону — коли базова гілка з'їхала під уже відкритим PR: CI рендерить артефакт з мерджу, тож дашборд може розійтись, хоча в коміті все сходилось. Ліки ті самі, що й для конфлікту, — `git merge origin/main` і регенерація; після мерджу гейт відтворює падіння CI локально й називає команду.

Запис для `pr-ledger/index.json` винесено окремою групою, а не додано в `--docs`, з ціни: `docs:check-pr-ledger` коштує ~2 с (ліниво тягне prettier) — утричі більше за всю решту разом. Реєстр правиться рідко й здебільшого автоматикою `pr-backlinks.yml`, тож платити за нього на кожному коміті з `.md` немає за що.

Opt-out — `SERGEANT_NO_DERIVED_CHECK=1 git commit …` для проміжного коміту в гілці. Це не обхід хука (Hard Rule #7 лишається чинним) і не обхід CI: перевірка просто переїжджає на PR.

Хук обгорнуто wrapper-ом [`scripts/pre-commit-timing.mjs`](./scripts/pre-commit-timing.mjs), що міряє wall-clock час і друкує markdown summary одразу після commit-у. Історичний p50/p95 — `pnpm pre-commit:timings`. Деталі (env-контракт `SERGEANT_TIMING_LOG`, opt-out `SERGEANT_SKIP_TIMING=1`) — [`docs/02-engineering/development/pre-commit-timing.md`](./docs/02-engineering/development/pre-commit-timing.md).

Перед відкриттям PR:

1. Заповни новий PR template повністю.
2. Вкажи, який skill або playbook вів роботу.
3. Переліч конкретні verification steps.
4. Перевір, чи треба було оновити `AGENTS.md`, playbook, governance doc або roadmap.

Reviewer checklist живе в [docs/04-governance/governance/review-checklist.md](./docs/04-governance/governance/review-checklist.md).

### Hard rules (з `AGENTS.md`)

Нумерація — канонічна, з розривами: правила #8, #9, #11–#14, #16, #17 і #24
retired рішенням [ADR-0081](./docs/04-governance/adr/0081-repository-simplification.md).
Тому список — таблиця, а не ordered list: Prettier нормалізує маркери ordered
list-а і схлопує розриви в `1..N`, мовчки перенумеровуючи все після першого
розриву.

| #   | Rule                                                                                     |
| --- | ---------------------------------------------------------------------------------------- |
| 1   | DB types: coerce `bigint` to `number` in serializers                                     |
| 2   | RQ keys: only via centralized factories                                                  |
| 3   | API contract: server response shape ↔ `api-client` types ↔ test                          |
| 4   | SQL migrations: sequential, no gaps, two-phase for DROP                                  |
| 5   | Conventional Commits: explicit scope enum                                                |
| 6   | No force push to main/master                                                             |
| 7   | Pre-commit hooks via Husky — do not skip                                                 |
| 10  | Lifecycle markers — every file/doc declares its status                                   |
| 15  | Read governance before coding; update docs alongside code; internal docs in Ukrainian    |
| 18  | Module-size discipline — `max-lines: 600` for web TS/TSX and server TS/JS                |
| 19  | Strict-mode flag canonical — `noUncheckedIndexedAccess: true` по всьому monorepo         |
| 20  | No OpenClaw PATs in production                                                           |
| 21  | Pino redaction policy enforced                                                           |
| 22  | Skill body security scan — no injection/exfiltration patterns in SKILL.md                |
| 23  | Archive-move depth integrity — no broken `../X` links in docs archives                   |
| 25  | Auto-generated docs must start with `<!-- AUTO-GENERATED -->` marker                     |
| 26  | Merged PRs touching canonical docs must update `docs/04-governance/pr-ledger/index.json` |

Джерела істини:

- Human-readable contract: [AGENTS.md](./AGENTS.md)
- Machine-readable registry: [docs/04-governance/governance/hard-rules.json](./docs/04-governance/governance/hard-rules.json)
- Generated matrix: [docs/04-governance/governance/hard-rules-matrix.md](./docs/04-governance/governance/hard-rules-matrix.md)

## Generators (`pnpm gen`)

Plop-генератори створюють шаблонні артефакти з валідною мета-структурою (frontmatter, freshness header, schema), щоб не доводилось копіпастити інший приклад і ловити drift.

```bash
pnpm gen                # інтерактивний вибір генератора
pnpm gen new-skill      # .agents/skills/<slug>/SKILL.md + запис у skills-lock.json
pnpm gen new-playbook   # docs/00-start/playbooks/<slug>.md з валідним schema + freshness
pnpm gen:adr            # docs/04-governance/adr/<NNNN>-<title>.md (auto-numbered)
pnpm gen migration      # apps/server/src/migrations/<NNN>_<name>.sql + .down.sql
pnpm gen rq-hook        # apps/web/src/modules/<module>/hooks/use<Name>.ts
pnpm gen hubchat-tool   # server toolDef stub + web action stub
pnpm gen endpoint       # server handler + test + api-client stub
pnpm gen new-package    # packages/<slug>/{src,package.json,tsconfig.json,vitest.config.ts,README.md}
```

`new-skill` і `new-playbook` за замовчуванням генерують UA-текст (Hard Rule #15). Якщо матеріал свідомо англомовний (зовнішній/user-facing), вибери `lang: en` у промпті — генератор додасть `lang: en` у frontmatter і linter візьме файл у allowlist.

Після `pnpm gen new-skill` запусти `pnpm lint:skills`, щоб переконатись, що hash збігається; SHA-256 зберігається відразу в `.agents/skills-lock.json`. Після `pnpm gen new-playbook` запусти `pnpm docs:gen-playbook-index`, щоб оновити trigger-індекс.

## Governance checks

При зміні docs або process surfaces запускай:

```bash
pnpm docs:check-links
pnpm docs:check-playbook-schema
pnpm docs:check-playbook-index
pnpm lint:governance-sync --strict
pnpm lint:hard-rules-registry
pnpm hard-rules:check
pnpm lint:skills
```

При зміні `.agents/skills/<slug>/SKILL.md` додатково треба оновити SHA-256 у `.agents/skills-lock.json`:

```bash
pnpm skills:lock     # перерахує хеші та оновить lock
pnpm lint:skills     # перевірить shape + збіг хешів
```

Без `skills:lock` після правок CI впаде з повідомленням `stale computedHash`.

## Де шукати далі

- Повний doc index: [docs/README.md](./docs/README.md)
- Agent operating system: [docs/00-start/agents/README.md](./docs/00-start/agents/README.md)
- Planning/roadmaps: [docs/90-work/planning/README.md](./docs/90-work/planning/README.md)
