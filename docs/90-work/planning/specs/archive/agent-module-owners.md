# SPEC: Модульний шар агентної системи (module-owner скіли + Claude-агенти)

> **Last touched:** 2026-08-30 by @Skords-01. **Next review:** 2026-12-27.
> **Status:** Archived (реалізовано) — розкатано PR #889-#892 (+ полірування #895): 13 скілів у `.agents/skills/`, 8 агентів у `.claude/agents/`, двовимірний роутинг у AGENTS.md.

<!-- Самодостатня спека: виконавець (свіжа сесія, нуль контексту з розмови-інтервʼю)
реалізує зміни, читаючи лише її. Створена через скіл `spec` 2026-08-27. -->

## Проблема

Усі 23 скіли в `.agents/skills/` організовані за поверхнями (web/server/mobile), дисциплінами (security, tech-debt, QA) або воркфлоу (squads, council) — жоден за продуктовим модулем. При цьому канони модулів існують: `docs/01-product/model/` містить 5 повних канон-доків (finyk 79.6K, nutrition 90.9K, fizruk 47.7K, routine 53K, hub-coach 60K), але grep по `.agents/skills/**/SKILL.md` дає **нуль** посилань на них — канони «сироти», роутинг агентів про них не знає. Задача по finyk сьогодні вантажить `sergeant-server-api` + `sergeant-web-ui`, які нічого не знають про продуктові рішення finyk, тож maintainer пояснює контекст модуля щосесії. Per-модульного журналу рішень немає (`docs/00-start/agents/decisions.md` — про agent-ops, не про продукт). Інфра-поверхні (sync/dualwrite, billing, зовнішні інтеграції, push) не мають ні канону, ні скіла.

## Мета

Задача, що торкається модуля X, автоматично отримує продуктовий контекст X — канон, журнал рішень, мапу файлів, модульні інваріанти — без жодного пояснення в сесії. Роутинг стає двовимірним: **модуль** (продуктовий контекст) × **поверхня** (технічні правила). Наявні lint-гейти (`pnpm lint:agent-graph`, `pnpm lint:skills`, freshness-маркери) охоплюють новий шар, щоб він не гнив. Перевірити можна так: свіжа сесія з задачею «зміни поведінку X у finyk» вантажить `sergeant-module-finyk` і цитує канон/журнал, не питаючи maintainer-а про контекст.

## Рішення дизайну

