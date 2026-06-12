# Design System — Motion, Animation та Offline/Error стани

> **Last validated:** 2026-06-12 by @claude. **Next review:** 2026-09-10.
> **Status:** Active (v2 redesign foundation merged 2026-05)

Цей документ охоплює motion tokens, choreography rules, reduced-motion стратегію та патерни для offline/empty/error станів.

Повний index → [`../design-system.md`](../design-system.md).

---

## 14. Motion & Animation (2026-05-13)

> Канонічна специфікація — [Hard Rule #17 (Animation
> budget)](../../../04-governance/governance/rules/17-animation-budget.md). Цей розділ описує
> токени та choreography, на які лінт-плагін + ESLint посилаються; код
> живе в `apps/web/src/styles/animations.css` +
> `packages/design-tokens/tailwind-preset.js`.

### 14.1 Motion tokens (CSS custom properties)

Single source of truth — `apps/web/src/styles/theme.css → :root`. Tailwind
пропускає їх через preset як `duration-*` і `ease-*`. **Рваних значень у
`className` не існує** — `duration-[230ms]` ловить ESLint (Hard Rule #17).

#### Duration scale

| Token                       | Value  | Tailwind           | Tier            | Призначення                             |
| --------------------------- | ------ | ------------------ | --------------- | --------------------------------------- |
| `--motion-duration-instant` | 75 ms  | `duration-instant` | RESPONSE        | Micro-feedback (tap, hover, focus ring) |
| `--motion-duration-fast`    | 150 ms | `duration-fast`    | RESPONSE / exit | Exit / dismissal, ghost reactions       |
| `--motion-duration-base`    | 220 ms | `duration-base`    | RESPONSE        | Default enter (більшість one-shot)      |
| `--motion-duration-slow`    | 320 ms | `duration-slow`    | RESPONSE        | Sheet / list reveal, wizard step swap   |
| `--motion-duration-slower`  | 480 ms | `duration-slower`  | CELEBRATE       | Larger pops (check-bounce, shake, bars) |
| `--motion-duration-slowest` | 680 ms | `duration-slowest` | CELEBRATE       | Bursts, milestone fanfare               |

> AMBIENT loops жодного з шести не використовують — їх тривалість
> інтенційно довша. Канонічні AMBIENT-тривалості:
> `--motion-duration-loop-spin` (800 ms), `--motion-duration-loop`
> (1500 ms, shimmer), `--motion-duration-loop-glow` (2000 ms),
> `--motion-duration-loop-float` (8000 ms),
> `--motion-duration-confetti-fall` (2500 ms — CELEBRATE).

#### Easing scale

| Token                      | Cubic-bezier        | Tailwind          | Коли вживати                                          |
| -------------------------- | ------------------- | ----------------- | ----------------------------------------------------- |
| `--motion-ease-standard`   | `.2, 0, 0, 1`       | `ease-standard`   | Sustained transitions (transforms, shared backdrops). |
| `--motion-ease-emphasized` | `.3, 0, 0, 1`       | `ease-emphasized` | Sustained transitions з акцентом (focus moments).     |
| `--motion-ease-accelerate` | `.3, 0, 1, 1`       | `ease-accelerate` | Exits / dismissals (елемент тікає з екрана).          |
| `--motion-ease-decelerate` | `0, 0, .2, 1`       | `ease-decelerate` | Enters / reveals (елемент влітає в екран).            |
| `--motion-ease-overshoot`  | `.34, 1.56, .64, 1` | `ease-overshoot`  | CELEBRATE пружинні pop-и (check-bounce, fab-item).    |

Legacy aliases (`ease-smooth`, `ease-bounce`, `ease-spring`) залишаються
як synonyms, але не використовуй для нового коду.

### 14.2 Choreography rules

#### Animation budget (Hard Rule #17)

- **3 tiers** з різною семантикою — див. таблицю нижче.
- **Max 1 AMBIENT + 1 RESPONSE simultaneously** на екрані. Stagger-група
  рахується як **одна** RESPONSE незалежно від кількості дітей.
- **CELEBRATE — лише milestone-події** (7/30/100/365 day streaks, weekly
  goal hit, first entry). NOT every checkbox.

| Tier      | Lifecycle                | Duration range              | Easing                             | Reduced-motion            |
| --------- | ------------------------ | --------------------------- | ---------------------------------- | ------------------------- |
| AMBIENT   | Infinite loop            | 800 ms – 8 s                | linear / standard                  | Pause (зберігається стан) |
| RESPONSE  | One-shot per user action | 75 – 320 ms                 | decelerate / accelerate / standard | Opacity fade ≤ 100 ms     |
| CELEBRATE | One-shot, milestone      | 480 – 680 ms (+ 2.5 s loop) | overshoot / decelerate             | Opacity fade ≤ 100 ms     |

#### Stagger

- Канонічна утиліта — `.stagger-children` (нова, token-driven). Старий
  `.stagger-enter` — legacy alias з тим же розкладом, його не вживай у
  новому коді.
- **Cadence:** `animation-delay: index × 30 ms`, починаючи з 6-ї дитини
  застряє на `150 ms` total cap.
- **Бюджет:** group counts as 1 RESPONSE; не пушай ще одну RESPONSE
  поверх неї одночасно.

```html
<ul class="stagger-children">
  <!-- 6+ дітей: 0 ms, 30 ms, 60 ms, 90 ms, 120 ms, 150 ms (cap) -->
</ul>
```

#### Enter / exit helpers (sheets, modals, menus)

Token-driven choreography для overlay-примітивів. Кожен має `-enter` і
`-exit` пару — enter йде `ease-decelerate`, exit `ease-accelerate`, бо
елемент тікає.

| Helper            | Enter                                        | Exit                                            |
| ----------------- | -------------------------------------------- | ----------------------------------------------- |
| `.motion-sheet-*` | `slide-in-up` × `duration-slow` × decelerate | `slide-out-down` × `duration-base` × accelerate |
| `.motion-modal-*` | `scale-in` × `duration-base` × decelerate    | `scale-out` × `duration-fast` × accelerate      |
| `.motion-menu-*`  | `fade-in` × `duration-fast` × decelerate     | `fade-out` × `duration-instant` × accelerate    |

```tsx
{
  open && <div className="motion-sheet-enter">…</div>;
}
{
  closing && <div className="motion-sheet-exit">…</div>;
}
```

### 14.3 `prefers-reduced-motion` strategy (WCAG 2.3.3)

Стратегія живе в самому низу `apps/web/src/styles/animations.css` і
вмикається двома шляхами:

1. **OS-level** — `@media (prefers-reduced-motion: reduce)` (system
   setting).
2. **Showcase / тести** — клас-предок `.simulate-reduced-motion`
   (тогл-кнопка в `DesignShowcase → Motion`).

Поведінка по tiers:

- **AMBIENT** (shimmer, streak-glow, pull-rotate, float-slow,
  pulse-soft, spin, wiggle, fade-in-slow) — `animation-play-state:
paused`. Елемент залишається composed, але рух зупиняється.
- **RESPONSE + CELEBRATE** — keyframe-set свопиться на
  `rm-opacity-fade`, тривалість фіксується на 100 ms, easing —
  `decelerate`. State change залишається помітним, vestibular load
  зникає.

### 14.4 Legacy animation-class inventory

Покриває `apps/web/src/styles/animations.css` (всі класи pinned до
motion-tokens, без magic numbers).

| Class                      | Tier      | Використання               |
| -------------------------- | --------- | -------------------------- |
| `animate-shake`            | RESPONSE  | Form validation errors     |
| `animate-confetti-fall`    | CELEBRATE | CelebrationModal particles |
| `animate-streak-milestone` | CELEBRATE | Achievement / streak cards |
| `animate-scale-out`        | RESPONSE  | Modal exit                 |
| `animate-stagger-in`       | RESPONSE  | List item stagger entrance |
| `animate-shimmer`          | AMBIENT   | Skeleton placeholder       |
| `animate-streak-glow`      | AMBIENT   | StreakFlame ≥ 7-day glow   |
| `animate-pull-rotate`      | AMBIENT   | Pull-to-refresh spinner    |
| `animate-float-slow`       | AMBIENT   | Welcome page background    |
| `animate-bar-grow`         | CELEBRATE | Chart bar entrance         |

---

## 15. Offline / Empty / Error

Користувачам потрібен один консистентний канал для кожного стану — інакше
вони отримують суперечливі сигнали («банер каже офлайн, а тост каже
ретрай», «екран порожній, але форма вже летить»). Канон зведено нижче.

### Empty

`EmptyState` з §5 — **єдиний** примітив для «немає даних» (порожній
дашборд, тренування без сетів, пуста історія). Не пиши власні
"плейсхолдер-карточки" — `compact` режим закриває in-card випадки. Action
property — це CTA-стартер потоку (наприклад, «Додати першу витрату»).

```tsx
<EmptyState
  icon="receipt"
  title="Поки що немає витрат"
  description="Додай першу — і ми покажемо твій бюджет на цей місяць."
  action={{ label: "Додати витрату", onClick: openAddTx }}
/>
```

### Offline

**Один сигнал зверху, не дві смуги.** `OfflineBanner` (`apps/web/src/core/app/OfflineBanner.tsx`)
— це канонічна стрічка під `safe-area-pt`, висота константна, вмикається
по `useOnlineStatus()`. Вона ж тягне `useSyncStatus()` і показує, скільки
дій стоїть у черзі, тож юзер одразу бачить, що локальна правка не
загубилася.

Правила:

1. **Не фарбуй банер у `danger`** — `bg-warning-strong` достатньо. Червоний у
   дорослого продукту читається як «дані втрачені», а тут вони просто
   стоять у черзі.
2. **`role="status" + aria-live="polite"`** — оголошуємо появу/зникнення,
   але не викрадаємо фокус.
3. **Не дублюй банер у toast.** Поки `navigator.onLine === false`, хук
   `useSyncErrorToast` мовчить (див. наступний підрозділ).
4. **Не ховай за анімацією входу `> 200 ms`** — користувач має побачити
   стан до того, як кликне по сесії, бо інакше тапи можуть пропадати в
   ще-не-замонтований UI.

### Error / Retry

CloudSync помилки — `useSyncErrorToast(syncErrorDetail, toast, pushAll)` у
модулі `apps/web/src/core/cloudSync/index.ts` поряд із cloud-sync-хуком. Хук працює як
маленький стейт-машина:

| `syncErrorDetail`                      | Поведінка                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `null` (idle / success / dirty)        | no-op, скидає внутрішню де-дуп пам'ять                                        |
| `{ retryable: true, type: "network" }` | error-toast, copy "перевір з'єднання", CTA «Спробувати ще» викликає `pushAll` |
| `{ retryable: true, type: "server" }`  | error-toast, copy "сервер тимчасово", CTA «Спробувати ще»                     |
| `{ retryable: false }` (4xx / parse)   | error-toast без CTA, copy «передивись введення»                               |
| `navigator.onLine === false`           | suppress — `OfflineBanner` уже сигналить                                      |

Тривалість тоста — `SYNC_ERROR_TOAST_DURATION_MS = 8000` (5 c дефолту мало
для «прийняти рішення про ретрай»). Якщо помилка змінює повідомлення, хук
сам диспозитить попередній тост, щоб черга не пухла.

Правила:

1. **Один error-toast на помилку**, не один-на-рендер. `useSyncErrorToast`
   де-дуплікує по `syncErrorDetail.message`.
2. **Retry CTA — лише коли `detail.retryable === true`.** 4xx/parse/aborted
   — не ретраїмо: помилка ніколи не зникне сама і ми зациклимо нудьгу.
3. **Copy — українською**, без «помилка #500». Користувач має знати, що
   робити, а не що зламалося.
4. **Не ставимо blocking modal** для sync-помилок — це фонове, не
   user-initiated.

### Інші toast-патерни

- **`showUndoToast`** (`@shared/lib/undoToast`) — деструктивні дії
  (видалення звички / транзакції) АБО **mutator-tool-call у HubChat**: 5 c,
  кнопка «Повернути». Не плутати з retry-toast: `undo` повертає минулий
  стан, `retry` повторює невдалу дію.

#### HubChat tool-call undo

Mutator-handler-и в `apps/web/src/core/lib/chatActions/` повертають
`{ result: string; undo: () => void }` замість простого `string`. Контракт
у `types.ts → ChatActionResult`. `HubChat.tsx` після `executeActions` ітерує
по результатам і для кожного, який має `undo`, кидає
`showUndoToast(toast, { msg: result, onUndo: undo })`. Read-only handler-и
(`find_transaction`, `weekly_summary`, …) залишаються `string` — нема що
реверсити.

Правила для нових mutator-handler-ів:

1. **`undo` має бути ідемпотентним.** Користувач не повторить дію — але
   паралельні UI-зміни (видалення з іншого екрану) можуть зробити стан
   таким, що скасовувати нема чого. У такому разі — `return` без throw.
2. **Тримай у замиканні `id` створеної сутності, а не повний snapshot
   стану.** Snapshot переписує паралельні правки; `id`-філтр прибирає
   тільки свою мутацію.
3. **Якщо мутація — no-op** (напр., `mark_habit_done` для дати, де галочка
   вже стоїть) — повертай простий `string`, не `{ undo }`. Toast «Повернути
   на нічого» збиває з пантелику.
4. **Зміни тестів:** хелпер `call()` у `*.test.ts` приймає обидві форми
   (`typeof out === "string" ? out : out.result`). Додай окремий
   `describe("<tool> · undo")`-блок з тестами на видалення, ідемпотентність
   та no-op гілку.

- **`tryShowCrossModulePrompt`** (`@shared/lib/crossModulePrompt`) — нудж із
  модуля в модуль («витрата в ресторані → запиши прийом їжі?»). Має
  fatigue-suppression на дисмиси.
