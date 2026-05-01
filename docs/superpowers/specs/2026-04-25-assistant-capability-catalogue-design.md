# Assistant Capability Catalogue — дизайн-спек

> **Last validated:** 2026-05-01 by @devin-ai. **Next review:** 2026-07-30.
> **Status:** shipped (PR [#795](https://github.com/Skords-01/Sergeant/pull/795) +
> follow-ups [#798](https://github.com/Skords-01/Sergeant/pull/798),
> [#799](https://github.com/Skords-01/Sergeant/pull/799),
> [#800](https://github.com/Skords-01/Sergeant/pull/800),
> [#805](https://github.com/Skords-01/Sergeant/pull/805),
> [#812](https://github.com/Skords-01/Sergeant/pull/812),
> [#839](https://github.com/Skords-01/Sergeant/pull/839)).
> Реджистр живе у `packages/shared/src/lib/assistantCatalogue.ts`; UI — у
> `apps/web/src/core/AssistantCataloguePage.tsx` + `CapabilityDetailModal.tsx`;
> server system prompt будується з реджистру через `buildModuleToolList()` у
> `apps/server/src/modules/chat/toolDefs/systemPrompt.ts` (`SYSTEM_PROMPT_VERSION = "v6"`);
> `/help` редіректить на каталог через `onOpenCatalogue` у `HubChat.tsx`.
> Залишковий борг закрито: `apps/web/src/core/lib/<hubChatQuickActions>.ts` видалено (файлу немає);
> `ChatQuickActions.tsx` читає реджистр напряму через `ASSISTANT_CAPABILITIES` із
> [`packages/shared/src/lib/assistantCatalogue.ts`](../../../packages/shared/src/lib/assistantCatalogue.ts).

## Контекст

HubChat має 60 серверних tool definitions, ~50-рядковий `HELP_TEXT` і 10 quick action chips — три **повністю незалежних** списки можливостей, кожен підтримується вручну. Конкретний стан до цього спека:

- `apps/server/src/modules/chat/toolDefs/{finyk,fizruk,nutrition,routine,crossModule,memory,utility}.ts` — 60 tool definitions для Anthropic API. Це для моделі, юзер їх не бачить.
- `apps/web/src/core/lib/hubChatUtils.ts` `HELP_TEXT` — markdown-стіна з ~50 командних прикладів, групованих по модулях. Виводиться коли юзер пише `/help`.
- `apps/web/src/core/lib/<hubChatQuickActions>.ts` (історичний; видалено після міграції на capability catalogue) — 10 chips під полем вводу в чаті, із власним polled prompt + `requiresOnline` + module-aware filtering.

Кожен новий tool вимагає синхронної правки в усіх трьох — і часто розробники додають у toolDefs, але забувають про `HELP_TEXT` чи chip. Юзер бачить лише chips (10 з 60) і не знає, що інші 50 можливостей існують.

Окремо: серверний system prompt у `toolDefs/systemPrompt.ts` дублює список tool-імен у тексті інструкцій моделі, що збільшує token cost і створює ще один surface для розсинхрону.

## Ціль

Зробити **єдиний реджистр capability-ів** як джерело істини, з якого автоматично випливають:

1. **Catalogue UI** — новий екран «Можливості асистента», де юзер бачить всі ~60 можливостей, групованих по модулях, з прикладами і пошуком.
2. **Quick action chips** у чаті — продовжують працювати, але читають з реджистру (`isQuickAction === true`).
3. **`/help` команда** — відкриває catalogue замість wall of markdown.
4. **System prompt** — список імен tool-ів і 1 приклад на tool беруться з реджистру (зменшує token cost, тримає синхрон).

Юзер отримує:

- discovery — точно знає, що можливо;
- швидкий старт — chip-и в чаті залишаються як зараз;
- контекст — приклади і опис кожної можливості перед тим, як спробувати.

Розробник отримує:

- одне місце для додавання нової capability;
- automatic invariant: новий tool без catalogue-entry — не з'являється у юзера, без isQuickAction — не з'являється як chip.

## Нецілі v1

- Не **генерувати tool input_schema** з реджистру — кожен tool має складний zod-подібний schema для Anthropic, що погано виводиться з прозового опису. Реджистр генерує тільки **імена + 1 приклад** для system prompt.
- Не **порт на mobile** в цьому PR — це окремий follow-up (catalogue UI повторюється з NativeWind).
- Не **multi-step wizards** усередині catalogue — тап → відправляє в чат, далі чат робить свою роботу. Catalogue не стає окремою UI-логікою для tool-ів.
- Не **localization** (англійська catalogue) — реджистр одномовний, як і все інше у репо.
- Не **аналітика usage** окремих capability-ів у v1 — додамо коли матимемо PostHog (`#13` dev-stack).
- Не **personalization** (показ топ-5 capabilities на основі історії) — окремий follow-up; v1 групує по модулях статично.

## Підхід

### 1. Реджистр capability-ів

Новий файл у `packages/shared` (бо споживається і `apps/web`, пізніше і `apps/mobile`):

```txt
packages/shared/src/lib/assistantCatalogue.ts
```

```ts
export type CapabilityModule =
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition"
  | "cross"
  | "analytics"
  | "utility"
  | "memory";

export interface AssistantCapability {
  /**
   * Стабільний id, snake_case. Збігається з AI tool name де можливо
   * (`create_transaction`, `morning_briefing`, etc.). Використовується
   * як React key і для майбутнього usage tracking.
   */
  id: string;

  /** До якого модуля належить можливість. Визначає групу в catalogue. */
  module: CapabilityModule;

  /** Назва для catalogue list і chip (повна форма). */
  label: string;

  /** Опціонально коротка форма для mobile chip-ів, де місця обмаль. */
  shortLabel?: string;

  /** Іконка з `@shared/components/ui/Icon` (узгоджено з існуючими chips). */
  icon: string;

  /** 1-2 речення для catalogue картки (відображається під label). */
  description: string;

  /**
   * Реальні приклади формулювань, як юзер може попросити дію.
   * 2-4 прикладів. Показуються у деталь-картці; перший використовується
   * у system prompt.
   */
  examples: readonly string[];

  /**
   * Текст, що відправляється в чат при тапі на capability.
   * Якщо закінчується на `": "` — це prefill flow: текст вставляється
   * в input замість одразу send.
   */
  prompt: string;

  /**
   * true → потребує юзерського вводу (наприклад, сума витрати).
   * Тап у catalogue відкриває деталь-картку з кнопкою «Спробувати»;
   * `prompt` має закінчуватися на `": "`.
   * false → одразу відправляє при тапі.
   */
  requiresInput: boolean;

  /**
   * Деструктивна дія (видалення, забути факт). Показує warning-бейдж
   * «Критична дія» у catalogue і requires confirmation у деталь-картці.
   */
  risky?: boolean;

  /**
   * Чи показувати як chip під полем вводу в чаті. Очікується ~10-12 entries
   * матимуть true (як зараз у `hubChatQuickActions.ts`).
   */
  isQuickAction?: boolean;

  /**
   * Сортування chips у чаті: нижче число — вище позиція.
   * Має значення тільки для `isQuickAction === true`.
   */
  quickActionPriority?: number;

  /**
   * Дія потребує мережі (типу брифінгу — звертається до Anthropic).
   * Disabled у offline. Має значення тільки для `isQuickAction === true`.
   */
  requiresOnline?: boolean;

  /**
   * Додаткові слова для пошуку в catalogue (синоніми, тому що `description`
   * формальний). Не показуються в UI.
   */
  keywords?: readonly string[];
}

export const ASSISTANT_CAPABILITIES: readonly AssistantCapability[] = [
  // ~60 entries
];
```

Реджистр експортується через `@sergeant/shared`. У `packages/shared/src/index.ts` додається `export * from "./lib/assistantCatalogue";`.

### 2. Хто читає з реджистру

| Surface                                | Як читає                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `AssistantCataloguePage` (новий екран) | `ASSISTANT_CAPABILITIES`, групує по `module`, фільтрує по search query                                |
| `ChatQuickActions` chips               | `ASSISTANT_CAPABILITIES.filter(c => c.isQuickAction)`, сортує по `quickActionPriority`                |
| `/help` команда у `ChatInput`          | Не виводить markdown — навігує на `/assistant`                                                        |
| `toolDefs/systemPrompt.ts` (server)    | Імпортує з `@sergeant/shared`, генерує markdown-список `<id>: <example>` замість хардкодного переліку |
| Майбутні mobile chips і catalogue      | Той самий source, NativeWind UI (окремий PR)                                                          |

`hubChatQuickActions.ts` стає тонкою back-compat-обгорткою на 1 PR (re-exports `ASSISTANT_CAPABILITIES.filter(...)`), потім видаляється.

### 3. UI — Catalogue екран

**Розташування:** `apps/web/src/core/AssistantCataloguePage.tsx`. Route `/assistant` у `App.tsx`.

**Точки входу:**

1. Settings → новий рядок «Можливості асистента» (icon `sparkles`).
2. Кнопка `?` у `ChatInput.tsx` поряд із input — навігація на `/assistant`.
3. `/help` команда (через `isHelpCommand` helper у `hubChatUtils.ts`) — навігація на `/assistant`.

**Лейаут:**

```
┌──────────────────────────────────────┐
│ ← Можливості асистента               │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ 🔍 Пошук по можливостях...       │ │
│ └──────────────────────────────────┘ │
│                                      │
│ 💰 Фінік (15)                        │
│   ⚡ Записати витрату                 │
│      Швидкий запис витрати готівкою  │
│   ✏ Змінити категорію                 │
│      Перенести транзакцію в іншу...  │
│   ⚠ Видалити транзакцію               │
│      Тільки ручні; автоматичні...    │
│   ...                                │
│                                      │
│ 🏋 Фізрук (11)                       │
│   ⚡ Почати тренування                │
│   ⚡ Додати підхід                    │
│   ...                                │
│                                      │
│ 📋 Рутина (9)                        │
│ 🍎 Харчування (9)                    │
│ 🔗 Кросмодульні (3)                  │
│ 📊 Аналітика (5)                     │
│ 🛠 Утиліти (5)                       │
│ 🧠 Пам'ять (3)                       │
└──────────────────────────────────────┘
```

**Бейджі:**

- ⚡ — `isQuickAction === true` (юзер бачить це як chip під чатом).
- ⚠ — `risky === true` (warning style на whole row, червоний відтінок ledige).

**Search:**

Клієнтський filter по об'єднаному рядку `label + shortLabel + description + examples + keywords`. Case-insensitive, без fuzzy у v1 (просто `includes`). Якщо `query.length >= 2` — гачі групи що не мають жодного match-у.

**Тап на елемент:**

```ts
function onCapabilityTap(c: AssistantCapability) {
  if (!c.requiresInput) {
    // Один-крок: переходимо на чат і одразу відправляємо
    navigate("/", { state: { autoSend: c.prompt } });
  } else {
    // Деталь-картка
    openCapabilityDetail(c);
  }
}
```

**Деталь-картка** (`CapabilityDetailModal`):

```
┌─────────────────────────────────────┐
│ × Записати витрату                  │
│                                     │
│ Швидкий запис витрати готівкою      │
│ або карткою.                        │
│                                     │
│ Приклади:                           │
│ • додай витрату 200 грн на каву     │
│ • витратив 350 на таксі вчора       │
│ • -150₴ продукти                    │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Спробувати в чаті               │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

«Спробувати в чаті» → `navigate("/", { state: { prefill: c.prompt, focusInput: true } })`. `ChatInput.tsx` уже має `focusInputRef` для prefill flow (з [#743](https://github.com/Skords-01/Sergeant/pull/743)) — перевикористовуємо.

Якщо `risky === true` — у деталь-картці додатково:

```
┌──────────────────────────────────────┐
│ ⚠ Критична дія                       │
│   Цю дію не можна скасувати.         │
└──────────────────────────────────────┘
```

Кнопка «Спробувати в чаті» лишається — підтвердження відбувається у самому чаті через action card warning style (existing behavior).

### 4. ChatQuickActions — міграція

Існуючий `apps/web/src/core/components/ChatQuickActions.tsx` змінює тільки джерело даних:

```ts
// було:
import { ALL_QUICK_ACTIONS } from "../lib/hubChatQuickActions";

// стало:
import { ASSISTANT_CAPABILITIES } from "@sergeant/shared";
const ALL_QUICK_ACTIONS = ASSISTANT_CAPABILITIES.filter((c) => c.isQuickAction);
```

`hubChatQuickActions.ts` стає тонким re-export shim на 1 PR (для backward-compat посилань у тестах), потім видаляється.

`hubChatActionCards.ts` (мапер tool-call → action card) **не міняється** — це окрема відповідальність (рендер результату tool-call), не discovery.

### 5. System prompt — генерація списку tool-ів

`apps/server/src/modules/chat/toolDefs/systemPrompt.ts` зараз має хардкодний markdown:

```
- Фінанси: create_transaction, delete_transaction, change_category, hide_transaction, ...
- Фізрук: start_workout, finish_workout, log_set, ...
```

Заміняємо на згенероване з реджистру:

```ts
import {
  ASSISTANT_CAPABILITIES,
  type CapabilityModule,
} from "@sergeant/shared";

const MODULE_TITLES: Record<CapabilityModule, string> = {
  finyk: "Фінанси",
  fizruk: "Фізрук",
  routine: "Рутина",
  nutrition: "Харчування",
  cross: "Кросмодульні",
  analytics: "Аналітика",
  utility: "Утиліти",
  memory: "Пам'ять",
};

function buildToolList(): string {
  const byModule = new Map<CapabilityModule, string[]>();
  for (const c of ASSISTANT_CAPABILITIES) {
    const list = byModule.get(c.module) ?? [];
    list.push(c.id);
    byModule.set(c.module, list);
  }
  return Array.from(byModule.entries())
    .map(([m, ids]) => `  - ${MODULE_TITLES[m]}: ${ids.join(", ")}`)
    .join("\n");
}

export const SYSTEM_PREFIX = `Ти персональний асистент...

ПРАВИЛА:
- Усі числа бери з блоку ДАНІ нижче.
- ...
- Якщо користувач просить змінити або записати дані — використай відповідний tool:
${buildToolList()}
- ...
`;
```

**Token cost — очікуваний impact:**

- До: ~620 chars markdown списку tools (рукою). Один абзац на модуль.
- Після: ~530 chars (компактніший, тільки `id`-list).
- Anthropic prompt caching: `SYSTEM_PREFIX` будується раз при boot-i, рядкова константа стабільна між запитами → cache benefit зберігається.

**Ризик:** якщо юзер додає capability, сервер треба перезапустити, щоб system prompt оновився. Не проблема — Railway pre-deploy автоматичний.

### 6. /help — навігація замість markdown

`apps/web/src/core/lib/hubChatUtils.ts`:

```ts
// було:
export const HELP_TEXT = `### Доступні інструменти ...`; // ~80 ліній

// стало:
// HELP_TEXT видалено повністю.
// isHelpCommand лишається — обробляється у HubChat.tsx:
//   if (isHelpCommand(text)) navigate("/assistant"); return;
```

`HELP_TEXT` references у тестах і HubChat.tsx видаляються; `/help` обробка в `HubChat.tsx` навігує на `/assistant`.

### 7. Початковий зміст реджистру (≈60 entries)

Реджистр заповнюється з:

1. **15 Фінік tools** з `toolDefs/finyk.ts`: change_category, create_debt, create_receivable, hide_transaction, set_budget_limit, set_monthly_plan, create_transaction, delete_transaction, update_budget, mark_debt_paid, add_asset, import_monobank_range, split_transaction, recurring_expense, export_report.
2. **11 Фізрук** з `toolDefs/fizruk.ts`: start_workout, finish_workout, log_set, plan_workout, add_program_day, log_measurement, log_wellbeing, suggest_workout, copy_workout, compare_progress, log_weight.
3. **9 Рутина** з `toolDefs/routine.ts`.
4. **9 Харчування** з `toolDefs/nutrition.ts`.
5. **3 Кросмодульні** з `toolDefs/crossModule.ts`: morning_briefing, weekly_summary, set_goal. Решта 5 з того ж файлу йдуть як `module: "analytics"` (див. п. ⓘ нижче): spending_trend, weight_chart, category_breakdown, detect_anomalies, habit_trend.
6. **3 Пам'ять** з `toolDefs/memory.ts`: remember, forget, my_profile.
7. **5 Утиліти** з `toolDefs/utility.ts`: calculate_1rm, convert_units, save_note, list_notes, export_module_data.

Аналітика виділяється з cross/finyk/fizruk як окрема `module: "analytics"` для UI-групи (в реджистрі це окремий module, навіть якщо AI-tool сидить у `crossModule.ts`).

`description` і `examples` пишуться вручну на основі `description` поля в toolDef-ах + перевірених прикладів з `HELP_TEXT`. Це інтенсивна, але одноразова робота на ~60 entries.

`isQuickAction` стартово true для тих самих 10, що зараз у `hubChatQuickActions.ts`:

| id (capability)    | label             | module    | quickActionPriority |
| ------------------ | ----------------- | --------- | ------------------- |
| morning_briefing   | Ранковий брифінг  | cross     | 10                  |
| daily_summary      | Підсумок дня      | cross     | 20                  |
| create_transaction | Записати витрату  | finyk     | 10                  |
| budget_risks       | Ліміт бюджету     | finyk     | 20                  |
| start_workout      | Почати тренування | fizruk    | 10                  |
| log_set            | Додати підхід     | fizruk    | 20                  |
| mark_habit_done    | Позначити звичку  | routine   | 10                  |
| missed_this_week   | Що пропущено      | routine   | 20                  |
| log_meal           | Залогати їжу      | nutrition | 10                  |
| protein_target     | Добити білок      | nutrition | 20                  |

`risky: true` — `delete_transaction`, `hide_transaction`, `forget`, `archive_habit`, `import_monobank_range`. Узгоджено з `RISKY_TOOLS` у `hubChatActionCards.ts`.

### 8. Routing і state-передача

`autoSend` і `prefill` через React Router state:

```ts
// AssistantCataloguePage.tsx
navigate("/", { state: { autoSend: c.prompt } });
// or
navigate("/", { state: { prefill: c.prompt, focusInput: true } });
```

`HubChat.tsx`:

```tsx
const location = useLocation();
useEffect(() => {
  const s = location.state as {
    autoSend?: string;
    prefill?: string;
    focusInput?: boolean;
  } | null;
  if (s?.autoSend) {
    sendRef.current?.(s.autoSend);
    navigate("/", { replace: true, state: null });
  } else if (s?.prefill) {
    focusInputRef.current?.(s.prefill);
    navigate("/", { replace: true, state: null });
  }
}, [location.state]);
```

`replace: true` + `state: null` гарантує, що back-кнопка не повторить дію.

## Тестування

Юніт:

- `assistantCatalogue.test.ts` — інваріанти реджистру:
  - всі id унікальні;
  - якщо `requiresInput === true`, `prompt` має закінчуватися на `": "`;
  - всі `risky` capabilities також у `RISKY_TOOLS` (cross-check);
  - кожен `module` має ≥1 entry.
- `AssistantCataloguePage.test.tsx` — рендер групи по модулях, search фільтрує, тап на non-input → navigate з autoSend.
- `CapabilityDetailModal.test.tsx` — рендер прикладів, кнопка «Спробувати» викликає prefill, risky показує warning.
- `ChatQuickActions.test.tsx` — оновлений тест, що читає з нового джерела (без поломки existing assertions).
- `systemPrompt.test.ts` (новий) — `buildToolList()` містить імена з реджистру, не містить старого хардкодного списку.

E2E (Playwright smoke):

- Існуючий smoke-тест чату — не ламається (chips продовжують працювати).
- Новий мінімальний smoke: відкрити Settings → Асистент → переконатися, що список з ≥50 entries рендериться, search працює.

## Поетапна реалізація

**PR 1 (цей spec → implementation):**

- Реджистр у `packages/shared/src/lib/assistantCatalogue.ts` (~60 entries).
- `AssistantCataloguePage` + `CapabilityDetailModal` UI.
- Settings link + `?` button у `ChatInput`.
- `ChatQuickActions` читає з нового реджистру.
- `/help` → navigate на `/assistant`.
- Видаляється `HELP_TEXT`.
- `hubChatQuickActions.ts` лишається як re-export shim.
- system prompt лишається як зараз (хардкод).

Розмір: середній — ~60 нових entries у реджистрі + 2 нових компоненти + 5 змін у existing. Без backend-touch.

**PR 2 (follow-up, окремий):**

- system prompt бере імена з реджистру (`buildToolList()`).
- Видаляється `hubChatQuickActions.ts` shim, всі імпорти оновлені.

Розмір: малий, але **server-touch** → окремий PR щоб ізолювати ризик.

**PR 3 (follow-up, окремий):**

- Mobile catalogue port (NativeWind).
- Mobile-specific routing (Stack або Drawer).

Розмір: середній; чисто frontend, окрема платформа.

## Метрики успіху

Після PR 1:

- юзер може відкрити catalogue з 3 точок (Settings, `?` button, `/help`);
- catalogue показує всі ~60 capabilities, групованих по 8 модулях;
- search фільтрує за < 50 ms на 60 entries (тривіально);
- chips під чатом продовжують працювати ідентично як до PR.

Через 1 тиждень (manual check):

- `HELP_TEXT` як wall-of-text не повертається у код-рев'ю.
- Розробник, що додає 61-й tool, має один файл для оновлення (a реджистр), не три.

## Ризики і пом'якшення

| Ризик                                                              | Пом'якшення                                                                                                |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 60 entries — багато ручної роботи + помилки                        | Скрипт-валідатор у `assistantCatalogue.test.ts` перевіряє всі інваріанти (id-unique, prompt-shape, risky). |
| Юзер плутає catalogue з налаштуваннями і не знаходить              | Settings має чіткий рядок «Можливості асистента»; `?` button у chat — primary entry; `/help` як fallback.  |
| `requiresInput` не завжди очевидне                                 | `requiresInput` явне поле у реджистрі, тест перевіряє що `prompt` закінчується на `": "` коли true.        |
| System prompt token cost трохи зросте через `examples` integration | Не використовуємо examples у system prompt у v1 — лише `id`-list. Examples — у catalogue UI.               |
| Реджистр у `packages/shared` змусить server білдитися більше       | Реджистр — pure data, ~10 KB max. Без runtime impact.                                                      |
| `hubChatQuickActions.ts` shim забутий і живе вічно                 | PR 2 видаляє його; чек-лист у PR 1 включає створення issue для PR 2.                                       |

## Open questions

1. **Чи групувати «Аналітика» окремо від «Кросмодульні» у UI**, навіть якщо в `toolDefs/crossModule.ts` вони разом? Поточна пропозиція — так, бо юзер мислить «графіки і тренди» окремо від «брифінг і підсумок». Але це вимагає `module: "analytics"` явно у реджистрі.
2. **Tail-секція «Все інше / експериментальне»** для capabilities, що не вписуються в 8 груп. Поки нема таких — но залишимо ментально на майбутнє.
3. **Feature flag для catalogue?** Не плануємо в v1 — запуск тривіальний, відкат через PR-revert. Якщо хочеш — додамо `assistant_catalogue_enabled` flag через [`featureFlags.ts`](../../../apps/web/src/core/lib/featureFlags.ts) у impl-плані.

## See also

- [`docs/superpowers/specs/2026-04-24-assistant-quick-actions-v1-design.md`](./2026-04-24-assistant-quick-actions-v1-design.md) — попередній етап (chips), на якому будується catalogue
- [`docs/playbooks/add-hubchat-tool.md`](../../playbooks/add-hubchat-tool.md) — оновити після PR 1: додавання tool вимагає catalogue entry
- [`docs/playbooks/tune-system-prompt.md`](../../playbooks/tune-system-prompt.md) — оновити після PR 2: токен-cost через `buildToolList()`
- [`AGENTS.md`](../../../AGENTS.md) — секція «Architecture: AI tool execution path» (без змін у v1; в PR 2 додамо ноту про реджистр як SSOT)