1. **Еволюція, не rebuild.** Фундамент (AGENTS.md як source of truth, `.agents/skills/`, `.claude/agents/`, agent-graph, freshness-гейти) лишається; додається модульний шар поверх. Відкинуто: перехід на зовнішні фреймворки (Agent OS, BMAD, memory-bank) — жоден не покриває per-модульність краще за наявне.
2. **Owner-и — це скіли** (harness-neutral, працюють для будь-якого харнеса), **плюс Claude-агенти** як делеговані виконавці — Claude Code є основним інструментом maintainer-а.
3. **9 модульних скілів однією ініціативою**: 5 продуктових (`sergeant-module-finyk`, `-nutrition`, `-fizruk`, `-routine`, `-ai`) + 4 інфра (`sergeant-module-sync`, `-billing`, `-integrations`, `-push`). Відкинуто: пілот з 2 скілів — maintainer обрав повне покриття одразу.
4. **`sergeant-hubchat` поглинається `sergeant-module-ai`**: механіка (tool defs, executors, prompt cache, action cards) переїжджає в тіло нового скіла; `sergeant-hubchat/SKILL.md` стає deprecated-вказівником (Status: Deprecated, Rule #10). Відкинуто: два окремі скіли — два хопи на одну AI-задачу.
5. **Журнал рішень продуктового модуля — секція в його каноні** (`docs/01-product/model/<module>.md § Журнал рішень`), формат як у `docs/00-start/agents/decisions.md`: append-only таблиця `| Дата | Рішення | Джерело/ADR |`, найновіші зверху, курована maintainer-ом. Правило «PR міняє продуктову поведінку → оновлює канон у тому ж PR» (AGENTS.md § See also) автоматично покриває і журнал. Відкинуто: окремий файл (подвоює кількість файлів) і спільний журнал (плоска купа, все читається всіма).
6. **Інфра-модулі без канонів**: контекст і журнал живуть прямо в SKILL.md (секції `## Контекст` і `## Журнал рішень`). Канон-док створюється лише коли скіл доросте (>15 записів журналу або >200 рядків контексту) — YAGNI.
7. **Nested вказівники — CLAUDE.md** (не AGENTS.md) у теках модулів web + server + domain-пакетів. Claude Code вантажить їх ліниво при вході в теку; інші харнеси роутяться через `pnpm agent:route` і таблицю `sergeant-start-here`. Відкинуто: дублювати ще й AGENTS.md ×22 файли.
8. **4 нові прості скіли-дисципліни**: `sergeant-copy-and-tone` (UA-копірайтинг за `docs/01-product/copy/style-guide.uk.md`), `sergeant-adr` (написання/оновлення ADR + індекс у `docs/04-governance/adr/`), `sergeant-feature-flags` (робота з реєстром `docs/02-engineering/architecture/feature-flags.md`), `sergeant-analytics` (PostHog-івенти: коли додавати, неймінг, де живуть виклики).
9. **8 нових Claude-агентів** у `.claude/agents/`: 5 module-owner виконавців (`finyk-owner`, `nutrition-owner`, `fizruk-owner`, `routine-owner`, `ai-owner`) + `canon-drift-auditor` (read-only: канон ↔ код) + `product-historian` (read-only: «чому так вирішили») + `spec-executor` (виконує спеки з `docs/90-work/planning/specs/` у worktree).
10. **Розкатка 4 PR-ами** (A→D нижче), кожен зелений і самодостатній — інакше diff нередвʼюабельний.
11. **Межа owner-агент ↔ deliver-squad**: squad-агенти (migration→server→api-client→web/mobile) ведуть крос-поверхневу фічу по стадіях; module-owner працює **всередині одного модуля** на всіх його поверхнях. Зафіксувати в `description` кожного owner-агента.

## Поверхня змін

Шляхи перевірені 2026-08-27. Модульні теки: web — `apps/web/src/modules/{finyk,fizruk,nutrition,routine}/`; server — `apps/server/src/modules/` містить `finyk`, `nutrition`, AI-шар (`chat`, `mono`, `digest`, `ai-memory`) та інфру (`sync`, `billing`, `push`, `silpo`, `telegram`, `transcribe`, `webhooks`, …). **На сервері НЕМАЄ тек `fizruk/` і `routine/`** (client-local модулі, дані йдуть через sync) — не вигадувати їх. Domain-пакети: `packages/{finyk-domain,fizruk-domain,nutrition-domain,routine-domain}/`, sync-ядро — `packages/dualwrite-core/`.

### Нові файли

- `.agents/skills/sergeant-module-{finyk,nutrition,fizruk,routine,ai}/SKILL.md` — 5 продуктових owner-скілів.
- `.agents/skills/sergeant-module-{sync,billing,integrations,push}/SKILL.md` — 4 інфра owner-скіли (integrations покриває silpo + telegram + transcribe + webhooks).
- `.agents/skills/sergeant-{copy-and-tone,adr,feature-flags,analytics}/SKILL.md` — 4 прості скіли.
- `.claude/agents/{finyk-owner,nutrition-owner,fizruk-owner,routine-owner,ai-owner,canon-drift-auditor,product-historian,spec-executor}.md` — 8 агентів.
- Nested CLAUDE.md-вказівники (~22 файли по 5–7 рядків):
  - web: `apps/web/src/modules/{finyk,fizruk,nutrition,routine}/CLAUDE.md` (4);
  - server продуктові: `apps/server/src/modules/{finyk,nutrition}/CLAUDE.md` (2);
  - server AI-шар: `apps/server/src/modules/{chat,mono,digest,ai-memory}/CLAUDE.md` → усі 4 вказують на `sergeant-module-ai`;
  - server інфра: `apps/server/src/modules/{sync,billing,push,silpo,telegram,transcribe,webhooks}/CLAUDE.md` (7);
  - пакети: `packages/{finyk-domain,fizruk-domain,nutrition-domain,routine-domain,dualwrite-core}/CLAUDE.md` (5).

### Змінювані файли

- `docs/01-product/model/{finyk,nutrition,fizruk,routine,hub-coach}.md` — додати секцію `## Журнал рішень` (стартово 1–2 записи, перенесені з відповідних ADR, не ретроспективне наповнення).
- `.agents/skills/sergeant-hubchat/SKILL.md` — deprecated-вказівник на `sergeant-module-ai`.
- `AGENTS.md` § «Routing (surface → specialist)» — нові рядки модульного роутингу; рядок HubChat перенаправити на `sergeant-module-ai`.
- `.agents/skills/sergeant-start-here/SKILL.md` § «Роутся одразу» — модульні рядки (сигнал «задача згадує finyk/бюджети/транзакції» → `sergeant-module-finyk` + surface-скіл, і так далі).
- `docs/00-start/agents/agent-skills-catalog.md` — 13 нових записів + деприкація hubchat.
- `docs/00-start/agents/agent-workflows.md` — § про двовимірний роутинг (модуль × поверхня) і межу owner ↔ deliver-squad.
- `docs/00-start/agents/decisions.md` — рядок про це архітектурне рішення (лінк на цю спеку).
- Root `CLAUDE.md` (§ Notes: «Web-асистент → sergeant-hubchat») — замінити на `sergeant-module-ai`.
- `scripts/agent/route.mjs` — мапа шлях→модуль (`apps/web/src/modules/finyk/**`, `apps/server/src/modules/finyk/**`, `packages/finyk-domain/**` → `sergeant-module-finyk`; аналогічно для решти; `chat|mono|digest|ai-memory` → `sergeant-module-ai`; `silpo|telegram|transcribe|webhooks` → `sergeant-module-integrations`).
- `.agents/agent-graph.json` — +21 вузол (13 skill + 8 agent) і ребра: модульний скіл `dispatches` свого owner-агента; `sergeant-module-*` `escalates` у surface-скіли; `spec-executor` досяжний з `sergeant-feature-delivery`. Гейт: `pnpm lint:agent-graph`.
- `docs/00-start/agents/skill-trigger-evals.json` — по 4 кейси на кожен новий скіл (2 trigger, 1 anti-trigger, 1 workflow), за зразком наявних кейсів `better-auth-best-practices`.
- `.agents/skills-lock.json` — через `pnpm skills:lock`.
- `.kilo/harness-versions.json` — `node scripts/ci-bump-harness-version.mjs` у кожному PR, що торкає скіли/AGENTS.md.
- `docs/04-governance/pr-ledger/index.json` — після мержу кожного PR (Rule #26).

### Обовʼязковий процес для SKILL-роботи

Перед написанням будь-якого SKILL.md виконавець вантажить `.agents/skills/sergeant-writing-skills/SKILL.md` і дотримується його грамару: frontmatter `name` = slug теки, `description` ≤220 символів з EN-тригером + `; UA:` клаузою, `lang`/`lang-reason`; тіло заземлене конкретними шляхами репо; мінімум один лінк на playbook або `agent-skills-catalog.md`; без injection-патернів (Rule #22, `scripts/check-skill-body-security.mjs`). Тіло — українською (`lang: uk` + `lang-reason` за зразком `sergeant-start-here`; це чинна практика більшості скілів, попри `lang: en` у § Грамар writing-skills). RED-фаза: мінімум один пресс-промпт на скіл, зафіксований у PR-описі; eval-кейси в `skill-trigger-evals.json` — формалізований тест GREEN-фази.

## Шаблони

### Продуктовий module-owner SKILL.md (скелет)

```markdown
---
name: sergeant-module-finyk
description: Use when the task touches the Finyk personal-finance module — budgets, transactions, receipts, analytics — on any surface; UA: задача про finyk/фінанси/бюджети.
lang: uk
lang-reason: <за зразком sergeant-start-here>
---

# Finyk — власник модуля

## Канон і журнал (читати перед роботою)

- Канон: docs/01-product/model/finyk.md (включно з § Журнал рішень — рішення там уже ухвалені, не перепитуй).
- Розбіжності канон↔код: docs/90-work/audits/product-knowledge-finyk.md.

## Мапа файлів

- Web: apps/web/src/modules/finyk/ (RQ-ключі — finykKeys з apps/web/src/shared/lib/api/queryKeys.ts).
- Server: apps/server/src/modules/finyk/.
- Domain: packages/finyk-domain/.

## Інваріанти модуля

- Гроші — копійки як number (AGENTS.md § Domain invariants); bigint → Number() у серіалізаторах (Hard Rule #1).
- День-ключ — device-local (ADR-0078).
- <2-4 модуль-специфічні правила з канону>

## Роутинг далі

- Технічні правила поверхні: sergeant-web-ui / sergeant-server-api / sergeant-data-and-migrations.
- Делегування виконання: агент finyk-owner (.claude/agents/finyk-owner.md).
- Каталог: docs/00-start/agents/agent-skills-catalog.md.
```

Інфра-варіант — той самий скелет плюс секції `## Контекст` (що це за підсистема, ключові ADR) і `## Журнал рішень` (таблиця `| Дата | Рішення | Джерело/ADR |`) замість посилання на канон.

### Nested CLAUDE.md-вказівник (повний файл)

```markdown
# Модуль Finyk

Продуктовий контекст: `Read .agents/skills/sergeant-module-finyk/SKILL.md` → канон docs/01-product/model/finyk.md (§ Журнал рішень — уже ухвалені рішення).
Ключовий інваріант: гроші — копійки як number; RQ-ключі лише через finykKeys.
```

### Owner-агент (скелет frontmatter, за зразком `.claude/agents/contract-reviewer.md`)

```markdown
---
name: finyk-owner
description: "Module owner-executor for the Finyk finance module. Loads .agents/skills/sergeant-module-finyk/SKILL.md and docs/01-product/model/finyk.md (incl. § Журнал рішень) BEFORE any edit. Works across apps/web/src/modules/finyk, apps/server/src/modules/finyk, packages/finyk-domain. Trigger for delegated tasks scoped to one module. Boundary: does NOT run cross-surface feature staging (that's sergeant-deliver-squad) and does NOT touch other modules' dirs."
tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
---

<тіло: порядок роботи — канон → журнал → мапа файлів → hard rules модуля → виконання → pnpm-гейти>
```

`canon-drift-auditor` і `product-historian`: `tools: Read, Grep, Glob, Bash`, read-only за зразком review-squad агентів. `spec-executor`: повний набір tools; тіло вимагає читати спеку цілком, виконувати § Верифікація і НЕ комітити без явного прохання в задачі.

## План розкатки (4 PR, послідовно)

Гілки `claude/<desc>`, commit-scope `agents` (правки канонів — scope `docs`). Кожен PR проходить: `pnpm lint:skills && pnpm skills:lock && pnpm format:check` + `node scripts/ci-bump-harness-version.mjs` + PR-template з Governing Skill = `sergeant-writing-skills`.

- **PR-A `feat(agents): продуктові module-owner скіли`** — 5 продуктових скілів, § Журнал рішень у 5 канонах, злиття hubchat→module-ai (+deprecated-вказівник), роутинг (AGENTS.md, start-here, каталог, root CLAUDE.md), graph-вузли скілів, eval-кейси, decisions.md.
- **PR-B `feat(agents): інфра module-скіли і nested-роутинг`** — 4 інфра-скіли, ~22 nested CLAUDE.md, мапа модулів у `scripts/agent/route.mjs`, graph, eval-кейси.
- **PR-C `feat(agents): скіли-дисципліни`** — copy-and-tone, adr, feature-flags, analytics + graph + eval-кейси.
- **PR-D `feat(agents): module-owner і службові Claude-агенти`** — 8 агентів, ребра dispatches у graph, § у agent-workflows.md.

## Поза скоупом v1

- Канон-доки для інфра-модулів (журнал у SKILL.md; промоушн за критерієм з рішення 6).
- Скіли/агенти для gdpr, alerts, waitlist, feedback, me, topic-archive, logRetention, observability — додаються поштучно, коли контекст реально повторюється.
- Ретроспективне наповнення журналів рішень (стартують з 1–2 записів з наявних ADR).
- Nested-вказівники в `apps/mobile`/`apps/mobile-shell` (web-first рішення 2026-06-29 у decisions.md).
- Будь-які зміни MEMANTO / векторної памʼяті — модульний контекст живе в markdown у репо.
- CI-інтеграція canon-drift-auditor (v1 — ручний виклик агента; авто-запуск після фіч — окрема ініціатива).
- AGENTS.md-дублікати nested-вказівників.

## Верифікація (обовʼязково)

1. `pnpm lint:skills` → exit 0 (включає check-skill-shape, skills-lock, security-scan, `pnpm lint:agent-graph` без `disk-not-in-graph`, `pnpm eval:skills` з новими кейсами).
2. `pnpm skills:lock` → після запуску `git status` не показує незакомічених змін лока.
3. `pnpm format:check` → exit 0.
4. Після PR-B: зміни файл у `apps/web/src/modules/finyk/`, запусти `pnpm agent:route` → вивід містить `sergeant-module-finyk`; зміни файл у `apps/server/src/modules/silpo/` → вивід містить `sergeant-module-integrations`.
5. Behavioral smoke (свіжа сесія Claude Code): промпт «Зміни правило перенесення невитраченого бюджету в finyk» → сесія вантажить `sergeant-module-finyk`, цитує канон/журнал і НЕ ставить питань про базовий контекст модуля. Анти-тест: промпт про nutrition-дашборд не вантажить finyk-скіл (звірити з анти-тригер eval-кейсом).
6. `grep -r "sergeant-hubchat" --include="*.md"` поза deprecated-вказівником, архівами і pr-ledger → нуль згадок як активного роуту.
7. Після PR-D: виклик агента `canon-drift-auditor` з аргументом «hub-coach» повертає структурований звіт (розбіжності або явне «розбіжностей немає»); виклик `product-historian` з питанням «чому день-ключ device-local?» повертає відповідь з посиланням на ADR-0078.

## Ризики та відкриті питання

- **Розростання канонів** через журнали — мітигація: журнал курований; «дозріле» рішення переїжджає в ADR, у журналі лишається рядок-лінк (той самий механізм, що в decisions.md).
- **~22 nested CLAUDE.md** можуть здатися шумом у дереві — якщо заважатиме, згорнути до web-only одним PR і зафіксувати в decisions.md.
- **Security-scan скілів (Rule #22)** може зафолзити на лексиці analytics/feature-flags (`token`, `key`) — формулювати тіла обережно; при фолзі дивитись категорії в `scripts/check-skill-body-security.mjs`, не вимикати гейт.
- **Дублювання owner-агентів з deliver-squad** — межу зафіксовано в рішенні 11; якщо на практиці плутатиме роутинг, обʼєднати в agent-workflows.md одним деревом рішень.
- **Обсяг PR-A** (5 скілів + 5 канонів + злиття hubchat) — найбільший з чотирьох; якщо ревʼю важке, дозволено відщепити злиття hubchat в окремий PR-A2 без зміни решти плану.
