# Cross-module prompts — pattern, fatigue, anti-nag

> **Last validated:** 2026-04-29 by @devin-ai. **Next review:** 2026-07-29.
> **Status:** Active

> Sergeant — це 4 модулі (Finyk · Fizruk · Routine · Nutrition), що
> часто зустрічаються в одному користувацькому дні. Cross-module
> prompts перетворюють Sergeant з «4 окремих app-и» на «один інтегрований
> асистент», пропонуючи next-step у _іншому_ модулі — без переривання
> поточного flow.

## TL;DR

```ts
import { tryShowCrossModulePrompt } from "@shared/lib/crossModulePrompt";
import { openHubModuleWithAction } from "@shared/lib/hubNav";

tryShowCrossModulePrompt(toast, {
  id: "finyk-restaurant-to-meal",
  msg: "Додати прийом їжі з ресторану?",
  acceptLabel: "Додати →",
  onAccept: () => openHubModuleWithAction("nutrition", "add_meal"),
});
```

Toast (info, 6 s) з'являється _після_ успіху основної дії. Auto-dismiss

- trim history. Прокидати ≥3 рази за 14 днів — auto-suppress; tap accept
  → snooze на 12 годин.

## Чому окрема система, не просто `toast.info`

`toast.info("...")` ідеально підходить для одноразової інфи. Але
крос-модульний nudge має 3 додаткових вимоги:

1. **Anti-nag.** Якщо користувач 3 рази вже сказав «ні» на «додай прийом
   їжі», 4-й раз показувати — це мінус довіра до продукту.
2. **Snooze on accept.** Якщо щойно прийняв, відкрив Nutrition,
   повернувся до Finyk і додав ще одну витрату — не повторювати той же
   prompt. Минула дія вже виконана.
3. **Stable id.** Той самий prompt не змінює свого «лічильника втоми»
   через рандомну суфіксацію. ID — типізований союз (`CrossModulePromptId`).

## Anti-nag механіка

```
              ┌─ User dismisses (auto-timeout / X)
              ▼
          dismissedAt[] += [now]
              │
              ▼
   if dismissedAt.filter(t > now-14d).length >= 3:
       → suppress for 14 days from oldest qualifying dismiss
              │
              │ ─── User accepts ───
              ▼
       lastAcceptedAt = now
       dismissedAt = []          ← reset, fair start
       suppress for 12 hours
```

- **MAX_DISMISSALS = 3** — поріг втоми. Меньше — навʼязливо; більше —
  pattern не самовидаляється.
- **FATIGUE_WINDOW_MS = 14 days** — rolling. Раз на місяць забутий
  prompt — fine, він повертається.
- **ACCEPT_SNOOZE_MS = 12 hours** — приблизно один день. Захищає від
  «додав витрату → відкрив meal → повернувся → додав ще витрату» loop.
- **Acceptance resets dismissal counter** — користувач дає сигнал «це
  цінно мені», лічильник «cтомленості» обнуляється.

## Шаблон Finyk → Nutrition (реалізовано)

**Trigger:** save manual expense у Finyk з категорією `restaurant`
(MCC 5812/5813/5814) або `food` (MCC 5411/5412/…).

**Prompt:** info-toast «Додати прийом їжі з ресторану?» + CTA
«Додати →».

**Action:** `openHubModuleWithAction("nutrition", "add_meal")` —
переключає Hub в Nutrition + ініціює add-meal-action (PWA-shortcut
семантика).

**Не trigger:** редагування існуючої витрати (тільки нові). Якщо
користувач передумав і виправив категорію — це не окрема нова подія,
prompt би створив шум.

## Шаблон Fizruk finish → Nutrition (вдосконалено)

`WorkoutFinishSheets` уже мав inline-link «Додати білок після тренування
→». Цей PR додає `isCrossModulePromptSuppressed("fizruk-finish-to-meal")`
guard:

- Tap accept → 12 h snooze (другий workout того ж вечора не показує
  prompt вдруге).
- Acceptance recorded; dismiss-counter не торкається (inline-prompt не
  має auto-timeout, тому користувач явно ігнорує його кожен раз ≠ tap-X).

Якщо в майбутньому додамо явний "Не зараз" CTA, можна викликати
`recordCrossModulePromptDismissed()` і отримати full anti-nag.

## API

```ts
type CrossModulePromptId =
  | "finyk-restaurant-to-meal"
  | "finyk-food-to-meal"
  | "fizruk-finish-to-meal";

// Toast-style — full anti-nag.
tryShowCrossModulePrompt(toast, {
  id: CrossModulePromptId,
  msg: string,
  acceptLabel: string,
  onAccept: () => void,
  duration?: number,
}): boolean;  // true if shown, false if suppressed

// Inline-style — manual control.
isCrossModulePromptSuppressed(id, now?): boolean;
recordCrossModulePromptAccepted(id, now?): void;
recordCrossModulePromptDismissed(id, now?): void;
```

