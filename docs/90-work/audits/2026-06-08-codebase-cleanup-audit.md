# Codebase Cleanup Audit — мертвий код, застарілі рішення та інфра-дрейф

> **Last validated:** 2026-06-13 by @claude (audit-triage reconciliation — PR-A та PR-D анотовано як shipped). **Next review:** 2026-07-08.
>
> **Status:** Active — all 4 audit themes executed (console-rename, grammy deletion #3470, doc-status reconcile, ai-marker gate). Residual is out-of-band: plop stale-branding rename + Sept KV→SQLite tombstone batch + react-hooks burndown (Initiative 0021).

> **Single source of truth → root [`AGENTS.md`](../../../AGENTS.md).** Цей файл —
> аудиторський знімок на 2026-06-08. Не дублює repo policy; кожна знахідка
> лінкує конкретний `file:line`. Драфт — узгоджуємо й розбиваємо на PR-и
> окремими класами боргу (за `sergeant-tech-debt`: dead-code / baseline /
> rename / doc-hygiene — різні ризик-профілі, різні PR-и).

## Виконано в цьому PR (2026-06-08)

Після узгодження з founder-ом виконано всі 4 рішення (коміти в цьому PR):

- ✅ **Тема 1 — console→openclaw rename (in-repo).** Реальний баг `eslint.baseline.js` (resolver → неіснуючий `tools/console/`) виправлено + fixtures/skills-lock регенеровано; scope `console` прибрано з commitlint+AGENTS.md; усі stale `tools/console`/`apps/console` посилання в активних доках/скілах/коментарях/CI.
- ✅ **Фіз. deploy-файли перейменовано** — `git mv Dockerfile.console→Dockerfile.openclaw`, `railway.console.toml→railway.openclaw.toml` + dockerfilePath + service-catalog generator (регенеровано) + live deploy-доки + build.mjs. **Railway-частина застосована через API** (`serviceInstanceUpdate` на `sergeant-hubchat`): `railwayConfigFile=railway.openclaw.toml` + watchPatterns на нові імена (заодно фікс застарілого `tools/console/**`→`tools/openclaw/**`). Бот лишився live (healthz 200); деплой не тригернуто. **⚠️ Стане консистентним після мерджу PR у main** (до мерджу новий деплой `sergeant-hubchat` падав би — railway.openclaw.toml ще не на main — але running-контейнер не зачеплено, downtime 0). Service NAME `sergeant-hubchat`→`sergeant-openclaw` — окрема операція (domain+webhook), НЕ робив.
- ✅ **Тема 3 — grammy / Locked Decision #17** → **повністю видалено 2026-06-08** (founder reversed «retain» після підтвердження gateway): `tools/openclaw` workspace + `Dockerfile.openclaw` + `railway.openclaw.toml` + Railway-сервіс `sergeant-hubchat` + plugin parity drift-gate тести + eslint/codeowners/skill-mapping tendrils. `sergeant-openclaw-gateway` — єдина OpenClaw-поверхня.
- ✅ **Replit прибрано** — mode/env/scripts/CSP-disable вектор; тести зелені. Залишок: stale Replit-_коментарі_ в `index.ts`/`app.ts`/`frontend.ts` (follow-up).
- ✅ **Тема 2 — stale-status доки** → 4 закрито (`dead-code-hard-rules-roast`, `page-audit-01`, `pr-plan-dead-code-hard-rules`, initiative `0017`) з верифікацією; `open-work.md` 74→71. 4 borderline переглянуто поштучно й свідомо лишено Active.
- ✅ **Бонус: server-typecheck розблоковано** — виправлено передіснуючі регресії декомпозиції syncV2 (`9d8c0d4`/ADR-0064): битий `ApplyFn` тип, 4× биті type-import шляхи `applySync`, відсутній рантайм-імпорт `toNonNegativeInt` (реальний баг), unused `req`. `turbo typecheck` → 0 помилок.
- ✅ **Replit-коментарі добиті** — вичищено stale Replit-згадки з 8 server-файлів (header `index.ts`, `app.ts`, `env.ts`, `trustProxy.ts`, `db.ts`, `dbReplica.ts`, `rateLimit.ts`, `health.ts`).
- ✅ **Блок A (швидкі doc/lint-фікси):** ADR-0058–0061 `Proposed`→`Accepted` (Initiative 0014 Done) + sync adr/README; ADR-0003 price-note (історичні ₴99 → чинні $7 per ADR-0051); ADR-0025↔0062 cross-link; `ai-marker-syntax` `warn`→`error` (0 violations) + fixtures; `today.md` Next-review cadence (+7, припинено same-day overdue); знято stale `ci.yml` pgvector-SHA TODO.

**Розслідувано → no-action:** Dependabot/Renovate — **це НЕ дубль** (ADR-0044: Renovate primary + Dependabot security-only fallback; npm у Dependabot уже звужений до `applies-to: security-updates`; actions/docker overlap навмисний — інші CVE-фіди).

**Ще НЕ зроблено (потребує окремого рішення / розкладу):** lint-suppressions без власника (react-hooks v7 ~152 — окрема ініціатива, i18n block-disables), `@removeBy 2026-09-01` tombstones (батч у вересні), `@types/node` уніфікація, `pino-loki` prod-перевірка, dormant `servesFrontend`/`frontend.ts` (follow-up), plop-генератори `hubchat-tool`/`new-console-specialist` rename (10+ doc-refs — focused-PR).

## TL;DR

Репо в доброму стані — система governance/freshness/audits працює (548 свіжих
доків, 1 overdue). Це **не** «занедбаний» код. Те, що реально «висить мертвим
вантажем і збиває агентів», згруповано у 4 теми:

1. **Напів-зроблений `console` → `openclaw` rename** (наскрізна тема, зачіпає
   всі 3 осі). Один з артефактів — **реальний баг конфігу** (`eslint.baseline.js:131`
   вказує на неіснуючий `tools/console/tsconfig.json`), решта — stale-коментарі
   та шляхи в доках, що дезорієнтують агентів.
2. **Audits/initiatives зі статусом `Active`, але 0 outstanding** — створюють
   фантомну «відкриту роботу» в `open-work.md`.
3. **Один застарілий decision-record із дедлайном «сьогодні», який НЕ можна
   виконувати** (grammy-deletion, Locked Decision #17) — named-шляхи зараз є
   живим кодом гейтвея. Це пастка для агента, що візьме задачу буквально.
4. **Lint/tech-debt suppressions без тикета й дати** (react-hooks v7 ~152
   violations, i18n block-disables) — легітимний борг, але без власника.

⚠️ **Застереження щодо охоплення:** `pnpm knip` НЕ запускався (у цьому
середовищі немає `node_modules`) — цифри по dead-exports нижче евристичні
(grep + `knip.json` suppressions). Перед будь-яким видаленням exports —
прогнати `pnpm knip` на свіжому install. `@removeBy 2026-09-01` tombstones
(нижче) ще НЕ настали — це не «прострочене», їх чистити батчем у вересні.

---

## Тема 1 — `console` → `openclaw` rename (напів-зроблений)

Каталог `apps/console` → `tools/openclaw`, сервіс `sergeant-hubchat` →
`sergeant-openclaw` (ADR-0032, PR-1792/PR-47). Код, npm-пакет (`@sergeant/openclaw`)
і workspace перейменовані. **Не** перейменовані: 2 deploy-файли, commit-scope і
купа stale-посилань на неіснуючий `tools/console/`.

### 🔴 Реальний баг (не косметика)

> **✅ Закрито 2026-06-13** (PR-A; верифіковано на поточній гілці) — у `eslint.baseline.js` більше немає жодного посилання на `tools/console`; resolver-project list містить лише web/mobile/mobile-shell. Битий шлях усунено.

- **`eslint.baseline.js:131`** — у `import/resolver` TypeScript-project list стоїть
  `"tools/console/tsconfig.json"`. Каталог `tools/console/` **не існує** (підтверджено);
  реальний — `tools/openclaw/tsconfig.json`. Resolver тихо падає на `node`-fallback
  і не бачить openclaw-workspace для import-правил. Fixture-снапшоти в
  `scripts/__fixtures__/eslint-print-config/` запікають той самий битий шлях.

### 🟡 Stale-посилання, що збивають агентів (low-risk, high-clarity)

- `docs/00-start/agents/onboarding.md:75` — `tools/console використовує @anthropic-ai/sdk` (решта файлу вже `tools/openclaw`).
- `docs/02-engineering/development/eslint-config.md:53,87,112` — три `tools/console` посилання.
- `eslint.baseline.js:13,19,26`, `eslint.openclaw.js:12` — prose-коментарі `tools/console`.
- `apps/server/src/modules/openclaw/tools.ts:586`, `packages/shared/src/lib/pii.ts:17` — коментарі `tools/console`.
- `.github/workflows/codeql.yml:56` — коментар `apps/console` (шлях ніколи не існував у цій формі).
- `plop-templates/hubchat-tool/` та `new-console-specialist` — генератори зі stale-брендингом («HubChat», «console-specialist»), хоча генерують у правильні шляхи.

### 🟡 Незавершений rename (потребує координації — це деплой)

- `Dockerfile.console`, `railway.console.toml` — досі стара назва; `railway.console.toml → dockerfilePath = "Dockerfile.console"`.
- `commitlint.config.js:12-14` — scope `console` як «deprecated alias for back-compat» (AGENTS.md:186 = «PR-47 phase 2 removes once Dockerfile.console / railway.console.toml renamed»).
- `docs/04-governance/governance/service-catalog.auto.json` — `"deployArtifact": "Dockerfile.console"` для сервісу `openclaw` (name-mismatch).
- `docs/03-operations/deploy/openclaw.md:34-36`, `docs/03-operations/ops/docker-image-policy.md`, `docs/03-operations/deploy/monorepo-deploy-filtering.md` — посилаються на `Dockerfile.console`/`railway.console.toml` як канонічні.
- **Closed 2026-06-09:** Trivy gap закрито комітом `120ec9d94` (`ci(ci): add Dockerfile.openclaw to container-scan Trivy workflow`), тож окремого follow-up саме для `container-scan.yml` тут більше немає.

> **ADR-immutable:** `ADR-0032`, `ADR-0057` (title `tools/console`) — історичні, НЕ чіпати; максимум — 1 рядок-нотатка про rename (як уже зроблено в `stack-pulse pr-39`).

---

## Тема 2 — Audits/initiatives «Active», але робота закрита

Фантомна «відкрита робота» в `docs/open-work.md`. Перевести в `Archived`/`Closed`
(+ перенести в `archive/` де треба):

| Документ                                                                    | Реальний стан                                                | Дія                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------- |
| `docs/90-work/audits/2026-05-13-dead-code-hard-rules-roast.md`              | 17/17, 0 outstanding (лишився knip-false-positive watchlist) | → `Archived`                            |
| `docs/90-work/audits/2026-05-13-page-audit-01-auth-onboarding.md`           | ~24/25, 0 outstanding                                        | → `Archived`                            |
| `docs/90-work/audits/2026-05-13-page-audit-02-hub-dashboard.md`             | ~23/24, 0 (тільки burn-down markers watchlist)               | borderline — підтвердити                |
| `docs/90-work/initiatives/0017-hub-tabs-mount-perf.md`                      | code-complete; Sprint 3 gated на метрику `>50ms`             | → `Closed` + observation-window дедлайн |
| `docs/90-work/tech-debt/syncV2-refactor-plan.md`, `…-engineering-ticket.md` | syncV2 декомпозовано (3096→474, ADR-0064)                    | → `archive/`                            |
| `docs/90-work/planning/pr-plan-dead-code-hard-rules-2026-05.md`             | усі DC/HR items ✅                                           | → `Closed`/`archive/`                   |
| `docs/90-work/planning/dev-stack-roadmap.md`                                | 15/15 done (`Status: Reference`)                             | → `archive/`                            |
| `docs/90-work/planning/flyio-vs-railway.md`                                 | decision-артефакт, «дій не потребує»                         | → `archive/`                            |
| `docs/90-work/planning/pr-plan-2026-05.md`                                  | всі logged-items `merged`                                    | підтвердити → `Closed`                  |

**Структурний дрейф freshness (не борг, а скрипт):**

- `docs/today.md` — overdue 1d бо `Next review = Last validated` (той самий день). `docs:gen-today` має ставити `Next review: today+1`. Полагодити генератор, а не дату.

---

## Тема 3 — Застарілі рішення / ADR-дрейф

### 🔴 P0-пастка: grammy-deletion (Locked Decision #17) — НЕ виконувати

`docs/90-work/planning/openclaw-migration-plan.md:6,241` наказує до **2026-06-09 (сьогодні)**
видалити `tools/openclaw/src/openclaw/` + `agents/{openclaw,personas,strategic-modes,dispatcher}.ts`.

**Верифіковано вручну — це live-код, не legacy:**

- entrypoint `tools/openclaw/src/index.ts:12,18,19` імпортує `./openclaw/index.js`, `commands.js`, `webhook.js`;
- `src/openclaw/handler-*.ts` імпортують усі 4 «legacy» agent-файли (`handler-events.ts:20`, `handler-audit.ts:20`, `handler-agent-commands.ts:21-26`, …);
- гейтвей **досі на grammy** (`src/index.ts:3 import { Bot } from "grammy"`).

→ Named-шляхи в decision-record **застаріли/не відповідають дереву**. Виконання
наосліп = видалення живого гейтвея. **Дія: НЕ видаляти.** Потрібне рішення
власника — або grammy-код реструктуризовано/поглинуто (decision moot, закрити
рядок у migration-plan), або «legacy» означає щось інше. Поки що — зняти дедлайн
і позначити Locked Decision #17 як `superseded/needs-reconciliation`.

### 🟡 ADR-дрейф

- **ADR-0058/0059/0060/0061** — усі `Proposed`, але батьківська Initiative 0014 вже `archive/`. → `Accepted` (якщо код shipped) або `Deprecated`.
- **ADR-0003** (`proposed`) — у тілі стара ціна «Pro ₴99/міс» (рядки 10,23); ADR-0051 (accepted) встановив $7/міс. Stale price у тілі.
- **ADR-0025 ↔ ADR-0062** — обидва «OpenAPI з Zod», 0062 не лінкує 0025 як supersede. Уточнити зв'язок.
- Superseded ADR (0004/0010/0018/0031/0036/0041) — коректно крос-залінковані, immutable-policy, **НЕ чіпати**.

---

## Тема 4 — Lint / tech-debt suppressions без власника

| Кластер                                      | Обсяг                                                | Файл                                                                            | Нотатка                                                                            |
| -------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `react-hooks/*` v7 disabled                  | ~152 (set-state-in-effect 78, refs 37, purity 17, …) | `eslint.baseline.js:146-178`                                                    | «queued for dedicated cleanup initiative» — без тикета й дати. Завести ініціативу. |
| `react-hooks/exhaustive-deps` inline         | 50 disables                                          | apps/\*                                                                         | здебільшого свідомі                                                                |
| `@typescript-eslint/no-explicit-any`         | 30                                                   | apps/\*                                                                         | test-stubs/DI                                                                      |
| i18n block-disable `no-cyrillic-jsx-literal` | 3 файли                                              | `apps/web/.../nutrition/components/LogCard{Search,WeeklyTable,Analytics}.tsx:5` | permanent block, «pre-existing i18n debt», без `@removeBy`                         |
| `no-raw-storage-key` block                   | 1                                                    | `apps/web/src/core/lib/chatActions/queryFinykActions.ts:1`                      | без sunset-дати                                                                    |

**Quick win:** `sergeant-design/ai-marker-syntax` стоїть `"warn"` (`eslint.baseline.js:194`)
з нотаткою «promote to error once clean». В source **0** `AI-LEGACY` маркерів →
безпечно підняти до `"error"`.

> **✅ Закрито 2026-06-13** (PR-D; верифіковано на поточній гілці) — `sergeant-design/ai-marker-syntax` уже `"error"` в `eslint.baseline.js:193` (promoted 2026-06-08, коментар фіксує `0 violations confirmed`). Gate-hardening застосовано.

**Lingering legacy-аліаси без `@removeBy` (дрібні, але «висять»):**

- `apps/server/src/env/env.ts:212` — `SLOW_QUERY_THRESHOLD_MS` «legacy alias of DB_SLOW_MS», але саме він і використовується (`db.ts:181`); `DB_SLOW_MS` мертвий. Консолідувати.
- `packages/shared/src/openapi/routes.ts:429,444` — push «legacy alias» endpoints, без дати.
- `apps/server/src/obs/metrics.ts:1132` — label `skipped` «legacy; kept for back-compat».

---

## Інфра / стек — інші знахідки (потребують рішення власника)

- **`start:replit` скрипти** (`package.json:23`, `apps/server/package.json:10`) — вмикають `SERVER_MODE=replit` що **вимикає CSP** (`security.ts:42`). ADR-0009 пішов від Replit. Replit ще ціль? Якщо ні — видалити (security-relevant).
- **`@types/node@^20`** override при runtime Node 22 (`pnpm-overrides.md` — «drop when workspaces pin Node 22»). + `Dockerfile.console` на Node 20 vs Node 22 baseline (api) vs Node 24 (gateway). Уніфікувати/підтвердити інтенцію.
- **`pino-loki`** wired у коді (`obs/lokiTransport.ts`), але залежить від `GRAFANA_CLOUD_LOKI_URL` (optional). Підтвердити чи активний у prod, інакше — мертвий шлях.
- **Renovate + можливий Dependabot** (`dependabot-automerge.yml` згадує `.github/dependabot.yml`) — перевірити чи нема дубльованих PR-ів.
- **`ci.yml:549`** — `TODO: Replace SHA` хоча SHA вже є й консистентний — зняти TODO.
- **`visual-regression.yml`** — disabled з 2026-06-02 (founder decision, 3 acceptance-критерії). Свідомо; тримати на радарі.
- **Scaffolded-but-not-wired (свідомо, Phase 2):** `ops/grafana-alloy/` (не deployed), `ops/posthog/` (manual import), local Prometheus без server recording-rules. Документовано — НЕ чистити, але мати на увазі що це «aspirational».
- **`plans/`** top-level (2 свіжі файли) — структурно дивно поряд із `docs/90-work/planning/`; розглянути перенесення.

---

## Свідома інфраструктура — НЕ чіпати

Щоб агенти не «почистили» зайве:

- Усі `@scaffolded` barrels (knip-ignored, Hard Rule #10).
- Усі `@removeBy 2026-09-01` tombstones (KV→SQLite migration; ще не настали — батч у вересні): `packages/shared/src/lib/storageKeys.ts` (31 ключ), `kvStore.ts`, `db-schema/.../migrations/index.ts` (SPIKE-аліаси, **активно імпортуються** `clientMigrate.ts`), Card/Settings/i18n/push deprecated props.
- 7 deprecated playbook-stubs (`Status: Deprecated`, 308-redirect, git-blame anchor, initiative 0009) — _можливо_ перенести в `archive/`, але це свідомо.
- Hash-compat shims (`HashRedirect.tsx`, module-router rewrites) — PWA back-compat для старих bookmarks.
- `packages/openclaw-plugin/src/legacy/` — свідомо retained per dead-code roast.

---

## Запропонований план (окремими PR-ами за класом боргу)

> `sergeant-tech-debt`: НЕ змішувати класи боргу в одному PR.

1. **PR-A `fix(config)` — battle stale `tools/console` (zero-risk, найбільший agent-clarity).** `eslint.baseline.js:131` → `tools/openclaw/tsconfig.json` + fixture-resnapshot; виправити stale-посилання в `onboarding.md:75`, `eslint-config.md:53/87/112`, коментарі. **Починати з цього.**
2. **PR-B `docs` — doc-hygiene статуси.** Архівувати/закрити Тему 2 (audits/initiatives/plans з 0 outstanding); полагодити `docs:gen-today` cadence; ADR-0058..0061 статуси; ADR-0003 price; ADR-0025↔0062 link.
3. **PR-C `chore(openclaw)` — частково закрито 2026-06-09:** Trivy-розширення вже landed (`120ec9d94`), але rename/service-catalog/commitlint частина все ще потребує окремої координації.
4. **PR-D `chore(eslint-plugins)` — promote `ai-marker-syntax` to error** + завести ініціативу react-hooks v7 cleanup (з тикетом і датою).
5. **Рішення власника (не код, окремо):** grammy/Locked-Decision-#17 reconcile (P0 — зняти дедлайн); Replit drop; Loki active?; Dependabot dup?; `@types/node` уніфікація.
6. **Відкладено на вересень:** `@removeBy 2026-09-01` tombstones — один батч.

## Рішення власника (узгоджено 2026-06-08)

- **Grammy / Locked Decision #17** — ✅ **закрити** (moot; код retained, дедлайн знято).
- **`console` rename** — ✅ **завершуємо** (in-repo done; фіз. deploy-файли — окремий Railway-крок).
- **Replit** — ✅ **прибрати** (більше не ціль деплою).
- **Stale-status audits** — ✅ **поштучно** (4 закрито з верифікацією, 4 borderline лишено).
