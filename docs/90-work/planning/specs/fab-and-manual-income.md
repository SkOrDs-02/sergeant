# Ручні надходження + уніфікація FAB у всіх модулях

> **Last touched:** 2026-07-24 by Claude (Fable 5). **Next review:** 2026-08-24.
> **Status:** Active

Самодостатня спека для виконання у свіжій сесії (Opus). Виконавець: прочитай `.agents/skills/sergeant-start-here/SKILL.md`, потім `sergeant-feature-delivery` (owner) і `sergeant-web-ui` (поверхня). Усі рішення нижче — узгоджені з founder-ом; не переглядай їх, виконуй.

## Проблема

У Фініку є ручне введення лише **витрат** (`ManualExpenseSheet`) — надходження зʼявляються тільки з Monobank, тож юзер без банку (або з готівковим доходом) не може вести повну картину. Паралельно FAB-кнопка (`FloatingActionButton`, shared-компонент із fan-menu і scroll-to-hide) змонтована **лише у Фініку** — в інших модулях головна дія захована в глибині екрана, розміщення дій неконсистентне між модулями.

## Мета

1. Ручні надходження у Фініку: та сама форма, що для витрат, з перемикачем типу; надходження враховуються скрізь нарівні з банківським доходом.
2. FAB у всіх 4 модулях з однаковим розміщенням і по одній головній дії на модуль.

## Дизайн-рішення (зафіксовані, не переглядати)

1. **Взаємодія FAB у Фініку:** тап по FAB одразу відкриває форму (як зараз), а В САМІЙ ФОРМІ зверху — сегмент-перемикач «Витрата | Надходження» (дефолт — Витрата). Без fan-menu для цього вибору, без long-press.
2. **Модель даних:** той самий store, що й ручні витрати (**НЕ** окремий `finyk_manual_incomes`). Реалізація з мінімальною міграцією: до наявного типу `ManualExpense` додається **додаткове поле `kind: "expense" | "income"`** (відсутнє поле = `"expense"` — старі записи валідні без міграції даних). `amount` лишається додатним числом; знак похідний від `kind` у точці конвертації в транзакцію: expense → відʼємний, income → додатний (та сама конвенція, що в банківських транзакцій, де дохід має `amount > 0`).
3. **Категорії надходжень:** короткий власний набір чіпів (окремий від категорій витрат): Зарплата, Фріланс, Подарунок, Повернення, Інше (5 штук, ids: `salary`, `freelance`, `gift`, `refund`, `other-income`). Показуються у формі замість категорій витрат, коли сегмент = Надходження.
4. **Вплив на цифри — скрізь, як банківський дохід:** список операцій (фільтр «Доходи»), рядок «Дохід» на Огляді, прогрес «Плану доходу» в `MonthlyPlanCard`, hub quick-stats, будь-яка наявна математика доходів. Одна правда без винятків. (Механічно це має статись «безкоштовно»: ручні записи конвертуються в `Transaction` і вливаються у merged-стрім — див. § Поверхня.)
5. **FAB у 4 модулях, по одній головній дії:**
   - **Фінік** — відкрити форму транзакції (п.1);
   - **Їжа** — відкрити `AddMealSheet` (додати прийом їжі);
   - **Рутина** — відкрити `HabitQuickCreateDialog` (додати звичку);
   - **Фізрук** — «Почати тренування»; якщо тренування ВЖЕ активне — FAB змінює іконку/лейбл на «Продовжити» і веде до активного тренування (не ховається, не дублює старт).
6. **Розміщення уніфіковане:** як у поточного Фініка — `fixed`, правий нижній кут, над `ModuleBottomNav` (`bottom: calc(6rem + safe-area-inset-bottom)`), scroll-to-hide поведінка зберігається. Використовувати наявні `variant="v2-*"` стилі компонента (усі 4 варіанти вже описані в `variantStyles`).
7. **Редагування/видалення надходжень** — ідентично ручним витратам (той самий swipe-delete з undo-тостом, той самий edit-шлях через sheet; сегмент типу при редагуванні показує збережений `kind` і його МОЖНА змінити).

## Поверхня (шляхи перевірені)

**Фінік — форма і дані:**

- `apps/web/src/modules/finyk/components/ManualExpenseSheet.tsx` — додати сегмент-перемикач типу + рендер категорій надходжень; заголовок/CTA динамічні («Додати витрату/надходження»). Розглянь перейменування компонента на `ManualTransactionSheet` — але тільки якщо це не роздуває diff (грепни всі імпорти).
- `packages/finyk-domain/src/domain/personalization.ts` — тип `ManualExpense` (додати опційний `kind`). Друга копія типу в `apps/web/src/core/onboarding/seedDemoData/utils.ts` — синхронізувати.
- `apps/web/src/modules/finyk/hooks/useFinykStorageMutations.ts` — CRUD ручних записів (add/edit/remove) — параметр `kind`.
- Конвертація в транзакцію: `manualExpenseToTransaction` (експорт із `@sergeant/finyk-domain`; використання — `apps/web/src/modules/finyk/pages/transactions/useTransactionFilters.ts:112`) — ключова точка знаку: income → `amount > 0`. Після цього фільтр «Доходи» (`getIncomeCategory` у `TxRow.tsx:76-78`), Огляд, `MonthlyPlanCard` і `computeFinykQuickStats` (`packages/finyk-domain/src/lib/quickStats.ts`, реюзає `calcFinykPeriodAggregate`) підхоплюють дохід автоматично — перевір кожну з цих поверхонь, а не припускай.
- SQLite-дзеркало: `apps/web/src/modules/finyk/lib/sqliteWriter/specs.ts` (таблиця `finyk_manual_expenses`, ~рядки 108-131) — додати колонку/поле для `kind` за наявним патерном specs; старі рядки без поля читаються як expense. Перевір також `extract.ts`/`diff.ts`/`parity.ts` поруч — вони ганяють роздільні specs.
- Аналітика подій: у `useFinykStorageMutations` шлеться `EXPENSE_DELETED` тощо — додай симетричні події для income або параметризуй наявні (подивись, як заведені констант-и подій).

