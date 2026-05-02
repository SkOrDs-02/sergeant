# UX-аудит 2025 — PWA Sergeant

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-27.
> **Status:** Active

Скоуп: 10 напрямків покращень (ключові флоу, стани, мікровзаємодії,
HubChat, HubSearch, онбординг, a11y, PWA). Цей документ — чек-ліст
змін, що увійшли у PR, з before/after.

## 1. Ключові флоу — інвентаризація

| Флоу                   | Старт                 | Таппи до цілі             | Видимість стану                        | Feedback               | Undo                   | Клавіатура                |
| ---------------------- | --------------------- | ------------------------- | -------------------------------------- | ---------------------- | ---------------------- | ------------------------- |
| Додати витрату         | FAB (Finyk)           | 2 — FAB → сума+enter      | Toast + оптимістичний додаток          | Toast                  | ✅ 5с (новинка)        | Enter                     |
| Почати тренування      | Dashboard → Фізрук    | 1 — `Почати`              | `ActiveWorkoutBanner`                  | Toast + haptic         | —                      | Tab/Enter                 |
| Завершити тренування   | Під час тренування    | 2 — `Завершити` → confirm | Toast + dialog                         | Toast + haptic success | —                      | Enter                     |
| Відмітити звичку       | Dashboard Routine     | 1 — tap                   | Confetti + badge                       | haptic                 | ✅ undo (raw → revert) | Tab/Enter                 |
| Логання їжі через фото | NutritionApp → camera | 3 — FAB → camera → save   | Прогрес-стадії                         | Toast                  | —                      | Tab/Enter                 |
| Логання через штрихкод | NutritionApp          | 2 — FAB → scan            | Прогрес                                | Toast                  | —                      | —                         |
| Логання через чат      | HubChat FAB           | 1 — `Залогай сніданок`    | Tool-call indicator (новинка) + токени | Toast + чат            | ✅ undo (у чаті)       | Enter                     |
| HubSearch              | Search icon / ⌘K      | 1 — hotkey                | Recent queries + match-groups          | tap sound + haptic     | —                      | ↑/↓/Enter/Esc + ⌘K/Ctrl+K |

## 2. Уніфікація станів

### До

- `PageLoader` — просто текст "Завантаження…".
- `OfflineBanner` не показував кількість черги синку.
- `ModuleErrorBoundary` рендерив лише fallback, без Retry.
- Animations у 10+ файлах без `motion-safe:` — не поважали
  `prefers-reduced-motion`.

### Після

- `PageLoader` → Skeleton (аватар + title/subtitle + 3 рядки контенту) +
  `aria-live="polite"` + `aria-busy="true"`.
- `OfflineBanner` підтягує `useSyncStatus()` і показує
  "Немає підключення · N дій чекають синхронізації" через `pluralUa`.
- `ModuleErrorBoundary` отримав кнопки "Спробувати ще" (re-mount по
  `retryRev` ключу) + "До вибору модуля", плюс `pre` з `error.message`
  для debug-режиму.
