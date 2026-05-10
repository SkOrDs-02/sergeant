---
name: sergeant-feature-delivery
description: Use when building a new Sergeant feature, screen, endpoint, workflow, or behavior change needing design, planning, tests, docs, and verification — even if scope looks small; UA: робиш нову фічу/екран/endpoint.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# Доставка фіч у Sergeant

Робота над фічами в Sergeant має рухатися як дисциплінований slice, а не як розкидані правки. Спершу design, потім — найменша звʼязна зміна, що дотримується правил репо.

## Flow

1. Перечитай `AGENTS.md`, відповідний specialist skill і будь-який relevant playbook у `docs/playbooks/`.
2. Запиши або онови design/spec у `docs/agents/specs/`, коли зміна нетривіальна або product-facing.
3. Визнач, де живе код, через `sergeant-monorepo-boundaries` ще до додавання файлів.
4. Спершу додай тести там, де змінюється поведінка: unit, контракт, UI або migration verification — за релевантністю.
5. Імплементуй мінімальний end-to-end slice.
6. Онови доки лише там, де змінилася operator- або contributor-поведінка.
7. Прогон цільову верифікацію перед тим, як казати «готово».

## Завжди покривай

- Користувацький success-шлях
- Один failure- або empty-state шлях
- Ризик регресії на зачепленій поверхні
- Sync доків/spec-у, якщо зміна вводить новий workflow, endpoint або deployment requirement

## Куди роутити по поверхнях

- Web/PWA: `sergeant-web-ui`
- Server/API: `sergeant-server-api`
- БД/міграції: `sergeant-data-and-migrations`
- Mobile/Expo: `sergeant-mobile-expo`
- HubChat: `sergeant-hubchat`
- Auth: `better-auth-best-practices`

## Поширені помилки

- Починати в `apps/web` чи `apps/server` ще до того, як вирішено, чи логіка має жити у спільному package
- Виливати behavior-зміни без правок відповідних тестів
- Оновлювати доки як changelog dump замість того, щоб правити лише зачеплений canonical doc

## Playbooks

- `docs/playbooks/add-api-endpoint.md` — server-контракт + api-client + тести в одному кроці.
- `docs/playbooks/add-feature-flag.md` — flag-gated rollout нової поведінки.
- `docs/playbooks/add-onboarding-step.md` — коли фіча торкається onboarding-у.
- Каталог: `docs/agents/agent-skills-catalog.md`.
