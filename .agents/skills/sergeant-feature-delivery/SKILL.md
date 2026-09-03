---
name: sergeant-feature-delivery
description: Use when building a new Sergeant feature, screen, endpoint, workflow, or behavior change needing design, planning, tests, docs, and verification — even if scope looks small; UA: робиш нову фічу/екран/endpoint.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Доставка фіч у Sergeant

Робота над фічами в Sergeant має рухатися як дисциплінований slice, а не як розкидані правки. Спершу design, потім — найменша звʼязна зміна, що дотримується правил репо.

## Flow

1. Перечитай `AGENTS.md`, відповідний specialist skill і будь-який relevant playbook у `docs/00-start/playbooks/`.
2. Потрібна спека (зміна нетривіальна або product-facing)? Писати її самому не можна — заходь у [`sergeant-spec`](../sergeant-spec/SKILL.md): інтервʼю з власником передує документу, і за відсутності каналу до нього деліверабл це список питань, а не спека. Форму гейтить `pnpm lint:specs`. Готову спеку БЕЗ відкритих блокерів виконує агент `spec-executor` — його контракт читає її як settled, тож він не місце для здогадок.
3. Визнач, де живе код, через `sergeant-monorepo-boundaries` ще до додавання файлів.
4. Спершу додай тести там, де змінюється поведінка: unit, контракт, UI або migration verification — за релевантністю.
5. Імплементуй мінімальний end-to-end slice.
6. Онови доки лише там, де змінилася operator- або contributor-поведінка.
7. Прогони цільову верифікацію перед тим, як казати «готово» — канонічний гейт і таблиця «claim → proving command» у [`sergeant-verify-before-done`](../sergeant-verify-before-done/SKILL.md). Для крос-поверхневої фічі перед цим — `sergeant-qa-squad`.

## Завжди покривай

- Користувацький success-шлях
- Один failure- або empty-state шлях
- Ризик регресії на зачепленій поверхні
- Sync доків/spec-у, якщо зміна вводить новий workflow, endpoint або deployment requirement

## Куди роутити по поверхнях

Роутинг двовимірний: фіча в продуктовому модулі (finyk / nutrition / fizruk / routine / AI-шар) чи інфра-модулі (sync / billing / integrations / push) — **спершу** завантаж його `sergeant-module-*` скіл (канон, § Журнал рішень, мапа файлів, інваріанти), потім surface-скіл нижче. Таблиця сигналів — `sergeant-start-here` § «Роутся одразу».

- Web/PWA: `sergeant-web-ui`
- Server/API: `sergeant-server-api`
- БД/міграції: `sergeant-data-and-migrations`
- Mobile/Expo: `sergeant-mobile-expo`
- HubChat / AI-шар: `sergeant-module-ai`
- Auth: `better-auth-best-practices`

## Поширені помилки

- Починати в `apps/web` чи `apps/server` ще до того, як вирішено, чи логіка має жити у спільному package
- Виливати behavior-зміни без правок відповідних тестів
- Оновлювати доки як changelog dump замість того, щоб правити лише зачеплений canonical doc

## Playbooks

- `docs/00-start/playbooks/add-api-endpoint.md` — server-контракт + api-client + тести в одному кроці.
- `docs/00-start/playbooks/add-feature-flag.md` — flag-gated rollout нової поведінки.
- `docs/00-start/playbooks/add-onboarding-step.md` — коли фіча торкається onboarding-у.
- Каталог: `docs/00-start/agents/agent-skills-catalog.md`.
