# Talk-to-your-data: план реалізації для Sergeant

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-03.
> **Автор:** Devin (для @Skords-01)
> **Дата:** 2026-05-05
> **Статус:** Draft / на розгляд

---

## Мета

Перетворити HubChat із "AI-радника, який бачить саммарі даних" на **повноцінний data-інтерфейс**, де користувач може ставити довільні питання по своїх даних і отримувати точні числові відповіді.

**Приклади запитів після реалізації:**
- "Скільки я витратив на каву за останні 3 місяці?"
- "Порівняй мої витрати на їжу в квітні і травні"
- "В які дні тижня я пропускаю тренування найчастіше?"
- "Покажи всі транзакції в АТБ більше 200 грн"
- "Яка моя середня калорійність в дні тренувань vs дні без?"

---

## Що вже є (і чому це не зламається)

Поточна архітектура HubChat:

```
Клієнт (HubChat.tsx)                    Сервер (chat.ts)
┌───────────────┐                       ┌──────────────────┐
│ hubChatContext │──context──>           │ SYSTEM_PREFIX     │
│ (localStorage  │                      │ + context         │
│  саммарі)      │                      │ + RAG (pgvector)  │
├───────────────┤                       │                   │
│ hubChatActions │<──tool_use──          │ TOOLS[] (19+)     │
│ (localStorage  │──tool_result──>      │ toolDefs/*        │
│  read/write)   │                      │ Anthropic API     │
└───────────────┘                       └──────────────────┘
```

**Ключова архітектура (НЕ змінюється):**
- Сервер визначає tool definitions і system prompt
- Клієнт виконує tool-и (read/write localStorage)
- RAG context injection (pgvector) вже працює
- Memory tools (remember/recall) вже є
- Prompt caching (cache breakpoints) вже налаштований

**Що додаємо:** нові tool definitions + нові client-side executors. Існуючий код НЕ змінюється, лише розширюється.

---

## Ризик-аналіз

| Ризик | Вірогідність | Вплив | Митігація |
|---|---|---|---|
| Зламаємо існуючі tools | Мінімальна | Високий | Новий код — окремі файли. Існуючі tools не змінюються. Покриваємо тестами |
| Prompt cache invalidation | 100% (одноразово) | Низький | Після додавання нових tools у TOOLS[] — одноразовий cache miss (~$0.01). Далі кешується |
| Розмір context перевищить ліміт | Низька | Середній | Нові tools повертають дані on-demand (tool_result), не збільшують system context |
| AI quota spike | Низька | Низький | Tool-results повертаються клієнтом, не генерують додаткові API calls |
| localStorage race conditions | Дуже низька | Низький | Нові tools — read-only (query), не конфліктують із write-tools |

---

## Архітектура рішення

### Ключова ідея

Замість того, щоб "впихнути всі дані в context" (неможливо — місяці транзакцій не влізуть), ми даємо AI **query-tools** — інструменти для адресного пошуку по даних. AI сам вирішує, який tool викликати, на основі запиту юзера.

```
Юзер: "Скільки я витратив на каву за останні 3 місяці?"

AI бачить system context (саммарі) → розуміє що треба шукати глибше
AI викликає tool: query_transactions({ query: "кава", date_from: "2026-02-01" })
Клієнт шукає в localStorage → повертає результат
AI форматує відповідь: "За останні 3 місяці ви витратили 2,340 грн на каву (47 транзакцій)"
```

### Три рівні data access (вже є → додаємо)

```
Рівень 1 (є): System Context     — саммарі поточного стану (hubChatContext.ts)
Рівень 2 (є): RAG Memory         — семантичний пошук по історії (ragContext.ts)
Рівень 3 (НОВЕ): Query Tools      — адресний пошук/агрегація по сирих даних
```

---

## Етапи реалізації (розбивка на PR)

### PR 1: Query tools — Фінік (транзакції та аналітика)

**Scope:** Найцінніший модуль для "talk to data" — фінансові запити.

**Що робимо:**

1. **Новий toolDef файл:** `apps/server/src/modules/chat/toolDefs/queryFinyk.ts`
   - `query_transactions` — пошук транзакцій з фільтрами (текст, сума, дата, категорія, ліміт)
   - `aggregate_spending` — агрегація витрат за період з групуванням (по категоріях, по днях, по тижнях, по мерчантах)
   - `compare_periods` — порівняння двох довільних періодів (витрати, дохід, кількість транзакцій)

2. **Клієнтські executor-и:** `apps/web/src/core/lib/chatActions/queryFinykActions.ts`
   - Всі три tools — read-only з localStorage
   - Використовують існуючі utils з `modules/finyk/utils`
   - Повертають структуровані текстові результати (таблиці, числа)

3. **Реєстрація:**
   - Додати `QUERY_FINYK_TOOLS` в `tools.ts`
   - Додати handler в `hubChatActions.ts` dispatch chain
   - Зареєструвати capabilities в `@sergeant/shared` ASSISTANT_CAPABILITIES

4. **Тести:**
   - Unit tests для кожного executor-а (happy path + error path)
   - Snapshot test для toolDef shapes

**Файли, що змінюються:**
- `apps/server/src/modules/chat/toolDefs/queryFinyk.ts` (NEW)
- `apps/server/src/modules/chat/tools.ts` (додаємо import)
- `apps/web/src/core/lib/chatActions/queryFinykActions.ts` (NEW)
- `apps/web/src/core/lib/chatActions/queryFinykActions.test.ts` (NEW)
- `apps/web/src/core/lib/hubChatActions.ts` (додаємо в dispatch)
- `packages/shared/src/assistantCapabilities.ts` (нові capabilities)

