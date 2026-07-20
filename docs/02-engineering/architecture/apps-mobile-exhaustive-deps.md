# Mobile: навмисні винятки `react-hooks/exhaustive-deps`

> **Last touched:** 2026-07-20 by @cursoragent. **Next review:** 2026-10-18.
> **Status:** Active

Документ фіксує **живі** `eslint-disable` для `react-hooks/exhaustive-deps` у виробничому `apps/mobile/src`. Мета — не «вимкнути правило», а зафіксувати контракт для рев'ю та рефакторингу.

**Поточний стан (2026-07-20):** **9** активних disable у production (8 файлів; `ConfirmDialog.tsx` — 2 сайти). Тестові файли не враховуються. Web-каталог закритий (0 production) — див. [`apps-web-exhaustive-deps.md`](./apps-web-exhaustive-deps.md).

---

## Живий каталог

| Шлях                                                | Рядок (орієнтовно) | Чому disable                                                                                                                    | Патерн                         |
| --------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `modules/routine/hooks/useRoutineReminders.ts`      | ~357               | Mount-only: один раз прочитати permission; `refreshPermission` стабільний, а reschedule йде лише через окремий debounced-ефект. | mount-only `[]`                |
| `core/theme/ColorSchemeBridge.tsx`                  | ~93                | Реагувати лише на `prefs.darkMode`; інші поля HubPrefs не повинні повторно викликати NativeWind `colorScheme.set`.              | вузький dep (`prefs.darkMode`) |
| `core/hub/reports/RoutineCard.tsx`                  | ~60                | `cacheTick` — тік реактивності SQLite-кешу; `period`/`offset` задають вікно; повний об'єкт state у deps не потрібен.            | bump/tick deps                 |
| `core/dashboard/SoftAuthPromptCard.tsx`             | ~56                | Аналітика `onShown` — один раз при монтуванні (parity з web `placement={"dashboard"}`).                                         | mount-only analytics           |
| `core/dashboard/FirstActionHeroCard.tsx`            | ~182               | Report-on-mount FTUX analytics; повторний виклик при зміні ranking/picks ламає «показано раз».                                  | mount-only analytics           |
| `core/dashboard/CrossModulePreview.tsx`             | ~61                | `CROSS_MODULE_PREVIEW_SEEN` один раз на mount; повторні surfaces блокує persisted flag, не deps.                                | mount-only analytics           |
| `components/ui/ConfirmDialog.tsx` (`handleConfirm`) | ~295               | У deps лише `state.resolve` поточного Promise — увесь `state` перестворював би handlers на кожну зміну title/open.              | вузький dep (`state.resolve`)  |
| `components/ui/ConfirmDialog.tsx` (`handleCancel`)  | ~301               | Те саме для cancel-гілки: resolve поточного діалогу, без зайвих перестворень callback.                                          | вузький dep (`state.resolve`)  |
| `modules/finyk/lib/transactionsStore.ts`            | ~276               | Mount-only flush seed `realTx` у MMKV; повторний seed-об'єкт на re-render не повинен перезаписувати кеш.                        | mount-only seed flush          |

Перевірка живості:

```bash
rg -n "eslint-disable.*exhaustive-deps" apps/mobile/src -g '*.{ts,tsx}' -g '!**/*.{test,spec}.{ts,tsx}'
```

---

## Як додати новий disable

1. Спочатку спробуй патерни з web-каталогу (`void bump` / `firedRef` / `useRef`+layout sync) — disable лише якщо вони ламають контракт.
2. Поруч із `eslint-disable-next-line react-hooks/exhaustive-deps` — **один рядок WHY** українською або англійською (що саме зламається, якщо додати deps).
3. Додай рядок у таблицю вище в тому ж PR (шлях → rationale → патерн).
4. Рев'ю блокує disable без WHY-коментаря або без оновлення цього каталогу.

**Не в каталозі:** тестові файли (`*.test.tsx` тощо) — їх не трекаємо як production-борг.
