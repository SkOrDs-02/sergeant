# Toast policy

> **Last validated:** 2026-08-05 by @claude.
> **Next review:** 2026-08-12.
> **Status:** Active.

Канонічна довідка для агентів і розробників: коли який toast, скільки
показувати, що покласти в `action`, які anti-pattern-и. Закриває
рекомендацію §3.4 з [`docs/90-work/audits/2026-05-03-web-deep-dive/01-frontend-ergonomics.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/audits/archive/2026-05-03-web-deep-dive/01-frontend-ergonomics.md).
Політика тримається tokens + review — колишнє ESLint-правило
`sergeant-design/require-toast-error-action` retired
[ADR-0081](../../04-governance/adr/0081-repository-simplification.md).

API: [`apps/web/src/shared/hooks/useToast.tsx`](../../../apps/web/src/shared/hooks/useToast.tsx).
Компонент: [`apps/web/src/shared/components/ui/Toast.tsx`](../../../apps/web/src/shared/components/ui/Toast.tsx).

## Tone-table

| Tone      | Trigger                                                                                                       | Default duration | Action policy                                                                                                                          | Politeness            |
| --------- | ------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `success` | Підтвердження результату дії, ініційованої користувачем (Збережено, Відправлено, Імпортовано).                | 3500 ms          | Optional — `Скасувати` для destructive actions (паттерн `undoToast`). Без action для тривіальних saves.                                | `aria-live=polite`    |
| `info`    | Stateless нотифікація (Версія 2.4 доступна, Push-канал увімкнуто). Не блокує користувача, не вимагає реакції. | 3500 ms          | Optional — `Дізнатись` / `Налаштувати` коли є природний deep-link. Без action коли інформативно ок.                                    | `aria-live=polite`    |
| `warning` | Дегрейд / soft-fail (Слабкий зв'язок, Sync відкладено, Локальні зміни не збережено в хмарі).                  | 5000 ms          | Recommended — посилання на причину (Settings → Sync) або soft-retry. Без action коли стан виправляється автоматично.                   | `aria-live=polite`    |
| `error`   | Реальний fail-stop, який потребує реакції (Не вдалось завантажити, Невалідний формат, 429, мережа off-line).  | 5000 ms          | **Mandatory** — `{ label, onClick }` з recovery-шляхом (`Повторити`, `Налаштувати`, `Відкрити Sessions`). Конвенція — review-enforced. | `aria-live=assertive` |

`useToast` під капотом форсить `assertive` politeness ще й коли є
будь-який `action` (бо undo-toast треба прочитати раніше, ніж він
зникне) — див. [`Toast.tsx:88-92`](../../../apps/web/src/shared/components/ui/Toast.tsx).

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
| `toast.error("Не вдалося синхронізувати")` без `action`                                         | Користувач у тупику — не знає, чи буде нова спроба, треба перезавантажити сторінку чи ні.                      | Додай `{ label: "Повторити", onClick: retry }`. Дизайн-конвенція — review-enforced (ex-lint rule retired ADR-0081).      |
| `toast.error("Не вдалося", 0, …)` (нескінченне `duration`)                                      | Користувач не зможе закрити тост клавіатурою / автоматично — `aria-live=assertive` блокує screen-reader queue. | Default 5000 ms або явне число; user може hover/focus pause-ити.                                                         |
| `toast.success("Видалено")` без undo                                                            | Випадкове видалення → нема як відновити; doc стерто з cloud після 200 ms.                                      | `undoToast(...)` із 6-сек grace window. Див. [`undoToast.tsx`](../../../apps/web/src/shared/lib/ui/undoToast.tsx).       |
| `toast.error(error.message)` де `error.message` — це stack-trace або сервер-internal            | Користувач бачить "TypeError: Cannot read property 'data' of undefined" — лякає, не допомагає.                 | Покажи human copy (`Не вдалося оновити аватар`) + `console.error(error)` для дев-консолі.                                |
| Чотири підряд `toast.error(...)` у `Promise.allSettled` loop-і                                  | Ідентичні зіллються у `×4`, але різні тексти займуть чотири слоти з черги — користувач читатиме їх по черзі.   | Агрегуй сам: `toast.error("3 з 4 операцій впали. Подивитись?", …, { label: "Відкрити", onClick: openLog })`.             |
| `onClick: () => { …; toast.dismiss(id); }` в action-і                                           | `<ToastRow>` уже закриває аркуш у `finally` — другий `dismiss` перезаписує exit-таймер і лишає перший сиротою. | Просто зроби дію; закриття — відповідальність компонента.                                                                |
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

## Скільки одночасно на екрані

Одночасно видно **щонайбільше 3** аркуші (`MAX_VISIBLE_TOASTS` у
[`useToast.tsx`](../../../apps/web/src/shared/hooks/useToast.tsx)). Решта
чекає у черзі провайдера і піднімається, щойно звільниться слот — тост із
черги починає «горіти» рівно тоді, коли став видимим, а не поки чекав.
Глибина черги — 5 понад видимі; далі найстаріший **незапущений** тост
тихо викидається.

Раніше cap був 5 із мовчазним викиданням найстарішого прямо в `show()` —
серія швидких дій (три свайпи по транзакціях, чотири помилки з
`Promise.allSettled`) забудовувала пів екрана на 667-px в'юпорті.

**Коалесинг.** Однаковий текст + однаковий tone + **без `action`** не
займає новий слот: лічильник на наявному аркуші росте (`×2`, `×3`) і
відлік перезапускається. Тости **з `action` не зливаються** — кожен несе
власне замикання (undo саме цього запису, retry саме цього запиту), і
злиття тихо забрало б у користувача можливість скасувати першу дію.

## Layout

`<ToastContainer>` живе у `apps/web/src/core/app/Providers.tsx` як root-portal.

- Bottom-центрований стак, `w-[min(92vw,24rem)]`.
- Нижній відступ = `max(safe-area, --sgt-bottom-nav-inset, --sgt-workout-banner-inset) + 0.75rem`.
  **AI-DANGER:** обидві `--sgt-*` змінні ставить хук
  [`useBottomInsetVar`](../../../apps/web/src/shared/hooks/useBottomInsetVar.ts)
  на `<html>`. Локальна `--bottom-nav-height` (утиліта
  `bottom-nav-height-var`) сюди **не доходить**: вона живе на корені
  модуля, тобто всередині `children` у `Providers`, а трей — їхня сестра,
  і CSS-змінні успадковуються лише вниз. Саме тому тости раніше лягали
  поверх нижньої навігації. Не повертай `var(--bottom-nav-height)` у цей
  `calc()`.
- Порожній трей лишається змонтованим — live-region, у яку контент
  вставляється разом із самим регіоном, частина screen-reader-ів пропускає.
- Touch-dismiss: горизонтальний swipe ≥ 64 px (або 32 px з велосіті ≥ 0.4 px/ms).
- Hover / focus / touch-drag → `pause()`; mouseleave / blur / touchend
  → `resume()`. Реалізовано в [`useToast.tsx:118-140`](../../../apps/web/src/shared/hooks/useToast.tsx).
- Countdown bar анімація → `[animation-play-state:paused]` коли paused.

## Review policy

Для recoverable `toast.error(...)` додавай явну action під час product-review. AST-rule та allowlist retired за [ADR-0081](../../04-governance/adr/0081-repository-simplification.md): коректність дії залежить від сценарію й не має надійного синтаксичного сигналу.