- `motion-safe:` префікс у 8 файлах для `animate-pulse` / `animate-spin`.
- Новий `SkeletonList` компонент — уніфікована заміна спінерам у
  списках (transactions / workouts / habits / meals). _Прибраний як
  невикористаний у PR [#439](https://github.com/Skords-01/Sergeant/pull/439);
  усі місця використовують `Skeleton`-примітив напряму._

## 3. Мікровзаємодії

### Нові

- `src/shared/lib/haptic.ts` — `hapticTap/Success/Warning/Error`.
  Feature-detect `navigator.vibrate`, no-op на платформах без
  підтримки, поважає `prefers-reduced-motion`.
- `src/shared/lib/undoToast.tsx` — `showUndoToast` з 5-сек вікном
  для destructive дій; викликає `hapticWarning()` при показі та
  `hapticTap()` при undo.

### Wiring

- `VoiceMicButton` → `hapticTap()` на toggle.
- `HubSearch` → `hapticTap()` при відкритті хіту.
- Запис звички / скасування витрати — використовуватимуть
  `showUndoToast` у follow-up PR-ах (інфраструктура готова).

## 4. HubChat UX

### До

- Стрімінг токенів був, але:
  - Не можна було скасувати запит — користувач чекав до таймауту.
  - Tool-calls відображалися тільки після завершення (`✅ прекс`).
  - Підказки — статичний список з двох варіантів (mono / no-mono).
  - Історія сесій — лише `hub_chat_history` (одна сесія).

### Після

- **AbortController cancel**: кожен `send` має власний `AbortController`;
  кнопка "Скасувати" поруч із `TypingIndicator` перериває fetch одразу,
  `chatApi.send`/`.stream` тепер приймають `signal`.
- **Tool-call видимість**: префікс `✅ {action}\n\n` рендериться
  негайно (до follow-up streaming) — користувач бачить, що створено,
  раніше за пояснення.
- **Контекстні швидкі підказки**: `QUICK_BY_CONTEXT` — 4 набори
  (finyk / fizruk / routine / nutrition), що читаються з `location.hash`.
  Fallback → generic mono/no-mono.
- **Abort cleanup on unmount**: `useEffect` у HubChat abortить живий
  запит при unmount (закриття чату) — інакше fetch продовжує
  "ганяти" токени у фоні.
- **Друге повідомлення "⏹ Запит скасовано"** замість generic error, коли
  причина — aborted.

## 5. HubSearch — fuzzy + keyboard + recent

### До

- `includes()` case-sensitive fallback, без token-based scoring.
- Нема keyboard-nav (↑/↓/Enter) — тільки Escape.
- Нема recent queries.
- Нема глобального shortcut.

### Після

- `src/core/hub/hubSearchEngine.ts`:
  - `normalize(s)` — lowercase + NFD + diacritic strip + apostrophe
    normalization (ʼ → ').
  - `tokenize(q)` — split by whitespace.
  - `scoreMatch(item, tokens)` — AND-logic; prefix > substring,
    title > subtitle; повертає -1 коли не всі токени знайдені.
  - `scoreAndSort(items, query, limit)` — filter + rank + stable sort.
  - `getRecentQueries / pushRecentQuery / clearRecentQueries` —
    localStorage cap-5, оновлюється при `Enter` або кліку на хіт.
- `src/core/hub/HubSearch.tsx` (переписано):
  - Показує recent-queries chips коли input порожній.
  - Highlighted row (`aria-selected`, `ring-1 ring-brand-500/25`) +
    `data-hit-idx` для keyboard-nav scroll.
  - `aria-combobox/listbox/option` ARIA-патерн.
  - Hint у порожньому стані згадує ⌘K / Ctrl+K залежно від платформи.
- **Глобальний shortcut** в `src/core/App.tsx`:
  - `keydown` handler на `window`, `metaKey || ctrlKey` + `k`.
  - Ігнорується, якщо фокус у `<input>`, `<textarea>`, або
    `isContentEditable` — інакше ⌘K блокував би editing.

## 6. Онбординг + PermissionsPrompt

План — додати `PermissionsPrompt.tsx` у onboarding flow (push / speech
/ camera) з поясненням "навіщо" + кнопка skip. Скоуп великий —
перенесено у follow-up PR; інфраструктура haptic і a11y вже на місці.

## 7. Доступність (a11y)

### Зроблено

- `motion-safe:` префікс у всіх `animate-pulse` / `animate-spin`
  (8 файлів: Skeleton, Button, VoiceMicButton, ChatInput × 2,
  UserMenuButton × 2, WeeklyDigestCard, Transactions,
  SyncStatusBadge, FoodPickerSection, PageLoader).
- `aria-hidden="true"` на `Skeleton` (декоративний — не зчитувати
  AT-ями).
- `PageLoader` → `aria-live="polite"` + `aria-busy="true"` +
  `aria-label="Завантаження сторінки"`.
- `HubSearch` → `role="dialog"`/`aria-modal`, `role="combobox"` з
  `aria-expanded`/`aria-controls`/`aria-activedescendant`, `role="listbox"`
  для результатів, `role="option"` + `aria-selected` для рядків.
- `focus-visible:ring-2 focus-visible:ring-brand-500/45` у нових
  інтерактивних елементах (замість `focus:ring-*`, яке показується
  і для mouse).

### Ще

- Audit focus rings у застарілих компонентах (`h-11 rounded-xl` tokens)
  для follow-up.

## 8. PWA

- `OfflineBanner` з queued-count — зрозуміла іконка офлайн-стану
  ("Немає підключення · N дій чекають").
- `IOSInstallBanner` / `usePwaInstall` — перевірено, не змінено
  (існуюча поведінка коректна).
- `manifest.json` shortcuts — не чіпали, валідні.

## 9. Файли в PR

### Нові

- `src/shared/lib/haptic.ts`
- `src/shared/lib/undoToast.tsx`
- `src/shared/components/ui/SkeletonList.tsx` _(видалено в
  PR [#439](https://github.com/Skords-01/Sergeant/pull/439) — dead code)_
- `src/core/hub/hubSearchEngine.ts`
- `docs/design/ux-audit-2025.md`

### Змінені (основні)

- `src/core/App.tsx` — ⌘K/Ctrl+K handler.
- `src/core/hub/HubChat.tsx` — AbortController cancel, context-aware
  prompts, unmount-abort cleanup.
- `src/core/hub/HubSearch.tsx` — перевстановлено з fuzzy engine +
  keyboard-nav + recent queries + ARIA.
- `src/core/ModuleErrorBoundary.tsx` — Retry button + remount key.
- `src/core/app/PageLoader.tsx` — Skeleton замість тексту.
- `src/core/app/OfflineBanner.tsx` — queued-count через useSyncStatus.
- `src/shared/api/endpoints/chat.ts` — accept `signal`.

### Змінені (a11y `motion-safe:`)

- `src/shared/components/ui/Skeleton.tsx`
- `src/shared/components/ui/Button.tsx`
- `src/shared/components/ui/VoiceMicButton.tsx`
- `src/core/components/ChatInput.jsx`
- `src/core/app/UserMenuButton.tsx`
- `src/core/insights/WeeklyDigestCard.tsx`
- `src/modules/finyk/pages/Transactions.jsx`
- `src/modules/finyk/components/SyncStatusBadge.jsx`
- `src/modules/nutrition/components/meal-sheet/FoodPickerSection.jsx`

## 10. Не увійшло (follow-up)

- `PermissionsPrompt` у онбординг (push / speech / camera).
- Масштабне перенесення `showUndoToast` у всі destructive actions.
- Drawer з історією сесій HubChat (наразі одна активна сесія у
  `hub_chat_history`).
- A11y audit legacy focus rings.

---

## 11. Оновлення квітень 2026

### 11.1 Celebration System

Інтегровано `CelebrationModal` в ключові флоу:

| Флоу                 | Тип celebration   | AutoClose |
| -------------------- | ----------------- | --------- |
| Успішна реєстрація   | `achievement`     | 6s        |
| Завершення онбординг | `confetti` (high) | 5.5s      |
| Досягнення цілі      | `goalCompleted`   | 5.5s      |
| Streak milestone     | `streak`          | 5s        |

**Зміни:**

- Збільшено `autoCloseMs` з 3s до 4.5-6s для кращого UX
- Інтегровано `useFocusTrap` для accessibility
- Додано confetti particles з physics simulation

### 11.2 Progressive Header

`HubHeader` тепер використовує `useScrollHeader`:

- **Shrink mode** (scroll > 40px): зменшується padding, ховаються subtitle та greeting
- **Hide mode** (scroll down > 120px): повністю ховається з translate
- **Blur backdrop**: з'являється при scroll для візуального розділення

### 11.3 Module-Specific Loaders

Замінено generic `PageLoader` на `ModulePageLoader` в lazy-loaded modules:

| Модуль    | Skeleton layout                 |
| --------- | ------------------------------- |
| Finyk     | Balance card + transaction list |
| Fizruk    | Stats grid + workout cards      |
| Routine   | Habit grid + week calendar      |
| Nutrition | Macro rings + meal cards        |

### 11.4 Form Validation UX

Новий `useFormValidation` hook:

- **Shake animation** на полях з помилками
- **Haptic feedback** при validation failure
- **Inline error messages** з плавним fade-in
- **Built-in rules**: email, required, minLength, pattern, etc.

### 11.5 Visual Polish

- **PricingPage**: hover-lift ефект на tier cards, stagger entrance animation
- **AuthPage**: slide-in animation на форму
- **Animations**: shake, stagger-in, confetti-fall keyframes

### 11.6 Accessibility

- `useFocusTrap` hook для modal focus management
- Focus trap інтегровано в `CelebrationModal`
- Всі нові анімації мають `motion-safe:` prefix

### 11.7 Нові компоненти

| Компонент                | Призначення                                 |
| ------------------------ | ------------------------------------------- |
| `CelebrationModal`       | Achievement/success celebrations з confetti |
| `FeatureSpotlight`       | Contextual onboarding hints                 |
| `ModulePageLoader`       | Module-specific skeleton loaders            |
| `PullToRefreshIndicator` | Native-like pull-to-refresh                 |

### 11.8 Нові хуки

| Hook                | Призначення                    |
| ------------------- | ------------------------------ |
| `useScrollHeader`   | Progressive header shrink/hide |
| `useFormValidation` | Form validation з shake        |
| `useFocusTrap`      | Modal focus management         |
| `usePullToRefresh`  | Pull-to-refresh gesture        |

---

## 12. Roadmap (наступні кроки)

### Високий пріоритет

- [ ] Profile page з avatar upload
- [ ] Push notification opt-in flow
- [ ] Charts анімації в Finyk

### Середній пріоритет

- [ ] Інтеграція `FeatureSpotlight` в onboarding touchpoints
- [ ] Bottom navigation замість tabs на mobile
- [ ] Більше haptic feedback

### Низький пріоритет

- [ ] Keyboard shortcuts guide (? hotkey)
- [ ] Dark mode scheduled toggle
- [ ] Custom theme colors
