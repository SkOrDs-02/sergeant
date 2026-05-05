# 0009 — Agent-OS hardening: skill enforcement, governance slimming, лінтери проти дрейфу

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-03.
> **Status:** In progress (Phase 1 — 5/5 core PR merged: [#1659](https://github.com/Skords-01/Sergeant/pull/1659) skills-lint, [#1660](https://github.com/Skords-01/Sergeant/pull/1660) Hard Rules categorization, [#1670](https://github.com/Skords-01/Sergeant/pull/1670) playbook-schema extension, [#1672](https://github.com/Skords-01/Sergeant/pull/1672) playbook-language warn-only linter, [#1821](https://github.com/Skords-01/Sergeant/pull/1821) PR 1.3 Husky `tsc-files` pre-commit gate (мерджнуто 2026-05-05, commit `7c80774f`). PR 1.2b — backfill EN-only playbook'ів — 4 batches merged: [#1772](https://github.com/Skords-01/Sergeant/pull/1772) `add-hard-rule.md`, [#1799](https://github.com/Skords-01/Sergeant/pull/1799) `write-postmortem.md`, [#1825](https://github.com/Skords-01/Sergeant/pull/1825) `add-feature-flag.md`, [#1826](https://github.com/Skords-01/Sergeant/pull/1826) `cleanup-dead-code.md` (мерджнуто 2026-05-05, commits `71ba4f3f` + `baed8aca`). Phase 2 — 2/4 merged 2026-05-04: [#1684](https://github.com/Skords-01/Sergeant/pull/1684) `docs/superpowers/` → `docs/agents/` rename, [#1705](https://github.com/Skords-01/Sergeant/pull/1705) PR 2.3 release-\* консолідація. PR 2.1 — specialists ↔ skills mapping — відкрито [#1687](https://github.com/Skords-01/Sergeant/pull/1687). PR 2.4 — access-\* консолідація — відкрито [#1707](https://github.com/Skords-01/Sergeant/pull/1707) (rebased on `main` after PR 2.3 merge). Phase 3 — PR 3.1 (demote design rules) — відкрито [#1725](https://github.com/Skords-01/Sergeant/pull/1725); PR 3.3 (slim `.env.example` + `docs/integrations/env-vars.md` reference) — відкрито [#1775](https://github.com/Skords-01/Sergeant/pull/1775). Phase 4 — 3/3 merged 2026-05-04: [#1785](https://github.com/Skords-01/Sergeant/pull/1785) PR 4.1 Renovate maintainer runbook (`docs/ops/renovate.md`), [#1788](https://github.com/Skords-01/Sergeant/pull/1788) PR 4.3 workflow audit + Owner block у 26 workflow-файлах (мерджнуто `67ba6b0b`), [#1795](https://github.com/Skords-01/Sergeant/pull/1795) PR 4.2 knip-only dead-code (мерджнуто `e7592f71`). Phase 5 — 2/3 merged: [#1796](https://github.com/Skords-01/Sergeant/pull/1796) PR 5.1 Plop `new-skill` + `new-playbook` generators (мерджнуто 2026-05-04, commit `0a9dff6a`); [#1828](https://github.com/Skords-01/Sergeant/pull/1828) PR 5.1b Plop `new-package` generator (мерджнуто 2026-05-05, commit `15e1089f`). PR 5.2 (`docs/agents/onboarding.md`) — відкрито [#1728](https://github.com/Skords-01/Sergeant/pull/1728).)
> **Priority:** P1 (Sprint 2–3)
> **Owner:** `@Skords-01`
> **ETA:** 4 weeks (фази 1–4 послідовно, фаза 5 — паралельно або як carry-over)
> **Sources:** Devin agent-OS review 2026-05-04 (внутрішній звіт-прожарка), [`AGENTS.md`](../../AGENTS.md), [`docs/agents/`](../agents/), [`docs/playbooks/`](../playbooks/)

## Поточний прогрес

| Фаза | PR     | Опис                                           | Гілка/PR                                                                                                                                                                                                                                  | Статус                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | ------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.1  | merged | `pnpm lint:skills` + skills-lock SHA256        | [#1659](https://github.com/Skords-01/Sergeant/pull/1659)                                                                                                                                                                                  | Мерджнуто 2026-05-04 (commit `e3529e0a`). Поставлено: `scripts/check-skill-shape.mjs`, `scripts/check-skills-lock.mjs`, `pnpm lint:skills`, `pnpm skills:lock`, реальні SHA-256 для 12 skill-ів, `Playbooks` секції в 8 SKILL.md.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 1.2a | merged | `pnpm lint:playbook-language` (UA, warn-only)  | [#1672](https://github.com/Skords-01/Sergeant/pull/1672)                                                                                                                                                                                  | Мерджнуто 2026-05-04 (commit `11bebf8`). Лінтер `scripts/check-playbook-language.mjs` (Cyrillic ratio ≥ 0.4 + `lang: en` opt-out) + 24 unit tests; інтеграція в `pnpm lint` і `docs-automation.yml` у `--warn-only`. Базова warn-list: 21 EN playbook + 12 EN SKILL.md — є входом для 1.2b.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 1.2b | open   | Backfill EN-only playbook'ів і SKILL.md        | [#1772](https://github.com/Skords-01/Sergeant/pull/1772) + [#1799](https://github.com/Skords-01/Sergeant/pull/1799) + [#1825](https://github.com/Skords-01/Sergeant/pull/1825) + [#1826](https://github.com/Skords-01/Sergeant/pull/1826) | Відкрито 2026-05-04, 4 batches merged. 1-й batch [#1772]: `docs/playbooks/add-hard-rule.md` перекладено на українську (Cyrillic ratio ~0.55) — приклад секцій: `## Trigger`, `## Goal`, `## Why this matters`, decision-tree з UA-glossary; технічні токени (CLI команди, JSON ключі, файлові шляхи, Hard Rule ID) збережено EN. 2-й batch [#1799]: `docs/playbooks/write-postmortem.md` перекладено (cyrillic 0 → ratio ≥0.40, single-file diff); технічні токени (`SEV1`/`SEV2`, `root cause`, `action item`, `INDEX.md`) збережено EN; structural identifiers (`## Owner surface`, `## Verification`) preserved per schema gate. 3-й batch [#1825] (мерджнуто 2026-05-05, commit `71ba4f3f`): `docs/playbooks/add-feature-flag.md` перекладено — code examples (Postgres `INSERT`, server `featureFlags` API, web `useFlag`, vitest fixture) preserved verbatim; 5 кроків + Verification checklist + Notes у UA prose. 4-й batch [#1826] (мерджнуто 2026-05-05, commit `baed8aca`): `docs/playbooks/cleanup-dead-code.md` перекладено — JSDoc маркери (`@scaffolded`, `@deprecated`, `@experimental`, `@removeBy`) і bash recipes (`rg`, `grep`) збережено EN; 10 кроків + Step 0 lifecycle markers + Tools + Notes у UA prose; cross-refs на AGENTS.md + PR #1143 збережено. `pnpm lint:playbook-language` warn-list дропнувся 35 → 32. Залишок: 12 EN playbook'ів + 12 EN SKILL.md — наступні batch'і. Може йти паралельно з фазою 2. |
| 1.2c | TBD    | Перемикання `lint:playbook-language` у gate-ON | —                                                                                                                                                                                                                                         | Не розпочато. Прибрати `--warn-only` після завершення 1.2b.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 1.3  | merged | Husky pre-commit `tsc-files`                   | [#1821](https://github.com/Skords-01/Sergeant/pull/1821)                                                                                                                                                                                  | Мерджнуто 2026-05-05 (commit `7c80774f`). `lint-staged` отримав другий pipeline для `*.{ts,tsx}` → `node scripts/staged-typecheck.mjs`. Скрипт-врапер групує staged TS-файли за найближчим `tsconfig.json` (apps/web, apps/server, packages/\*…) і викликає `tsc-files --noEmit --skipLibCheck` під cwd кожного sub-project — це уникнення повного `pnpm typecheck` (16 турбо-task-ів) на кожен коміт. На гарячому кеші проходить за 3–8 сек на 10–20 staged файлів; на холодному (після `git pull` зі змінами в `node_modules` або `tsconfig`) — 15–30 сек. CONTRIBUTING.md «Pre-commit hooks» секція описує pipeline-таблицю + cost-budget. Pre-existing TS-помилки на `main` (`#1572`-fallout: server-сторона `8ae5caba`, web-сторона `7518734e`) уже зафіксовано до мерджу — `pnpm typecheck` 16/16 task-ів 0 errors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 1.4  | merged | `playbook-schema` extension                    | [#1670](https://github.com/Skords-01/Sergeant/pull/1670) + fix [#1676](https://github.com/Skords-01/Sergeant/pull/1676)                                                                                                                   | Мерджнуто 2026-05-04 (commit `a26ae6e`). Schema гейт тепер вимагає `## Owner surface` + `Governing skill:`, `## Verification` ≥1 чекбокс, `**Trigger:**` ≤ 240 chars. Backfill на 22 playbook'и + `_TEMPLATE-decision-tree.md`. PR #1676 — follow-up з фіксом `apps/web/src/core/App.tsx` шляху на `add-new-page-route.md` (governance-sync false-positive).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 1.5  | merged | Hard-rules categorization                      | [#1660](https://github.com/Skords-01/Sergeant/pull/1660)                                                                                                                                                                                  | Мерджнуто 2026-05-04 (commit `549b0dd2`). Додано required-поле `category` (`blocker-invariant` / `lint-enforced-convention` / `active-initiative`) у `hard-rules.json` + schema; новий стовпець + Category legend у `hard-rules-matrix.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2.1  | open   | Specialists ↔ skills mapping                   | [#1687](https://github.com/Skords-01/Sergeant/pull/1687)                                                                                                                                                                                  | Відкрито 2026-05-04. Новий `docs/agents/specialists-mapping.md` (11 SpecialistAgent → governance skill + primary playbook + ADR; 3 `extra` без 1:1 skill); JSDoc `@see` коментарі в `tools/console/src/agents/dispatcher.ts`; primer-и в `personas.ts` посилаються на skills. Status callback rendering — як follow-up (PR 2.1b).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2.2  | merged | `docs/superpowers/` → `docs/agents/`           | [#1684](https://github.com/Skords-01/Sergeant/pull/1684)                                                                                                                                                                                  | Мерджнуто 2026-05-04 (commit `3edf244e`). `git mv` перейменував 5 файлів; оновлено ~30 референсів (AGENTS.md, CLAUDE.md, DEVIN.md, README.md, docs/README.md, CONTRIBUTING.md, 12 SKILL.md, scripts, console code, audits, ops, CODEOWNERS). `docs/agents/README.md` перефреймено з “Superpowers” на “Agents” з явною роздільною від product-side AI.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2.3  | merged | Merge `release-*` playbooks                    | [#1705](https://github.com/Skords-01/Sergeant/pull/1705)                                                                                                                                                                                  | Мерджнуто 2026-05-04 (commits `e8ca5bda` + `571ee6c1`). Новий `docs/playbooks/release.md` з `flowchart TD` decision tree і трьома секціями (Web + API, Mobile shell (Capacitor), Expo). Старі 3 файли — `Status: Deprecated` + `Superseded by:` лінк (не вилучено для git blame). Оновлено specialists-mapping, service-catalog, release-policy, playbook-catalog, INDEX, 4 SKILL.md, skills-lock.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2.4  | open   | Merge `access-*` playbooks                     | [#1707](https://github.com/Skords-01/Sergeant/pull/1707)                                                                                                                                                                                  | Відкрито 2026-05-04. Новий `docs/playbooks/access-governance.md` з `flowchart TD` decision tree і чотирма секціями (Grant, Revoke, Periodic review, Suspected compromise; Q2 рутить revoke → compromise за ознакою компромісу). Старі 4 файли — `Status: Deprecated` + `Superseded by:` лінк. Оновлено access-policy, security-incident-policy, specialists-mapping, playbook-catalog, INDEX, README, better-auth-best-practices SKILL.md, skills-lock. Перебазовано на `main` після мерджу PR 2.3 — конфлікти в `INDEX.md` / `playbook-catalog.md` / `specialists-mapping.md` вирішено вручну (об'єднано `release.md` + `access-governance.md` рядки в одну канонічну таблицю). Окремий CI-розблокувач: [#1719](https://github.com/Skords-01/Sergeant/pull/1719) — скоротити Trigger у `deploy-config-change.md` з 275 → 236 chars.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 3.1  | open   | Демоутити дизайн-конвенції з Hard Rules        | [#1725](https://github.com/Skords-01/Sergeant/pull/1725)                                                                                                                                                                                  | Відкрито 2026-05-04. AGENTS.md розщеплено: § Hard rules (12 правил: 6 blocker-invariant + 5 lint-enforced non-design + 1 active-initiative) і новий § Lint-enforced design conventions (#11–#14, #16, #17). `id` стабільні в обох розділах і `hard-rules.json`. ADR-0045 «Hard Rules taxonomy» фіксує семантику категорій. `scripts/check-hard-rules-registry.mjs` тепер сінкує обидві секції. Acceptance criteria: «≤ 6 blocker-invariants у Hard rules» виконано.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 3.2  | TBD    | AGENTS.md slim (≤ 150 LOC core)                | —                                                                                                                                                                                                                                         | Залежить від 3.1 (taxonomy + per-rule структура). Не розпочато.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 3.3  | open   | Slim `.env.example` + повний reference         | [#1775](https://github.com/Skords-01/Sergeant/pull/1775)                                                                                                                                                                                  | Відкрито 2026-05-04. `.env.example` сплющено з 200 → 19 LOC (12 required для quick-start: Postgres URL, JWT, NextAuth secret, Better-Auth, base URLs). Новий `docs/integrations/env-vars.md` (484 LOC, UA prose) описує всі ~109 змінних у 21 секції за фічею (LLM, Voice, Telegram, Mono, Storage, Email, Bull/Queue, AI quotas, Mobile, Console, Observability, тощо). Кожна змінна: тип, default, де читається, як зареєструвати ключ, fail-mode (5xx/quiet downgrade/skip). README + `docs/agents/onboarding.md` оновлено з лінком на новий reference. `pnpm lint`, `pnpm docs:check-links` (без нових introduced broken links) ОК. Acceptance: `.env.example` ≤ 30 LOC ✅; reference містить блок для кожної змінної ✅.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 4.1  | merged | Renovate maintainer runbook                    | [#1785](https://github.com/Skords-01/Sergeant/pull/1785)                                                                                                                                                                                  | Мерджнуто 2026-05-04 (commit `3be422a2`). Новий `docs/ops/renovate.md` (UA prose, Status: Active) — operational runbook: розподіл ролей з Dependabot per [ADR-0044](../adr/0044-renovate-vs-dependabot.md), Monday routine 8:00-8:30 Europe/Kyiv, monthly hygiene checklist (1-й Mon місяця), triage decision tree (mermaid), Mend Renovate downtime escalation, security-PR handling (MTTR ≤ 24h). Cross-refs на `renovate.json`, `.github/dependabot.yml`, `dependabot-automerge.yml`, `renovate-usage.md`, `H2-dependabot.md`. Scope adjustment: оригінальний PR 4.1 передбачав вилучення Dependabot, але ADR-0044 (Option 3) лишає обидва з різними scope — runbook документує співіснування.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 4.2  | merged | Dead-code: knip-only                           | [#1795](https://github.com/Skords-01/Sergeant/pull/1795)                                                                                                                                                                                  | Мерджнуто 2026-05-04 (commit `e7592f71`). Скрипти `dead-code:packages` (ts-prune wrapper) і `depcheck:all` видалено з `package.json`; dev-deps `ts-prune` + `depcheck` теж знесено; `scripts/ts-prune-packages.mjs` deleted; `knip.json` `ignoreDependencies: ["ts-prune"]` прибрано. `docs/playbooks/cleanup-dead-code.md` Tools section перепроставлено: knip — єдиний source of truth; додано посилання на `pnpm dead-code:files` (`@scaffolded`-aware wrapper). CI gate flip-on (`pnpm knip` як required check) свідомо відкладено в окремий follow-up PR 4.2b — на main ~30 pre-existing knip findings (default-exported router pages + duplicate aliases + 20 config hints), які треба тріажити окремою діффо. Acceptance criteria #1 (`pnpm knip` clean) виконається після 4.2b; #2 (3 dead-code tools → 1) виконано в цьому PR.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 4.3  | merged | Workflow audit + Owner block                   | [#1788](https://github.com/Skords-01/Sergeant/pull/1788)                                                                                                                                                                                  | Мерджнуто 2026-05-04 (commit `67ba6b0b`). Audit показав, що suggested schedule changes з ініціативного документа уже застосовані на main (`shell-tax-report` schedule, `flaky-tests-dashboard` schedule, `typescript-next` canary-only-on-tsconfig). 26/26 workflow-файлів отримали уніфікований `# Owner: @Skords-01 / Triage / Schedule rationale` коментар-блок. Acceptance criteria #2 (documented owner per workflow) виконано; #1 (CI median minutes -15%) потребує post-merge baseline (2-тижневе вікно через GH Actions billing API).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 5.1  | merged | Plop generators (skill, playbook, n8n, …)      | [#1796](https://github.com/Skords-01/Sergeant/pull/1796)                                                                                                                                                                                  | Мерджнуто 2026-05-04 (commit `0a9dff6a`). Перший batch: два генератори `pnpm gen new-skill` (пише `.agents/skills/<slug>/SKILL.md` + одразу додає SHA-256 entry в `.agents/skills-lock.json` — `pnpm lint:skills` ОК на першому ж пуші) і `pnpm gen new-playbook` (пише `docs/playbooks/<slug>.md` із повною schema: H1, freshness, Status, Trigger ≤ 240 chars, Owner surface + Governing skill, Verification з чекбоксами; `Next review` = today + 90 days). UA-default body; `lang: en` opt-out у frontmatter. Smoke-tested через `node-plop` programmatic API (`pnpm docs:check-playbook-schema` зелений на згенерованому артефакті). `CONTRIBUTING.md` отримує нову секцію «Generators» з повним каталогом. Решта 2 генератори зі специфікації — `new-n8n-workflow`, `new-console-specialist` — винесені в окремі follow-up PR (різні поверхні: n8n schema / console agent registry — кожна заслуговує власного diff).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 5.1b | merged | Plop `new-package` generator                   | [#1828](https://github.com/Skords-01/Sergeant/pull/1828)                                                                                                                                                                                  | Мерджнуто 2026-05-05 (commit `15e1089f`). `pnpm gen new-package` — інтерактивний промпт (slug kebab-case + `existsSync` валідація проти існуючих `packages/<slug>`, description ≤200 chars, kind `lib`/`react`, owner GitHub handle); скеффолдить `packages/<slug>/{package.json (з `@sergeant/<slug>`+ workspace`:\*`deps), tsconfig.json (extends base або react-варіант), vitest.config.ts (mirrors`@sergeant/insights` pattern), src/index.ts (UA doc-block + stub export), src/index.test.ts (одна passing assertion), README.md (UA, freshness header, Що всередині / Використання / Тести / Наступні кроки)}`. Custom action `appendPackageCodeowner` вставляє `/packages/<slug>/  @<owner>` у `.github/CODEOWNERS` алфавітно в `/packages/...` блок (idempotent, не дублює існуючий запис) — тримає `pnpm lint:codeowners` зеленим одразу після генерації. Smoke-tested локально: згенерований `@sergeant/smoke-test-pkg` пройшов `pnpm typecheck` + `pnpm lint` + `pnpm test`. `CONTRIBUTING.md` `Generators` блок розширено новим рядком.                                                                                                                                                                                                                                                                                                                                                                                        |
| 5.2  | open   | `docs/agents/onboarding.md`                    | [#1728](https://github.com/Skords-01/Sergeant/pull/1728)                                                                                                                                                                                  | Відкрито 2026-05-04. Новий `docs/agents/onboarding.md` (UA, Status: Active, freshness 2026-05-04 → 2026-08-02) — quickstart за 30 хвилин: секрети (`/run/repo_secrets/Sergeant/.env.secrets`), Postgres + pgvector image (`pnpm db:up`), `AI_QUOTA_DISABLED` semantics, hard-rule навігація, skill routing decision tree, plop generators, verification before PR. Лінки додано в AGENTS.md, CLAUDE.md, DEVIN.md, `docs/agents/README.md`. `docs:check-links` без нових broken links від цього PR.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 5.3  | TBD    | n8n smoke contract test                        | —                                                                                                                                                                                                                                         | Не розпочато                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

> **PR 1.3 deferred reason (resolved 2026-05-04):** ~~запуск `tsc-files`/`tsc -p` на staged TS-файлах поверх `main` падає на pre-existing помилках (`apps/server/src/modules/mono/rotateSecret.test.ts:63` TS2345; `apps/web/src/core/hub/HubDashboard.tsx:682` TS2741).~~ Обидві помилки виправлено `#1572`-fallout-коммітами `8ae5caba` (server) і `7518734e` (web). Перевірено локально: `pnpm typecheck` (`turbo run typecheck` з `dependsOn: ["^build"]`) — 16/16 task-ів, 0 errors. Окремий hotfix-PR не потрібен — PR 1.3 (Husky pre-commit `tsc-files` gate) переведено зі `hold` у `ready` і може стартувати у наступному слоті без передумов.

## TL;DR

Sergeant має один із найдорожче побудованих agent-OS-шарів серед знайомих solo-репо: `AGENTS.md` (800 рядків, 18 hard rules), 12 SKILL'ів, 46 playbook'ів, 23 GitHub workflow'и, hard-rules registry з триплет-сінком, 24 n8n workflow'и з manifest-ом. **Але** формальний шар обігнав реальний enforcement: частина гейтів — театральні (`.agents/skills-lock.json` з порожніми хешами; `skill-freshness.yml` що warning-ить про DEVIN.md), частина «hard rules» — це насправді дизайн-конвенції чи активна ініціатива з allowlist + дедлайном (#18 ↔ ініціатива 0001), частина політик не енфорситься нічим (Hard Rule #15 «прозу — українською» порушують 16/42 playbook'и + усі 12 SKILL.md).

Ця ініціатива **«висушує»** agent-OS у 4 фази: (1) додає лінтери, які реально блокують дрейф; (2) уніфікує іменування та структуру; (3) обрізає Hard Rules і AGENTS.md до того, що насправді блокує; (4) прибирає operational-надлишок (Renovate-vs-Dependabot, 3 dead-code інструменти, низькосигнальні CI workflow'и). Фаза 5 (paralelno) — розширення інструментарію (Plop, onboarding doc).

## Чому зараз

- **Дрейф вже триває.** З 42 «функціональних» playbook'ів 16 — англійською (повний список у фазі 1.2), включно з тими, що змінювалися агентами Claude/Devin в останні 30 днів. Hard Rule #15 не енфорситься нічим — наступний прохід будь-якого AI-агента ламатиме його далі.
- **Інтегріті-гейти створюють ілюзію безпеки.** `.agents/skills-lock.json` із `"computedHash": ""` для кожного скіла — це фейк. Якщо хтось замінить SKILL.md, нічого не зреагує. Команда вже звикла до warning'ів `skill-freshness.yml`, які нічого не блокують — це тренує ігнорувати CI noise.
- **«Hard rule» інфлятується.** Із 18 правил половина — дизайн-конвенції (#11–#14, #16, #17) і активний бэклог (#18). Коли «hard rule» — це і `pg.bigint→Number()`, і «no hex colors», термін втрачає вагу для агентів.
- **Розкол між governance-skills і runtime-specialists.** `tools/console/src/agents/dispatcher.ts:13` оголошує 11 `SpecialistAgent` (наприклад, `web-ui`, `server-api`, `hubchat-ai`, `n8n-automation`, `growth-marketing`, `qa-release`, `security`). `.agents/skills/` має 12 governance-skill'ів (`sergeant-web-ui`, `sergeant-server-api`, `sergeant-hubchat`, …). 8 з 11 концептуально дублюються, але без канонічного мапінгу. Telegram-бот, який класифікує задачу як `web-ui`, не знає, що SKILL для агента-виконавця називається `sergeant-web-ui`.
- **Pre-commit не ловить TS.** Husky `lint-staged` робить ESLint + Prettier; `tsc --noEmit` не виконується. Найчастіша CI-fail причина — TS-помилки. Економія 5–10 секунд на коміт коштує 8 хвилин CI-цикл + race з ботом.

## Скоуп

**In:**

- Лінтери, які блокують дрейф governance: skill-shape, playbook-language (Ukrainian-required), playbook-schema розширення, skills-lock з реальним SHA256.
- Уніфікація іменування й структури: канонічна мапа specialists ↔ skills; `docs/agents/` → `docs/agents/`; обʼєднання дубльованих playbook'ів (release-_, access-_).
- Слім AGENTS.md (≤ 150 LOC core + per-rule deep-dives у `docs/governance/rules/`), реструктуризація Hard Rules на дві категорії.
- Slim `.env.example` + повний reference у `docs/integrations/env-vars.md`.
- Pre-commit fast typecheck (`tsc-files`) на staged TS.
- Operational cleanup: Renovate XOR Dependabot decision (ADR), один dead-code інструмент, аудит низькосигнальних workflow'ів.
- Plop generators: `new-skill`, `new-playbook` (фаза 1); `n8n-workflow`, `console-specialist`, `new-package` (фаза 5).
- `docs/agents/onboarding.md` — «перші 30 хвилин агента в Sergeant».

**Out:**

- Декомпозиція `tools/console/src/agents/openclaw.ts` (753 LOC) — code-level refactor; піде окремою ініціативою (тимчасовий ID `0010-console-agents-decomposition`, окремий PR-trail).
- Нові продукт-фічі (HubChat tools, mobile screens, дизайн-система).
- ESLint plugin development — окрема ініціатива власника `packages/eslint-plugin-sergeant-design`.
- Ребрендинг runtime-specialist enum у `dispatcher.ts` (public Telegram contract) — ризик зламати n8n workflow `20-agent-dispatcher`. Залишаємо існуючі імена, додаємо мапінг-таблицю.

## План змін

### Фаза 1 — Лінтери проти дрейфу (тиждень 1, 5 PR)

> Ціль: ввести гейти, які насправді блокують дрейф. Без них фази 2–4 марні: знов набіжить друк-помилок і англійських playbook'ів.

#### PR 1.1 — `pnpm lint:skills` + skills-lock з реальним SHA256

**Scope:** `chore(agents)` (повністю в `.agents/` + `scripts/`).

- `scripts/check-skill-shape.mjs`:
  - Кожен `.agents/skills/*/SKILL.md` має `frontmatter.name`, `frontmatter.description` (≤ 200 chars).
  - Тіло — ≥1 файлошлях у репо (`apps/`/`packages/`/`scripts/`/`docs/`) **або** ≥1 `pnpm` команда.
  - ≥1 посилання на playbook у `docs/playbooks/` АБО на skill-каталог.
- `scripts/check-skills-lock.mjs`:
  - Обчислює SHA256 кожного `.agents/skills/*/SKILL.md`, порівнює з `.agents/skills-lock.json[skill].computedHash`.
  - Failure → інструкція «`pnpm skills:lock` regenerate».
- `package.json`: `lint:skills`, `skills:lock`. Додати `lint:skills` у root `lint` (yepнути після `lint:plugins`).
- Початковий `pnpm skills:lock` запис — реальні хеші у JSON.
- Оновити `.github/workflows/skill-freshness.yml`: замінити «JSON valid + dir exists» на `pnpm lint:skills` (як required gate). **Прибрати** гілку «DEVIN.md references» (no-op warning).

**Acceptance criteria:**

- [x] `pnpm lint:skills` зеленіє локально + у CI на `main`. _(Done у [#1659](https://github.com/Skords-01/Sergeant/pull/1659).)_
- [x] Зміна вмісту будь-якого `SKILL.md` без оновлення lock → CI fail з інструкцією. _(Done — `scripts/check-skills-lock.mjs` падає з посиланням на `pnpm skills:lock`.)_
- [x] `skill-freshness.yml` більше не warning-ить про DEVIN.md. _(Done — workflow тепер запускає `pnpm lint:skills`; DEVIN.md grep видалено.)_

**Ризики:** початковий PR оновить 12 hash-ів; reviewer має перевірити, що SKILL.md тіла справді не змінювалися.

**Status:** Merged 2026-05-04 ([#1659](https://github.com/Skords-01/Sergeant/pull/1659)).

#### PR 1.2 — `pnpm lint:playbook-language` (Ukrainian-required)

**Scope:** `ci(docs)`.

- `scripts/check-playbook-language.mjs`:
  - Для кожного `docs/playbooks/*.md` (виключаючи `INDEX.md`, `README.md`, `_TEMPLATE-*.md`, `playbook-catalog.md`):
    - Видаляє code blocks, frontmatter, freshness header (Last validated рядок), URL.
    - Підраховує співвідношення кириличних / латинських літер.
    - Якщо < 0.4 → fail зі списком файлів і пропозицією додати укр-секцію або змінити frontmatter `lang: en` (allow-list).
  - Те саме для `.agents/skills/*/SKILL.md` (де frontmatter `description` теж має бути двомовним).
- `lint:playbook-language` додати в root `lint`.
- **Backfill 16 англомовних playbook'ів** із [списку](#додаток-список-en-only-playbookів-на-2026-05-04) у тому ж PR (або серії PR-ів за фазою). Allow-list (`lang: en`) — лише на ті, де команда явно вирішить лишити англійською (наприклад, `release-*` для зовнішнього on-call shadowing).

**Acceptance criteria:**

- [ ] CI fail на новому EN-playbook без `lang: en` allow-list.
- [ ] Усі 16 існуючих EN-playbook'ів або переписано українською, або позначено `lang: en` із обґрунтуванням у frontmatter.
- [ ] SKILL.md `description:` має українську тригерну фразу (для UA-промптів).

**Ризики:** масовий переклад одночасно з лінтером → великий diff. Мітигація: лінтер ввімкнути `--warn-only` у фазі 1.2a, переклад у 1.2b, gate ON у 1.2c.

#### PR 1.3 — Husky pre-commit fast typecheck

**Scope:** `chore(root)`.

- Додати `tsc-files` (ESM-сумісна обгортка над `tsc --noEmit` для staged файлів).
- `lint-staged.config`: `*.{ts,tsx}` → `tsc-files --noEmit` (виконується після ESLint, перед Prettier; на гарячому кеші 3–8 сек на 10–20 staged файлів).
- Документувати у `CONTRIBUTING.md` як обхід через `git commit --no-verify` ЗАБОРОНЕНИЙ (Hard Rule #7 уже існує).

**Acceptance criteria:**

- [ ] Локальний commit із TS-помилкою blocked зі stack trace.
- [ ] Staged-файли без TS змін → typecheck не запускається.
- [ ] PR-цикл «зеленіє лінт, червоніє CI на TS» зникає на гілках команди.

**Ризики:** перший прохід може бути повільним (cold cache). Мітигація: `tsc-files` має incremental cache; `.tsbuildinfo` ігнорується git.

#### PR 1.4 — `playbook-schema` розширення

**Scope:** `ci(docs)`.

- `scripts/docs/check-playbook-schema.mjs`: додати перевірки
  - `## Owner surface` секція + `Governing skill:` рядок (зараз є де-факто, але не enforced).
  - `## Verification` секція з ≥1 чекбоксом.
  - `**Trigger:**` рядок ≤ 240 chars (для INDEX-збірки).
- Backfill будь-яких файлів, що падають.

**Acceptance criteria:**

- [x] CI fail на новому playbook без `Owner surface` або `Verification`.
- [x] `INDEX.md` тригери не обрізаються (всі ≤ 240 chars).

#### PR 1.5 — Hard-rules categorization (підготовка до фази 3)

**Scope:** `chore(governance)`.

- `docs/governance/hard-rules.json` schema: додати поле `category: 'blocker-invariant' | 'lint-enforced-convention' | 'active-initiative'`.
- Помітити всі 18 правил відповідно (без зміни тексту чи enforcement). Категорії — у фазі 3.1 використовуються для секціонування AGENTS.md.
- Згенерувати оновлений `hard-rules-matrix.md` (через `pnpm hard-rules:generate`).
- Sync gate (`lint:hard-rules-registry`) — додати перевірку категорії.

**Acceptance criteria:**

- [x] Кожне правило має `category`. _(Done у [#1660](https://github.com/Skords-01/Sergeant/pull/1660) — 18/18 правил.)_
- [x] Categorization — у форматі, який очікує фаза 3. _(Done — enum `blocker-invariant` / `lint-enforced-convention` / `active-initiative` валідується schema-ою + `loadRegistry`; розподіл 6/11/1.)_

**Status:** Merged 2026-05-04 ([#1660](https://github.com/Skords-01/Sergeant/pull/1660)).

### Фаза 2 — Уніфікація іменування і структури (тиждень 2, 4 PR)

> Ціль: усунути паралельні системи (specialists ↔ skills), дубляжі (release-_, access-_), плутаниху назв (`superpowers` ↔ `agents`).

#### PR 2.1 — Specialists ↔ skills mapping

**Scope:** `docs(agents)`.

- Новий файл `docs/agents/specialists-mapping.md`: таблиця `runtime specialist | governance skill | primary playbook | ADR(s)`.
  - Для кожного з 11 `SpecialistAgent` у `tools/console/src/agents/dispatcher.ts:13` — точний mapping на 1+ skill і 1+ playbook.
  - Маркер `extra` для пар без 1:1 (наприклад, `n8n-automation` → no skill yet → плановано в фазі 5.1).
- `tools/console/src/agents/dispatcher.ts`: коментарі-`@see` біля кожного `SpecialistAgent` з шляхом до відповідного SKILL.md.
- Оновити `tools/console/src/agents/personas.ts` — primer кожної OpenClaw persona посилається на skill.

**Acceptance criteria:**

- [x] Кожен runtime specialist має задокументований skill mapping. _(Done у [#1687](https://github.com/Skords-01/Sergeant/pull/1687) — 11/11 в `docs/agents/specialists-mapping.md`.)_
- [x] Кожна persona має посилання на skill. _(Done у [#1687](https://github.com/Skords-01/Sergeant/pull/1687) — 5/5 OpenClaw primer-ів `personas.ts`.)_
- [ ] Telegram-бот, який класифікував `/assign web-ui …`, рендерить «Loading skill: `sergeant-web-ui`» у status callback. _(Виділено в PR 2.1b — потребує змін у `runDispatchedTask` + Telegram status renderer; mapping є prerequisite і мерджиться першим.)_

**Status:** Open в [#1687](https://github.com/Skords-01/Sergeant/pull/1687).

#### PR 2.2 — `docs/superpowers/` → `docs/agents/`

**Scope:** `docs(agents)`.

- Перейменувати директорію (зберегти git history через `git mv`).
- Оновити всі посилання в репо: `AGENTS.md`, `CLAUDE.md`, `DEVIN.md`, `docs/README.md`, `.agents/skills/sergeant-start-here/SKILL.md`, кожен playbook.
- `docs:check-links` пройде після оновлення.

**Acceptance criteria:**

- [x] Жодне внутрішнє посилання на `docs/superpowers/` не лишилося як path. _(Done у [#1684](https://github.com/Skords-01/Sergeant/pull/1684) — решта референсів їх лише як історична згадка в README і в цій ініціативі — це очікувана поведінка для traceability.)_
- [x] `docs/agents/README.md` пояснює, що це operating system для AI-агентів, а не AI-фічі продукту. _(Done у [#1684](https://github.com/Skords-01/Sergeant/pull/1684) — H1 «# Agents» + явний роздільний абзац + history note.)_

**Status:** Merged 2026-05-04 ([#1684](https://github.com/Skords-01/Sergeant/pull/1684)).

#### PR 2.3 — Обʼєднати release-\* playbook'и

**Scope:** `docs(agents)`.

- Новий `docs/playbooks/release.md` із 3 секціями:
  - `## Web + API` (з `release-web-and-api.md`)
  - `## Mobile shell (Capacitor)` (з `release-mobile-shell.md`)
  - `## Expo` (з `release-expo-mobile.md`)
- Старі 3 файли → `Status: Superseded by release.md` + 308-style stub із посиланням (так само, як deprecated плейбуки в `agent-skills-catalog.md`).
- Оновити `INDEX.md`, `playbook-catalog.md`, всі посилання в playbook'ах і скілах (`sergeant-deploy-and-observability`, `sergeant-mobile-expo`).

**Acceptance criteria:**

- [x] `release.md` містить decision tree «який surface релізиш?» (mermaid). _(Done в [#1705](https://github.com/Skords-01/Sergeant/pull/1705) — `flowchart TD` з Q1/Q2 → 3 ACTION-leaf за surface.)_
- [x] Старі файли не вилучено (для git blame), але позначено `Status: Deprecated` + `Superseded by:` лінк на конкретну секцію `release.md`. _(Done в [#1705](https://github.com/Skords-01/Sergeant/pull/1705) — schema enum {Active, Scaffolded, Deprecated, Archived} не містить «Superseded», тому стаб використовує `Status: Deprecated` + явний `> **Superseded by:**` рядок одразу під ним.)_
- [x] `docs:check-links` не дає нових broken-link-ів від цього PR. _(Done — link checker для `release-*` шляхів зеленіє; 5 pre-existing broken-link-ів у `docs/adr/0009`, `docs/initiatives/0006-0008`, `docs/security/hardening` — не від цього PR.)_

**Status:** Open в [#1705](https://github.com/Skords-01/Sergeant/pull/1705).

#### PR 2.4 — Обʼєднати access-\* playbook'и

**Scope:** `docs(agents)`.

- Новий `docs/playbooks/access-governance.md` із 4 секціями:
  - `## Grant privileged access` (з `grant-privileged-access.md`)
  - `## Revoke privileged access` (з `revoke-privileged-access.md`)
  - `## Periodic access review` (з `run-access-review.md`)
  - `## Suspected account compromise` (з `respond-to-suspected-account-compromise.md`)
- Аналогічно фазі 2.3 — старі файли позначити `Superseded`.

**Acceptance criteria:** як у 2.3.

- [x] `access-governance.md` містить decision tree «що за подія доступу?» (mermaid). _(Done в [#1707](https://github.com/Skords-01/Sergeant/pull/1707) — `flowchart TD` з Q1/Q2 → 4 ACTION-leaf за тип події; Q2 («чи підозра на компроміс?») рутить normal-revoke → § Revoke privileged access або compromise → § Suspected account compromise.)_
- [x] Старі файли не вилучено (для git blame), але позначено `Status: Deprecated` + `Superseded by:` лінк на конкретну секцію `access-governance.md`. _(Done в [#1707](https://github.com/Skords-01/Sergeant/pull/1707) — той самий шаблон, що в PR 2.3.)_
- [x] `docs:check-links` не дає нових broken-link-ів від цього PR. _(Done — link checker для `access-*` шляхів зеленіє.)_

**Status:** Open в [#1707](https://github.com/Skords-01/Sergeant/pull/1707).

### Фаза 3 — Слім Hard Rules і AGENTS.md (тиждень 3, 3 PR)

> Ціль: повернути вагу терміну «hard rule», скоротити AGENTS.md до того, що агент справді читає кожну сесію.

#### PR 3.1 — Демоутити дизайн-конвенції

**Scope:** `docs(governance)`.

- Hard Rules #11 (no hex), #12 (module-accent), #13 (raw-palette light/dark), #14 (focus-visible), #16 (typography scale), #17 (animation budget) **демоутити** до окремого розділу `## Lint-enforced design conventions` у `AGENTS.md`.
- `hard-rules.json`: ці правила лишаються в реєстрі, але `category: 'lint-enforced-convention'` (поставлено в фазі 1.5).
- Hard Rule #18 (max-lines: 600) лишається `category: 'active-initiative'`, з посиланням на ініціативу 0001 і запланованим перетворенням на `blocker-invariant` після завершення.
- `hard-rules-matrix.md` рендерить дві таблиці.
- ADR-0045 «Hard Rules taxonomy» — фіксує семантику категорій (частина PR [#1725](https://github.com/Skords-01/Sergeant/pull/1725); файл `docs/adr/0045-hard-rules-taxonomy.md` зʼявиться на main після мерджу).

**Acceptance criteria:**

- [x] AGENTS.md § «Hard rules» містить ≤ 6 blocker-invariants. (PR [#1725](https://github.com/Skords-01/Sergeant/pull/1725) — § Hard rules містить 6 blocker-invariants + 5 lint-enforced non-design + 1 active-initiative.)
- [x] § «Lint-enforced conventions» містить решту з посиланнями на конкретний ESLint-rule або скрипт. (PR [#1725](https://github.com/Skords-01/Sergeant/pull/1725) — 6 design-related rules винесено в новий розділ; non-design lint-enforced (#5, #8, #9, #10, #15) лишилися в § Hard rules за дизайном — це не «design conventions».)
- [x] `lint:hard-rules-registry` сінкує всі три файли як раніше. (`scripts/check-hard-rules-registry.mjs` оновлено — `sliceHardRulesSection` тепер злітає обидві AGENTS.md секції в один Map.)

**Ризики:** агенти, що вже звикли посилатися на «Hard Rule #11» у PR-описах, побачать стабільні номери (id у hard-rules.json лишаються). Текстова класифікація — лише в AGENTS.md і matrix.

#### PR 3.2 — AGENTS.md slim (≤ 150 LOC core)

**Scope:** `docs(root)`.

- `AGENTS.md` скорочується до:
  - § Agent operating system (як зараз)
  - § Repo overview (як зараз, але без deep-table; одна посилання на architecture/repo-map.md)
  - § Module ownership map → стиснути до 5–6 рядків (по одному на app + посилання на повну таблицю в `docs/architecture/`)
  - § Hard rules — тільки **список** (id + назва + 1 рядок суті) + посилання на per-rule файли
  - § AI markers — короткий summary + посилання на `docs/governance/ai-markers.md`
  - § Domain invariants → винести в `docs/architecture/domain-invariants.md`
- Кожне правило отримує файл `docs/governance/rules/NN-<slug>.md` з повним deep-dive (приклади BAD/GOOD, посилання на тести/migrations).
- `lint:hard-rules-registry` оновити, щоб сінкував коротку шапку в AGENTS.md ↔ JSON ↔ CONTRIBUTING.md.

**Acceptance criteria:**

- [ ] `AGENTS.md` ≤ 150 LOC (на сьогодні — 800).
- [ ] Кожне посилання в скілах і playbook'ах резолвиться (`docs:check-links`).
- [ ] Жодне правило не втрачене — кожен `id` має файл у `docs/governance/rules/`.

#### PR 3.3 — Slim `.env.example` + повний reference

**Scope:** `docs(root)`.

- `.env.example` → ≤ 30 рядків з 12–15 обовʼязковими змінними для `pnpm dev:web` + `pnpm dev:server`.
- `docs/integrations/env-vars.md` — повний reference: per-feature блоки (Better Auth, Anthropic, Voyage, VAPID, Resend, Google OAuth, Mono, Sentry, PostHog, n8n hooks, AI quota, USDA FDC, …) із посиланням на сервіс-доку.
- README, `docs/agents/onboarding.md` (фаза 5.2) посилаються на новий reference.

**Acceptance criteria:**

- [ ] `.env.example` ≤ 30 LOC.
- [ ] `docs/integrations/env-vars.md` має блок для кожної із 109 змінних, що зараз закоментовані.
- [ ] `docs:check-links` зеленіє.

### Фаза 4 — Operational cleanup (тиждень 4, 3 PR)

> Ціль: прибрати дубляжі автоматизації — «Renovate і Dependabot», 3 dead-code інструменти, низькосигнальні CI workflow'и.

#### PR 4.1 — Renovate XOR Dependabot

**Scope:** `chore(deps)`.

- ADR-XXXX «Dependency automation: pick one» — фіксує вибір. Рекомендований сценарій: Renovate (вже налаштований із групами + auto-merge dev-deps), Dependabot вилучити.
- Видалити `.github/workflows/dependabot-automerge.yml` і `.github/dependabot.yml` (якщо існує).
- `docs/ops/renovate.md` (новий) — runbook для maintainer'а: як обробляти Renovate PR, що auto-merge'иться, що review-ається.

**Acceptance criteria:**

- [ ] ADR-XXXX змерджено.
- [ ] Один із двох інструментів вилучено.
- [ ] Перші 5 dependency-PR після вилучення — без конфлікту.

#### PR 4.2 — Dead-code: knip-only

**Scope:** `chore(ci)`.

- Залишити `knip` (вже інтегрований через `knip-respects-scaffolded.mjs`, з повагою до `@scaffolded`).
- Видалити `dead-code:packages` (ts-prune) і `depcheck:all` із `package.json`.
- Видалити dev-dependencies `ts-prune`, `depcheck`.
- Додати `knip` як CI gate (зараз — лише script).

**Acceptance criteria:**

- [ ] `pnpm knip` чисто на main.
- [ ] CI fail при появі нової unused-import (а не тільки nightly).

**Ризики:** перший CI gate може зловити borderline cases — мітигація: `knip` config має `ignore` секцію для legitimate dynamic imports.

#### PR 4.3 — Аудит низькосигнальних workflow'ів

**Scope:** `ci(root)`.

- Перевірити Actions runs за останні 90 днів, скласти список workflow'ів без жодного **блокуючого** failure'а.
- Запропоновані зміни (за попереднім скануванням):
  - `posthog-release-annotation.yml` — лишити, але переключити на `release` event (не `push:main`).
  - `shell-tax-report.yml` — переконвертувати на `schedule: weekly`, не на `pull_request`.
  - `flaky-tests-dashboard.yml` — лишити, schedule.
  - `ai-legacy-scan.yml` — лишити лише якщо є active `// AI-LEGACY: expires` маркери; інакше pause.
  - `typescript-next.yml` — schedule weekly (не на кожен PR; canary).
- Додати `Owner` коментар-блок у топ кожного workflow file (хто відповідає за false-positive).

**Acceptance criteria:**

- [ ] CI total minutes на PR (median) знижено на ≥ 15%.
- [ ] Кожен workflow має задокументованого owner.

### Фаза 5 — Розширення інструментарію (paralelno або carry-over, 3 PR)

> Ціль: знизити поріг входу в governance-зміни. Менше копіпасти — менше дрейфу.

#### PR 5.1 — Plop generators

**Scope:** `chore(agents)`.

- `plop new-skill` — інтерактивний промпт (name, description, governing-surface), створює `.agents/skills/<name>/SKILL.md` зі skeleton'ом + оновлює `.agents/skills-lock.json`.
- `plop new-playbook` — створює `docs/playbooks/<slug>.md` із валідною schema (H1 + freshness + Status + Trigger + Owner surface + Steps + Verification), пропонує дві мови (UK default).
- `plop n8n-workflow` — JSON-стаб + `manifest.json` entry + опційний README.
- `plop console-specialist` — стаб у `tools/console/src/agents/<name>.ts` + dispatcher reg + persona primer.
- `plop new-package` — `packages/<name>/{src,__tests__,package.json,tsconfig.json}` + workspace entry.

**Acceptance criteria:**

- [ ] Кожен generator проходить smoke (створює файли, які проходять lint/skill-shape/playbook-schema/typecheck).
- [ ] Документовано в `CONTRIBUTING.md`.

#### PR 5.2 — `docs/agents/onboarding.md`

**Scope:** `docs(agents)`.

- Новий файл «Перші 30 хвилин агента в Sergeant»:
  - Як завантажити секрети (Devin: `/run/repo_secrets/Sergeant/.env.secrets`).
  - Як підняти Postgres (`pnpm db:up` із pgvector image).
  - Що робить `AI_QUOTA_DISABLED=1`.
  - Як читати hard-rule помилки CI (link to docs/governance/rules/).
  - Як вибрати skill за тригерною фразою.
  - Як використати Plop generators.

**Acceptance criteria:**

- [x] Onboarding посилається на актуальні шляхи (links pass `docs:check-links`). (PR [#1728](https://github.com/Skords-01/Sergeant/pull/1728) — без нових broken links у `pnpm docs:check-links`; усі pre-existing failures від інших doc'ів.)
- [x] AGENTS.md, CLAUDE.md, DEVIN.md мають посилання на цей файл. (PR [#1728](https://github.com/Skords-01/Sergeant/pull/1728) — лінк додано в § Agent operating system у AGENTS.md і у Startup flow у CLAUDE.md / DEVIN.md.)

#### PR 5.3 — n8n smoke contract test

**Scope:** `feat(agents)`.

- `apps/server/src/__tests__/integration/n8n-alert-ack-contract.test.ts` — синтетичний POST на `/api/internal/alerts/post` із валідним payload, перевірка вставки в `tg_alert_acks` (через testcontainers).
- CI крок у `ci.yml` після migration-lint.
- ADR-0038 W3 §3.2 (alert ack-row) отримує contract-gate.

**Acceptance criteria:**

- [ ] CI fail при breaking change у `tg_alert_acks` schema.
- [ ] Smoke test покриває happy path + 1 error path (duplicate alert id).

## Критерії DONE (Initiative-level)

- [ ] Усі 5 фаз шипнуто (фаза 5 може carry-over як successor initiative).
- [ ] `pnpm lint` (root) включає: `lint:skills`, `lint:playbook-language`, `lint:playbook-schema` (extended), `lint:hard-rules-registry`, `lint:codeowners` — всі required.
- [x] Жоден SKILL.md не може бути замінено без оновлення hash у lock.
- [ ] Жоден EN-only playbook без явного `lang: en` allow-list у frontmatter.
- [ ] Husky pre-commit ловить ≥ 80% TS-помилок локально (метрика: PR-и за 30 днів із isolated TS-fail у CI < 20% від baseline).
- [ ] AGENTS.md ≤ 150 LOC.
- [x] Kожен `SpecialistAgent` має задокументований skill mapping.
- [x] `docs/agents/` → `docs/agents/` мейгрейцію завершено.
- [x] release-_ і access-_ playbook'и зведено.
- [x] Renovate-vs-Dependabot decision зафіксовано в ADR.
- [ ] CI median minutes per PR знижено на ≥ 15%.

## Ризики та мітигація

| Ризик                                                                                                           | Мітигація                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Великий backfill в одному PR (16 EN-playbook'ів → UK)** заблокує review.                                      | Розбити фазу 1.2 на 1.2a (лінтер у `--warn-only`), 1.2b (інкрементальний переклад серією PR із scope `docs`), 1.2c (gate ON). Кожен переклад — окремий PR ≤ 1 файла.                                    |
| **Slim AGENTS.md ламає посилання в історичних PR-описах і tech-debt notes**.                                    | Лишити стабільні `id` у hard-rules.json. Перейменування файлів робити через `git mv` (зберігає blame). Per-rule файли мають у H1 alias-anchor «#NN-<slug>», який матчить старі URL'и з matrix.          |
| **Уніфікація specialists ↔ skills через rename `web-ui` → `sergeant-web-ui` ламає Telegram-бот контракт**.      | НЕ робимо rename. Лишаємо runtime enum, додаємо mapping-таблицю + `@see` коментарі. Telegram users не помічають зміну.                                                                                  |
| **`tsc-files` повільно на cold cache** (перший commit після pull).                                              | Перший прохід може бути 15–30 сек. Документуємо в CONTRIBUTING.md. Кеш `.tsbuildinfo` дозволяє наступні commits 3–8 сек.                                                                                |
| **`knip` як CI gate видасть багато false-positive на dynamic imports** (конфіги, lazy loaders).                 | Перед увімкненням gate — повний прохід `pnpm knip` локально, додавання `ignore` для legitimate cases. PR 4.2 включає baseline knip config + smoke.                                                      |
| **Видалення Dependabot ламає auto-merge для якогось external action**.                                          | Перед видаленням — перевірити, чи `dependabot.yml` керує чимось, окрім auto-merge (наприклад, ecosystem `github-actions`). Якщо так — мігрувати конфіг на Renovate `customManagers` спершу.             |
| **Backfill skills-lock.json у фазі 1.1 reviewer не може перевірити вручну** (12 SHA256).                        | PR 1.1 у body містить вивід `pnpm skills:lock --print` із діапазоном дат. Reviewer звіряє з `git log --since=2026-04-01 -- .agents/skills/`.                                                            |
| **Demote дизайн-Hard Rules знижує сприйняття дизайн-conventions**.                                              | ESLint plugins (`packages/eslint-plugin-sergeant-design`) лишаються error-level, не warning. Сема enforcement не змінюється — змінюється класифікація. Це підкреслено в ADR-XXXX «Hard Rules taxonomy». |
| **n8n smoke test у фазі 5.3 потребує testcontainers + Postgres + alert-ack-row migration** — повільний CI-крок. | Виділити в окремий job із `if: contains(...changed-files..., 'tg_alert_acks')`. Не запускати на кожен PR.                                                                                               |
| **Workflow audit (фаза 4.3) видаляє щось, що раз на рік ловить інцидент**.                                      | Не видаляємо — переключаємо на `schedule` або marker `if: failure()`. Зберігаємо файли. Зміни — reversible commit.                                                                                      |

## Метрики

| Метрика                                                                      | Baseline (2026-05-04)                               | Поточне (2026-05-04)                                                                                                    | Target (post-rollout)                                                      |
| ---------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| % playbook'ів, що відповідають Hard Rule #15 (UA prose або явний `lang: en`) | ~62% (26/42)                                        | ~67% (28/42 після злиття PR 1.2b 1-й batch `add-hard-rule.md` + 2-й batch `write-postmortem.md` #1799)                  | 100%                                                                       |
| `.agents/skills-lock.json` `computedHash` integrity                          | broken (порожні)                                    | **enforced** (PR 1.1 #1659)                                                                                             | enforced (CI gate)                                                         |
| Hard-rules registry містить категорізацію                                    | no                                                  | **yes** — 6 blocker-invariant / 11 lint-enforced-convention / 1 active-initiative (PR 1.5 #1660)                        | yes (фаза 3 use-cases категорії)                                           |
| AGENTS.md LOC                                                                | 800                                                 | 808 (мінімальний +8 від preface PR 1.5)                                                                                 | ≤ 150                                                                      |
| Skills з task-specific тригерною фразою у `description:`                     | 0/12                                                | 0/12 (без змін — PR 1.2 не розпочато)                                                                                   | 12/12                                                                      |
| EN-only playbook без `lang: en` allow-list                                   | 16                                                  | 14 після злиття PR 1.2b 1-й batch (#1772) + 2-й batch (#1799) — `add-hard-rule.md` + `write-postmortem.md` UA           | 0                                                                          |
| `SpecialistAgent` enum записів без skill-mapping                             | 11/11                                               | 11/11 (без змін)                                                                                                        | 0                                                                          |
| Pre-commit ловить TS-помилки                                                 | no                                                  | no (PR 1.3 deferred)                                                                                                    | yes (`tsc-files`)                                                          |
| % PR-ів із isolated TS-fail у CI (per 30 days)                               | TBD (sample)                                        | TBD                                                                                                                     | < 50% від baseline                                                         |
| CI median minutes per PR                                                     | TBD                                                 | TBD (PR 4.3 #1788 додає Owner-block; baseline для -15% потребує post-merge 2-week window)                               | -15%                                                                       |
| Dependency automation tools                                                  | 2 (Renovate + Dependabot)                           | 2 (Option 3 ADR-0044: Renovate primary + Dependabot security-only; runbook PR 4.1 #1785 merged)                         | 2 (Renovate primary, Dependabot security-only — per ADR-0044)              |
| Dead-code інструменти                                                        | 3 (knip + ts-prune + depcheck)                      | 1 (knip) — PR 4.2 (#1795) merged 2026-05-04 (`e7592f71`); ts-prune + depcheck retired                                   | 1 (knip)                                                                   |
| Workflow-файлів з документованим owner                                       | 0/26                                                | 26/26 після злиття PR 4.3 (#1788) — `# Owner: @Skords-01` коментар-блок                                                 | 26/26                                                                      |
| Plop-генератори для governance-артефактів                                    | 5 (migration, rq-hook, hubchat-tool, endpoint, adr) | 7 — PR 5.1 (#1796) merged 2026-05-04 (`0a9dff6a`); додано `new-skill` + `new-playbook` (UA-default; `lang: en` opt-out) | 8 (PR 5.1b: + `new-package`, `new-n8n-workflow`, `new-console-specialist`) |

## Власник, рев'юери

- **Lead:** `@Skords-01`.
- **Required review:**
  - Будь-який PR, що змінює `.agents/**` або `docs/governance/**` — `@Skords-01` як CODEOWNERS.
  - Hard Rules taxonomy ADR (фаза 3.1) — додаткове human-review (не лише AI-агент), бо змінює semantics.
  - Slim `AGENTS.md` (фаза 3.2) — те саме.

## Залежності між фазами

```
Phase 1 (лінтери) ──────────────── must finish first
   ├── PR 1.1 (skills-lock) ───┐
   ├── PR 1.2 (UA prose)       │
   ├── PR 1.3 (tsc-files)      │   blocks → Phase 2 (refactor зачіпатиме скіли і playbooks)
   ├── PR 1.4 (playbook schema) ─┘
   └── PR 1.5 (rules categorization) ──┐
                                       │
Phase 2 (уніфікація) ──── parallel ──┐  │   blocks → Phase 3 (slim AGENTS зачіпає посилання з фази 2)
   ├── PR 2.1 (mapping)              │  │
   ├── PR 2.2 (rename → /agents/)    │  │
   ├── PR 2.3 (release.md)           │  │
   └── PR 2.4 (access-governance.md) │  │
                                     │  │
Phase 3 (slim) ──────── needs Phase 1.5, 2.2 ──┘
   ├── PR 3.1 (demote design rules)
   ├── PR 3.2 (slim AGENTS.md)
   └── PR 3.3 (slim .env.example)

Phase 4 (operational) ── parallel із Phase 3
   ├── PR 4.1 (Renovate vs Dependabot)
   ├── PR 4.2 (knip-only)
   └── PR 4.3 (workflow audit)

Phase 5 (інструментарій) ── carry-over або parallel
   ├── PR 5.1 (Plop generators)  ← needs Phase 1 (skill-shape, playbook-schema)
   ├── PR 5.2 (onboarding.md)
   └── PR 5.3 (n8n smoke test)
```

## Додаток: список EN-only playbook'ів на 2026-05-04

Знайдено `pnpm` командою-аналогом (Python script у звіті 2026-05-04):

| Author                  | Files                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@Skords-01`            | `add-feature-flag.md`, `cleanup-dead-code.md`, `grant-privileged-access.md`, `respond-to-suspected-account-compromise.md`, `revoke-privileged-access.md`, `run-access-review.md`                                                           |
| `@claude`               | `declare-incident.md`, `release-expo-mobile.md`, `release-mobile-shell.md`, `release-web-and-api.md`, `restore-from-backup.md`, `retire-feature-flag.md`, `run-weekly-operator-digest.md`, `test-backup-restore.md`, `write-postmortem.md` |
| `@devin-ai-integration` | `add-hard-rule.md`                                                                                                                                                                                                                         |

Phase 1.2 reviewer прогоняє цей список і звіряє з результатом `pnpm lint:playbook-language` (якщо ввімкнено `--warn-only`).

## Out of scope (наступні ініціативи)

- **0010 — Console agents decomposition** — `tools/console/src/agents/openclaw.ts` (753 LOC) розбити за прецедентом `apps/server/src/modules/chat/` (orchestrator + tools + handlers + cache).
- **0011 — n8n test harness** — повний end-to-end test infra для 24 workflow'ів, не лише alert-ack contract.
- **0012 — ESLint plugin expansion** — нові правила в `packages/eslint-plugin-sergeant-design`, які закривають демоутовані «design conventions» з фази 3.1.

## Посилання

- Devin agent-OS review 2026-05-04 (внутрішній; sources для більшості пунктів).
- [`AGENTS.md`](../../AGENTS.md) — джерело hard rules.
- [`docs/governance/hard-rules.json`](../governance/hard-rules.json), [`hard-rules-matrix.md`](../governance/hard-rules-matrix.md) — реєстр.
- [`docs/agents/agent-skills-catalog.md`](../agents/agent-skills-catalog.md) (renamed з `docs/superpowers/` у фазі 2.2).
- [`docs/agents/agent-workflows.md`](../agents/agent-workflows.md) (те саме).
- [`docs/playbooks/README.md`](../playbooks/README.md), [`playbook-catalog.md`](../playbooks/playbook-catalog.md), [`INDEX.md`](../playbooks/INDEX.md).
- [`tools/console/src/agents/dispatcher.ts`](../../tools/console/src/agents/dispatcher.ts) — `SpecialistAgent` enum.
- [Initiative 0001 — Module decomposition](./0001-module-decomposition.md) — пов'язано з Hard Rule #18.
- [Initiative 0008 — Platform hardening](./0008-platform-hardening.md) — близький operational scope (Renovate, supply-chain).
