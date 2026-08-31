# Спека: чип «Спитати AI» на інсайт-плашках + зняття day-hint

> **Last touched:** 2026-08-31 by @Skords-01. **Next review:** 2026-12-05.
> **Status:** Active (спека до виконання)
> **Виконання:** чиста сесія у свіжому worktree від main. Governing skills: `sergeant-module-ai` + `sergeant-web-ui` (+ `sergeant-server-api` для видалення роуту).

## Проблема

AI-поради розкидані по сутностях: порада коуча на хабі, окремий генератор «підказка дня» в нутриції (`POST /api/nutrition/day-hint`), і поруч — 9 детермінованих інсайт-плашок, які нікуди не ведуть, крім навігації в модуль. Користувач бачить кілька AI-голосів, які не знають один про одного, а найдешевший сигнал (детерміновані правила) не має продовження розмовою.

## Ціль

Чат стає єдиною точкою AI-розмови («генеральний штаб»): детермінована плашка отримує дію «Спитати AI», яка відкриває HubChat із готовим питанням з числами плашки. Генератор day-hint видаляється повністю. Модель викликається лише після явного кліку користувача; нових AI-сутностей нуль.

## Рішення (зафіксовані founder-ом)

1. **Дія на плашці — окремий чип** «⌁ Спитати AI»: primary-акцент (teal), праворуч перед dismiss ✕. Touch target ≥44px під `pointer: coarse` (Hard Rule про floor), `focus-visible`-стан. Тап по тілу плашки, як і раніше, навігує в модуль; ✕ ховає.
2. **Чип на всіх 9 типах плашок** (реєстр у `useAllInsights.ts` PRIORITY_RANK), включно з celebration-типами.
3. **Префіл — розгорнуте питання з числами.** Числа беруться детерміновано з даних правила, НЕ парсяться з title. Для цього `Insight` розширюється полем `askAiPrompt: string`, яке збирає кожен модульний хук `use*Insights` зі своїх даних (він їх уже має).
4. **Відкриття чату:** наявний механізм `emitHubBus("openChat", { message: askAiPrompt, autoSend: false })` — той самий, що в `AssistantAdviceCard` («Запитати AI про це») і в пошуку. Жодного нового транспорту.
5. **Квота вичерпана (Free):** чип дизейблиться з підказкою «Ліміт AI на сьогодні». Джерело стану — наявний `GET /api/chat/usage` (`{plan, limit, remaining}`; Pro → `remaining: null`) через ключ `chatKeys.usage`. Один запит на хаб (хук у `HubInsightsBlock`, проп у плашки). **Fail-open:** помилка/відсутність відповіді → чип активний; `remaining: null` (Pro) → активний.
6. **day-hint видаляється повністю, без компенсаційного entry-point у нутриції.** AI-вхід для їжі: вечірня плашка protein-low → чип, або чат вручну.
7. **Телеметрія:** нова подія `VALUE_SIGNAL_ASK_AI` `{module, signal, surface}` у наявну петлю value_signal_* в `InsightCard` (єдиний писар, не в хуках) + за consent — `ADVICE_REACTED`-аналог через `trackAdviceReaction(computeAdviceId(kind, id), "ask_ai")`, дзеркалячи семантику `AssistantAdviceCard`.
8. **Канонічне формулювання** (в Журнали рішень обох канонів): модулі — основний UX; чат — єдина точка AI-розмови; детерміновані плашки — безкоштовний сигнальний шар і ворота в чат. Це НЕ ревізія [ІНТЕРВ'Ю]-тези «чат — допоміжний канал».

## Шаблони askAiPrompt (9 типів)

Формулювання — 1-2 речення, «ти»-звертання не потрібне (це репліка користувача), числа підставляються з даних хука. Копія фінально проходить повз `docs/01-product/copy/style-guide.uk.md` (без ем-дешів).

| Тип                             | Шаблон (числа — приклад підстановки)                                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `finyk-budget-overrun-<cat>`    | «У Фініку категорія "<назва>" вже <факт> грн із бюджету <ліміт> грн (<+N%>). Це разовий сплеск чи тренд? Що підрізати?»                |
| `finyk-coffee-limit-*`          | «Витрати на каву цього місяця <сума> грн, на <N%> більше за минулий. Варто ставити ліміт чи це норм?»                                  |
| `finyk-recurring-detected`      | «Схоже, зʼявився регулярний платіж "<назва>" ~<сума> грн/міс. Підкажи, як його краще обліковувати і чи не дублюється він із наявними.» |
| `nutrition-protein-low`         | «Сьогодні білка <факт> г із цілі <ціль> г, уже вечір. Що реально додати з простого, щоб добрати хоча б до <0.8×ціль> г?»               |
| `nutrition-streak-7-days-*`     | «Тиждень тримаю калорії в цілі (<ціль> ± 5%). Що з цього закріпити, а де я можливо недоїдаю по макросах?»                              |
| `routine-todo-evening`          | «Вечір, а зі звичок сьогодні не відмічені: <список>. Допоможи вирішити, що з цього ще реально зробити, а що чесно перенести.»          |
| `routine-streak-record-pending` | «Сьогодні можу побити рекорд стріку по "<звичка>" (<N> днів). Дай коротку мотивацію і підкажи, як не зірватись завтра.»                |
| `fizruk-pr-pending`             | «У поточному тренуванні є шанс на PR у "<вправа>" (минулий макс <вага> кг). Як підійти до підходу безпечно?»                           |
| `fizruk-rest-day-overdue`       | «<N> тренувань поспіль без дня відновлення. Наскільки це критично за моїми даними і коли найкраще поставити відпочинок?»               |

Точні поля для підстановки бере хук відповідного модуля (`useFinykInsights` тощо) — числа там уже обчислені для title/subtitle.

## Зачеплені поверхні

### Додати (web-only; на mobile плашок немає)

- `apps/web/src/shared/lib/insights/types.ts` — поле `askAiPrompt: string` в `Insight`.
- `apps/web/src/modules/{finyk,fizruk,routine,nutrition}/hooks/use*Insights.ts` — зібрати `askAiPrompt` по шаблонах вище.
- `apps/web/src/shared/components/ui/InsightCard.tsx` — чип (проп `onAskAi?: () => void` + `askAiDisabled?: boolean`), телеметрія `VALUE_SIGNAL_ASK_AI` (див. AI-CONTEXT у файлі: InsightCard — єдиний писар подій петлі).
- `apps/web/src/core/hub/HubInsightsBlock.tsx` — прокинути `onAskAi` (→ `emitHubBus("openChat", …)`) і стан квоти; модульні `*InsightsBlock`-и — те саме (плашки рендеряться і в модулях, `surface="module"`).
- `apps/web/src/core/observability/analytics.ts` — реєстрація `VALUE_SIGNAL_ASK_AI` в `ANALYTICS_EVENTS`.
- Квота: хук поверх `chatApi.usage` + `chatKeys.usage` (фабрика вже існує, Hard Rule #2).

### Видалити (day-hint, триплет Hard Rule #3)

- Server: `apps/server/src/modules/nutrition/day-hint.ts` (+ `.test`), роут `POST /api/nutrition/day-hint` у `apps/server/src/routes/nutrition.ts`, `DayHintSchema` у `apps/server/src/http/schemas.ts` (server-local), згадка endpoint-тегу `day-hint` у docstring `apps/server/src/lib/llm/provider.ts`.
- api-client: метод `dayHint` у `packages/api-client/src/endpoints/nutrition.ts` + кейс у `product-endpoints.test.ts`.
- Web: `dayHintMutation`/prefetch у `apps/web/src/modules/nutrition/hooks/useNutritionRemoteActions.ts`, стан у `useNutritionUiState.ts`, UI-блок «Отримати» у `NutritionDashboard.tsx` (пропи `dayHintText`/`dayHintBusy`), wiring у `NutritionApp.tsx` / `NutritionStartPage.tsx` / `NutritionMenuPage.tsx`, кейс у `lib/nutritionErrors.ts`, ключ `nutritionKeys.dayHint` у `apps/web/src/shared/lib/api/queryKeys.ts`.
- OpenAPI: якщо day-hint є у спеці — `pnpm api:generate-openapi`, гейт `pnpm api:check-openapi`.
- Каталог можливостей: перевірити `packages/shared/src/lib/assistantCatalogue.ts` на згадку підказки дня; якщо є — прибрати (реєстр-тест підкаже).
- ENV НЕ чіпати: `LLM_NUTRITION_PROVIDER`/`OPENROUTER_NUTRITION_MODEL` обслуговують решту 5 нутриційних генераторів.

### Канони й доки (у тому ж PR, Hard Rule #15)

- `docs/01-product/model/nutrition.md` § Журнал рішень: day-hint знято, формула «плашка → чат».
- `docs/01-product/model/hub-coach.md` § Журнал рішень: чат — єдина точка AI-розмови; плашки — ворота в чат; §2 таблиця поверхонь — прибрати згадку day-hint, якщо є.
- `docs/02-engineering/architecture/repo-map.md` / `apps/web/AGENTS.md` — лише якщо day-hint там згадується (grep).

## Поза скоупом v1

- Mobile (плашок там немає; чат на mobile сліпий — окремий трек).
- AI-генерація самих плашок; зміни коуча, дайджесту чи решти нутриційних генераторів (day-plan, week-plan, recipes, shopping-list, analyze-photo).
- Автовідправка префілу (`autoSend` лишається `false`).
- Зміни серверного чату/промпта/квот.

## Верифікація

```bash
pnpm --filter @sergeant/db-schema build
pnpm --filter @sergeant/server typecheck && pnpm --filter @sergeant/web typecheck
pnpm --filter @sergeant/server exec vitest run nutrition
pnpm --filter @sergeant/web exec vitest run InsightCard useAllInsights
pnpm --filter @sergeant/api-client test
grep -rn "day-hint\|dayHint" apps packages --include="*.ts*" | grep -v test   # очікування: 0 рядків поза архівними доками
```

Click-through (обовʼязково, `pnpm dev:db && pnpm dev:server && pnpm dev:web`):

1. Хаб → «Інсайти» → на плашці видно чип «Спитати AI» (є хоч одна детермінована плашка; за потреби підготувати дані: перевитрата категорії у Фініку).
2. Тап чипа → відкривається чат-оверлей, у композері розгорнуте питання з числами плашки, НЕ відправлене.
3. «Надіслати» → звичайна відповідь чату (1 списання квоти).
4. Тап по тілу плашки → навігація в модуль (стара поведінка жива); ✕ → dismiss.
5. Квота: тимчасово `AI_DAILY_USER_LIMIT=0` на сервері → чип сірий з підказкою; для Pro (`BILLING_ALL_PRO=true`) → активний.
6. Нутриція: блоку «Підказка дня» / кнопки «Отримати» немає ніде (дашборд, старт, меню).
7. Скріншоти: плашка з чипом, чат із префілом, задизейблений чип.

Подієва перевірка: у `window.__hubAnalytics` ring-buffer після кроку 2 є `value_signal_ask_ai` з коректними `module`/`signal`/`surface`.