> `tryShowCrossModulePrompt` — для toast-style, де користувач реально
> бачить prompt і має чітке місце "tap accept / let it auto-close".
> Inline-style API — для UI, що вже існує як persistent element
> (WorkoutFinishSheets), де ми просто додаємо anti-nag поверх.

## Decision table — коли додавати crossmodule prompt

| Ситуація                                     | Prompt? | Чому                                               |
| -------------------------------------------- | ------- | -------------------------------------------------- |
| Витрата у ресторані (Finyk save)             | **Так** | High signal — почали їжу = ймовірний прийом        |
| Витрата на продукти (Finyk save)             | **Так** | Те саме, slightly weaker signal                    |
| Завершення тренування (Fizruk finish)        | **Так** | Window of intent: post-workout 30 min              |
| Витрата на бензин (Finyk save, transport)    | Ні      | До чого це? Не trigger-ить інший модуль            |
| Виконав звичку «Випив воду» (Routine toggle) | Ні      | Не cross-module — це закінчена дія в одному модулі |
| Знизив вагу (Fizruk Body)                    | Ні      | Не trigger — нема next-action в іншому модулі      |
| Створив бюджет (Finyk)                       | Ні      | Не consumer-action — це налаштування, не моментум  |

**Правило:** prompt показується тоді, коли (а) основна дія ЩОЙНО
завершилась, (б) у іншому модулі є логічний next-step, (в) timing
window — короткий (хвилини, не години).

## Anti-patterns

```ts
// ❌ BAD — без anti-nag, prompt буде дратувати
toast.info("Додати прийом їжі?", 6000, {
  label: "Додати",
  onClick: () => openHubModule("nutrition"),
});

// ❌ BAD — динамічний id ламає лічильник втоми
tryShowCrossModulePrompt(toast, {
  id: `finyk-${expense.id}-to-meal`, // generates new id each time
  ...
});

// ❌ BAD — prompt замість самої дії
// "Додати прийом їжі? [Так/Ні]" — це modal-blocker, не nudge
<ConfirmDialog ... />

// ❌ BAD — prompt при редагуванні (повтори дратують)
onSave: (expense) => {
  if (expense.id) editExpense(expense);  // edit
  else addExpense(expense);              // create
  // prompt as user expects it only on creation moments
  tryShowCrossModulePrompt(...);
}

// ✅ GOOD
onSave: (expense) => {
  if (expense.id) {
    editExpense(expense);
    return;  // no prompt on edit
  }
  addExpense(expense);
  if (expense.category === "restaurant") {
    tryShowCrossModulePrompt(toast, {
      id: "finyk-restaurant-to-meal",
      ...
    });
  }
}
```

## Copy guidelines

- **Question form** з `?`: «Додати прийом їжі?» — користувач відчуває,
  що це opt-in.
- **Avoid imperative** («Додай!» → дратує).
- **CTA з → стрілкою**: «Додати →» — натякає на навігацію в інший
  екран.
- **Не описуй джерело**, описуй _next action_: «Додати прийом їжі»
  > > «Ви були у ресторані, додайте прийом їжі» (другий — patronizing).

## Testing

```ts
import {
  resetCrossModulePromptForTesting,
  isCrossModulePromptSuppressed,
  recordCrossModulePromptDismissed,
  MAX_DISMISSALS,
} from "@shared/lib/crossModulePrompt";

beforeEach(() => {
  resetCrossModulePromptForTesting("finyk-restaurant-to-meal");
});

it("suppresses after MAX_DISMISSALS in window", () => {
  for (let i = 0; i < MAX_DISMISSALS; i++) {
    recordCrossModulePromptDismissed("finyk-restaurant-to-meal");
  }
  expect(isCrossModulePromptSuppressed("finyk-restaurant-to-meal")).toBe(true);
});
```

`crossModulePrompt.test.ts` покриває 9 кейсів — fatigue, snooze,
acceptance reset, suppression, CTA-tap → onAccept, auto-dismiss → counter.

## Related docs

- [`apps/web/src/shared/lib/crossModulePrompt.ts`](../../apps/web/src/shared/lib/crossModulePrompt.ts) — implementation.
- [`apps/web/src/shared/lib/crossModulePrompt.test.ts`](../../apps/web/src/shared/lib/crossModulePrompt.test.ts) — contract tests.
- [`apps/web/src/shared/lib/hubNav.ts`](../../apps/web/src/shared/lib/hubNav.ts) — `openHubModule` / `openHubModuleWithAction` (cross-module navigation primitive).
- [`docs/design/UNDO-PATTERN.md`](./UNDO-PATTERN.md) — sister doc для destructive actions.
- `AGENTS.md` § Soft rules — "Cross-module nudges".
