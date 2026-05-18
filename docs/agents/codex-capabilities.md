# Codex capabilities у Sergeant

> **Last validated:** 2026-05-18 by @codex. **Next review:** 2026-08-16.
> **Status:** Active

Цей документ пояснює простими словами, що Codex у цьому репо вже вміє, як це викликати, і що потребує явної команди від тебе.

## Що працює автоматично

- **Repo skills** у [`.agents/skills/`](../../.agents/skills/) — правила роботи по поверхнях: web, server, mobile, migrations, HubChat, OpenClaw, security, tech-debt. Агент сам має стартувати з `sergeant-start-here` і вибрати один specialist skill під задачу.
- **Git / shell / pnpm** — Codex може читати репо, запускати перевірки, робити коміти й PR, коли задача цього потребує.
- **Codex hooks** у [`.codex/hooks.json`](../../.codex/hooks.json) — локальні guards перед небезпечними edit/bash діями. Вони не замінюють Husky/CI, а ловлять очевидні помилки раніше.
- **`pnpm codex:status`** — read-only статус: branch, dirty files, скільки Codex agents і repo skills видно.

## Що потребує явної команди від тебе

- **Subagents / Agent Team** — Codex запускає їх тільки якщо ти явно просиш агентів, делегацію або паралельну роботу. Наприклад: "використай агентів для QA" або "запусти review squad".
- **Browser-перевірка UI** — зазвичай достатньо сказати "перевір у браузері" або попросити screenshot/localhost QA.
- **Image generation/editing** — потрібен прямий запит на зображення.
- **Automations / reminders** — потрібен прямий запит "нагадай", "перевір завтра", "монітор".
- **Web search** — Codex використовує його для актуальних зовнішніх фактів або коли ти просиш "знайди/перевір в інтернеті".

## Codex agents

`.codex/agents/*.toml` — це спеціалізовані ролі для делегації. Вони не замінюють skills; skills кажуть "які правила", agents виконують вузький шмат роботи.

Основні групи:

- **Delivery:** `migration-agent`, `server-agent`, `api-client-agent`, `web-agent`, `mobile-agent`.
- **QA:** `qa-server`, `qa-web`, `qa-mobile`, `qa-openclaw`.
- **Review:** `contract-reviewer`, `design-reviewer`, `security-reviewer`, `docs-reviewer`.
- **Docs governance:** `docs-governance-auditor`.
- **Council:** `council-critic`, `council-growth-advisor`, `council-product-strategist`, `council-tech-architect`, `council-ux-advocate`.

## Як просити

- "Зроби задачу" — Codex працює сам, без subagents.
- "Використай агентів" — Codex може делегувати частини роботи.
- "Запусти QA squad" — `qa-server`, `qa-web`, `qa-mobile`, `qa-openclaw` працюють паралельно.
- "Запусти review squad" — contract/design/security/docs reviewers перевіряють PR diff.
- "Зроби docs governance audit" — `docs-governance-auditor` шукає дублікати active trackers і stale docs, але не редагує сам.
