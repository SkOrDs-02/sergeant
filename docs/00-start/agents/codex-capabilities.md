# Codex capabilities у Sergeant

> **Last touched:** 2026-09-01 by @Skords-01. **Next review:** 2026-12-19.
> **Status:** Active

Цей документ пояснює простими словами, що Codex у цьому репо вже вміє, як це викликати, і що потребує явної команди від тебе.

## Що працює автоматично

- **Repo skills** у [`.agents/skills/`](../../../.agents/skills) — правила роботи по поверхнях: web, server, mobile, migrations, HubChat, security, tech-debt. Агент сам має стартувати з `sergeant-start-here` і вибрати один specialist skill під задачу.
- **Git / shell / pnpm** — Codex може читати репо, запускати перевірки, робити коміти й PR, коли задача цього потребує.
- **Codex hooks** у [`.codex/hooks.json`](../../../.codex/hooks.json) — локальні guards перед небезпечними edit/bash діями. Вони не замінюють Husky/CI, а ловлять очевидні помилки раніше.
- **`pnpm codex:status`** — read-only статус: branch, dirty files, скільки Codex agents і repo skills видно.

## Що потребує явної команди від тебе

- **Subagents / Agent Team** — Codex запускає їх тільки якщо ти явно просиш агентів, делегацію або паралельну роботу. Наприклад: "використай агентів для QA" або "запусти review squad".
- **Browser-перевірка UI** — зазвичай достатньо сказати "перевір у браузері" або попросити screenshot/localhost QA.
- **Image generation/editing** — потрібен прямий запит на зображення.
- **Automations / reminders** — потрібен прямий запит "нагадай", "перевір завтра", "монітор".
- **Web search** — Codex використовує його для актуальних зовнішніх фактів або коли ти просиш "знайди/перевір в інтернеті".

## Codex agents

`.codex/agents/*.toml` — це спеціалізовані ролі для делегації. Вони не замінюють skills; skills кажуть "які правила", agents виконують вузький шмат роботи.

**Ці файли генеруються, а не пишуться руками.** Канонічне визначення кожної ролі живе в `.claude/agents/<name>.md` (front matter + тіло інструкції); `pnpm codex:sync-agents` перетворює його на `.toml`, а `pnpm lint:codex-agents` (усередині `pnpm lint`) валить збірку, щойно копії розійшлись. Так було не завжди: до 2026-09-01 tomlʼи писались руками як скорочені перекази, і з них тихо повипадали evidence discipline, межі ролей і формати звітів — тобто Codex діставав слабшу версію того самого агента. Правило просте: правиш роль — правиш `.md`, потім `pnpm codex:sync-agents`.

Ролі, у яких у front matter немає write-інструментів, отримують у згенерованому файлі перший рядок `READ-ONLY ROLE` — це переносить обмеження, якого в схемі `.toml` немає.

Групи (27 агентів):

- **Delivery (крос-поверхневий ланцюг):** `migration-agent` → `server-agent` → `api-client-agent` → `web-agent` / `mobile-agent`.
- **Module owners (одна фіча в межах одного модуля, всі поверхні):** `finyk-owner`, `nutrition-owner`, `fizruk-owner`, `routine-owner`, `ai-owner`.
- **Spec execution:** `spec-executor` — виконує готову спеку з `docs/90-work/planning/specs/`.
- **QA:** `qa-server`, `qa-web`, `qa-mobile`, `qa-packages`. (`qa-openclaw` видалено разом із поверхнею — ADR-0075.)
- **Review:** `contract-reviewer`, `design-reviewer`, `security-reviewer`, `docs-reviewer`.
- **Audit / history:** `docs-governance-auditor`, `canon-drift-auditor`, `product-historian`.
- **Council:** `council-critic`, `council-growth-advisor`, `council-product-strategist`, `council-tech-architect`, `council-ux-advocate`.

Вибір між delivery-ланцюгом і module owner-ом: фіча з контрактними залежностями через 2+ поверхні — delivery; задача всередині одного продуктового модуля від міграції до UI — owner.

## Спеки

Спека — це самодостатній документ у [`docs/90-work/planning/specs/`](../../90-work/planning/specs/), написаний так, щоб сесія з нульовим контекстом могла його виконати: скоуп, що поза скоупом, план розкатки по PR і секція `§ Верифікація` з конкретними гейтами. Шаблон — [`TEMPLATE.md`](../../90-work/planning/specs/TEMPLATE.md).

- **Нова фіча / екран / endpoint / зміна поведінки, більша за дрібний фікс** — спершу спека, потім код. Кодити одразу можна на багфіксі з чітким репро, на зміні ≤2 файлів з очевидними вимогами і коли спека вже існує.
- **Виконання спеки** — `spec-executor`: читає документ цілком, тримається його плану розкатки, проганяє кожен гейт із `§ Верифікація` і звітує реальними exit codes. Усе, що спека позначила «Поза скоупом», лишається поза скоупом.
- **Суперечність усередині спеки або шлях, якого немає** — це стоп по тому пункту й запис у звіт, а не імпровізація.

## Як просити

- "Зроби задачу" — Codex працює сам, без subagents.
- "Використай агентів" — Codex може делегувати частини роботи.
- "Виконай спеку X" — `spec-executor` бере файл зі `specs/` і йде по ньому.
- "Запусти QA squad" — `qa-server`, `qa-web`, `qa-mobile`, `qa-packages` працюють паралельно.
- "Запусти review squad" — contract/design/security/docs reviewers перевіряють PR diff.
- "Зроби docs governance audit" — `docs-governance-auditor` шукає дублікати active trackers і stale docs, але не редагує сам.
- "Чому так вирішили?" — `product-historian` шукає відповідь у журналах рішень і ADR, не переглядаючи саме рішення.
