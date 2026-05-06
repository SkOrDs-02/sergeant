# ADR-0045: Hard Rules taxonomy — blocker-invariant / lint-enforced-convention / active-initiative

- **Status:** Accepted
- **Date:** 2026-05-04
- **Last validated:** 2026-05-06 by Codex. **Next review:** 2026-08-04.
  > **Status:** Active
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/initiatives/0009-agent-os-hardening.md`](../initiatives/0009-agent-os-hardening.md) §Phase 3.1
  - [`docs/governance/hard-rules.json`](../governance/hard-rules.json) — реєстр (single source of truth для скриптів)
  - [`docs/governance/hard-rules-matrix.md`](../governance/hard-rules-matrix.md) — auto-generated enforcement-матриця
  - [`AGENTS.md`](../../AGENTS.md) §Hard rules + §Lint-enforced design conventions

---

## Context and Problem Statement

«Hard rule» в Sergeant до 2026-05 був семантичним super-set'ом, який поглинув три різні класи інваріантів:

1. Ран-тайм / процес-інваріанти (пошкодження даних, deploy-катастрофи, branch-protection): rules #1 (bigint coercion), #4 (sequential migrations), #6 (no force-push), #7 (Husky pre-commit). Порушення цих правил = data loss / outage / silent regression.
2. Стилістичні / процесні правила з механічним enforcement: rules #5 (Conventional Commits scope enum), #8 (colour-opacity scale), #9 (`-strong` companion), #10 (lifecycle markers), #11–#14 (design conventions: hex / module accent / raw palette / focus-visible), #15 (governance reading + Ukrainian default), #16 (typography scale), #17 (animation budget). Порушення = drift, але runtime лишається коректним.
3. Активні ініціативи з allowlist + дедлайном: rule #18 (`max-lines: 600`) — «hard для нового коду, exception-list для legacy».

Усі 18 — `severity: blocker`, тому з точки зору CI вони ідентичні (merge-block). Але з точки зору **review-decision-making** агенту чи людині важливо знати: «це правило, порушення якого створює incident», чи «це лінтер-конвенція, яку CI ловить автоматично, тому ризик мінімальний», чи «це правило з allowlist, у якого є exception-process».

Без taxonomy:

- AGENTS.md «Hard rules» розділ розрісся до 18 правил із дуже різною вагою → агент бачить однорідний список і не може пріоритетизувати читання.
- Slim-down AGENTS.md (Initiative 0009 фаза 3.2 ціль ≤ 150 LOC core) неможливий, поки всі 18 hard rules сидять у єдиному списку.
- Нові правила additивно додаються без обговорення «це справді ран-тайм-інваріант?» → списки `do-not-break` втрачають вагу.

## Considered Options

1. **Status quo** — лишити всі 18 правил у єдиному списку без таксономії. Просто, але не вирішує root cause.
2. **Лише severity (blocker / warning)** — без category-поля. Не відрізняє стилістичну конвенцію (CI ловить автоматично) від ран-тайм-інваріанта (порушення = outage).
3. **Зробити category першокласним полем у `hard-rules.json` + рендерити окремі секції в AGENTS.md та matrix** — обрано. Класи: `blocker-invariant`, `lint-enforced-convention`, `active-initiative`.
4. **Декілька severity-рівнів (`critical`, `error`, `warning`, `info`)** — гнучкіше, але CI поведінка все одно або blocks, або warns; зайвий рівень.

## Decision

Закріпити три-категорійну таксономію в реєстрі, AGENTS.md і matrix:

- **`blocker-invariant`** — порушення = data loss / outage / silent regression. Якщо ран-тайм або процес упаде, цьому правилу місце тут. Поточний реєстр: rules #1, #2, #3, #4, #6, #7. Має лишатися ≤ 6 (історично), розширення обговорюється в ADR.
- **`lint-enforced-convention`** — стилістичне / процесне правило з механічним enforcement. Severity все ще `blocker` (CI блокує merge), але порушення локалізоване (no incident risk). Лінтер ловить раніше, ніж людина перевірить. Reviewer без contextу може довіряти вердикту лінтера. Поточний реєстр: rules #5, #8, #9, #10, #11, #12, #13, #14, #15, #16, #17.
- **`active-initiative`** — правило з allowlist + явним дедлайном. Для нового коду — blocker; legacy exceptions трекаються окремо (часто з `TODO(NNNN-…): YYYY-MM-DD`). Очікувана траєкторія — після завершення ініціативи правило стає або `blocker-invariant`, або демоутиться. Поточний реєстр: rule #18 (max-lines: 600, ініціатива 0001).

### Що це означає конкретно

- `docs/governance/hard-rules.schema.json` уже включає `category` як required-поле з enum `[blocker-invariant, lint-enforced-convention, active-initiative]` (виставлено в Initiative 0009 фаза 1.5).
- AGENTS.md розщеплено: § Hard rules містить blocker-invariant + non-design lint-enforced + active-initiative; § Lint-enforced design conventions містить design-related lint-enforced (#11–#14, #16, #17). Обидва розділи мають `### N. …` заголовки з тими ж id, що в реєстрі — `lint:hard-rules-registry` парсить обидва (Initiative 0009 фаза 3.1).
- `hard-rules-matrix.md` рендерить Category-колонку для кожного правила. Майбутнє розщеплення на дві таблиці (blocker-invariant vs lint-enforced) — некритичне; одна таблиця з category-колонкою достатня.
- `hard-rules-matrix.md` має «Category legend» секцію, яка рендерить опис трьох категорій.

