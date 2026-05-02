# Empty-states

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-27.
> **Status:** Active

> **Аудиторія:** усі, хто пише UI у `apps/web` або `apps/mobile`.
> **Ціль:** однакова обробка стану «даних поки немає» — обирати правильний tier для поверхні, а не вигадувати разовий патерн.

У Sergeant є повноцінний компонент `<EmptyState>` (`apps/web/src/shared/components/ui/EmptyState.tsx`) з анімованою іконкою, слотами title/description/hint/example-preview/action і module-accent-тонуванням. Більшість module-entry-point-ів уже на ньому (`Transactions`, `Budgets`, `WorkoutCatalogSection`, `Exercise`, `Progress`, `RoutineCalendarPanel`, `LogCard`, `Analytics`, …).

Є **три tier-и** обробки empty-state. Обираємо за поверхнею.

## Tier 1 — Full screen / hero

Коли primary-поверхня модуля ще не має даних — використайте `<ModuleEmptyState>` (curated-обгортка над `<EmptyState>`):

```tsx
<ModuleEmptyState module="finyk" onAction={() => openAddSheet()} />
```

У ньому module-tuned копія, іконка, hint і example-preview-картка — усе per-module. Використовуйте для **першого запуску** модуля.

Для не-module-екранів (Hub-search, Reports) використайте сирий `<EmptyState>` і самі передайте копію.

## Tier 2 — Compact / inline-card

Коли sub-card усередині заповненого екрана немає чого показати (наприклад, картка «Збережені шаблони» без шаблонів, але інша частина екрана з даними) — використайте `<EmptyState compact>`:

```tsx
<EmptyState
  compact
  icon={<Icon name="dumbbell" size={20} />}
  title="Поки немає шаблонів"
  description="Створи свій перший — кнопка вище."
  module="fizruk"
/>
```

`compact` зменшує іконку (40 px замість 56 px) і паддінги (`py-8` замість `py-14`). Це правильний розмір для card-internal-empty-поверхні (~120–180 px заввишки).

**Не дублюйте action**, якщо primary-CTA уже видно на тому самому екрані. Empty-state — описовий, а не дубль кнопки.

## Tier 3 — inline-текст (≤ 1 рядок)

Для крихітних карток — chart-легенди, mini-stats всередині analytics-grid-у, sub-секції sheet-ів — правильно один muted-рядок. `EmptyState` домінуватиме у 80 px stat-картці.

```tsx
{statsRows.length === 0 ? (
  <div className="text-xs text-muted">Поки що порожньо</div>
) : (
  …
)}
```

Стайл-гайд для tier 3:

- `text-xs text-muted` (або `text-subtle` для ще тихішої нотатки).
- Центруйте, якщо контейнер центрує контент; інакше — left-align.
- Одне коротке речення. Без CTA, без іконки. Якщо потрібне щось із цього — переходьте у tier 2.

## Як обирати tier 1 vs tier 2 vs tier 3

Вирішуйте за **розміром поверхні** і за тим, **чи це перший раз для юзера**, а не за типом контейнера:

| Поверхня                                                                | Tier    |
| ----------------------------------------------------------------------- | ------- |
| Module landing page, ще немає даних (перший запуск)                     | 1       |
| Порожня сторінка після фільтра (наприклад, «нема транзакцій у березні») | 1 або 2 |
| Card-section без items (наприклад, список збережених шаблонів)          | 2       |
| Mini-stat-картка (40–120 px заввишки)                                   | 3       |
| Sub-секція action-sheet-у (наприклад, «нема шаблонів на сьогодні»)      | 3       |

## Гайдлайни копії

- **Українська, форма «ти»** (тон Sergeant — див. Wave 1 PR #1126).
- Title — це стан, а не інструкція: «Поки немає шаблонів», а не «Створи шаблон». Дієслово несе кнопка action-у.
- Description — одне речення; якщо не виходить в одне — empty-state надто складний для цієї поверхні; підніміться до tier 2 / 1.
- Hint (tier 1) — це _корисна побіжна нотатка_, не дубль description-а. Добре: «Порада: підключи Monobank — імпорт автоматично.» Погано: «Тут зараз порожньо.»

## Анти-патерни

```tsx
// ❌ Tier-1 EmptyState всередині 100-px stat-картки.
// Іконка більша за саму картку, виглядає як bug.
<div className="bg-panelHi rounded-2xl px-3 py-3">
  <SectionHeading>Топ страв</SectionHeading>
  <EmptyState icon={<Icon name="utensils" size={24} />}
              title="Ще немає улюблених страв"
              description="…" />
</div>

// ✅ Tier 3 — один muted-рядок.
<div className="bg-panelHi rounded-2xl px-3 py-3">
  <SectionHeading>Топ страв</SectionHeading>
  {top.length === 0 ? (
    <div className="text-xs text-muted">Поки що порожньо</div>
  ) : …}
</div>
```

```tsx
// ❌ Tier-3 голий текст на повноекранному модулі при першому запуску.
// Юзер не розуміє, що цей модуль робить і з чого почати.
{
  txs.length === 0 && (
    <p className="text-xs text-subtle">Транзакцій ще немає.</p>
  );
}

// ✅ Tier 1 — ModuleEmptyState із action-ом.
{
  txs.length === 0 && (
    <ModuleEmptyState module="finyk" onAction={() => openManualExpense()} />
  );
}
```

```tsx
// ❌ Action-кнопка задубльована — на сторінці вже є «+ Новий шаблон»
// угорі, а в empty-state з'являється ще одна за 60 px нижче. Візуальний
// шум; юзер тицяє в одну з них рандомно.
<>
  <Button onClick={startNew}>+ Новий шаблон</Button>
  <Card>
    <EmptyState
      compact title="Поки немає шаблонів"
      action={<Button onClick={startNew}>Створити</Button>} />
  </Card>
</>

// ✅ Empty-state суто описовий; CTA вище видно.
<>
  <Button onClick={startNew}>+ Новий шаблон</Button>
  <Card>
    <EmptyState
      compact title="Поки немає шаблонів"
      description="Створи свій перший — кнопка вище." />
  </Card>
</>
```

## Як це enforce-иться

Сьогодні: code review + цей документ.

Якщо empty-state-дрейф стане проблемою — кандидати на правило:

- Заборонити голий патерн `<p>Поки … немає…</p>` поза файлами, позначеними `// eslint-disable-next-line sergeant-design/empty-state-tier`.
- Ворнити, коли `<EmptyState compact>` використовується в контейнері ≥ 250 px заввишки (швидше за все, треба tier 1).
