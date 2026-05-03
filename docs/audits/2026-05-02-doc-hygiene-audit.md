# Sergeant — doc-hygiene аудит (2026-05-02)

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.
> **Status:** Active

> Аудит виконано 2026-05-02 проти `main @ b7c629dd`. Стиль: прохід зверху-вниз, без правок коду. Фікси (ADR-0029-gap rule, audit lifecycle, agent file unification) реалізовані у PR `docs(hygiene): close audit findings — ADR gap rule, audits lifecycle, agent files`.

## TL;DR

- Структура **здорова і зріла**: pnpm + Turbo monorepo з чітко розділеними `apps/*` та `packages/*`, ADR-and-playbook governance, freshness-gates, hard-rules registry, knip + ts-prune dead-code сканери. Є власний ESLint plugin для design-rules.
- Основні проблеми — **дрейф у docs**, не в коді: ADR має пропуск номера (`0029`), README ADR має stale claim про «наступний номер», `docs/audits/` тримає поверх-перетину UX-документи без чіткого lifecycle, а `CLAUDE.md` / `DEVIN.md` майже клони.
- Мертвого коду фактично нема — все, що `knip` ловить як «no importers», явно помічене `@scaffolded` JSDoc-ом і це enforced Hard Rule #10.
- Кілька допоміжних скриптів — або разові codemods, або один-раз-перевикорстання, які можна або видалити, або перенести у `scripts/codemods/` із markdown-описом.

---

## 1. Структура верхнього рівня

### Що добре

- `apps/{web, server, mobile, mobile-shell, console}` + `packages/{shared, api-client, config, db-schema, design-tokens, finyk-domain, fizruk-domain, nutrition-domain, routine-domain, insights, eslint-plugin-sergeant-design}` — чисте розділення runtime-сервіси vs shared logic, точно як описано в [`docs/adr/0024-monorepo-apps-packages-split.md`](../adr/0024-monorepo-apps-packages-split.md).
- `pnpm-workspace.yaml` лаконічний (`apps/*` + `packages/*`), `turbo.json` мінімалістичний, всі package-name прив'язані до `@sergeant/*`-namespace окрім `eslint-plugin-sergeant-design` (за конвенцією ESLint).
- `.agents/skills/` (12 SKILL.md) + `docs/superpowers/agent-skills-catalog.md` мають deprecated→replacement-таблицю — добре читається.

### Що варто почистити

| #   | Що                                                                                                                                    | Чому                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | **8 markdown-файлів у root** (`README`, `AGENTS`, `CHANGELOG`, `CLAUDE`, `CONTRIBUTING`, `DEVIN`, `SECURITY`, `THIRD_PARTY_LICENSES`) | Норма для monorepo, але `CLAUDE.md` ↔ `DEVIN.md` майже клони (4 формальні рядки різниці). Розв'язано у doc-hygiene PR через перевід у thin-pointer-формат — обидва тепер посилаються на `AGENTS.md` і тримають лише agent-specific bullets.                                                         |
| 1.2 | **`AGENTS.md` — 752 рядки / 70KB**                                                                                                    | Це найбільший repo-policy doc. Усе в ньому **варто** мати, але читачі-агенти не можуть його повністю утримати в контексті без фрагментації. Hard Rules (1–17) разом з шукаються найчастіше — їх можна винести в окремий `docs/governance/hard-rules.md` (не вирішено в цьому PR; medium-task у §5). |
| 1.3 | **Дублікат «next review» дат**                                                                                                        | README.md, AGENTS.md, docs/README.md, docs/postmortems/README.md, docs/governance/README.md, docs/playbooks/README.md мають один і той самий `Last validated: 2026-05-02 by @claude` — не баг, але видно що це bulk-bump, не реальна ревалідація.                                                   |

---

## 2. Документація

### 2.1 ADR — пропуск номера 0029 (РОЗВ'ЯЗАНО)

**Проблема:** `docs/adr/` має `0001…0028, 0030, 0031`. Між ними немає 0029.

