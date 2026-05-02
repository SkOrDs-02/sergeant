# Ритм border-radius

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-27.
> **Status:** Active

> **Аудиторія:** усі, хто пише UI у `apps/web` або `apps/mobile`.
> **Ціль:** уникати дрейфу border-radius — обирати правильний радіус із короткої, орієнтованої на розмір шкали, а не вигадувати разові значення.

Sergeant використовує **size-driven** шкалу радіусів: чим більший елемент — тим більший радіус. Шкала вже зашита у спільні компоненти (`Button`, `Card`, `Modal`, …), тож писати `rounded-*` напряму майже ніколи не треба. Якщо все ж треба — обирайте з цієї таблиці.

## Шкала

| Токен                   | Tailwind-клас  | px    | Де використовувати                                                                                     |
| ----------------------- | -------------- | ----- | ------------------------------------------------------------------------------------------------------ |
| **Swatch**              | `rounded-sm`   | 2 px  | Крихітні кольорові маркери (heatmap-клітинки, точки в легенді чарта, swatch-и macro-pie).              |
| **Marker**              | `rounded-md`   | 6 px  | Елементи 5 × 5 / 6 × 6 px (квадратики чекбоксів, badge-чипи, in-place pill-лейбли).                    |
| **Control (sm)**        | `rounded-xl`   | 12 px | `Button` size `xs`/`sm`; icon-кнопки `≤ 40 px`; малі input-чипи; рейл `IconButton`.                    |
| **Card / Control (md)** | `rounded-2xl`  | 16 px | `Button` size `md`/`lg`; `Card` `radius="lg"` (типові контентні поверхні); `IconButton` ≥ 44 px.       |
| **Hero / Control (xl)** | `rounded-3xl`  | 24 px | `Button` size `xl`; `Card` `radius="xl"` (hero / module-branded); shell `Modal`; shell bottom-sheet-у. |
| **Pill**                | `rounded-full` | ∞     | FAB; кругові аватари; status-точки; градієнти module-bento-тайлів; toggle-pill-и.                      |

Шару семантичних аліасів (`rounded-card` / `rounded-control`) **немає**. Tailwind уже дає правильний примітив — додавати аліаси означає мати два імені для однієї речі, що тільки збільшує дрейф.

## Правила

1. **Перевага компоненту, а не класу.** Якщо `Button`/`Card`/`Modal` уже існує — використайте його з потрібним size/variant. Не відтворюйте його через сирий `<div className="bg-panel rounded-2xl …">`.

2. **Радіус має відповідати розміру елемента.** Icon-кнопка 48 × 48 px використовує `rounded-2xl`, а не `rounded-xl` (надто гострий для такого footprint-а) і не `rounded-3xl` (надто округлий — починає виглядати як pill). Icon-кнопка 32 × 32 використовує `rounded-xl`, а не `rounded-2xl`.

3. **Не вводьте `rounded-lg` (8 px)** — він живе між Marker і Control без чіткої семантичної ролі. 53 наявні використання — це легасі дорадіусних часів; новий код має округлятися вгору до `rounded-xl` або вниз до `rounded-md` залежно від footprint-а елемента.

4. **Не вводьте `rounded-4xl` / `rounded-5xl`** — ці токени є в Tailwind-preset-і для разових ілюстрацій (наприклад, onboarding-hero blob). Вони **не** є частиною звичайного ритму.

5. **`rounded-full` зарезервований для кіл, FAB-ів і pill-ів.** Не вживайте його на прямокутних поверхнях «щоб виглядало модерно» — це інша візуальна мова (Memoji-iOS), яка не вʼяжеться з bento Sergeant-а.

## Анти-патерни

```tsx
// ❌ Хардкоднутий `rounded-md` на 48 px icon-кнопці — занадто гострий,
// виглядає як товстий чекбокс.
<button className="w-12 h-12 rounded-md …" />

// ✅ 48 px → `rounded-2xl` (співпадає з Card / Button size=md).
<button className="w-12 h-12 rounded-2xl …" />
```

```tsx
// ❌ Inline 12 px кнопка з `rounded-3xl` — over-rounded; читається як
// pill і конфліктує з мапінгом xl-розміру у компоненті Button.
<button className="h-9 px-3 rounded-3xl …" />

// ✅ Використайте наявний Button.
<Button size="sm">…</Button>
```

```tsx
// ❌ Ad-hoc rounded-lg для inline-чипа — сидить між Marker і Control
// без чіткої ролі.
<span className="px-1.5 py-0.5 rounded-lg bg-brand-500/10 …" />

// ✅ Marker (`rounded-md`) для чипів розміру лейбла.
<span className="px-1.5 py-0.5 rounded-md bg-brand-500/10 …" />
```

## Як це enforce-иться

Сьогодні: code review + цей документ. Lint-правила поки немає.

Якщо дрейф радіусів стане проблемою — кандидати на правило:

- Заборонити `rounded-lg` поза міграційними path-ами `packages/design-tokens`.
- Ворнити, коли сирий `rounded-2xl` / `rounded-3xl` використовується замість `<Card>` / `<Button>` для поверхонь 100 × 100+.
- Заборонити `rounded-4xl` / `rounded-5xl` поза `apps/web/src/core/onboarding/**`.

## Чому без семантичних аліасів?

Ми розглядали додавання `rounded-control` / `rounded-card` / `rounded-pill` у Tailwind-preset. Ми вирішили **не** додавати:

- Аліаси створюють два імені для одного примітиву (`rounded-card` і `rounded-2xl`). Нові контрибʼютори шукають одне або інше — і отримують змішане використання, що активно гірше за поточний статус-кво.
- Шкала радіусів і так коротка (5 активних кроків); називати її двічі не зменшує когнітивне навантаження.
- Шар компонентів (`Card`, `Button`, `Modal`) уже дає семантичну індирекцію: `<Card radius="lg">`, а не `<Card radius="rounded-2xl">`. Іменувати треба саме там.

Якщо в майбутньому форма зміниться (наприклад, усі card-и стануть 18 px замість 16 px), зміна станеться в компоненті, а не на рівні токена.
