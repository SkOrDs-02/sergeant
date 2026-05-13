# Toast policy

> **Last validated:** 2026-05-13 by Devin (audit `2026-05-13-web-frontend-ergonomics-roast`).
> **Next review:** 2026-08-11.
> **Status:** Active.

Канонічна довідка для агентів і розробників: коли який toast, скільки
показувати, що покласти в `action`, які anti-pattern-и. Закриває
рекомендацію §3.4 з [`docs/audits/2026-05-03-web-deep-dive/01-frontend-ergonomics.md`](../audits/2026-05-03-web-deep-dive/01-frontend-ergonomics.md).
Машинно гайдиться правилом
[`sergeant-design/require-toast-error-action`](../../packages/eslint-plugin-sergeant-design/index.js).

API: [`apps/web/src/shared/hooks/useToast.tsx`](../../apps/web/src/shared/hooks/useToast.tsx).
Компонент: [`apps/web/src/shared/components/ui/Toast.tsx`](../../apps/web/src/shared/components/ui/Toast.tsx).

## Tone-table

| Tone      | Trigger                                                                                                       | Default duration | Action policy                                                                                                                      | Politeness            |
| --------- | ------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `success` | Підтвердження результату дії, ініційованої користувачем (Збережено, Відправлено, Імпортовано).                | 3500 ms          | Optional — `Скасувати` для destructive actions (паттерн `undoToast`). Без action для тривіальних saves.                            | `aria-live=polite`    |
| `info`    | Stateless нотифікація (Версія 2.4 доступна, Push-канал увімкнуто). Не блокує користувача, не вимагає реакції. | 3500 ms          | Optional — `Дізнатись` / `Налаштувати` коли є природний deep-link. Без action коли інформативно ок.                                | `aria-live=polite`    |
| `warning` | Дегрейд / soft-fail (Слабкий зв'язок, Sync відкладено, Локальні зміни не збережено в хмарі).                  | 5000 ms          | Recommended — посилання на причину (Settings → Sync) або soft-retry. Без action коли стан виправляється автоматично.               | `aria-live=polite`    |
| `error`   | Реальний fail-stop, який потребує реакції (Не вдалось завантажити, Невалідний формат, 429, мережа off-line).  | 5000 ms          | **Mandatory** — `{ label, onClick }` з recovery-шляхом (`Повторити`, `Налаштувати`, `Відкрити Sessions`). Enforced by ESLint rule. | `aria-live=assertive` |

`useToast` під капотом форсить `assertive` politeness ще й коли є
будь-який `action` (бо undo-toast треба прочитати раніше, ніж він
зникне) — див. [`Toast.tsx:88-92`](../../apps/web/src/shared/components/ui/Toast.tsx).

## Action shape

```ts
toast.error("Не вдалося синхронізувати дані. Перевір з'єднання.", undefined, {
  label: "Повторити",
  onClick: () => {
    void retrySync();
  },
});
```

- `label` — ≤ 14 символів, одна дія в інфінітиві (Повторити, Відкрити,
  Налаштувати). Не `OK`, не `Закрити` — це seant-no-op (closing the
  toast is what dismissing it already does).
- `onClick` — синхронна або fire-and-forget (`void asyncFn()`). НЕ
  блокуй UI спінером усередині toast — це responsibility caller-а.
- `onClick` НЕ повинен викликати `dismiss(id)` сам — toast автоматично
  закривається коли користувач натискає на action.

## Anti-patterns

| Anti-pattern                                                                                    | Чому погано                                                                                                    | Що замість                                                                                                               |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `toast.error("Не вдалося синхронізувати")` без `action`                                         | Користувач у тупику — не знає, чи буде нова спроба, треба перезавантажити сторінку чи ні.                      | Додай `{ label: "Повторити", onClick: retry }`. ESLint rule `require-toast-error-action` enforce-ить це.                 |
| `toast.error("Не вдалося", 0, …)` (нескінченне `duration`)                                      | Користувач не зможе закрити тост клавіатурою / автоматично — `aria-live=assertive` блокує screen-reader queue. | Default 5000 ms або явне число; user може hover/focus pause-ити.                                                         |
| `toast.success("Видалено")` без undo                                                            | Випадкове видалення → нема як відновити; doc стерто з cloud після 200 ms.                                      | `undoToast(...)` із 6-сек grace window. Див. [`undoToast.tsx`](../../apps/web/src/shared/lib/ui/undoToast.tsx).          |
| `toast.error(error.message)` де `error.message` — це stack-trace або сервер-internal            | Користувач бачить "TypeError: Cannot read property 'data' of undefined" — лякає, не допомагає.                 | Покажи human copy (`Не вдалося оновити аватар`) + `console.error(error)` для дев-консолі.                                |
| Чотири підряд `toast.error(...)` у `Promise.allSettled` loop-і                                  | Стек 4-х однакових тостів — screen-reader розриватиме фокус, користувач не зрозуміє нічого.                    | Агрегуй: `toast.error("3 з 4 операцій впали. Подивитись?", …, { label: "Відкрити", onClick: openLog })`.                 |
| `toast.warning("Слабкий зв'язок")` у `setInterval(5000)` поки offline                           | Spam — користувач бачить tower of toasts.                                                                      | Один persistent banner у network-layer (PWASection / network indicator). Toast — лише на перший трансишн online↔offline. |
| `toast.show(msg, "error", 5000, () => {...})` (4-й арг = function замість `{ label, onClick }`) | `useToast` мовчки drop-ає не-object `action`-параметр — toast рендериться без кнопки.                          | Завжди `{ label, onClick }`-форма.                                                                                       |

## Чому `assertive` обов'язково для `error`

WCAG 4.1.3 (Status Messages, Level AA) вимагає, що повідомлення про
помилку має пробити поточну screen-reader queue. `useToast` мапить:

- `type === "error"` → `aria-live=assertive` (interrupting)
- будь-який `action` → `aria-live=assertive` (interrupting)
- решта → `aria-live=polite`

`assertive` НЕ означає "блимай" — це лише сигнал реколайзингу для AT.
Анімація / контраст / `duration` живуть окремо.

## Layout

`<ToastContainer>` живе у `apps/web/src/core/App.tsx` як root-portal.

- На mobile: `bottom: safe-area-inset-bottom + 12px`. На iOS PWA — над
  Home Indicator (safe-area).
- На desktop: `bottom-right` стак, max 5 одночасно (старші — leaving).
- Touch-dismiss: горизонтальний swipe ≥ 64 px (або 32 px з велосіті ≥ 0.4 px/ms).
- Hover / focus / touch-drag → `pause()`; mouseleave / blur / touchend
  → `resume()`. Реалізовано в [`useToast.tsx:118-140`](../../apps/web/src/shared/hooks/useToast.tsx).
- Countdown bar анімація → `[animation-play-state:paused]` коли paused.

## Burndown

ESLint rule `sergeant-design/require-toast-error-action` (`warn`)
тегує всі НОВІ `toast.error(...)` без `action`. Існуючі call-site-и —
у [`apps/web/eslint.toast-error-action-allowlist.json`](../../apps/web/eslint.toast-error-action-allowlist.json):
видаляй пункт, коли refactor-иш callsite. Коли файл `[]` — promote
rule до `error` (one-line edit у `eslint.config.js`).