- `docs/adr/README.md:103` каже:
  > «ADRs нумеруються **sequentially without gaps** надалі — наступний номер `0031`.»
- Але `0031-openclaw-v0-telegram-cofounder.md` вже існує (created 2026-05-02). Stale claim.
- `scripts/docs/check-adr-graph.mjs` ловив status / Supersedes / README-membership consistency, але **не gap у sequential numbering**. Тому пропуск пройшов через CI.

**Розв'язано (цей PR):**

- Додано `KNOWN_NUMBERING_GAPS = new Set(["0029"])` у `scripts/docs/check-adr-graph.mjs`. 0029-кандидат був згорнутий в ADR-0028 під час рев'ю, а ADR-0030/0031 створено в паралельних сесіях того ж дня.
- Додано `findNumberingGaps()` функцію + правило #6 у `validateGraph()` — будь-який новий gap, не whitelisted, fail-ить CI.
- Оновлено нотатку «Note on missing 0029» у `docs/adr/README.md` з повним поясненням.
- Додано unit-тести у `scripts/docs/__tests__/check-adr-graph.test.mjs` для gap-rule та KNOWN_NUMBERING_GAPS allowlist.

### 2.2 Audit-перетин у `docs/audits/`

Файли:

- `2026-04-26-sergeant-audit-devin.md` (61 KB) — Devin audit
- `2026-04-28-sergeant-comprehensive-audit.md` (25 KB) — комплексний аудит
- `2026-04-28-implementation-roadmap.md` (31 KB) — план виконання
- `UX-UI-AUDIT-2026.md` (30 KB) — UX/UI 2026
- `UX-IMPROVEMENT-PLAN.md` (28 KB) — техплан UX
- `typography-2026-04-audit.md` (1.3 KB) — typography
- `ux-audit-2025.md` (15 KB) — UX 2025 («архівний» за README, але **не** в `archive/` директорії)

**Розв'язано (цей PR):**

- Додано `Status` стовпчик у `docs/audits/README.md` (Active / Closed / Archived) разом із Lifecycle-секцією, що пояснює семантику.
- `ux-audit-2025.md` фізично перенесено в `docs/audits/archive/`, його `Status: Active` оновлено на `Status: Archived`, додано блок-нотатку про перенесення.
- Закриті аудити (`2026-04-26-*`, `2026-04-28-comprehensive-*`, `UX-UI-AUDIT-2026`) позначено як `Closed`; активні трекери (`*-implementation-roadmap`, `UX-IMPROVEMENT-PLAN`, `typography-2026-04-audit`) — `Active`.
- Шлях `docs/audits/ux-audit-2025.md` → `docs/audits/archive/ux-audit-2025.md` оновлено в `scripts/docs/freshness-config.json` і у прикладі в `docs/governance/doc-freshness.md`.

### 2.3 `CLAUDE.md` vs `DEVIN.md` — клони (РОЗВ'ЯЗАНО)

Diff показав 4 різниці, всі формальні (заголовок секції, browser smoke vs verification commands, список «канонічних посилань»).

**Розв'язано (цей PR):** обидва файли переведено у thin-pointer-формат. Кожен починається з `> See [AGENTS.md](./AGENTS.md) — single source of truth.`, тримає лише 4–5 agent-specific bullets (Claude → skill catalog priority; Devin → playbook taxonomy + browser smoke). Загальна політика тепер живе виключно в `AGENTS.md`.

### 2.4 Документація без freshness-header

Тільки 3 файли поза whitelist'ом не мають freshness-header:

- `docs/adr/**` — свідомо виключені (immutability, описано в `doc-freshness.md`). OK.
- `docs/playbooks/_TEMPLATE-decision-tree.md` — це template, OK.
- `docs/postmortems/TEMPLATE.md` — template, OK.

Все інше має header. Це **дуже добре**.

### 2.5 Stale claims у docs

