# ADR-0023: Turborepo as monorepo task runner

- **Status:** accepted
- **Date:** 2026-04-27
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`turbo.json`](../../turbo.json) — task-граф (`build`, `typecheck`, `lint`, `test`, `test:coverage`, `dev`).
  - [`package.json`](../../package.json) — root-скрипти, що делегують у `turbo run …`.
  - [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) — workspace-боундарі (`apps/*`, `packages/*`), які turbo "бачить" через pnpm-провайдер.
  - [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) — `TURBO_TOKEN` / `TURBO_TEAM` для remote-cache.
  - ADR-0024 — monorepo apps/packages split (структура, на якій працює task-граф).

---

## 0. TL;DR

Sergeant — pnpm-workspace монорепо з 5 apps і 10 packages. Як **task-runner**
поверх workspace ми використовуємо **Turborepo** (`turbo@^2.3.3`). Усі
кросс-пакетні команди (`build`, `typecheck`, `test`, `test:coverage`, `dev`)
проходять через `turbo run …`; локальні пакетні скрипти (`lint`, `format`)
викликаються через pnpm filters або зовнішні Node-скрипти, поза turbo-графом.

| Що використовуємо     | Чим саме                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Task-граф             | `turbo.json` → `dependsOn: ["^build"]` для `typecheck` / `test` / `test:coverage`                                      |
| Кеш                   | Локально — `.turbo/`; у CI — Vercel remote cache (`TURBO_TOKEN` / `TURBO_TEAM`), з graceful fallback на local-only     |
| Persistent dev        | `turbo run dev --parallel` (`cache: false`, `persistent: true`)                                                        |
| Що **не** через turbo | `lint` (turbo + 4 додаткові Node-скрипти ланцюжком у root `package.json#scripts.lint`), `format`, `licenses:*`, `db:*` |

Це **не** перехід на Nx, не perl-fast-script-runner, не raw pnpm `-r` для всього.

---

## Context and Problem Statement

Workspace із 5 apps + 10 packages дає кросс-пакетні залежності, які pnpm
сам по собі **не оркеструє**: коли `apps/web` залежить від `@sergeant/api-client`
і `@sergeant/shared`, `pnpm --filter @sergeant/web build` не білдить
залежності — він покладається на те, що ти попередньо зробив `pnpm -r build`
у правильному топологічному порядку.

З цього виростають конкретні болі (всі бачили на цьому репо до Turbo):

1. **Topological execution.** `pnpm typecheck` без оркестратора або біжить
   паралельно (і падає, бо `apps/web` ще не бачить нових типів з
   `@sergeant/shared`), або біжить серійно (і займає 6+ хвилин).
2. **Інкрементальний кеш.** Якщо ніщо в `@sergeant/finyk-domain` не змінилось,
   `pnpm --filter @sergeant/finyk-domain build` все одно перебудовує. На 9
   пакетах це 30–60 секунд щоразу.
3. **CI re-runs.** GitHub Actions без зовнішнього cache повторює всю роботу
   на кожному пуші, навіть якщо змінився один markdown-файл.
4. **`dev` mode.** Запустити одночасно `apps/web` (Vite dev) + `apps/server`
   (tsx watch) одним коренеговим скриптом без оркестратора — це або
   `concurrently` (зайвий dep), або 2 термінали.

Потрібен задачний-оркестратор з: (а) розумінням workspace-залежностей,
(б) інкрементальним кешем, (в) parallel + persistent режимами, (г) CI-friendly
remote cache.

## Considered Options

1. **Turborepo (`turbo@2`).** Vercel-розроблений, ESM-config (`turbo.json`),
   Go-runtime (швидкий), вбудована pnpm-інтеграція, remote cache на vercel.com
   або self-hosted, persistent tasks (`dev`). Зрілий екосистема, активний
   розвиток.