**FAB:**

- `apps/web/src/shared/components/ui/FloatingActionButton.tsx` — компонент готовий (props `actions`, `variant`, scroll-to-hide; варіанти `v2-finyk/fizruk/routine/nutrition` у `variantStyles`). Змін у компоненті, найімовірніше, не потрібно — тільки монтування.
- Монтування зараз: `apps/web/src/modules/finyk/FinykApp.tsx:~407-410` (еталон). Додати аналогічне у:
  - `apps/web/src/modules/nutrition/NutritionApp.tsx` → відкриває `apps/web/src/modules/nutrition/components/AddMealSheet.tsx` (грепни, який стейт керує його відкриттям);
  - `apps/web/src/modules/routine/RoutineApp.tsx` → відкриває `apps/web/src/modules/routine/components/HabitQuickCreateDialog.tsx`;
  - `apps/web/src/modules/fizruk/FizrukApp.tsx` → старт тренування / перехід до активного. Стан активного тренування шукай у `apps/web/src/modules/fizruk/components/workouts/` (`ActiveWorkoutPanel`, `ActiveWorkoutHeader`) і хуках поруч — знайди канонічний селектор «чи є активне тренування».
- Перевір, чи існуючі екрани модулів не мають ВЛАСНИХ кнопок тієї ж дії у контент-потоці, які тепер дублюють FAB — якщо є, приберій дубль лише коли він очевидно зайвий (інакше залиш і зазнач у PR-нотатках).

**Обмеження репо (обовʼязкові):** RQ-ключі лише через фабрики `apps/web/src/shared/lib/api/queryKeys.ts`; storage лише через wrapper `@shared/lib/storage/storage` (lint-allowlist); дизайн-лінти (без hex, `focus-visible:`, opacity-scale, типографічна шкала); touch-target ≥44px; `max-lines: 600`; `noUncheckedIndexedAccess`. Час — межі доби Europe/Kyiv. Гроші — копійки як `number`.

## Поза скоупом (v1)

- `apps/mobile` / `apps/mobile-shell` — тільки web.
- Аналітика доходів (нові графіки/розбивки по категоріях доходу).
- Регулярні/повторювані надходження (автоповтор зарплати).
- Fan-menu з кількома діями в одному модулі (у кожного модуля рівно одна головна дія).
- Перейменування таблиці `finyk_manual_expenses` чи столів SQLite (тільки додатне поле).

## Верифікація (обовʼязкова, перед звітом «готово»)

Автоматика:

```bash
pnpm --filter @sergeant/db-schema build   # пререквізит Vitest
pnpm --filter @sergeant/web test
pnpm --filter @sergeant/web typecheck
pnpm --filter @sergeant/finyk-domain test
pnpm lint
```

Нові тести (мінімум): конвертація manual-запису з `kind: "income"` → транзакція з додатним amount; старий запис БЕЗ `kind` → expense (backward compat); агрегат доходу за період бачить ручний income; sqliteWriter spec для нового поля.

Клік-тур у браузері (dev server, mobile viewport; NB: у dev без COOP/COEP SQLite у fallback-VFS — стан може не переживати hard-reload, це НЕ регресія):

1. Фінік → FAB → форма відкрилась із сегментом «Витрата | Надходження», дефолт Витрата.
2. Перемкнути на Надходження → категорії змінились на Зарплата/Фріланс/Подарунок/Повернення/Інше; додати 5000 ₴ «Зарплата».
3. Операції → фільтр «Доходи» → запис видно з додатною сумою; редагування відкриває форму з сегментом на «Надходження»; swipe-delete показує undo-тост.
4. Огляд → рядок «Дохід» включає 5000; Планування → прогрес «Плану доходу» зрушив.
5. Хаб → картка Фініка оновилась (quick stats не зламані).
6. Їжа → FAB видно над навбаром → тап відкриває AddMealSheet.
7. Рутина → FAB → відкриває створення звички.
8. Фізрук → FAB «Почати тренування»; почати → FAB став «Продовжити» і веде до активного тренування.
9. У всіх 4 модулях FAB в одній позиції, ховається при скролі вниз, зʼявляється при скролі вгору.

Скріншоти FAB у 4 модулях + форми з сегментом — у PR (UI-зміна, вимога AGENTS.md § Verification before PR).

## Межі виконання

- Не комітити і не пушити без явного «ок» founder-а; PR — за шаблоном `.github/PULL_REQUEST_TEMPLATE.md`.
- Продуктовий канон: перед зміною поведінки Фініка переглянь `docs/01-product/model/finyk.md`; якщо зміна суперечить канону — СПОЧАТКУ спитай founder-а, PR оновлює канон у тому ж PR.
