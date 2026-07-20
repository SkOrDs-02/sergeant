# Keyboard shortcuts registry

> **Last validated:** 2026-05-13 by Devin (audit `2026-05-13-web-frontend-ergonomics-roast`).
> **Next review:** 2026-08-11.
> **Status:** Active.

Канонічний реєстр клавіатурних шорткатів `apps/web` + browser-conflict
аналіз для §3.11 з [`docs/90-work/audits/2026-05-03-web-deep-dive/01-frontend-ergonomics.md`](../../90-work/audits/archive/2026-05-03-web-deep-dive/01-frontend-ergonomics.md).

Шорткати реєструються через [`useRegisterShortcuts`](../../../apps/web/src/shared/components/ui/KeyboardShortcutsModal.tsx)
у `ShortcutRegistryContext` і автоматично з'являються в модальці
`?`. Module-level шорткати реєструються у мод-onMount, де `?`
відкриває об'єднаний реєстр (global + module).

## Global

| Key            | Action                                      | Handler / реєстрація                                                                                                                                                                                                                   | Browser conflict                                                                                                                   |
| -------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `?`            | Відкрити модальку шорткатів                 | [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts) — Registered                                                                                                                               | Жодного — `?` не зарезервовано браузером.                                                                                          |
| `Cmd/Ctrl + K` | Глобальний пошук (Hub Search)               | [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts) — Registered                                                                                                                               | Chrome / Firefox map-ять `Ctrl+K` на address-bar focus — ми `preventDefault()`-имо.                                                |
| `Cmd/Ctrl + /` | Відкрити AI-асистента                       | [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts) — Registered; `preventDefault()` скрізь                                                                                                    | Конфлікт у Firefox (Quick-find) — `preventDefault()` застосовано.                                                                  |
| `Cmd/Ctrl + S` | Context-aware save (R6 mitigation)          | [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts) — Registered; `preventDefault()` + `form.requestSubmit()` лише коли фокус у `<form>`. Без form-context — no-op, browser default збережено. | **Browser default = Save Page.** Override тільки у form-context — безпечно.                                                        |
| `Cmd/Ctrl + Z` | Скасувати дію                               | TBD — наразі браузер undo у `<input>`. Немає custom handler-а.                                                                                                                                                                         | **Browser default = Undo (in text-fields).** Для не-text contexts (chart, list, drag) — додай custom handler з `preventDefault()`. |
| `Esc`          | Закрити модальку / скасувати dragging       | [`useFocusTrap.ts`](../../../apps/web/src/shared/hooks/useFocusTrap.ts), per-component handlers — Registered                                                                                                                           | Конфлікту немає — `Esc` без modifier стандартна семантика.                                                                         |
| `Tab`          | Перехід між focusable елементами (in-modal) | [`useFocusTrap.ts`](../../../apps/web/src/shared/hooks/useFocusTrap.ts) (focus trap loop) — Registered                                                                                                                                 | Browser default — стандартна tab-navigation.                                                                                       |
| `Shift + Tab`  | Зворотній focus                             | [`useFocusTrap.ts`](../../../apps/web/src/shared/hooks/useFocusTrap.ts) — Registered                                                                                                                                                   | Browser default — стандартна reverse tab-navigation.                                                                               |

## Navigation (`G + <letter>` chord)

Зареєстровано в `useHubKeyboardShortcuts.ts` (`G_CHORD_MAP`) і підключено через `onNavigate` у `App.tsx`. 1-секундний timeout-window після `G` для другої клавіші.

| Chord | Target         | Реальний handler                                                                                                                     |
| ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `G H` | Перейти на Hub | [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts) — Registered (`goToHub()`)               |
| `G F` | Finyk          | [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts) — Registered (`openModule("finyk")`)     |
| `G Z` | Fizruk         | [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts) — Registered (`openModule("fizruk")`)    |
| `G R` | Routine        | [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts) — Registered (`openModule("routine")`)   |
| `G N` | Nutrition      | [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts) — Registered (`openModule("nutrition")`) |

`G + X` chord pattern не конфліктує з браузером — `G` без modifier = no-op у Chrome / Firefox / Safari.

## Module-level

Реєструються через `useRegisterShortcuts("module-id", [...])` у відповідних модулях.

| Module      | Зареєстровано                                                                                                  | Що було б корисно                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `finyk`     | Поки нічого                                                                                                    | `N` — нова витрата; `/` — focus у search input.                                      |
| `fizruk`    | Поки нічого                                                                                                    | `N` — нове тренування; `Space` — toggle play/pause workout-таймера.                  |
| `routine`   | Поки нічого                                                                                                    | `N` — нова звичка; `T` — `today` jump; `1..9` — toggle habit by index.               |
| `nutrition` | Поки нічого                                                                                                    | `N` — нова страва; `M` — open meals list.                                            |
| `stories`   | `←` / `→` / `Esc` через [`useStoriesKeyboard`](../../../apps/web/src/core/stories/hooks/useStoriesKeyboard.ts) | Already wired. Conflict-clean (arrows у фокусі сторінки stories — це seant-default). |

## Browser-conflict matrix (квік-довідка)

| Shortcut                | Chrome             | Firefox              | Safari               | Edge               | Висновок                                                                               |
| ----------------------- | ------------------ | -------------------- | -------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| `Cmd/Ctrl + K`          | Address bar focus  | Address bar focus    | URL field            | Address bar focus  | **Override з `preventDefault()`** — конвенція додатків (Slack, Notion, GitHub).        |
| `Cmd/Ctrl + /`          | Hide bookmarks bar | Quick-find (in-page) | View source (Safari) | Hide bookmarks bar | **Override з `preventDefault()`** — конвенція Slack / Notion.                          |
| `Cmd/Ctrl + S`          | Save page          | Save page            | Save page            | Save page          | **Уникай** — використовуй явну кнопку. Інакше power-user-и натикатимуться на conflict. |
| `Cmd/Ctrl + Z`          | Undo (text inputs) | Undo (text inputs)   | Undo (text inputs)   | Undo (text inputs) | OK для text-fields (browser default достатньо). Для non-text — потрібен handler.       |
| `?`                     | No-op              | No-op                | No-op                | No-op              | Безпечне використання.                                                                 |
| `Esc`                   | Cancel page-load   | Cancel page-load     | Cancel page-load     | Cancel page-load   | Override при відкритому модальному (бо `preventDefault()` не зачіпає load-state).      |
| `G H` / `G F` / `G Z` … | No-op              | No-op                | No-op                | No-op              | Безпечне використання (chord pattern).                                                 |

## Mobile

Шорткати релевантні лише desktop / external keyboard на iPad. На
touch-only mobile вони не показуються (модалка `?` залишається
прихована за відсутності `hover: hover` запиту).

## Як додавати новий шорткат

1. Зареєструй опис у `useRegisterShortcuts(moduleId, [...])` —
   модалка `?` автоматично підхопить.
2. Зашити handler в `keydown` listener (`window` / DOM-scope залежно
   від ширини застосовності).
3. Перевір по матриці вище, чи не конфліктує з браузером — якщо так,
   `event.preventDefault()` + згадай у release-notes.
4. `isEditableTarget` check — щоб шорткат не активувався, коли
   фокус у `<input>` / `<textarea>` / `[contenteditable]`. Pattern
   є в [`useHubKeyboardShortcuts.ts:8-17`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts).
5. Додай тест за паттерном
   [`useStoriesKeyboard.test.ts`](../../../apps/web/src/core/stories/__tests__/useStoriesKeyboard.test.ts).
