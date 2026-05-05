# Assistant Quick Actions v1 — дизайн-спек

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-03.
> **Status:** shipped (PR [#743](https://github.com/Skords-01/Sergeant/pull/743)) — **superseded by**
> [`2026-04-25-assistant-capability-catalogue-design.md`](./2026-04-25-assistant-capability-catalogue-design.md).
> Quick action chips, `RISKY_TOOLS` і action cards живі (`apps/web/src/core/components/ChatQuickActions.tsx`,
> `apps/web/src/core/lib/hubChatActionCards.ts`); back-compat shim
> `apps/web/src/core/lib/<hubChatQuickActions>.ts` уже видалено (файлу немає) — `ChatQuickActions.tsx`
> читає `ASSISTANT_CAPABILITIES` напряму з `packages/shared/src/lib/assistantCatalogue.ts`.
> Документ лишається як історичний контекст; усі майбутні зміни surface-ів — у capability-catalogue spec-у.

## Контекст

HubChat уже має сильну технічну основу: Anthropic tool-use, SSE-стрімінг, голосовий ввід/озвучення, локальну історію, контекст усіх 4 модулів і 60 синхронізованих tool definitions між сервером та клієнтським `executeAction`.

Проблема UX: більшість сили асистента прихована за текстовим інпутом і `/help`. Користувач має пам'ятати, що саме можна попросити. Через це чат виглядає як AI-вікно, а не як швидкий командний шар над продуктом.

## Ціль

Зробити HubChat швидким сценарним інтерфейсом:

- дати користувачу 1-tap старт для найчастіших задач;
- показувати контекстні дії залежно від активного модуля;
- зробити результати tool-calls зрозумілими через action cards;
- не переписувати AI-архітектуру і не додавати нові backend-залежності.

## Нецілі v1

- Не створювати новий AI endpoint.
- Не міняти модель, quota middleware або Anthropic tool protocol.
- Не переносити виконання tool-calls на сервер.
- Не робити повний marketplace команд.
- Не додавати складний multi-step wizard для кожної дії.

## Підхід

### 1. Quick action registry

Додати окремий registry швидких сценаріїв у web core:

```txt
apps/web/src/core/lib/hubChatQuickActions.ts
```

Кожен сценарій описує:

- `id`;
- `module`: `hub | finyk | fizruk | routine | nutrition`;
- `label`;
- `shortLabel`;
- `icon`;
- `prompt`;
- `description`;
- `priority`;
- `requiresOnline`;
- optional `keywords`.

Registry не виконує дії напряму. Він тільки генерує prompt і передає його в існуючий `sendRef.current(prompt)`. Це залишає Anthropic tool-use єдиним шляхом для складних дій.

Початкові сценарії:

| Сценарій          | Модуль     | Prompt                                                              |
| ----------------- | ---------- | ------------------------------------------------------------------- |
| Ранковий брифінг  | Hub        | `Що важливого на сьогодні? Дай короткий ранковий брифінг.`          |
| Підсумок дня      | Hub        | `Підсумуй мій день по фінансах, тренуваннях, звичках і харчуванню.` |
| Додати витрату    | Фінік      | `Додай витрату: `                                                   |
| Ліміт бюджету     | Фінік      | `Покажи ризики по бюджетах і що варто змінити.`                     |
| Почати тренування | Фізрук     | `Почни тренування на сьогодні.`                                     |
| Додати підхід     | Фізрук     | `Додай підхід: `                                                    |
| Позначити звичку  | Рутина     | `Познач звичку виконаною: `                                         |
| Що пропущено      | Рутина     | `Що я пропустив у рутині цього тижня?`                              |
| Залогати їжу      | Харчування | `Залогай їжу: `                                                     |
| Добити білок      | Харчування | `Що з'їсти сьогодні, щоб добити білок без перебору калорій?`        |

Сценарії з prompt, який закінчується на `: `, мають вставляти текст в input і фокусити поле, а не одразу відправляти. Це дає швидкий старт без ризику неповної дії.

### 2. ChatQuickActions UI

Додати компонент:

```txt
apps/web/src/core/components/ChatQuickActions.tsx
```

Розміщення:

- під welcome/empty state і над input;
- на mobile — горизонтальний scroll chips;
- на desktop — compact grid до 2 рядків;
- під час `loading` кнопки disabled;
- в offline режимі AI-сценарії disabled з title/aria-label про відсутність мережі.

Поведінка:

- top-level показує 5-7 сценаріїв;
- якщо активний модуль визначено через hash, першими йдуть сценарії цього модуля;
- кнопка `Ще` відкриває lightweight list усіх сценаріїв у межах chat panel;
- `?` / `/help` показує не тільки tools, а й “Швидкі сценарії”.

Для визначення активного модуля використати існуючу логіку з `HubChat.tsx`, але винести її в маленький helper, щоб не дублювати.

### 3. Action cards для tool results

Зараз tool results зводяться в текст:

```txt
✅ <result>
```

V1 має зберегти цей текст як fallback, але додати структуровані metadata до assistant message:

```ts
type ChatActionCard = {
  id: string;
  toolName: string;
  status: "completed" | "failed";
  title: string;
  summary: string;
  module: "finyk" | "fizruk" | "routine" | "nutrition" | "hub";
};
```

`executeAction` залишається сумісним і повертає string. Поруч додається lightweight parser/mapper:

```txt
apps/web/src/core/lib/hubChatActionCards.ts
```

Він приймає `{ name, input, result }` і повертає card metadata для найчастіших tool names. Якщо tool невідомий — card не показується, лишається текст.

Перший набір карток:

- `create_transaction`;
- `log_meal`;
- `log_water`;
- `start_workout`;
- `log_set`;
- `mark_habit_done`;
- `create_habit`;
- `morning_briefing`;
- `weekly_summary`.

UI:

- `ChatMessage` рендерить cards під markdown/text;
- card містить icon, title, summary, статус;
- v1 без кнопки undo, якщо в домені немає надійної undo-операції;
- для action із неповним prompt картка не створюється, бо дія ще не виконана.

### 4. Підтвердження для ризикових дій

V1 не має переробляти всі tool-calls на confirmation flow, але має підготувати UX-шар для майбутнього:

```ts
const RISKY_TOOLS = new Set([
  "delete_transaction",
  "hide_transaction",
  "forget",
  "archive_habit",
  "import_monobank_range",
]);
```

Для цих дій у v1 рекомендується не міняти execution path автоматично. Натомість:

- action card має явно показувати `Критична дія`;
- у наступній ітерації додати `pending_confirmation`;
- prompt/system rules можна уточнити, що для delete/forget варто перепитувати користувача.

Причина: повний confirmation flow змінює контракт між model → client executor і потребує окремого PR.

## UX flows

### Flow A — користувач відкриває чат з Hub

1. Бачить welcome message.
2. Бачить chips:
   - Ранковий брифінг;
   - Підсумок дня;
   - Додати витрату;
   - Залогати їжу;
   - Почати тренування;
   - Ще.
3. Натискає `Ранковий брифінг`.
4. Prompt одразу відправляється в існуючий `send`.
5. Assistant відповідає стрімом.

### Flow B — користувач відкриває чат з Фізрука

1. Першими chips показуються:
   - Почати тренування;
   - Додати підхід;
   - Порадь тренування;
   - Прогрес за тиждень.
2. Натискання `Додати підхід` вставляє `Додай підхід: ` в input.
3. Користувач дописує `жим 80 кг 8 повторів`.
4. Після tool-call бачить action card `Підхід записано`.

### Flow C — неповний сценарій

1. Користувач натискає `Додати витрату`.
2. Input отримує `Додай витрату: `.
3. Поле фокусується.
4. Нічого не відправляється, доки користувач не допише суму/опис.

## Дані та зберігання

Нових persistent storage keys для v1 не потрібно.

Опційно для майбутнього:

- `hub_chat_quick_action_usage_v1` — локальна статистика частоти сценаріїв;
- `hub_chat_pinned_actions_v1` — закріплені користувачем chips.

Це не входить у v1, щоб не роздувати scope.

## Доступність

- Chips — `button`, не `div`.
- Горизонтальний список має видимий focus ring.
- `Ще` має `aria-expanded`.
- Disabled offline actions пояснюють причину через `title` і видимий muted caption.
- Cards не повинні бути єдиним джерелом інформації: текстовий fallback лишається.

## Тестування

Мінімальний набір:

- unit tests для `hubChatQuickActions`:
  - правильний порядок для active module;
  - fallback для Hub;
  - incomplete prompt не auto-send.
- unit tests для `hubChatActionCards`:
  - mapper повертає cards для основних tools;
  - невідомий tool повертає `null`;
  - risky tools позначаються як critical.
- React tests для `ChatQuickActions`:
  - render chips;
  - click complete prompt calls send;
  - click incomplete prompt fills input and focuses input.

Ручна перевірка:

- mobile viewport: chips не ламають input і не перекривають keyboard inset;
- offline mode: input disabled і quick actions disabled;
- screen reader labels для `Ще`, mic, help, quick actions.

## Файли для реалізації

Очікувані зміни:

- `apps/web/src/core/hub/HubChat.tsx`
- `apps/web/src/core/components/ChatQuickActions.tsx`
- `apps/web/src/core/components/ChatMessage.tsx`
- `apps/web/src/core/lib/<hubChatQuickActions>.ts` (історичний — на момент написання spec-у був живим, після міграції на capability catalogue видалений)
- `apps/web/src/core/lib/hubChatActionCards.ts`
- `apps/web/src/core/lib/hubChatUtils.ts`
- tests поруч із новими lib/component файлами

Backend зміни для v1 не потрібні.

## Ризики

- Надто багато chips може захарастити bottom sheet. Обмеження: максимум 7 видимих, решта під `Ще`.
- Action cards можуть дублювати markdown-відповідь. Рішення: cards короткі, текст лишається як fallback.
- Користувач може очікувати undo. V1 не обіцяє undo, лише чітко показує виконану дію.
- Ризикові дії все ще виконуються старим шляхом. Для confirmation потрібен v2.

## Рекомендований implementation plan

1. Додати registry quick actions і pure helper сортування.
2. Додати `ChatQuickActions` без action cards.
3. Підключити компонент у `HubChat`.
4. Оновити `/help` блок сценаріями.
5. Додати action-card metadata типи й mapper.
6. Розширити `ChatMessage` рендером cards.
7. Додати unit/component tests.
8. Запустити `pnpm lint`, `pnpm typecheck`, релевантні tests.

## Open questions перед реалізацією

1. Чи потрібно в v1 показувати `Ще` як inline list у чаті, чи краще як modal/sheet?
2. Чи хочемо одразу додати local usage ranking, чи лишити ручний priority?
3. Чи переносити confirmation для risky tools у цей PR, чи робити окремим v2?

## Рекомендація

Робити v1 без confirmation і без usage ranking:

- менший ризик регресій;
- максимальний UX-виграш швидко;
- не змінюється backend/API контракт;
- наступний PR може сфокусовано додати `pending_confirmation` для risky tools.
