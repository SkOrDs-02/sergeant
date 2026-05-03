# Undo-патерн — soft-delete + 5-секундний undo-toast

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-27.
> **Status:** Active

> Уніфікований у Sergeant патерн для destructive-дій. Використовуйте `showUndoToast` замість `window.confirm()`, замість кастомного «Are you sure?»-діалогу і замість silent-delete. Confirmation-діалоги зарезервовані для **необоротних** flow.

## TL;DR

```tsx
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/undoToast";

const toast = useToast();

const handleDelete = (id: string) => {
  const snapshot = items.find((x) => x.id === id);
  if (!snapshot) return;

  setItems((prev) => prev.filter((x) => x.id !== id));

  showUndoToast(toast, {
    msg: `Видалено «${snapshot.name}»`,
    onUndo: () => setItems((prev) => [...prev, snapshot]),
  });
};
```

Усе. Пʼять секунд, одна undo-кнопка, haptic-feedback на появі та на undo, оптимістичне видалення в UI, без модалки, що перериває flow.

## Чому саме цей патерн

До уніфікації в нас було три конкуруючі патерни destructive-дії:

1. **Hard delete + `window.confirm()`** — переривання flow, без recovery, якщо юзер мис-кліком натиснув «OK».
2. **Кастомна модалка `<ConfirmDialog>`** — те саме переривання плюс «inconsistency-tax» — модальну логіку доводиться писати на кожен delete-сайт.
3. **Silent hard delete** — один тап і дані зникають назавжди. Найгірший варіант; особливо боляче для fat-finger-тапів на мобілці.

Уніфікована undo-політика замінює всі три одним правилом: **видалення soft і оборотні протягом 5 секунд; confirmation-и потрібні лише там, де дію справді не можна скасувати.**

| Дія юзера                        | Старі патерни                                         | Уніфікований патерн                   |
| -------------------------------- | ----------------------------------------------------- | ------------------------------------- |
| Видалити транзакцію              | `window.confirm("Видалити?")`                         | Optimistic remove + 5 s undo-toast    |
| Видалити звичку                  | `<ConfirmDialog>` «Видалити?»                         | Optimistic remove + 5 s undo-toast    |
| Видалити тег                     | _silent delete_                                       | Optimistic remove + 5 s undo-toast    |
| Скинути тренування               | confirm + delete                                      | Optimistic remove + 5 s undo-toast    |
| Trim історії журналу             | `<ConfirmDialog>` (річні дані, hard)                  | **Лишити ConfirmDialog** — необоротно |
| Відʼєднати exercise від каталогу | `<ConfirmDialog>` (з `showUndoToast` після confirm-у) | Гібрид — confirm + undo               |

## Коли НЕ використовувати undo (лишити ConfirmDialog)

Кілька винятків у кодбазі та чому:

- **`LogCard` «Видалити стару історію»** — обрізає все старше за 365 днів; потенційно сотні видалень; відновлення потребуватиме snapshot-у мегабайтів meal-даних. Confirm + hard delete.
- **`HubChat` «Очистити всі чати»** — bulk-операція по всіх сесіях; необоротна за дизайном.
- **`Workouts` «Видалити вправу з каталогу»** — відʼєднує exercise від усіх історичних тренувань. Записи виживають, але втрачають catalog-метадані. Confirm робить наслідки явними; ми _додатково_ даємо 5 s undo на самій вправі, але історичний detach необоротний.

Якщо ви тягнетесь до `<ConfirmDialog>` для delete-дії — спитайте: «чи можна просто snapshot-нути і відновити?» Якщо так — `showUndoToast`.

## API

```ts
showUndoToast(toast, {
  msg: ReactNode,                  // "Видалено звичку «Вода»"
  duration?: number,               // default 5000 (ms)
  undoLabel?: string,              // default "Повернути"
  onUndo: () => void,              // restore the snapshot
  onUndoErrorMsg?: ReactNode,      // shown if onUndo throws
});
```

Дефолти живуть у `@sergeant/shared` (`UNDO_TOAST_DEFAULT_*`), щоб web і mobile тримати в синхроні.

## Стратегії snapshot-у

Два патерни вживаються в кодбазі. Обирайте за формою стораджа.

### A. Snapshot одного item-а (RQ / array-state)

Найкраще, коли список плаский і кожен item має власний ID:

```tsx
const snapshot = items.find((x) => x.id === id);
setItems((prev) => prev.filter((x) => x.id !== id));
showUndoToast(toast, {
  msg: `Видалено «${snapshot.name}»`,
  onUndo: () => setItems((prev) => [...prev, snapshot]),
});
```

