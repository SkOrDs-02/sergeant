# SPEC: Голі поля вводу на примітиви `Input` / `Textarea` / `Select`

> **Last touched:** 2026-10-26 by @claude (тріаж документації: Status → Implemented, #1634). **Next review:** 2027-01-23.
> **Status:** Implemented - злито [#1634](https://github.com/SkOrDs-02/sergeant/pull/1634) (`cdf602a`); `rawInput` у `ZERO_ONLY_METRICS` (`scripts/check-ui-canon-ratchet.mjs`), бюджет 0.

Продовження редизайну v3.1 ([`redesign-v3-1.md`](./redesign-v3-1.md), Implemented). Рішення власника 2026-10-23 у § Рішення нижче, альтернативи не переглядаються.

## Проблема

Позиція А6 інвентарю v3.1 («поле вводу з попередньої мови») закрилась лише на рівні примітива: `Input`, `Textarea` і `Select` у PR2 отримали мову H (48 px, радіус 8, межа `border-control`, фокус межею й `inset-ring` чорнилом, підпис 14 / 500). Але 36 полів у 28 файлах малюють себе самі голим `<input>` / `<textarea>` / `<select>` з попередньою мовою: межа `border-line` (~1,6:1 проти панелі, нижче 3:1 за WCAG 1.4.11), висота 44 px, власне кільце фокусу (`input-focus-<module>`). На кадрі сторінки «Тіло» Фізрука після PR #1622 це видно одразу: шкали вже на мові H, а поля ваги, сну й нотатки поруч ні. Гейта, який не дав би додати нове голе поле, немає.

## Мета

1. Кожне видиме текстове, числове, дата/час-поле і випадний список у `apps/web` іде через `Input` / `Textarea` / `Select` або є явним винятком із причиною.
2. Метрика храповика `rawInput` = 0 і стає забороною (`ZERO_ONLY_METRICS`).
3. Винятки (чат, пошуки) беруть з примітива межу `border-control` і фокус `fieldFocus`, тобто виглядають як поле мови H, лишаючись своїми компонентами.
4. Поведінка полів не міняється: ті самі `register`, `value` / `onChange`, `inputMode`, `aria-*`, валідація.

## Рішення

- **Компактні поля в рядках** (повтори й вага підходу, грами порції, сума розбивки, рядок чека, ліміт нагадувань): `Input size="sm"` (36 px, 44 px зона на сенсорі через флор примітива), ширина лишається вузькою [власник 2026-10-23].
- **Чат із Сержантом і рядки пошуку** (`ChatInput`, `SearchInput`, пошук `AssistantCataloguePage`): виняток у `RAW_INPUT_ALLOWLIST`, але межа `border-control` і фокус `fieldFocus` з примітива [власник 2026-10-23].
- **`StrategyPage`** (не зароутована заглушка): переводиться разом із рештою, щоб гейт не мав винятків для мертвого коду [власник 2026-10-23].
- **Не поля вводу**, метрика їх не рахує: `type="file"` (приховані інпути вибору файлу), `type="hidden"`, прихований `sr-only` інпут PIN в `AppLock` (allowlist).
- Решта: `Input` / `Textarea` / `Select` розміру `md` (48 px), як у формах PR2-PR6.

## Інвентар (2026-10-23, `main` `f328c2f4a`)

| Модуль            | Файли й поля                                                                                                                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Налаштування      | `FinykPrivatBankSection` (2), `FinykSection` (1), `MonoTokenInlineForm` (1), `NotificationsSection` (1, `sm`), `NutritionSection` (1)                                                                                                                 |
| Фінік             | `receiptMoneyInput` (1), `ReceiptReviewItemRow` (1, `sm`), `TxRowSplitEditor` (1, `sm`)                                                                                                                                                               |
| Фізрук            | `SessionExtrasRow` (textarea), `AddExerciseSheet` (select), `LongSessionDialog` (1), `WorkoutItemCardioFields` (2), `WorkoutSetRow` (2, `sm`), `WorkoutSummaryTimeEditor` (2), `WorkoutTimeEditor` (3), `BodyEntryForm` (3), `AddMeasurementForm` (1) |
| Їжа               | `ItemEditSheet` (select), `PickedFoodCard` (1, `sm`), `PortionUnitControls` (1, `sm`), `NutritionPantrySelector` (select), `PantryCard` (textarea), `PantryModeSelect` (select), `RecipesCard.Generator` (2 select), `SilpoCartSheet` (select)        |
| Рутина            | `HabitForm` (select)                                                                                                                                                                                                                                  |
| Стратегія         | `StrategyPage` (textarea)                                                                                                                                                                                                                             |
| Винятки allowlist | `ChatInput`, `SearchInput`, `AssistantCataloguePage` (межа й фокус з примітива), `AppLock` (прихований PIN)                                                                                                                                           |

## Розкатка

Одна гілка, один draft-PR, коміт на модуль: гейт і спека → Налаштування й Стратегія → Фінік → Фізрук → Їжа і Рутина → винятки (межа й фокус). Після кожного коміту `node scripts/check-ui-canon-ratchet.mjs --update` опускає `rawInput`; останній коміт переносить його в `ZERO_ONLY_METRICS`.

## Поза скоупом

- Нові пропи чи варіанти примітивів: беремо те, що є (`size`, `icon`, `suffix`, `label`, `error`).
- Кнопки-«поля» (`LogPastWorkoutSheet` з кнопкою замість `<select>`), пікери дат і часу, що вже на примітивах (`DateField`, `TimeField`).
- `apps/mobile*` (ADR-0094), лендінг.
- Зміна поведінки, валідації чи копі полів.

## Верифікація

1. Команди з кодом 0: `pnpm --filter @sergeant/web exec tsc -p tsconfig.json --noEmit`; vitest зачеплених тек; eslint зачеплених файлів; `node --test scripts/__tests__/check-ui-canon-ratchet.test.mjs`; `node scripts/check-ui-canon-ratchet.mjs`; `pnpm --filter @sergeant/web build` + `size-limit` (JS під 1,55 MB); `pnpm lint:specs`.
2. Кадри зачеплених маршрутів сценарієм `pnpm --filter @sergeant/web shots` (390 × 844, світла й темна), до (`main`) і після.
3. Break-тести метрики: голі теги ловляться, `Input` / `Select` / `Textarea`, `type="file|hidden"`, коментарі, тека примітивів і allowlist ні.

## Журнал

**Де зупинився:** усе з інвентарю переведено, `rawInput` = 0 і заборона (`ZERO_ONLY_METRICS`), канон `04-components.md § Input`, `DESIGN.md`, `sergeant-web-ui` і `design-reviewer` знають правило. Далі: draft-PR, вердикт CI. Worktree `D:/Sergeant/.claude/worktrees/pryvit-1eb737`, гілка `claude/raw-input-to-primitive`.

**2026-10-23, виконання.** Коміт на модуль, лічильник 36 → 29 (Налаштування, Стратегія) → 26 (Фінік) → 10 (Фізрук) → 0 (Їжа, Рутина). Усі рядки інвентарю вище закриті в цьому PR. Попутно:

- `ReceiptMoneyInput` отримав проп `size` (`sm` у рядку позиції, `md` для суми чека); перебивання шрифту через `!` у формі чека зняті, бо анти-зум тримає `base.css`.
- Підписи над полями дата-часу Фізрука й над селектами Їжі та Рутини стали `label` примітива або `FIELD_LABEL` з `htmlFor` (раніше caption другим сірим і обгортка-`label` без привʼязки).
- Невживані після переведення утиліти `input-focus-nutrition`, `input-focus-routine`, `routine-touch-select` видалені з `utilities.css`.
- Винятки (чат, пошук хаба, пошук каталогу) на `border-control` і `fieldFocus`; `handRolledFocusRing` 138 → 133.
- Мок `@shared/components/ui/Input` у `DailyPlanCard.extra.test.tsx` доповнено `FIELD_LABEL` і `fieldFocus`: реальний `Select` бере `fieldFocus` з того ж модуля.

**Відхилення від спеки:** немає. Висоти змінились за правилом: поля форм 44 → 48 px (`md`), компактні в рядках 36 px візуально (44 px зона на сенсорі), як вирішив власник.

## Стан виконання

> Тріаж 2026-10-26: «Далі: draft-PR» у журналі вище - історія; PR злито [#1634](https://github.com/SkOrDs-02/sergeant/pull/1634). Залишків немає, повернення сирих полів ловить ratchet `rawInput` = 0.
