# Keyboard shortcuts registry

> **Last touched:** 2026-09-16 by @claude (рішення власника: `N` і `Cmd+Z` реалізовано, `Cmd+K` має одного власника, пошук хаба — режим палітри). **Next review:** 2026-12-22.
> **Status:** Active.

Канонічний реєстр клавіатурних шорткатів `apps/web` + browser-conflict
аналіз для §3.11 з [`docs/work/specs/audits/2026-05-03-web-deep-dive/01-frontend-ergonomics.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/audits/archive/2026-05-03-web-deep-dive/01-frontend-ergonomics.md).

## Де що живе (стан 2026-09-16, після рішень власника)

«Одного файла-реєстру» немає — поведінка розкладена по трьох файлах, і
жоден тест не звіряє їх між собою:

| Файл                                                                                                      | Що тримає                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts)               | Глобальні обробники на `window`: `?`, `Cmd/Ctrl+K`, `Cmd/Ctrl+/`, `Cmd/Ctrl+S`, `Cmd/Ctrl+Z`, `N`, `G`-акорд (`G_CHORD_MAP`, `CHORD_TIMEOUT_MS = 1000`); зшивка — `RootLayout.tsx` |
| [`KeyboardShortcutsModalUI.tsx`](../../../apps/web/src/shared/components/ui/KeyboardShortcutsModalUI.tsx) | `DEFAULT_SHORTCUTS` — **список, який бачить користувач** у модалці `?` (винесено окремо для lazy-чанку, ініціатива 0017)                                                           |
| [`KeyboardShortcutsModal.tsx`](../../../apps/web/src/shared/components/ui/KeyboardShortcutsModal.tsx)     | `useRegisterShortcuts` / `ShortcutRegistryContext` + власний `document`-слухач `?` у `useKeyboardShortcutsModal`                                                                   |

Модалка `?` рендериться **лише на сторінці хаба**
([`HubHomeView.tsx`](../../../apps/web/src/core/app/HubHomeView.tsx)); усередині
модульного маршруту `?` ловиться, але нічого не показує. Заявлений раніше
«обʼєднаний реєстр global + module» не існує: жоден модуль не викликає
`useRegisterShortcuts` (нуль call-site-ів поза тестами).

**Фантомів у модалці більше немає (рішення власника 2026-09-16, варіант B).**
`N` і `Cmd+Z` мали записи без обробників; тепер обидва живі:

- `N` → «створити» в поточному контексті. У модулі — первинна дія з
  `MODULE_PRIMARY_ACTION` через той самий PWA-інтент, що й FAB / чекліст
  (`openHubModuleWithAction`): Фінік — витрата, Харчування — прийом їжі,
  Рутина — звичка, Фізрук — аркуш «Почати тренування» (`start_workout`
  тепер відкриває аркуш, а не лише веде на сторінку). На хабі — пошук із
  порожнім запитом, тобто чотири дії швидкого додавання. Поверх відкритого
  діалогу (`useModalDialogOpen`) не спрацьовує.
- `Cmd/Ctrl+Z` → «Повернути» з наймолодшого видимого undo-тоста. Стеку
  undo немає навмисно: вікно скасування у продукті і є тост (5 с), клавіша
  лише повторює його кнопку. Undo-тости позначені `ToastAction.kind:
"undo"` (`showUndoToast` + два ручні «Скасувати» в Харчуванні); retry-
  чи «Оновити»-дії клавіша не чіпає. Нема чого повертати — `false`, і
  браузер робить свій undo (у полях вводу хук не спрацьовує взагалі).

**Один власник `Cmd+K` (рішення власника 2026-09-16, варіант A).**
`useCommandPaletteHotkey` знято; клавішу тримає лише
`useHubKeyboardShortcuts`, а `RootLayout` вирішує, що відкрити: з
увімкненим `hub_command_palette` — палітру, інакше — пошук хаба. Пошук
хаба з палітрою став її режимом: команда «Глобальний пошук» першою в
списку і рядок «Шукати „…“ у Sergeant» у хвості будь-якого запиту
(`openHubSearch(query)` → `hub:open-search` → `ui.openSearch(query)`).
Наслідок для полів вводу: палітра більше не відкривається з інпуту
(політика хаба — не красти клавіші з полів); закривати її — `Esc`.

`?` досі ловлять два слухачі — `useHubKeyboardShortcuts` (`window`) і
`useKeyboardShortcutsModal` (`document`; `RootLayout` викликає його
«side-effect only», тобто цей слухач лише `preventDefault()`-ить). Не
шкодить, але зайвий.

## Global

| Key            | Action                                                                       | Handler / реєстрація                                                                                                                                                                                                                     | Browser conflict                                                                                                     |
| -------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `?`            | Відкрити модальку шорткатів (лише на хабі)                                   | [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts) — Registered (+ дубль у `useKeyboardShortcutsModal`, див. вище)                                                                              | Жодного — `?` не зарезервовано браузером.                                                                            |
| `Cmd/Ctrl + K` | Глобальний пошук; з `hub_command_palette` — палітра команд (пошук усередині) | [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts) — Registered, єдиний власник; вибір поверхні — `RootLayout.handleOpenSearchShortcut`                                                         | Chrome / Firefox map-ять `Ctrl+K` на address-bar focus — ми `preventDefault()`-имо.                                  |
| `Cmd/Ctrl + /` | Відкрити AI-асистента                                                        | [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts) — Registered; `preventDefault()` скрізь                                                                                                      | Конфлікт у Firefox (Quick-find) — `preventDefault()` застосовано.                                                    |
| `Cmd/Ctrl + S` | Context-aware save (R6 mitigation)                                           | [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts) — Registered; `preventDefault()` + `form.requestSubmit()` лише коли фокус у `<form>`. Без form-context — no-op, browser default збережено.   | **Browser default = Save Page.** Override тільки у form-context — безпечно.                                          |
| `Cmd/Ctrl + Z` | Повернути щойно видалене (з undo-тоста)                                      | [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts) — Registered; `RootLayout.handleUndoShortcut` шукає видимий тост із `action.kind === "undo"`; `preventDefault()` лише коли було що повернути | **Browser default = Undo (in text-fields).** У полях вводу хук не спрацьовує; поза ними браузеру скасовувати нічого. |
| `N`            | Новий запис у поточному модулі / швидке додавання на хабі                    | [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts) — Registered; `RootLayout.handleCreateShortcut` → `openHubModuleWithAction(activeModule, MODULE_PRIMARY_ACTION[…].action)`                   | Жодного — `N` без модифікатора браузер не тримає; `Alt+N` (мертва клавіша на macOS) навмисно пропускається.          |
| `Esc`          | Закрити модальку / скасувати dragging                                        | [`useDialogFocusTrap.ts`](../../../apps/web/src/shared/hooks/useDialogFocusTrap.ts) (stack-aware: клавіші належать верхньому діалогу), per-component handlers — Registered                                                               | Конфлікту немає — `Esc` без modifier стандартна семантика.                                                           |
| `Tab`          | Перехід між focusable елементами (in-modal)                                  | [`useDialogFocusTrap.ts`](../../../apps/web/src/shared/hooks/useDialogFocusTrap.ts) (focus trap loop) — Registered                                                                                                                       | Browser default — стандартна tab-navigation.                                                                         |
| `Shift + Tab`  | Зворотній focus                                                              | [`useDialogFocusTrap.ts`](../../../apps/web/src/shared/hooks/useDialogFocusTrap.ts) — Registered                                                                                                                                         | Browser default — стандартна reverse tab-navigation.                                                                 |

Локальні `keydown`-власники поза цим реєстром (стрілки / Enter / Home / End у
результатах пошуку `useSearchEngine.ts`, `CommandPaletteUI`, `DropdownMenu`,
`Tooltip`, `PendingVoiceChip`, `PdfPreviewModal`, `NotificationBell`,
`useAppLock`, `useOutsideClick`) — компонентна семантика, у модалку `?` не
йдуть і конфліктів з браузером не мають.

## Navigation (`G + <letter>` chord)

Зареєстровано в `useHubKeyboardShortcuts.ts` (`G_CHORD_MAP`) і підключено через `onNavigate` у [`RootLayout.tsx`](../../../apps/web/src/core/app/RootLayout.tsx). 1-секундний timeout-window після `G` для другої клавіші.

| Chord | Target         | Реальний handler                                                                                                                     |
| ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `G H` | Перейти на Hub | [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts) — Registered (`goToHub()`)               |
| `G F` | Finyk          | [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts) — Registered (`openModule("finyk")`)     |
| `G Z` | Fizruk         | [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts) — Registered (`openModule("fizruk")`)    |
| `G R` | Routine        | [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts) — Registered (`openModule("routine")`)   |
| `G N` | Nutrition      | [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts) — Registered (`openModule("nutrition")`) |

`G + X` chord pattern не конфліктує з браузером — `G` без modifier = no-op у Chrome / Firefox / Safari.

## Module-level

Механізм `useRegisterShortcuts("module-id", [...])` існує, але жоден продуктовий модуль ним не користується.

| Module      | Зареєстровано                                                                                                                                                         | Що було б корисно                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `finyk`     | `N` — нова витрата (глобально, через `MODULE_PRIMARY_ACTION`)                                                                                                         | `/` — focus у search input.                                                       |
| `fizruk`    | `N` — аркуш «Почати тренування» (глобально)                                                                                                                           | `Space` — toggle play/pause workout-таймера.                                      |
| `routine`   | `N` — нова звичка (глобально)                                                                                                                                         | `T` — `today` jump; `1..9` — toggle habit by index.                               |
| `nutrition` | `N` — новий прийом їжі (глобально)                                                                                                                                    | `M` — open meals list.                                                            |
| `stories`   | `←` / `→` / `Esc` / `Space` (пауза) через [`useStoriesKeyboard`](../../../apps/web/src/core/stories/hooks/useStoriesKeyboard.ts), з guard-ом на інтерактивні елементи | Already wired. Conflict-clean (`Space` перехоплюється лише поза кнопками/полями). |

## Browser-conflict matrix (квік-довідка)

| Shortcut                | Chrome             | Firefox              | Safari               | Edge               | Висновок                                                                                       |
| ----------------------- | ------------------ | -------------------- | -------------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| `Cmd/Ctrl + K`          | Address bar focus  | Address bar focus    | URL field            | Address bar focus  | **Override з `preventDefault()`** — конвенція додатків (Slack, Notion, GitHub).                |
| `Cmd/Ctrl + /`          | Hide bookmarks bar | Quick-find (in-page) | View source (Safari) | Hide bookmarks bar | **Override з `preventDefault()`** — конвенція Slack / Notion.                                  |
| `Cmd/Ctrl + S`          | Save page          | Save page            | Save page            | Save page          | **Уникай** — використовуй явну кнопку. Інакше power-user-и натикатимуться на conflict.         |
| `Cmd/Ctrl + Z`          | Undo (text inputs) | Undo (text inputs)   | Undo (text inputs)   | Undo (text inputs) | У полях — browser default; поза ними — наш undo-тост, `preventDefault()` лише при спрацюванні. |
| `N`                     | No-op              | No-op                | No-op                | No-op              | Безпечне використання; `Alt+N` пропускаємо (мертва клавіша macOS).                             |
| `?`                     | No-op              | No-op                | No-op                | No-op              | Безпечне використання.                                                                         |
| `Esc`                   | Cancel page-load   | Cancel page-load     | Cancel page-load     | Cancel page-load   | Override при відкритому модальному (бо `preventDefault()` не зачіпає load-state).              |
| `Space` (stories)       | Scroll page        | Scroll page          | Scroll page          | Scroll page        | `preventDefault()` лише коли фокус не на інтерактивному елементі.                              |
| `G H` / `G F` / `G Z` … | No-op              | No-op                | No-op                | No-op              | Безпечне використання (chord pattern).                                                         |

## Mobile

Шорткати релевантні лише desktop / external keyboard на iPad. Окремого
гейту «ховати модалку без `hover: hover`» у коді **немає** — модалка просто
не має тригера без фізичної клавіатури (кнопки в UI немає, лише `?`).

## Як додавати новий шорткат

1. Зареєструй опис у `useRegisterShortcuts(moduleId, [...])` — і **окремо**
   додай рядок у `DEFAULT_SHORTCUTS` (`KeyboardShortcutsModalUI.tsx`), бо
   модалка показує саме цей список; не додавай запис без обробника.
2. Зашити handler в `keydown` listener (`window` / DOM-scope залежно
   від ширини застосовності). Перед тим перевір, чи клавішу вже не тримає
   інший файл із таблиці «Де що живе».
3. Перевір по матриці вище, чи не конфліктує з браузером — якщо так,
   `event.preventDefault()` + згадай у release-notes.
4. `isEditableTarget` check — щоб шорткат не активувався, коли
   фокус у `<input>` / `<textarea>` / `[contenteditable]`. Pattern
   є в [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts) (`isEditableTarget`).
5. Додай тест за паттерном
   [`useStoriesKeyboard.test.ts`](../../../apps/web/src/core/stories/__tests__/useStoriesKeyboard.test.ts).