Використовується у: `Transactions.tsx`, `AssetsTable.tsx`, `MemoryBankSection.tsx`.

### B. Snapshot цілого state (reducer-и / каскадні видалення)

Найкраще, коли видалення має side-effect-и (osi-rotean-я звʼязків, каскад через джойни, перевпорядкування масивів). Snapshot-ніть **увесь state** і відновіть його одним setter-ом:

```tsx
const snapshot = routine; // freeze the full RoutineState
setRoutine((s) => deleteTag(s, tagId));
showUndoToast(toast, {
  msg: `Видалено тег «${tag.name}»`,
  onUndo: () => setRoutine(snapshot),
});
```

Використовується у: `TagsSection.tsx`, `CategoriesSection.tsx`, `HabitsSection.tsx`.

> Snapshot цілого state **безпечний** для local-first сторів — 5-секундне вікно коротке, конкурентні правки з іншого таба надзвичайно рідкісні і у найгіршому випадку перезапишуть snapshot-path, не втративши даних назавжди. Для server-backed-списків бажано patтерн A — щоб конкурентні серверні апдейти не затирались на undo.

## Анти-патерни

```tsx
// ❌ BAD — silent delete; нема як відновити
<button onClick={() => deleteTag(tagId)} />;

// ❌ BAD — confirm-діалог для оборотної дії
if (window.confirm("Видалити тег?")) deleteTag(tagId);

// ❌ BAD — toast без undo-кнопки (просто оголошення)
toast.success("Тег видалено"); // нема способу відновити

// ❌ BAD — без haptic, без live-region; покладається тільки на візуал
<div>Тег видалено · undo</div>;

// ✅ GOOD
const snapshot = routine;
setRoutine((s) => deleteTag(s, tagId));
showUndoToast(toast, {
  msg: `Видалено тег «${tag.name}»`,
  onUndo: () => setRoutine(snapshot),
});
```

## Гайдлайни копії

- **Минулий час** як підтвердження: «Видалено звичку «Вода»», а не «Звичку «Вода» буде видалено».
- **Цитуйте назву** в `«…»`, щоб юзер міг ідентифікувати, який саме item зачеплений, коли toast-и черговіються.
- **Згадайте каскадні наслідки**, якщо вони є: «Видалено тег «дім» (відʼєднано від 4)».
- **Default undo-label**: `"Повернути"` (виставлено в `@sergeant/shared`). Не override-уйте без потреби (наприклад, «Підняти» для archive-flow-у).

## Haptic + a11y

`showUndoToast` автоматично:

- Викликає `hapticWarning()` на появі toast-а (фідбек dangerous-action на iOS).
- Викликає `hapticTap()` на тапі по undo-кнопці.
- Викликає `hapticError()`, якщо `onUndo` кидає виняток.
- Обгортає `onUndo` у `try/catch` і піднімає follow-up error-toast через `toast.error(onUndoErrorMsg)`, щоб юзер дізнався, що restore впав (а не мовчки ковтати exception, що раніше ховало localStorage-quota-помилки).

Toast-и рендеряться через `useToast`-провайдер, який підʼєднаний до app-level live-region — тож скрін-рідер чує повідомлення, а undo-кнопка нормально отримує клавіатурний focus.

## Migration-чеклист

Коли підключаєте патерн у новому модулі:

1. Імпортуйте `showUndoToast` і `useToast`.
2. Snapshot-ніть item (або цілий state) перед мутацією.
3. Застосуйте оптимістичну мутацію.
4. Викличте `showUndoToast(toast, { msg, onUndo })`.
5. Приберіть `window.confirm()` / `<ConfirmDialog>` для цієї дії, якщо вона не входить у винятки про необоротність вище.
6. Перевірте на реальному девайсі, що haptic-и фаяться — `useToast` не викликає `hapticTap()` для не-undo-toast-ів; це навмисно, але варто перевірити sanity.

## Пов'язані доки

- [`apps/web/src/shared/lib/undoToast.tsx`](../../apps/web/src/shared/lib/undoToast.tsx) — імплементація.
- [`apps/web/src/shared/lib/undoToast.test.tsx`](../../apps/web/src/shared/lib/undoToast.test.tsx) — contract-тести.
- [`packages/shared/src/lib/undoToast.ts`](../../packages/shared/src/lib/undoToast.ts) — дефолти, шарені з мобілкою.
- `AGENTS.md` § Soft rules — «Destructive UX defaults».