**Що НЕ змінюється:** hubChatContext.ts, chat.ts, існуючі toolDefs, існуючі actions.

**Приклади використання після PR 1:**
```
"Покажи всі витрати в Сільпо за квітень" → query_transactions
"Скільки я витратив на транспорт за останній квартал?" → aggregate_spending
"Порівняй витрати березня і квітня" → compare_periods
```

---

### PR 2: Query tools — Фізрук (тренування та прогрес)

**Scope:** Аналітика тренувань.

**Нові tools:**
- `query_workouts` — пошук тренувань за період, типом вправ, об'ємом
- `exercise_progress` — прогрес по конкретній вправі (вага, повтори, об'єм) за період
- `training_stats` — агрегована статистика (частота, улюблені вправи, розподіл по м'язових групах)

**Файли:**
- `apps/server/src/modules/chat/toolDefs/queryFizruk.ts` (NEW)
- `apps/web/src/core/lib/chatActions/queryFizrukActions.ts` (NEW)
- `apps/web/src/core/lib/chatActions/queryFizrukActions.test.ts` (NEW)
- `apps/server/src/modules/chat/tools.ts` (import)
- `apps/web/src/core/lib/hubChatActions.ts` (dispatch)
- `packages/shared/src/assistantCapabilities.ts`

**Приклади:**
```
"Покажи мої тренування за останній тиждень" → query_workouts
"Як змінилась моя жим лежачи за місяць?" → exercise_progress
"Які м'язи я треную найчастіше?" → training_stats
```

---

### PR 3: Query tools — Рутина та Харчування

**Scope:** Запити по звичках і харчуванню.

**Нові tools:**
- `query_habits` — детальна статистика по звичці (completion rate, найкращі/найгірші дні тижня, пропуски)
- `habit_correlation` — кореляція між звичками і іншими модулями ("чи менше я витрачаю коли тренуюсь?")
- `query_nutrition` — пошук по журналу їжі за період (калорії, макроси, конкретні продукти)
- `nutrition_averages` — середні показники харчування за період з трендом

**Файли:**
- `apps/server/src/modules/chat/toolDefs/queryRoutine.ts` (NEW)
- `apps/server/src/modules/chat/toolDefs/queryNutrition.ts` (NEW)
- `apps/web/src/core/lib/chatActions/queryRoutineActions.ts` (NEW)
- `apps/web/src/core/lib/chatActions/queryNutritionActions.ts` (NEW)
- Тести для кожного
- `tools.ts`, `hubChatActions.ts`, `assistantCapabilities.ts`

**Приклади:**
```
"В які дні тижня я пропускаю медитацію?" → query_habits
"Яка моя середня калорійність за тиждень?" → nutrition_averages
"Що я їв у понеділок?" → query_nutrition
"Чи менше я витрачаю коли тренуюсь?" → habit_correlation
```

---

### PR 4: Structured responses (форматування відповідей)

**Scope:** Покращити відображення data-відповідей у чаті.

**Що робимо:**
- Action card для query-результатів: таблиці, mini-графіки, числа з порівняннями
- `apps/web/src/core/lib/hubChatActionCards.ts` — нові card types для data-tools
- Рендеринг таблиць у чат-бульбашці (Markdown-таблиці → компоненти)

**Файли:**
- `apps/web/src/core/lib/hubChatActionCards.ts` (extend)
- `apps/web/src/core/hub/chat/components/DataResultCard.tsx` (NEW)
- `apps/web/src/core/hub/chat/components/DataResultCard.test.tsx` (NEW)

**Приклади:**
```
Замість: "Ви витратили 2340 грн на їжу, 1200 на транспорт..."
Покаже: красиву табличку з числами, порівнянням з минулим місяцем, і міні-барчартом
```

---

## Оцінка часу

| PR | Складність | Estimated time |
|---|---|---|
| PR 1: Query Finyk | Середня | ~3-4 години |
| PR 2: Query Fizruk | Середня | ~2-3 години |
| PR 3: Query Routine + Nutrition | Середня | ~3-4 години |
| PR 4: Structured responses | Легка-середня | ~2-3 години |

**Загалом: ~10-14 годин роботи**, розбитих на 4 незалежні PR.

---

## Порядок реалізації

```
PR 1 (Finyk queries) ──→ PR 2 (Fizruk queries) ──→ PR 3 (Routine+Nutrition) ──→ PR 4 (Cards)
     ↑                         ↑                          ↑
     незалежні, можна паралелити
```

PR 1-3 можна робити в будь-якому порядку або навіть паралельно — вони незалежні. PR 4 залежить від PR 1-3 (потрібно знати формат даних для card-ів).

---

## Що НЕ входить у скоуп (але можна додати потім)

1. **Server-side query tools** — поки все через localStorage клієнта. Якщо знадобиться SQL-запити до PostgreSQL (для хмарних даних) — це окремий PR з міграціями.
2. **Графіки в чаті** — PR 4 робить базові таблиці. Повноцінні інтерактивні графіки (Recharts) — окремий PR.
3. **Natural language → SQL** — не потрібно, бо дані в localStorage, не в SQL.
4. **Export результатів** — "зберегти звіт як PDF" тощо.

---

## Конвенції (з AGENTS.md)

- Commit scopes: `feat(web)`, `feat(server)`, `feat(shared)`
- Тести: Vitest + RTL для web, Vitest для server toolDefs
- Key factories: не потрібні (read-only з localStorage, без React Query)
- Без нових міграцій — все клієнтське
- hubChatActions dispatch chain — extend, не modify
- Tool defs — окремий файл per domain (як існуючі `finyk.ts`, `routine.ts`)
