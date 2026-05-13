# Keyboard shortcuts registry

> **Last validated:** 2026-05-13 by Devin (audit `2026-05-13-web-frontend-ergonomics-roast`).
> **Next review:** 2026-08-11.
> **Status:** Active.

Канонічний реєстр клавіатурних шорткатів `apps/web` + browser-conflict
аналіз для §3.11 з [`docs/audits/2026-05-03-web-deep-dive/01-frontend-ergonomics.md`](../audits/2026-05-03-web-deep-dive/01-frontend-ergonomics.md).

Шорткати реєструються через [`useRegisterShortcuts`](../../apps/web/src/shared/components/ui/KeyboardShortcutsModal.tsx)
у `ShortcutRegistryContext` і автоматично з'являються в модальці
`?`. Module-level шорткати реєструються у мод-onMount, де `?`
відкриває об'єднаний реєстр (global + module).

## Global

| Key            | Action                                      | Handler / реєстрація                                                                               | Browser conflict                                                                    |
| -------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `?`            | Відкрити модальку шорткатів                 | [`useHubKeyboardShortcuts.ts:34-37`](../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts)     | Жодного — `?` не зарезервовано браузером.                                           |
| `Cmd/Ctrl + K` | Глобальний пошук (Hub Search)               | [`useHubKeyboardShortcuts.ts:27-32`](../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts)     | Chrome / Firefox map-ять `Ctrl+K` на address-bar focus — ми `preventDefault()`-имо. |
| `Esc`          | Закрити модальку / скасувати dragging       | [`useFocusTrap.ts:87-90`](../../apps/web/src/shared/hooks/useFocusTrap.ts), per-component handlers | Конфлікту немає — `Esc` без modifier стандартна семантика.                          |
| `Tab`          | Перехід між focusable елементами (in-modal) | [`useFocusTrap.ts`](../../apps/web/src/shared/hooks/useFocusTrap.ts) (focus trap loop)             | Browser default — стандартна tab-navigation.                                        |
| `Shift + Tab`  | Зворотній focus                             | [`useFocusTrap.ts`](../../apps/web/src/shared/hooks/useFocusTrap.ts)                               | Browser default — стандартна reverse tab-navigation.                                |

## Глобальні (з `KeyboardShortcutsModal` DEFAULT_SHORTCUTS, ще не wired-up)

Перераховані у модальці як rounded-out roadmap. **Не всі мають handler-ів зараз** — допилки треба робити перед public release.

| Key            | Заявлене у DEFAULT_SHORTCUTS | Реальний handler                                               | Browser conflict                                                                                                                   |
| -------------- | ---------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Cmd/Ctrl + /` | Відкрити AI-асистента        | TBD — не зареєстровано у `keydown` handler-ах поки що.         | Конфлікт у Firefox (Quick-find) — потрібен `preventDefault()`. Документуй у release notes.                                         |
| `Cmd/Ctrl + S` | Зберегти                     | TBD — наразі per-form. Browser save-page має такий же шорткат. | **Browser default = Save Page.** Не використовуй для form-save — confusing UX. Інлайн-save кнопка надійніша.                       |
| `Cmd/Ctrl + Z` | Скасувати дію                | TBD — наразі браузер undo у `<input>`.                         | **Browser default = Undo (in text-fields).** Для не-text contexts (chart, list, drag) — додай custom handler з `preventDefault()`. |

## Navigation (`G + <letter>` chord)

Заявлено в `KeyboardShortcutsModal.DEFAULT_SHORTCUTS:121-133`. **Handler-ів НЕМАЄ** — це roadmap-item для item #17 (модульна навігація).

| Chord | Target         | Реальний handler               |
| ----- | -------------- | ------------------------------ |
| `G H` | Перейти на Hub | TBD (router push `/`)          |
| `G F` | Finyk          | TBD (router push `/finyk`)     |
| `G T` | Fizruk         | TBD (router push `/fizruk`)    |
| `G R` | Routine        | TBD (router push `/routine`)   |
| `G N` | Nutrition      | TBD (router push `/nutrition`) |

`G + X` chord pattern не конфліктує з браузером — `G` без modifier =
no-op у Chrome / Firefox / Safari. Реалізація вимагатиме 1-секундного
window після `G` для другої кнопки.

## Module-level

Реєструються через `useRegisterShortcuts("module-id", [...])` у відповідних модулях.

| Module      | Зареєстровано                                                                                               | Що було б корисно                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `finyk`     | Поки нічого                                                                                                 | `N` — нова витрата; `/` — focus у search input.                                      |
| `fizruk`    | Поки нічого                                                                                                 | `N` — нове тренування; `Space` — toggle play/pause workout-таймера.                  |
| `routine`   | Поки нічого                                                                                                 | `N` — нова звичка; `T` — `today` jump; `1..9` — toggle habit by index.               |
| `nutrition` | Поки нічого                                                                                                 | `N` — нова страва; `M` — open meals list.                                            |
| `stories`   | `←` / `→` / `Esc` через [`useStoriesKeyboard`](../../apps/web/src/core/stories/hooks/useStoriesKeyboard.ts) | Already wired. Conflict-clean (arrows у фокусі сторінки stories — це seant-default). |

## Browser-conflict matrix (квік-довідка)

| Shortcut        | Chrome             | Firefox              | Safari               | Edge               | Висновок                                                                               |
| --------------- | ------------------ | -------------------- | -------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| `Cmd/Ctrl + K`  | Address bar focus  | Address bar focus    | URL field            | Address bar focus  | **Override з `preventDefault()`** — конвенція додатків (Slack, Notion, GitHub).        |
| `Cmd/Ctrl + /`  | Hide bookmarks bar | Quick-find (in-page) | View source (Safari) | Hide bookmarks bar | **Override з `preventDefault()`** — конвенція Slack / Notion.                          |
| `Cmd/Ctrl + S`  | Save page          | Save page            | Save page            | Save page          | **Уникай** — використовуй явну кнопку. Інакше power-user-и натикатимуться на conflict. |
| `Cmd/Ctrl + Z`  | Undo (text inputs) | Undo (text inputs)   | Undo (text inputs)   | Undo (text inputs) | OK для text-fields (browser default достатньо). Для non-text — потрібен handler.       |
| `?`             | No-op              | No-op                | No-op                | No-op              | Безпечне використання.                                                                 |
| `Esc`           | Cancel page-load   | Cancel page-load     | Cancel page-load     | Cancel page-load   | Override при відкритому модальному (бо `preventDefault()` не зачіпає load-state).      |
| `G H` / `G F` … | No-op              | No-op                | No-op                | No-op              | Безпечне використання (chord pattern).                                                 |

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
   є в [`useHubKeyboardShortcuts.ts:8-17`](../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts).
5. Додай тест за паттерном
   [`useStoriesKeyboard.test.ts`](../../apps/web/src/core/stories/__tests__/useStoriesKeyboard.test.ts).
