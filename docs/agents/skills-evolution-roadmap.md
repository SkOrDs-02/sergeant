# Skills Evolution Roadmap — запозичення з ecosystem-у agent skills

> **Last validated:** 2026-05-10 by Devin. **Next review:** 2026-08-08.
> **Status:** Active (proposal — sequencing only; кожен пункт окремий PR із власним acceptance criteria)

> **Що це.** Курований план, як еволюціонувати repo-owned skill-систему Sergeant (`.agents/skills/**`) запозичивши перевірені патерни з широкого agent-skills ecosystem-у — без розмиття існуючих 12 specialist-skill-ів і без імпорту generic-обгорток. Документ працює як roadmap для будь-якого AI-агента (Claude Code, Devin, Codex, Cursor, Gemini CLI), що візьметься за конкретний пункт.

> **Не ініціатива в `docs/initiatives/`** через [audit-freeze 2026-05-05 → 2026-06-02](../governance/audit-freeze-2026-05-05.md). Якщо post-freeze команда вирішить підняти це в формальну initiative-у з owner-ом і ETA — створити `docs/initiatives/00NN-skills-evolution.md` і перенести скоуп туди; цей файл тоді стає секцією `## Sources` в новій initiative-і. До того часу — це **discovery roadmap**, не зобов'язання.