### Що це **не** змінює

- Severity всіх 18 правил лишається `blocker`. CI блокує merge однаково.
- `id` стабільні у всіх трьох файлах (registry / AGENTS.md / matrix). Старі PR-описи лінкуються без змін.
- Enforcement-механізми не змінюються — `pnpm lint:plugins`, governance-sync, `lint:hard-rules-registry` працюють як і раніше.

## Consequences

**Позитивні:**

- Slim-down AGENTS.md (Initiative 0009 фаза 3.2) розблокований — § Hard rules стає ≤ 12 правил замість 18.
- Reviewer (людина чи AI агент) може швидко визначити: чи варто блокувати merge до людського ревʼю (`blocker-invariant`), чи довіряти лінтеру (`lint-enforced-convention`), чи перевірити exception-list (`active-initiative`).
- Нові правила обговорюються через категорію: «це справді інваріант?» — якщо ні, кладемо в `lint-enforced-convention` без перевантаження «do-not-break» списку.

**Негативні / трейдоффи:**

- Категорія — текстова інформація, яка може дрейфувати від реальності, якщо ніхто не оновлює. Мітигація: `lint:hard-rules-registry` валідує schema (enum); матриця auto-generated із registry.
- Розщеплення AGENTS.md на два розділи додає surface для агентів, що сканують лише § Hard rules. Мітигація: обидва розділи мають однакову схему `### N. …` і явний cross-link у вступі § Hard rules.
- Можливе майбутнє переоцінювання: rule #18 (max-lines) після завершення ініціативи 0001 переходить у `blocker-invariant` (разом із кодом allowlist-у в lint config). Цей перехід — окремий PR, відстежується в Initiative 0001.

## Implementation steps

1. ✅ `hard-rules.schema.json` — додано `category` enum (Initiative 0009 фаза 1.5).
2. ✅ `hard-rules.json` — кожне правило має `category` (Initiative 0009 фаза 1.5).
3. ✅ AGENTS.md — § Lint-enforced design conventions (Initiative 0009 фаза 3.1).
4. ✅ `scripts/check-hard-rules-registry.mjs` — `parseAgentsRules` сінкує обидві секції.
5. ✅ `hard-rules-matrix.md` — Category-колонка (Initiative 0009 фаза 1.5).
6. (Майбутнє) `hard-rules-matrix.md` — розщеплення на дві таблиці, якщо матриця стане громіздкою.
7. (Майбутнє) AGENTS.md slim-down (Initiative 0009 фаза 3.2) — § Hard rules ≤ 6 blocker-invariants + посилання на per-rule файли.