2. **Nx (`@nrwl/nx`).** Багатший за features (codegen, project-graph
   visualization, distributed task execution Cloud), але важчий: vendored CLI,
   `nx.json` + `project.json` per-package, додатковий plugin-layer.
   Орієнтований на enterprise-monorepo з 50+ пакетами.
3. **Raw `pnpm -r run <task>` + topological order.** Безкоштовно, без
   додаткових deps. Але немає кешу, немає persistent режиму, складна логіка
   "залежності перед собою" пишеться вручну.
4. **Lage / Lerna / Rush.** Lage — Microsoft, схожий до Turbo, менший
   ком’юніті. Lerna — застарів, основні фічі переїхали в pnpm-workspace.
   Rush — Microsoft, потужний, але vendored і складніший на старті.
5. **Just bash + `make`.** Як головний оркестратор — не серйозно для
   TypeScript-моноpepo цього розміру.

## Decision

**Turborepo (option 1).** `turbo@^2.3.3` встановлений як devDependency в root.
Task-граф у `turbo.json`:

```json
{
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".turbo/**"] },
    "typecheck": { "dependsOn": ["^build"], "outputs": [] },
    "lint": { "outputs": [] },
    "test": { "dependsOn": ["^build"], "outputs": [] },
    "test:coverage": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

Корінь делегує:

- `pnpm build` → `turbo run build`
- `pnpm typecheck` → `turbo run typecheck`
- `pnpm test` / `pnpm test:coverage` → `turbo run test{,:coverage}`
- `pnpm dev` → `turbo run dev --parallel`

Не через turbo (свідомо):

- `pnpm lint` — це **ланцюжок** з turbo + Node-скриптів:
  `turbo run lint && node scripts/check-imports.mjs && node tools/tsconfig-guard/check.mjs && pnpm lint:plugins && pnpm lint:tech-debt-freshness`.
  Custom-скрипти живуть у `scripts/` і не вписуються в задачний-граф (вони
  глобальні, перевіряють крос-пакетні інваріанти).
- `pnpm format` / `pnpm format:check` — Prettier на всю repo, не per-package.
- `pnpm licenses:*`, `pnpm db:migrate`, `pnpm strict:coverage` — generators
  / one-shots без cache-value.

**Remote cache** активується автоматично в CI коли `TURBO_TOKEN` + `TURBO_TEAM`
встановлені (Vercel cache; secrets у GitHub repo). Якщо не встановлені —
turbo тихо переключається на local-only cache (`.turbo/`). CI **не падає**
при відсутності remote cache (важливо для forks і external contributors).

## Rationale

**Чому turbo, а не Nx:** Sergeant має 13 пакетів, не 50. Nx-features
(codegen, project graph visualization, plugin ecosystem) — overkill, а
вартість (другий конфіг-файл per-package, vendored CLI, vendor lock-in)
реальна. Turbo дає 90% потрібного при 10% складності. Audit ([2026-04-26
Devin audit](../audits/2026-04-26-sergeant-audit-devin.md), пункт 10)
явно фіксує: "Power-up monorepo на Nx — Turbo вже добре працює на цьому
масштабі."

**Чому turbo, а не raw pnpm:** ключове — `dependsOn: ["^build"]`. Це одна
строка, що замінює власноруч-написану логіку топологічного порядку. Плюс
file-based incremental cache: повторні `pnpm typecheck` або `pnpm test`
без змін — instant-no-op.

**Чому Turbo 2 (а не 1):** Turbo 2 — major з листопада 2024:
єдиний `turbo.json` без legacy-key-shapes, "stream"-UI (`"ui": "stream"` у
конфігу), `dependsOn` без spec-mode-wrapping. Migration з 1.x — `turbo migrate`,
без runtime-changes. Worth it.

**Чому remote cache опційний:** open-source-маркер: external contributor
(або forked CI) не повинен мати Vercel-аккаунт, щоб PR пройшов. Local cache
все одно дає 80% користі для самого мейнтейнера на CI.

## Consequences

### Positive

- **Topological execution «з коробки».** `pnpm test` чи `pnpm typecheck`
  гарантує, що залежні пакети збилдяться першими (через `dependsOn:
["^build"]`).
- **File-based incremental cache.** Локально друга поспіль `pnpm typecheck`
  без змін — миттєва (cache HIT на всіх 13 пакетах). У CI з remote cache —
  такий самий ефект між workflow-ранами.
- **Persistent dev mode.** `pnpm dev` запускає `apps/web` (Vite) +
  `apps/server` (tsx watch) паралельно одним терміналом, через
  `--parallel` + `persistent: true`. Без `concurrently` deps.
- **CI feedback швидший.** На no-op-PR-ах turbo пропускає всі задачі за
  секунди, а не повторює build/test/typecheck.
- **Stream UI.** `"ui": "stream"` у конфігу дає nicely-streamed output
  (по-таскно), а не interleaved-mess. Логи кожної задачі легко виокремити.

### Negative

- **Один зовнішній runtime.** `turbo` — це Go binary, не plain Node-script.
  Якщо turbo впаде / repository втратить сумісність — повертатися до raw
  pnpm-loops. Mitigation: turbo достатньо стабільний (Vercel-product),
  active community, low risk.
- **Cache invalidation складніша за raw scripts.** `inputs`/`outputs` у
  `turbo.json` треба тримати правильними, інакше cache HIT-ить, коли не
  слід (помилки бачимо як "тести раптом не падають на чорній зміні"). На
  цьому розмірі repo — не проблема, але кеш-правила треба ревьюити при
  кожному додаванні нової задачі.
- **Vendor lock-in (м’який).** Remote cache hosted на Vercel. Self-hosted
  (e.g., `turbo-remote-cache` від Ducktors) — можливий вихід, але потребує
  окремого сервісу. На цей момент acceptable.
- **`lint` фрагментований.** `pnpm lint` не повністю всередині turbo (бо
  на 4 Node-скрипти зверху). Це не "правильний" turbo-style, але
  альтернатива (запхати всі custom-checks у turbo task) ускладнила б
  розуміння для нових контрибʼюторів. Tradeoff документовано тут.

### Neutral

- Turbo не керує самим pnpm-install-ом (це робить Renovate / `pnpm install`
  напряму). Граф починається з вже-встановлених `node_modules`.
- Turbo не запускає Husky / lint-staged — pre-commit живе в `.husky/`
  поза turbo-графом.
- `TURBO_TEAM=team_sergeant` (Vercel team), `TURBO_TOKEN` — secret. Setup
  у Vercel docs ([Remote Caching](https://turbo.build/repo/docs/core-concepts/remote-caching)).

## Compliance

- **`turbo.json` живий.** Зміни task-графу проходять через PR-ревʼю
  (codeowner — `@Skords-01`). Будь-який новий cross-package скрипт додається
  як task у `turbo.json`, а не як ad-hoc loop.
- **CI assert.** `.github/workflows/ci.yml` запускає `pnpm check`, який
  делегує в `turbo run …` для `build`/`typecheck`/`test`/`test:coverage`.
  Якщо turbo впаде з missing-cache-key — CI red.
- **No raw `pnpm -r run build` у root scripts.** Перевіряється ревʼю —
  немає ESLint-rule на це поки що (low-frequency surface; rule додамо, якщо
  drift почне траплятися).

## Links

- [Turborepo docs — task graph](https://turbo.build/repo/docs/crafting-your-repository/configuring-tasks)
- [Turborepo docs — remote caching](https://turbo.build/repo/docs/core-concepts/remote-caching)
- [`docs/audits/2026-04-26-sergeant-audit-devin.md`](../audits/2026-04-26-sergeant-audit-devin.md) — пункт 10 ("Turbo вже добре працює на цьому масштабі").