> **Що ми НЕ робимо.** Не запускаємо `npx @agentskill.sh/cli@latest setup`. Не ставимо generic-скіли у `.claude/skills/`. Не дублюємо `agentskills.io` open standard 1:1 — наш `lang`/`lang-reason` frontmatter і UA/EN bilingual routing-формат лишаються (PR [#1848](https://github.com/Skords-01/Sergeant/pull/1848)). Це строго **import-of-patterns**, не **import-of-content**.

---

## Контекст і джерела

Огляд проведено 2026-05-10 за запитом @Skords-01 ([session](https://app.devin.ai/sessions/7ea320e17a814d6ca319c6fae1116ccd)). Перевірено три зрілі точки референсу:

| Джерело                                                             | Що дає                                                                                                                                | License       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| [`agentskills.io`](https://agentskills.io/) open standard           | Формальна schema для `SKILL.md` frontmatter; 3-tier progressive disclosure; reference-file convention з `impact:` + `tags:`.          | open standard |
| [`anthropics/skills`](https://github.com/anthropics/skills)         | Reference patterns: `scripts/` як black-box, `references/` для деталі, `evals/` для quantitative тригер-тестів, "pushy" описи.        | Apache-2.0    |
| [`supabase/agent-skills`](https://github.com/supabase/agent-skills) | 28 Postgres reference-файлів за 8 категоріями (`query-`, `schema-`, `lock-`, `data-`, `monitor-`, `conn-`, `security-`, `advanced-`). | MIT           |
| [`obra/superpowers`](https://github.com/obra/superpowers) (130k★)   | 14 process-skill-ів (brainstorming, TDD, systematic-debugging, verification-before-completion, receiving-code-review, …).             | (per-file)    |
| [`agentskill.sh`](https://agentskill.sh/) directory                 | Маркетплейс ~107k SKILL.md + server-side security scanner на 12 категорій загроз.                                                     | (per-skill)   |

Повний log джерел і їх якості — у session-transcript-і вище. **Не імпортуємо звідти SKILL.md як-є** — ми еволюціонуємо власну skill-систему, відштовхуючись від цих практик.

---

## Принципи відбору

PR проходить у roadmap, якщо він задовольняє всі чотири:

1. **Не дублює існуючий Sergeant skill.** Якщо `sergeant-bugfix-and-regression` уже каже "reproduce-first, failing check first" — додавання `obra/systematic-debugging` як окремого скілу буде redundant. Замість цього адаптуємо ідею в існуючий skill.
2. **Не залежить від зовнішнього сервісу.** Sergeant — local-first/private. PR не має додавати dependency на agentskill.sh CLI, зовнішні API, чи плагінні маркетплейси.
3. **Сумісний з 21 hard rule.** Якщо патерн суперечить (наприклад, generic React-скіл, який ігнорує `RQ keys factory`) — pass.
4. **Має конкретний acceptance criterion.** Не "поліпшити DX", а "після PR `pnpm lint:skills` падає, якщо `description:` коротший за N символів і не містить тригер-фрази X".

---

## PR-послідовність

Дев'ять незалежних PR-ів, від найдешевшого до найдорожчого. Кожен — окремий branch, окремий PR, окремий verify-step. **Один PR на одну проблему** (Hard Rule #15 sub-clause). Ніяких bundled-changes.

> **Drift policy.** Якщо план відстає реальності, фіксуй це errata-блоком у цій секції з датою і коротким поясненням, як у `docs/initiatives/0011-…md`. Не переписуй мовчки, не видаляй "невзяті" пункти.

### PR 1 — Pushy descriptions audit (≈30 хв, S) ✅ (merged: #2374, 2026-05-10)

**Проблема.** Claude і інші LLM-агенти undertrigger-ять скіли, якщо `description:` стримане. У `anthropics/skill-creator` явно сказано: опис має містити "Make sure to use this skill whenever the user mentions X, Y, Z, **even if they don't explicitly ask**".

**Скоуп.**

- Прочитати всі 12 `description:` у `.agents/skills/*/SKILL.md`.
- Для кожного перевірити проти трьох питань: (а) чи перелічено триггер-фрази з реальних задач? (б) чи містить "use when …" + "use also when …"? (в) чи є UA-тригер-фраза для bilingual routing (як у `sergeant-start-here`)?
- Вивести diff і узгодити з owner-ом перед merge — це behavior-shaping content, не cosmetics.

**Acceptance criteria.**

- Кожен з 12 `description:` ≥ 200 символів і ≤ 1024 (`agentskills.io` limit).
- Кожен містить ≥ 3 тригер-фрази/контексти.
- Кожен містить UA-фразу (як `; UA: …`).
- `pnpm lint:skills` лишається зеленим (shape + integrity).
- Опційно: розширити `pnpm lint:skills` гейтом `description.length >= 200`. Якщо так — зафіксувати ескалацію severity у [`hard-rules.json`](../governance/hard-rules.json) як sub-clause до Rule #10 (lifecycle markers) або як новий "skill description quality" rule (нова active-initiative; не blocker до runs of evals у PR 7).

**Files touched.**

- `.agents/skills/*/SKILL.md` (12 файлів — frontmatter only).
- `.agents/skills-lock.json` (regenerate via `pnpm skills:lock`).
- Опційно: `scripts/lint-skills.mjs` (якщо вирішимо додати length-check).

**References.**

- [`anthropics/skills/skill-creator`](https://github.com/anthropics/skills/tree/main/skills/skill-creator) — § "Description Field".
- [`supabase/agent-skills`](https://github.com/supabase/agent-skills) — § "Description Field (Critical)" — `1-1024 chars`.

---

### PR 2 — Verification-before-completion gate в `sergeant-review-and-merge` (≈2 год, S) ✅ (merged: #2373, 2026-05-10)

**Проблема.** Жоден з 12 Sergeant skill-ів не містить explicit-гейту "не клейми completion без свіжого verification-evidence". `sergeant-review-and-merge` фокусується на contract-checks і scope, але не на **дисципліні language-у** ("Should pass now", "I'm confident"). Це — найдешевший quality bump з усього roadmap-у.

**Скоуп.**

- Додати в `sergeant-review-and-merge/SKILL.md` нову секцію "Verification gate" з Iron Law формулюванням і Red Flags таблицею (адаптовано з [`obra/superpowers/verification-before-completion`](https://github.com/obra/superpowers/blob/main/skills/verification-before-completion/SKILL.md)).
- Додати в `sergeant-bugfix-and-regression/SKILL.md` посилання на цей gate як обов'язковий перед "Done".
- Узгодити з PR template (`.github/PULL_REQUEST_TEMPLATE.md` § Verification вже містить command-block — Iron Law доповнює його).

**Acceptance criteria.**

- Секція додана; містить (а) Iron Law-формулювання "NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE", (б) Red Flags-таблицю на ≥ 5 випадків ("tests pass" / "linter clean" / "build succeeds" / "bug fixed" / "regression test works"), (в) явну заборону формулювань "Should pass" / "Looks correct" / "I'm confident" перед прогоном.
- `pnpm lint:skills` зелений; `pnpm skills:lock` оновлено.
- Cross-link з `sergeant-bugfix-and-regression` ("Перед claim 'fixed' — Verification gate в `sergeant-review-and-merge`").

**Files touched.**

- `.agents/skills/sergeant-review-and-merge/SKILL.md`
- `.agents/skills/sergeant-bugfix-and-regression/SKILL.md`
- `.agents/skills-lock.json`

**References.**

- [`obra/superpowers/verification-before-completion`](https://github.com/obra/superpowers/blob/main/skills/verification-before-completion/SKILL.md) — Iron Law + Gate Function + Red Flags table.
- [`obra/superpowers/receiving-code-review`](https://github.com/obra/superpowers/blob/main/skills/receiving-code-review/SKILL.md) — "NEVER 'You're absolutely right!'" pattern (як supplementary секція).

---

### PR 3 — Postgres reference-rules в `sergeant-data-and-migrations` (≈2 год, M)

**Проблема.** `sergeant-data-and-migrations` enforce-ить sequential numbering і two-phase DROP, але не покриває generic Postgres performance pitfall-и (FK без index-у, n+1, missing partial index, deadlock-prone update order, vacuum starvation). У `supabase/agent-skills` ці правила вже структуровані як reference-файли з `impact:` + EXPLAIN-прикладами + GOOD/BAD SQL.

**Скоуп.**

- Створити `.agents/skills/sergeant-data-and-migrations/references/` (нова конвенція 3-tier disclosure).
- Адаптувати **9 reference-файлів** (не 28 — берем тільки релевантне Sergeant-у; решта або supabase-specific, або не зачіпає реальні query-патерни в `apps/server`):
  - `query-missing-indexes.md`
  - `query-partial-indexes.md`
  - `query-composite-indexes.md`
  - `schema-foreign-key-indexes.md` — Postgres не індексує FK автоматично.
  - `data-batch-inserts.md`
  - `data-pagination.md`
  - `data-n-plus-one.md`
  - `lock-skip-locked.md`
  - `monitor-pg-stat-statements.md`
- У основному `SKILL.md` додати посилання-блок: "Для performance/index/lock-питань див. references/{prefix}-\*.md".
- Зберегти Sergeant-specific шари: bigint coercion (Hard Rule #1), Kyiv time, sequential migrations (Hard Rule #4) — це **наша надбудова**, не замінюється Supabase rules.

**Acceptance criteria.**

- 9 reference-файлів за форматом `agentskills.io` (`title:`, `impact: CRITICAL|HIGH|...`, `impactDescription:`, `tags:`).
- Основний `SKILL.md` ≤ 500 рядків після рестру (більшість performance-вмісту переїде в `references/`).
- `pnpm lint:skills` адаптовано перевіряти `references/*.md` shape (frontmatter required + scope check).
- `pnpm skills:lock` хешує всю директорію скілу включно з `references/`.
- Кожен reference-файл містить (а) "Incorrect" SQL з поясненням чому погано, (б) "Correct" SQL з поясненням чому добре, (в) Sergeant-specific нотатку якщо є (наприклад, у `query-missing-indexes` згадати наші bigint-серіалізатори).

**Files touched.**

- `.agents/skills/sergeant-data-and-migrations/SKILL.md` (slim).
- `.agents/skills/sergeant-data-and-migrations/references/*.md` (9 нових).
- `.agents/skills-lock.json`.
- `scripts/lint-skills.mjs` (extension для `references/`).

**References.**

- [`supabase/agent-skills/skills/supabase-postgres-best-practices/references/`](https://github.com/supabase/agent-skills/tree/main/skills/supabase-postgres-best-practices/references) — джерело-форма (MIT — атрибутувати в кожному адаптованому файлі).
- [`docs/governance/rules/04-sql-migrations-sequential-two-phase.md`](../governance/rules/04-sql-migrations-sequential-two-phase.md) — наш супутній hard-rule.

---

### PR 4 — `sergeant-e2e-testing` skill (≈2 дні, M)

**Проблема.** Sergeant використовує Playwright для E2E (див. `apps/web` test-stack), але немає specialist-skill-у про Playwright-discipline. `sergeant-web-ui` згадує a11y і design tokens, але golden-rules для Playwright (web-first assertions, fixtures over globals, traces='on-first-retry', retries=2-in-CI/0-locally, ніколи `page.waitForTimeout()`) — розкидані по PR-описах і не enforce-ні.

**Скоуп.**

- Створити `.agents/skills/sergeant-e2e-testing/SKILL.md`.
- Тригер-описи: "Playwright тести, E2E, snapshot regression, accessibility automation, MSW + Playwright integration".
- Body: 8 golden rules (адаптовано з `testdino-hq/playwright-skill` + `obra/superpowers/test-driven-development` для red-green-refactor частини).
- `references/`:
  - `selectors.md` — preferred locators (role > text > testid; уникати nth-child).
  - `network-mocking.md` — коли мокати, коли ні; інтеграція з MSW.
  - `auth-flow.md` — Better Auth login fixture (Sergeant-specific).
  - `traces-and-debugging.md` — `'on-first-retry'`, `--ui` mode.
- Оновити `agent-skills-catalog.md` і `sergeant-start-here/SKILL.md` (роутинг-таблиці).

**Acceptance criteria.**

- Скіл проходить `pnpm lint:skills` і додано в `skills-lock.json`.
- Routing-рядок у `sergeant-start-here` для сценарію "Playwright / E2E / smoke test".
- Жодне правило skill-у не суперечить існуючим `apps/web` Playwright-конфігам — якщо є невідповідність, спочатку фіксимо конфіг окремим PR.
- Опційно: `pnpm test:e2e` (якщо є alias) посилається на skill в README як "guidelines see `.agents/skills/sergeant-e2e-testing`".

**Files touched.**

- `.agents/skills/sergeant-e2e-testing/SKILL.md` + `references/*.md`.
- `.agents/skills/sergeant-start-here/SKILL.md` (routing-таблиця).
- `.agents/skills-lock.json`.
- `docs/agents/agent-skills-catalog.md` (новий рядок).

**References.**

- [`testdino-hq/playwright-skill`](https://agentskills.so/skills/testdino-hq-playwright-skill-playwright-skill) — golden rules.
- [`obra/superpowers/test-driven-development`](https://github.com/obra/superpowers/blob/main/skills/test-driven-development/SKILL.md) — red-green discipline.
- [`anthropics/skills/webapp-testing`](https://github.com/anthropics/skills/blob/main/skills/webapp-testing/SKILL.md) — reconnaissance-then-action pattern.

---

### PR 5 — Security body-scan як гейт у `pnpm lint:skills` (≈1 день, M) ✅ (merged: #2378, 2026-05-10)

**Проблема.** `pnpm lint:skills` зараз перевіряє shape (frontmatter, links) + integrity (SHA-256 ↔ skills-lock.json). Не перевіряє body на injection-патерни. `agentskill.sh` запровадив сервер-side static analysis на 12 категорій загроз після широковідомого OpenClaw-інциденту; це доцільно мати як local CI-gate теж.

**Скоуп.**

- У `scripts/lint-skills.mjs` додати body-scanner, що шукає підозрілі патерни:
  - **Команд injection:** літеральні `curl … | sh`, `wget … | bash`, `eval $(`, `\`...\`` в інструкціях, що пропонує агенту виконати arbitrary HTTP-результат.
  - **Data exfiltration:** `cat /etc/passwd`, читання `~/.ssh/id_*`, читання `.env` файлів і HTTP-POST з ними.
  - **Credential harvesting:** інструкції відкривати `~/.aws/credentials`, `~/.config/gcloud/`, browser cookie storage.
  - **Prompt injection:** теги `<system>`, `<persona>`, що намагаються переписати system-prompt агента.
  - **Persistence:** `crontab`, `systemctl enable`, `~/.bashrc` editing без user-prompt-у.
  - **Reverse shells:** `nc -e`, `bash -i >& /dev/tcp/*`.
  - **Destructive:** `rm -rf /`, `git reset --hard`, `git clean -fd` без guard-у.
- Запустити сканер проти всіх 12 існуючих skill-ів — зафіксувати baseline (очікую 0 hits, але треба перевірити).
- Додати unit-тести для сканера (`scripts/__tests__/lint-skills-scan.test.mjs`).
- Як behavior-shaping content тут немає, severity = `error` із самого початку (не warning).

**Acceptance criteria.**

- Сканер ловить ≥ 7 категорій загроз з регресійних fixture-ів у `scripts/__tests__/fixtures/malicious-skills/`.
- Прогін на 12 існуючих skill-ів дає 0 hits (clean baseline).
- `pnpm lint:skills` падає на synthetic malicious skill-фікстурі.
- Розділ "Skill body security" додано в [`docs/governance/rules/`](../governance/rules/) — або як sub-clause до Rule #10, або як нова Rule #22 (`active-initiative`, deadline 2026-Q3).
- Якщо нова Hard Rule — оновити `hard-rules.json`, `hard-rules-matrix.md`, AGENTS.md table; pass `pnpm lint:hard-rules-registry`.

**Files touched.**

- `scripts/lint-skills.mjs`.
- `scripts/__tests__/lint-skills-scan.test.mjs` + `fixtures/malicious-skills/*.md`.
- `docs/governance/hard-rules.json` (якщо нова rule).
- `docs/governance/hard-rules-matrix.md` (regenerated).
- `docs/governance/rules/22-skill-body-security-scan.md` (опційно).
- `AGENTS.md` Hard rules table (опційно).

**References.**

- [`agentskill.sh`](https://agentskill.sh/) — категорії загроз (12 категорій: command injection / data exfiltration / credential harvesting / prompt injection / persistence / sensitive file access / external calls / reverse shells / destructive commands / social engineering / obfuscation / supply-chain).
- OpenClaw incident — search-tag: "OpenClaw skills attack 2025" (sources: agentskill.sh blog, Koi.ai writeup; конкретний URL зафіксувати на момент PR-у).
- Існуючий `docs/governance/rules/07-pre-commit-hooks-via-husky.md` — формат hard-rule файлу.

---

### PR 6 — Reference-folder convention як сторінка governance (≈1 год, S)

**Проблема.** Якщо PR 3 (Postgres references) і PR 4 (e2e references) внесуть `references/` у два скіли, треба canonical опис: коли робити reference-файл, як називати, які frontmatter-поля обов'язкові. Без цього через 6 місяців отримаємо drift (один скіл — `references/{prefix}-*.md`, інший — `refs/*-{name}.md`).

**Скоуп.**

- Додати секцію "Reference files convention" у `docs/agents/agent-skills-catalog.md` (або винести в окремий `docs/agents/skill-authoring-guide.md`).
- Оригінальний body-skill ≤ 500 рядків; деталі — у `references/{prefix}-{name}.md`.
- Frontmatter obligatory: `title`, `impact: CRITICAL|HIGH|MEDIUM-HIGH|MEDIUM|LOW-MEDIUM|LOW`, `impactDescription`, `tags: [...]`.
- Body: "Incorrect (description)" SQL/code → "Correct (description)" SQL/code → optional Sergeant-specific нотатки.
- Розширити `pnpm lint:skills` валідацією `references/` shape.

**Acceptance criteria.**

- Документ у `docs/agents/` із прикладом (адаптована sample-сторінка зі stop-skip locked).
- `pnpm lint:skills` перевіряє reference-frontmatter shape і зелений на baseline.
- Cross-link з `agent-skills-catalog.md` на цю секцію.

**Files touched.**

- `docs/agents/skill-authoring-guide.md` АБО розширення `docs/agents/agent-skills-catalog.md`.
- `scripts/lint-skills.mjs`.
- `docs/agents/README.md` (додати рядок у table).

**References.**

- [`agentskills.io`](https://agentskills.io/) open standard.
- [`anthropics/skills/skill-creator`](https://github.com/anthropics/skills/tree/main/skills/skill-creator) — § "Anatomy of a Skill".
- [`supabase/agent-skills/AGENTS.md`](https://github.com/supabase/agent-skills/blob/main/AGENTS.md) — § "Reference File Format".

---

### PR 7 — Skill evals: quantitative trigger-testing (≈2 дні, L)

**Проблема.** Зараз ми не маємо способу перевірити **чи правильно тригериться** скіл. `pnpm lint:skills` перевіряє shape, але не behavior. Якщо хтось зламає `description:` (PR 1 робить його pushy → потім хтось downgrade-ить), не дізнаємось доки агент не помиляється у проді.

**Скоуп.**

- Створити `.agents/skills/<skill>/evals/evals.json` для 3 priority-skill-ів: `sergeant-start-here`, `sergeant-feature-delivery`, `sergeant-bugfix-and-regression`.
- Кожен файл — 5–7 prompt-ів (`{ "id": …, "prompt": "…", "expected_skill": "…", "must_match": [...], "must_not_match": [...] }`).
- Expected-skill assertion — простий substring-checker, без real-LLM-запиту (тестуємо routing-table в `sergeant-start-here` і description-тригери, не runtime-LLM).
- Опційно (post-PR): runner з реальним LLM-запитом → відкладено в PR 8.
- Додати команду `pnpm test:skill-evals` що прогоняє shape + routing-checker.

**Acceptance criteria.**

- 3 skill-и мають `evals/evals.json` з ≥ 5 prompt-ів кожен.
- `pnpm test:skill-evals` зелений локально + CI.
- Якщо хтось редагує `description:` так, що eval-prompt більше не тригерить очікуваний skill — гейт падає.
- Документ у `docs/agents/skill-authoring-guide.md` (PR 6) розширено інструкцією про evals.

**Files touched.**

- `.agents/skills/{sergeant-start-here, sergeant-feature-delivery, sergeant-bugfix-and-regression}/evals/evals.json`.
- `scripts/test-skill-evals.mjs`.
- `package.json` (`scripts.test:skill-evals`).
- CI-workflow (`.github/workflows/skill-freshness.yml` — додати step або новий workflow).

**References.**

- [`anthropics/skills/skill-creator`](https://github.com/anthropics/skills/tree/main/skills/skill-creator) — § "Test Cases".
- `evals/evals.json` schema reference у тому ж скілі.

---

### PR 8 — Real-LLM eval runner (опційно, ≈2 дні, L) — POST-FREEZE

**Проблема.** Substring-eval-checker (PR 7) не ловить ситуації, коли два скіли тригеряться одночасно або жоден. Реальний LLM-запит — точніший, але дорогий.

**Скоуп.**

- Runner запускає Claude/GPT з prompt-ом + всіма 12 description-ами як tools і дивиться, який tool вибрав.
- Variance analysis: 5 runs per prompt (LLM варіативний).
- Бюджет: ≤ $5/run всього suite (~50 prompts × 5 runs × ~200 tokens).
- Дзвінки опт-in (тільки за `pnpm test:skill-evals --real-llm`); CI запускає тільки на main після merge, не на PR.

**Acceptance criteria.**

- `pnpm test:skill-evals --real-llm` працює локально проти `ANTHROPIC_API_KEY` чи `OPENAI_API_KEY` env.
- Звіт варіативності pinned в `.agents/skills/<skill>/evals/results-baseline.json`.
- CI-cron (weekly) запускає suite і додає issue-comment у тред initiative-и, якщо routing accuracy < 90%.

**Files touched.**

- `scripts/test-skill-evals.mjs` (extension).
- `.agents/skills/*/evals/results-baseline.json` (нові).
- CI workflow (новий cron-job).

**References.**

- [`anthropics/skills/skill-creator/scripts/eval-viewer/`](https://github.com/anthropics/skills/tree/main/skills/skill-creator) — `generate_review.py` як референс.

---

### PR 9 — `verification-before-completion` як cross-link з PR template (≈30 хв, S) ✅ (merged: #2375, 2026-05-10)

**Проблема.** PR 2 додає Iron Law у `sergeant-review-and-merge`. Але людина-контриб'ютор не обов'язково читає skill-и. PR template вже має чек-лист "Verification" з командами — треба явно лінкувати на skill-секцію.

**Скоуп.**

- Один рядок у `.github/PULL_REQUEST_TEMPLATE.md` § Verification: "Перед claim-ом 'Done' — Iron Law gate з [`sergeant-review-and-merge`](../../.agents/skills/sergeant-review-and-merge/SKILL.md), секція 'Verification gate' (додана в PR 2)".
- Один рядок у `docs/agents/onboarding.md` § "Перед PR" — те саме посилання.

**Acceptance criteria.**

- PR template містить посилання, що резолвиться у відрендереному UI GitHub-у.
- `pnpm docs:check-links` зелений.

**Files touched.**

- `.github/PULL_REQUEST_TEMPLATE.md`.
- `docs/agents/onboarding.md`.

---

## Priority matrix

| #   | PR                                | Effort | Value-per-hour | Dependencies        | Status   |
| --- | --------------------------------- | ------ | -------------- | ------------------- | -------- |
| 1   | Pushy descriptions audit          | S      | High           | none                | ✅ #2374 |
| 2   | Verification gate in review skill | S      | **Highest**    | none                | ✅ #2373 |
| 3   | Postgres references               | M      | High           | (no hard dep)       |          |
| 4   | E2E testing skill                 | M      | Medium         | (no hard dep)       |          |
| 5   | Security body-scan in lint:skills | M      | High           | none                | ✅ #2378 |
| 6   | References folder convention      | S      | Medium         | depends on PR 3 / 4 |          |
| 7   | Skill evals (substring)           | L      | Medium-High    | depends on PR 1     |          |
| 8   | Real-LLM eval runner              | L      | Medium         | depends on PR 7     |          |
| 9   | PR template cross-link            | S      | High           | depends on PR 2     | ✅ #2375 |

**Recommended starting order:** PR 2 → PR 1 → PR 5 → PR 9 → PR 3 → PR 6 → PR 4 → PR 7 → PR 8.

**Найдешевший quality-bump:** PR 2 (Verification gate) — лінгвістична дисципліна, що ловить 60-70% "Should pass now" / "Looks correct" хибних completion claims одним прочитанням SKILL.md.

---

## Anti-scope (що ми НЕ робимо)

- **`npx @agentskill.sh/cli@latest setup`.** Цей CLI ставить `/learn` команду + опційно дамп generic-скілів у `.claude/skills/`. Конфліктує з нашою policy "не покладайся на repo-owned обгортки generic-skill-ів" ([`sergeant-start-here`](../../.agents/skills/sergeant-start-here/SKILL.md)) і ламає hash-lock дисципліну.
- **Імпорт generic-skillset-ів** (`GreenXred/Front-dev`, `Hoaiduc195/Backend`). Конфліктує з RQ keys factory, design tokens, Hard Rule #2/#8/#9.
- **OpenClaw-derived скіли** (`openclaw/feishu-*`, `openclaw/xurl`, `openclaw/voice-call`). Tool wrapper-и для зовнішніх сервісів поза стеком; багато мають security-аудит-issues (acp-router: 3 high + 6 medium).
- **`anthropics/frontend-design`.** "Bold aesthetic direction, avoid Inter font" — суперечить нашому design-tokens-system.
- **Supabase RLS skills.** У нас Better Auth + opaque IDs, а не Postgres RLS — рекомендації не translate-ються.
- **Перейменування існуючих skill-frontmatter-полів** під 1:1 `agentskills.io` standard. Ми лишаємо `lang:` + `lang-reason:` (PR [#1848](https://github.com/Skords-01/Sergeant/pull/1848)) — це bilingual-routing, не cosmetics.

---

## Tracking

Цей документ — discovery roadmap, не active initiative. PR-и можна брати в довільному порядку (з урахуванням dependencies в матриці вище). Якщо post-freeze (≥ 2026-06-02) команда вирішить підняти це у формальну initiative-у з owner-ом і ETA — створити `docs/initiatives/00NN-skills-evolution.md` і перенести скоуп з цього файлу. До того часу:

- При закритті PR — додати рядок у "PR-послідовність" вище: `(merged: #NNNN, YYYY-MM-DD)`.
- При drift — додати errata-блок із поясненням.
- `Next review:` дата зверху bump-ається при кожному значущому update-і.

## See also

- [`docs/agents/README.md`](./README.md) — індекс agent-OS docs.
- [`docs/agents/agent-skills-catalog.md`](./agent-skills-catalog.md) — поточна skill-routing таблиця.
- [`docs/initiatives/0009-agent-os-hardening.md`](../initiatives/0009-agent-os-hardening.md) — попередня agent-OS initiative-а (closed 2026-05-05).
- [`docs/governance/audit-freeze-2026-05-05.md`](../governance/audit-freeze-2026-05-05.md) — чому це не initiative.