| Файл                              | Stale claim                                                                                                                                                                               | Статус                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `docs/adr/README.md:103`          | «наступний номер `0031`» — реально 0032                                                                                                                                                   | Розв'язано                  |
| `docs/audits/README.md`           | каже `ux-audit-2025.md` «архівний», але файл не в archive/ і має `Status: Active`                                                                                                         | Розв'язано                  |
| `docs/audits/UX-UI-AUDIT-2026.md` | "Дата аудиту: 28 квітня 2026" + "Дата оновлення: 2 травня 2026" + `Last validated: 2026-05-02` — три параметри дат у різних місцях шапки. Краще канонізувати під єдиний freshness-header. | Не розв'язано (medium-task) |

### 2.6 Empty postmortems index

`docs/postmortems/INDEX.md` має валідну структуру + freshness, але рядок «No published postmortems yet». Розглянуто і залишено без змін: empty-state-таблиця з посиланням на TEMPLATE — це інтенціональний onboarding-сигнал, не bloat. Якщо incidents справді не було — це bonus.

---

## 3. Мертвий код / невикористані файли

### 3.1 «No-importers» у `apps/web/src/shared/...` — не мертві, **scaffolded**

Knip-команда `dead-code:files` (по правилам `knip.json` + scaffolded-honour-у) поверне:

- `apps/web/src/shared/components/ui/PullToRefreshIndicator.tsx`
- `apps/web/src/shared/components/ui/EmptyStateIllustrations.tsx`
- `apps/web/src/shared/components/ui/OptimizedImage.tsx`
- `apps/web/src/shared/hooks/usePullToRefresh.ts`

**Усі чотири мають коректний `@scaffolded` JSDoc + `@nextStep` посилання** (Hard Rule #10). Це не мертвий код — це навмисно-зацементована UI-каркасія, яка чекає на consumer. **Не видаляти.** Це саме той кейс, про який AGENTS.md попереджає від PR #1143-стилю помилки.

### 3.2 Скрипти зі статусом «використовуються лише вручну»

`strip-js-extensions` codemod (одноразовий міграційний інструмент, був у `scripts/`). Згадується тільки в `docs/tech-debt/frontend.md`. Не дзвонять з `package.json` чи CI.

**Опції:**

- (a) Перенести у `scripts/codemods/` з README.md в директорії.
- (b) Видалити, якщо codemod вже виконано (треба перевірити `frontend.md`).

> **Виконано (PR follow-up до цього аудиту):** обрано опцію (a). Codemod перенесено в [`scripts/codemods/strip-js-extensions/script.mjs`](../../scripts/codemods/strip-js-extensions/script.mjs); додано директорійний README та каталог [`scripts/codemods/README.md`](../../scripts/codemods/README.md), який описує конвенцію для майбутніх codemod-ів.

`scripts/vitest.mjs` — wrapper навколо vitest, який strip-ить `--max-old-space-size` з NODE_OPTIONS. Теж не пов'язано з `package.json` scripts напряму.

**Опції:** (a) переконатись, що це використовується через якийсь VSCode workspace task / .replit / external runner, або (b) видалити якщо мертвий.

`scripts/docs/freshness-config.mjs` — це config-loader, його використовує `check-freshness.mjs`. **Не мертвий**, просто не запускається напряму.

`scripts/ci/pipeline-duration-p95.test.mjs`, `scripts/ci/posthog-release-annotation.test.mjs`, `scripts/ci/vitest.config.mjs` — test-файли. Запускаються через `vitest` за конфігом, не напряму. **Не мертві**, але грамотніше було б додати в `package.json` явний `scripts/ci/test` алиас.

### 3.3 Структурно

- `docs/notes/spikes/routine-sqlite-v2.md` — лише один spike. Якщо це паттерн (плани мати кілька spike-ів), залишити. Якщо це one-off, можна перенести в `docs/planning/storage-roadmap.md` як inline-секцію.
- `docs/api/` — 1 файл (`README.md` + `openapi.json`). OK як generated artifacts container, але якщо плануєте генерувати ще docs API — варто розширити структуру.

---

## 4. Workflows / CI

19 workflow files у `.github/workflows/`:

- `ci.yml`, `nightly-audit.yml`, `container-scan.yml` — core build/test/security.
- `mobile-shell-{android, ios}.yml` + `*-release.yml` — mobile pipelines (4 файли).
- `detox-{android, ios}.yml` — E2E tests.
- `extended-e2e.yml`, `visual-regression.yml`, `flaky-tests-dashboard.yml` — quality gates.
- `docs-automation.yml`, `docs-freshness.yml`, `skill-freshness.yml` — docs governance.
- `ai-legacy-scan.yml`, `security-sla-reminder.yml` — temporal hygiene.
- `posthog-release-annotation.yml`, `typescript-next.yml` — observability + future-proof.

**Спостереження:**

- Дуже потужна CI-картина. 19 workflow — на межі складності, але кожен має чітку мету. Не вижимати без причин.
- `typescript-next.yml` — workflow для тестування TS-next версії (поки в repo TS 6 + tsx; перевірити, чи це тимчасовий смок-канал — перевірити, чи його ще треба, бо в `package.json` вже зафіксований `^6.0.3`).

---

## 5. Конкретні `pickup-tasks` (від найшвидших)

### Quick wins — РОЗВ'ЯЗАНО у цьому PR

1. ✓ **ADR README**: фікс `наступний номер 0031` → `0032` + опис gap для 0029.
2. ✓ **`docs/audits/README.md`**: додано `Status` стовпчик + Lifecycle-секція; `ux-audit-2025.md` перенесено в `archive/`.
3. ✓ **`CLAUDE.md` / `DEVIN.md`**: переведено у thin-pointer-формат (See AGENTS.md + agent-specific bullets).
4. ✓ **`check-adr-graph.mjs` rule #6**: «sequential numbering — no gaps» з whitelist для resolved collisions.

### Medium (1–3 год) — не в скоупі цього PR

5. **Розбити `AGENTS.md`** на:
   - `AGENTS.md` (180–250 рядків): index + repo overview + ownership map + verification.
   - `docs/governance/hard-rules.md` (вже існує `hard-rules-matrix.md` як generated index — додати full text, single-source-of-truth, який матриця посилається на нього).
   - Усі ESLint-/Tailwind-rule-detalі лишити в hard-rules.md, AGENTS.md тримає тільки rule numbers + 1-line summary.
6. **`UX-UI-AUDIT-2026.md` дати** — канонізувати під єдиний freshness-header (зараз 3 параметри в шапці).

### Larger (≥3 год) — не в скоупі цього PR

7. **Скрипти**: ревізія `scripts/` — все, що не запускається з `package.json` чи `.github/workflows/`, або має чіткий ad-hoc-comment, або вилучається. Якщо це codemod — перенести у `scripts/codemods/<name>/{script.mjs, README.md}`.

---

## 6. Що **не** треба чіпати

- `apps/*` структура — здорова, кожна app має зрозумілу межу.
- `packages/*` namespace + boundary rules — добре enforced ADR-0024.
- `.husky/` + `lint-staged` + `prettier` + commitlint setup — еталонний.
- Hard Rules registry (`docs/governance/hard-rules.json` + matrix + AGENTS.md) — найкраще, що я бачив у зрілому monorepo.
- Lifecycle markers (`@scaffolded`, `@deprecated`, `@experimental`, `AI-LEGACY: expires …`) + їхнє enforcement — приклад для інших проєктів.
- `.agents/skills/` ecosystem + routing catalog — добре спроектований, deprecated→replacement-таблиця прибрана.

---

## Підсумок

Репо — у топовому стані для `Sergeant`-розміру monorepo, з суттєво вище-середнього інженерною культурою (governance, hard-rules, freshness, ADR). Quick-wins з doc-hygiene закрито у цьому PR. Medium/larger-tasks (`AGENTS.md` split, scripts review) винесено у follow-up.

Мертвого коду фактично нема — система вже захищена `@scaffolded`-маркерами + knip + ts-prune.
