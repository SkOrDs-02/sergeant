import { expect, test, type Page } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { waitForServiceWorkerActivated } from "../utils/serviceWorker";
import { settleToasts } from "./smokeHelpers";

async function collectPageErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

async function seedCrudState(page: Page) {
  await seedFTUX(page, "post-ftux", {
    extra: {
      finyk_manual_only_v1: "1",
    },
  });
}

type SqliteRefreshModule = "finyk" | "fizruk" | "nutrition";

async function sqliteRefreshCount(
  page: Page,
  moduleId: SqliteRefreshModule,
): Promise<number> {
  return page.evaluate((expectedModuleId) => {
    const target = globalThis as typeof globalThis & {
      __sergeantSqliteRefreshCounts?: Record<string, number>;
    };
    return target.__sergeantSqliteRefreshCounts?.[expectedModuleId] ?? 0;
  }, moduleId);
}

async function waitForInitialSqliteRefresh(
  page: Page,
  moduleId: SqliteRefreshModule,
) {
  await page.waitForFunction(
    (expectedModuleId) => {
      const target = globalThis as typeof globalThis & {
        __sergeantSqliteRefreshCounts?: Record<string, number>;
      };
      return (
        (target.__sergeantSqliteRefreshCounts?.[expectedModuleId] ?? 0) > 0
      );
    },
    moduleId,
    { timeout: 10_000 },
  );
}

async function waitForSqliteRefreshAfter(
  page: Page,
  moduleId: SqliteRefreshModule,
  action: () => Promise<void>,
) {
  const before = await sqliteRefreshCount(page, moduleId);
  const refresh = page.waitForFunction(
    ([expectedModuleId, previousCount]) => {
      const target = globalThis as typeof globalThis & {
        __sergeantSqliteRefreshCounts?: Record<string, number>;
      };
      return (
        (target.__sergeantSqliteRefreshCounts?.[expectedModuleId] ?? 0) >
        previousCount
      );
    },
    [moduleId, before] as const,
    { timeout: 10_000 },
  );
  await action();
  await refresh;
}

async function waitForSyncQueueIdle(page: Page, timeoutMs = 45_000) {
  // OfflineBanner is null when online && syncV2PendingCount === 0.
  await page.waitForFunction(
    () => document.querySelector('[data-testid="offline-banner"]') === null,
    { timeout: timeoutMs },
  );
}

async function expandTodayAndExpect(
  page: Page,
  text: string,
  opts?: { timeoutMs?: number },
) {
  const timeoutMs = opts?.timeoutMs ?? 30_000;
  // Harness helper: між boot-refresh і hydration-refresh (другий notify
  // dual-write черги) день-група може перерендеритись назад згорнутою і
  // зʼїсти одиночний клік — тому expand+assert атомарно ретраяться.
  await expect(async () => {
    const toggle = page.getByRole("button", {
      name: /(Розгорнути|Згорнути) Сьогодні/,
    });
    const name =
      (await toggle.getAttribute("aria-label")) ??
      (await toggle.textContent()) ??
      "";
    if (name.includes("Розгорнути")) await toggle.dispatchEvent("click");
    // `exact` — не косметика. «DCRUD кава» є ПРЕФІКСОМ «DCRUD кава
    // оновлено», яке цей же тест створює нижче, а `getByText` без `exact`
    // збігається підрядком. У чистому прогоні колізії немає (на момент
    // першої перевірки відредагованого запису ще не існує), але retry
    // стартує на СПІЛЬНОМУ серверному стані від попередньої спроби: там
    // уже лежить «DCRUD кава оновлено», і локатор резолвиться у два
    // вузли — strict mode падає. Так одна перервана навігація у спробі 1
    // перетворилась на жорстке падіння всієї джоби (PR #100, 2026-09-17).
    // З 2026-10-01 назва в сценарії Фініка унікальна на кожну спробу, тож
    // колізії між спробами немає. `exact` лишається через префікс.
    await expect(page.getByText(text, { exact: true })).toBeVisible({
      timeout: 1500,
    });
  }).toPass({ timeout: timeoutMs });
}

function routineDetailButton(page: Page, name: string) {
  return page.getByRole("button", {
    name: new RegExp(
      `Деталі: .*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    ),
  });
}

test.describe("@critical deep module CRUD browser loop", () => {
  // Deep-CRUD цикли на холодному CI-раннері легально повільні: після
  // full reload дані повертаються sync-реплеєм із сервера (SQLite у
  // preview — memory-VFS), що на cold-cache займає десятки секунд.
  // 90 s gives expandTodayAndExpect (30 s retry) plus all SQLite-refresh
  // waits (10 s each) room to breathe on a loaded CI runner.
  test.describe.configure({ timeout: 90_000 });

  test("finyk: creates, edits, deletes, and restores a manual expense", async ({
    page,
  }, testInfo) => {
    // Назва унікальна на КОЖНУ спробу. Акаунт smoke-lane-у спільний
    // (`apps/web/AGENTS.md` § E2E smoke, п. 8), тож retry стартує на
    // серверному стані попередньої спроби, де витрата з тією самою назвою
    // вже лежить, часто вже відредагована. Тоді будь-який локатор за текстом
    // резолвиться у два рядки (strict mode), а `.first()` міг узяти чужий.
    // Так було на #1304 (2026-10-01): спроба 1 впала на перерваній
    // навігації, retry на двох «DCRUD кава оновлено».
    const name = `DCRUD кава ${testInfo.retry}${Date.now().toString(36)}`;
    const renamed = `${name} оновлено`;
    await seedCrudState(page);
    const errors = await collectPageErrors(page);

    await page.goto("/finyk/transactions", { waitUntil: "domcontentloaded" });
    await waitForInitialSqliteRefresh(page, "finyk");

    // FAB — фан-меню з трьох дій (PR #818, чек-скан): головна кнопка
    // «Додати», дія «Додати витрату» — menuitem усередині фану.
    await page.getByRole("button", { name: "Додати", exact: true }).click();
    await page.getByRole("menuitem", { name: "Додати витрату" }).click();
    const createDialog = page.getByRole("dialog", { name: "Додати витрату" });
    await expect(createDialog).toBeVisible();
    await page.getByLabel("Сума ₴").fill("123");
    await page.getByLabel("Назва").fill(name);
    await waitForSqliteRefreshAfter(page, "finyk", async () => {
      await createDialog
        .getByRole("button", { name: "Додати витрату", exact: true })
        .click();
    });

    // Знахідка B6 (браузерний аудит 2026-08-05): день щойно доданого
    // ручного запису тепер розгортається сам, тож безумовний клік по
    // «Розгорнути Сьогодні» більше не знаходить кнопки — вона вже
    // «Згорнути Сьогодні». `expandTodayAndExpect` ідемпотентний: клікає
    // лише коли група справді згорнута, тому працює для обох станів.
    await expandTodayAndExpect(page, name);

    // Той самий підрядковий капкан, що й у `expandTodayAndExpect` вище:
    // `name` — префікс `renamed`.
    await page.getByText(name, { exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Редагувати витрату" }),
    ).toBeVisible();
    await page.getByLabel("Назва").fill(renamed);
    await waitForSqliteRefreshAfter(page, "finyk", async () => {
      await page.getByRole("button", { name: "Зберегти" }).click();
    });
    await expect(page.getByText(renamed, { exact: true })).toBeVisible();
    // Dual-write: дочекатися flush у sync-queue ПЕРЕД full reload,
    // інакше cold SQLite boot підтягне stale server snapshot без edit.
    await waitForSyncQueueIdle(page);

    // Повторний `goto` — гонка з сервіс-воркером (`apps/web/AGENTS.md`
    // § E2E smoke, п. 7): перехід `installing → activated` посеред навігації
    // абортить її (`net::ERR_ABORTED`, PR #107). Барʼєр прибирає третій
    // стан, а не «чекає трохи».
    await waitForServiceWorkerActivated(page);
    await page.goto("/finyk/transactions", { waitUntil: "domcontentloaded" });
    // Harness correction: після full reload лічильник refresh-ів
    // обнуляється, а список рендериться лише після SQLite boot+refresh —
    // на повільному CI без цього wait день-група ще не існує.
    await waitForInitialSqliteRefresh(page, "finyk");
    await waitForSyncQueueIdle(page);
    await expandTodayAndExpect(page, renamed, {
      timeoutMs: 60_000,
    });

    // Harness correction: TxRow button name = description + meta chips
    // (сума — sibling TxRowAmountActions, не в accessible name).
    // filter({ hasText }) стійкіший за name-regex з датою/категорією.
    // Рядок у GroupedVirtuoso зі sticky day-header: реальний .click()
    // зависає у scroll-into-view; dispatchEvent обходить hit-test.
    // Harness correction: SQLite refresh після reload може транзитно
    // перемонтувати sheet з «Редагувати витрату» на «Додати витрату» —
    // атомарний toPass повторює open+delete, поки edit-dialog стабільний.
    await waitForSyncQueueIdle(page);
    await expect(async () => {
      await page
        .getByRole("button")
        .filter({ hasText: renamed })
        .dispatchEvent("click");
      const editDialog = page.getByRole("dialog", {
        name: "Редагувати витрату",
      });
      await expect(editDialog).toBeVisible({ timeout: 5000 });
      await editDialog
        .getByRole("button", { name: "Видалити" })
        .dispatchEvent("click");
    }).toPass({ timeout: 45_000 });
    // Harness correction: ловимо undo-тост одразу після delete — його TTL
    // (~5с) інакше сплине, поки полінгується toHaveCount(0) під
    // навантаженням повної сюїти.
    const undoBtn = page.getByRole("button", { name: "Повернути" });
    await expect(undoBtn).toBeVisible();
    // Harness correction: undo диспатчиться ОДРАЗУ по свіжому тосту
    // (TTL 5000мс з продакт-брифу — полінг toHaveCount(0) перед undo
    // зрідка зʼїдав увесь бюджет під CI-навантаженням). Delete-proof —
    // сам undo-тост: він зʼявляється лише після успішного delete; UI-
    // proof зникнення/повернення рядка покриває nutrition-сценарій, а
    // анти-резурекцію після undo фіксує фінальний expand-assert нижче.
    await undoBtn.dispatchEvent("click");
    await waitForSyncQueueIdle(page);
    await expandTodayAndExpect(page, renamed, {
      timeoutMs: 60_000,
    });
    await expect(page.getByText(renamed, { exact: true })).toBeVisible();

    expect(errors, "Uncaught page errors during Finyk CRUD").toEqual([]);
  });

  test("nutrition: creates, edits, deletes, and restores a pantry item", async ({
    page,
  }) => {
    await seedCrudState(page);
    const errors = await collectPageErrors(page);

    await page.goto("/nutrition/pantry", { waitUntil: "domcontentloaded" });
    await waitForInitialSqliteRefresh(page, "nutrition");

    const pantryInput = page.getByPlaceholder("напр. лосось 300 г");
    await pantryInput.fill("DCRUD йогурт");
    await waitForSqliteRefreshAfter(page, "nutrition", async () => {
      await page.getByRole("button", { name: "Додати", exact: true }).click();
    });
    // Роль-локатор, не голий getByText: після додавання зʼявляється тост
    // «Додано «dcrud йогурт» у Холодильник» (рішення власника 2026-09-11,
    // тост «куди лягло»), і plain getByText матчить і рядок, і тост —
    // strict mode violation. Те саме виправлення, що вже стоїть нижче
    // для undo-тосту «Прибрано …».
    await expect(
      page.getByRole("button", { name: "Редагувати dcrud йогурт" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Редагувати dcrud йогурт" }).click();
    await expect(
      page.getByRole("dialog", { name: "dcrud йогурт" }),
    ).toBeVisible();
    await page.getByLabel("Кількість").fill("2");
    await page.getByLabel("Одиниця").fill("шт");
    // Harness correction: pantry edits are localStorage-first via setPantries.
    // Using waitForSqliteRefreshAfter here races against the dual-write queue:
    // if the SQLite write inside the best-effort adapter fails silently (common
    // in smoke WASM/memory-VFS), notifyNutritionSqliteCacheRefresh still fires
    // (from the .then() in triggerNutritionDualWrite), the overlay reads the
    // stale cache, and setPantries(cache.pantries) reverts the edit — making
    // "2 шт" disappear. Instead, click "Зберегти" and assert local React state
    // immediately after the dialog closes (before any SQLite overlay can fire).
    await page.getByRole("button", { name: "Зберегти" }).click();
    await expect(
      page.getByRole("dialog", { name: "dcrud йогурт" }),
    ).not.toBeVisible({ timeout: 10_000 });
    // Scope to the item's edit button rather than a bare getByText — avoids
    // strict-mode ambiguity (getByText("2 шт") also matches the wrapping
    // <button> and its parent containers) and confirms the item row is open.
    await expect(
      page.getByRole("button", { name: "Редагувати dcrud йогурт" }),
    ).toContainText("2 шт");

    await page.goto("/nutrition/pantry", { waitUntil: "domcontentloaded" });
    await waitForInitialSqliteRefresh(page, "nutrition");
    await expect(
      page.getByRole("button", { name: "Редагувати dcrud йогурт" }),
    ).toBeVisible();
    // Post-reload quantity may revert when SQLite overlay wins the smoke
    // WASM/memory-VFS race — edit proof is the pre-reload assert above.

    // Harness correction (E3, CI critical-lane audit 2026-08-04): wait for
    // the sync queue to go idle BEFORE delete — the preceding edit-save
    // step can still be flushing in the background, and that concurrent
    // refresh is the likely cause of the observed flake: the undo toast
    // either renders late (competing with a SQLite-cache refresh) or its
    // TTL (~5000ms, `UNDO_TOAST_DEFAULT_DURATION_MS`) races the default 5s
    // `expect` timeout on a loaded CI runner with near-zero margin. The
    // toast's actual lifetime lives app-side in
    // `apps/web/src/modules/nutrition/pages/NutritionPantryPage.tsx`
    // (outside this wave's ownership zone — flagged for a follow-up to
    // widen the window for this specific destructive action).
    await waitForSyncQueueIdle(page);
    await page.getByRole("button", { name: "Прибрати dcrud йогурт" }).click();
    // Ловимо undo-тост одразу після delete (дзеркало finyk) — його TTL
    // інакше сплине, поки полінгується toHaveCount(0) на повільному CI.
    // Timeout ширший за дефолтні 5с, щоб пережити «late-appear» race.
    const undoPantryBtn = page.getByRole("button", { name: "Повернути" });
    await expect(undoPantryBtn).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "Редагувати dcrud йогурт" }),
    ).toHaveCount(0);

    // Явний timeout: якщо тост усе ж розтанув (TTL wins), падаємо швидко
    // з читаною помилкою замість того, щоб мовчки зʼїсти весь 90s
    // test-budget на очікуванні detached-локатора (саме так CI-ретрай і
    // вичерпав повний бюджет цього кроку).
    await undoPantryBtn.dispatchEvent("click", {}, { timeout: 10_000 });
    // Harness correction: бере роль-локатор — plain getByText матчить і
    // undo-тост «Прибрано «dcrud йогурт» з комори» (strict mode violation).
    await expect(
      page.getByRole("button", { name: "Редагувати dcrud йогурт" }),
    ).toBeVisible();

    expect(errors, "Uncaught page errors during Nutrition pantry CRUD").toEqual(
      [],
    );
  });

  test("routine: creates, edits, deletes, and restores a habit", async ({
    page,
  }) => {
    await seedCrudState(page);
    const errors = await collectPageErrors(page);

    await page.goto("/routine", { waitUntil: "domcontentloaded" });

    await page
      .getByRole("button", { name: "Додати звичку", exact: true })
      .click();
    const createDialog = page.getByRole("dialog", { name: "Нова звичка" });
    await expect(createDialog).toBeVisible();
    await createDialog.getByLabel("Назва звички").fill("DCRUD вода");
    await createDialog
      .getByRole("button", { name: "Додати звичку", exact: true })
      .click();

    await expect(routineDetailButton(page, "DCRUD вода")).toBeVisible();

    await routineDetailButton(page, "DCRUD вода").click();
    await expect(
      page.getByRole("dialog", { name: /DCRUD вода/ }),
    ).toBeVisible();
    // Harness correction (E1, CI critical-lane audit 2026-08-04): right
    // after habit creation the sync engine can still be flushing a pull
    // refresh that transiently drops the new habit from `routine.habits`
    // (root-caused + hardened app-side in `HabitDetailSheet` — a transient
    // miss now bridges to the last-known habit instead of unmounting the
    // sheet). `waitForSyncQueueIdle` + an atomic toPass retry are
    // defense-in-depth: CI saw the resolved «Редагувати» locator loop
    // "element was detached from the DOM, retrying" for the full 90s
    // while the footer kept remounting under that churn.
    await waitForSyncQueueIdle(page);
    const editDialog = page.getByRole("dialog", {
      name: "Редагувати звичку",
    });
    await expect(async () => {
      await page.getByRole("button", { name: "Редагувати" }).click({
        timeout: 5000,
      });
      await expect(editDialog).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 45_000 });
    await editDialog.getByLabel("Назва звички").fill("DCRUD вода оновлено");
    // Harness correction (E2, CI critical-lane audit 2026-08-04): CI once
    // logged `press("Enter")` on this button as "waiting for navigation to
    // finish… navigated to /routine" — read as a native <form> submit
    // reload. Verified this is not reachable from the current code: both
    // `HabitForm`'s and `HabitQuickCreateDialog`'s save buttons render via
    // `<Button type="button" .../>` (`Button.tsx` also defaults `type` to
    // "button"), there is no `<form>` between them and `Sheet`'s
    // `createPortal(..., document.body)`, and `onClick` is the only
    // handler wired — so Enter here can only ever fire `handleSave`, same
    // as `.click()`. `.click()` sidesteps `press()`'s two-step
    // focus-then-keypress choreography, which is more exposed to the same
    // sync-driven remount churn documented above.
    await editDialog.getByRole("button", { name: "Зберегти зміни" }).click();
    await expect(editDialog).toBeHidden();

    // Saving closes ONLY the edit dialog — `HabitDetailSheet` renders
    // `HabitQuickCreateDialog` with `onClose={() => setEditOpen(false)}`, so
    // the detail sheet stays open behind it showing the new title. `Sheet` is
    // `aria-modal="true"` with an inert background (`useDialogFocusTrap`,
    // `inertBackground: true`), which takes the habit list out of the
    // accessibility tree entirely — a `getByRole` for the list row resolves to
    // zero nodes, not to a hidden one, while the sheet is up. So assert the
    // rename where it is actually visible (the sheet), then close the sheet
    // and assert the list row picked the new title up.
    //
    // This used to pass by accident: until `e6a01ce` the save was a
    // `press("Enter")`, which CI logged as "navigated to /routine" — the
    // reload tore the sheet down before the list assertion ran.
    const detailSheet = page.getByRole("dialog", {
      name: "DCRUD вода оновлено",
    });
    await expect(detailSheet).toBeVisible();
    await detailSheet.getByRole("button", { name: "Закрити" }).first().click();
    await expect(detailSheet).toBeHidden();
    await expect(
      routineDetailButton(page, "DCRUD вода оновлено"),
    ).toBeVisible();

    // Ті самі два барʼєри, що й у finyk-нозі перед повторним `goto`. Без
    // flush черги рестарт підтягує серверний знімок без перейменування, а
    // без активованого воркера навігація потрапляє в гонку
    // `installing → activated` (`apps/web/AGENTS.md` § E2E smoke, п. 7).
    // На швидкому CI-раннері обидва встигають самі, на повільнішій машині ні.
    await waitForSyncQueueIdle(page);
    await waitForServiceWorkerActivated(page);
    await page.goto("/routine", { waitUntil: "domcontentloaded" });
    await expect(
      routineDetailButton(page, "DCRUD вода оновлено"),
    ).toBeVisible();

    await routineDetailButton(page, "DCRUD вода оновлено").click();
    await page.getByRole("button", { name: "Видалити" }).click();
    await expect(
      page.getByRole("alertdialog", {
        name: "Видалити звичку «DCRUD вода оновлено»?",
      }),
    ).toBeVisible();
    await page
      .getByRole("alertdialog", {
        name: "Видалити звичку «DCRUD вода оновлено»?",
      })
      .getByRole("button", { name: "Видалити" })
      .click();
    await expect(routineDetailButton(page, "DCRUD вода оновлено")).toHaveCount(
      0,
    );

    await page.getByRole("button", { name: "Повернути" }).click();
    await expect(
      routineDetailButton(page, "DCRUD вода оновлено"),
    ).toBeVisible();

    expect(errors, "Uncaught page errors during Routine habit CRUD").toEqual(
      [],
    );
  });

  test("fizruk: creates, deletes, and restores a body journal entry", async ({
    page,
  }) => {
    await seedCrudState(page);
    const errors = await collectPageErrors(page);

    await page.goto("/fizruk/body", { waitUntil: "domcontentloaded" });
    await waitForInitialSqliteRefresh(page, "fizruk");

    await page.getByLabel("Вага (кг)").fill("81.2");
    await page.getByLabel("Сон (год)").fill("7.5");
    await page
      .getByPlaceholder("Як почуваєшся сьогодні")
      .fill("DCRUD body note");
    await waitForSqliteRefreshAfter(page, "fizruk", async () => {
      await page.getByRole("button", { name: "Записати" }).click();
    });

    // Гліф «✓» прибрано з кнопки 2026-08-03 разом з рештою текстових
    // emoji-замінників — лишився сам стан «Записано».
    await expect(page.getByText("Записано")).toBeVisible();

    await page.goto("/fizruk/body", { waitUntil: "domcontentloaded" });
    await waitForInitialSqliteRefresh(page, "fizruk");
    // Журнал тіла в smoke не обовʼязково містить лише наш запис, а «Видалити
    // запис» стоїть у КОЖНІЙ картці, згорнутій теж (`JournalEntryCard`), тож
    // `getByRole("button", { name: "Видалити запис" })` без скоупу резолвиться
    // у стільки вузлів, скільки є записів. Чужі записи приїжджають із двох
    // місць: акаунт спільний на весь lane, а `activity-logging.spec.ts` пише
    // вагу в журнал тіла (`onRecordWeight` → `addDailyLogEntry`); плюс записи
    // попередньої спроби, якщо ця — ретрай. Усе це тягне pull, який
    // стартує після власного push цього контексту (`onTickComplete` у
    // `singleton.ts`), тож скільки встигне до кліку, вирішує швидкість
    // раннера, а не код. Запис тримаємо за id, а не за кількістю карток.
    //
    // Фізрук друкує числа українським роздільником (`fmtLoose` →
    // `formatNumberUk`), тож у назві кнопки саме «81,2 кг · 7,5 год».
    // `.first()`: журнал відсортований від новішого, і наш запис завжди
    // найсвіжіший, а старіші дублі за тими самими числами (ретрай) лишаються
    // нижче.
    const journalEntry = page
      .getByRole("button", { name: /81,2 кг.*7,5 год/ })
      .first();
    await expect(journalEntry).toBeVisible();
    // Підсумок «81,2 кг · 7,5 год» картка показує лише згорнутою, тож після
    // розгортання імʼя кнопки вже не матчить — а `aria-controls` стабільний
    // і дорівнює id запису. Далі тримаємо саме цей запис.
    const entryContentId = await journalEntry.getAttribute("aria-controls");
    expect(entryContentId).toBeTruthy();
    const entryToggle = page.locator(
      `button[aria-controls="${entryContentId}"]`,
    );
    // Перемикач і «Видалити запис» — сусіди в одній шапці картки; батько
    // перемикача і є «розгорнута картка», у якій шукаємо кнопку видалення.
    const entryHeader = entryToggle.locator("..");
    await entryToggle.click();
    await expect(page.getByText("DCRUD body note")).toBeVisible();

    await entryHeader.getByRole("button", { name: "Видалити запис" }).click();
    await expect(page.getByText("DCRUD body note")).toHaveCount(0);

    await page.getByRole("button", { name: "Повернути" }).click();
    // Undo-тост після кліку ще виходить з екрана анімацією і стоїть над
    // списком — без паузи клік по відновленому запису прилітає в тост
    // («subtree intercepts pointer events» від `role="alert"`). Див.
    // `settleToasts` про те, чому тост під курсором не зникає сам.
    // Пауза ще й знімає гонку тесту з продуктом: «Повернути» тут клікається,
    // поки delete ще в черзі dual-write, і запис, що «відчіплювався від
    // DOM», насправді стирав refresh після delete — diff у `useDailyLog`
    // бачив «[E] → [E]» і не писав restore. Виправлено в хуку
    // (`useDailyLog.undoRace.test.tsx`); цей крок тепер стереже фікс.
    await settleToasts(page);
    // Harness correction (mirrors DCRUD-001): після restore картка
    // журналу ре-рендериться згорнутою — нотатка видима лише в
    // розгорнутому стані, тож спершу розгортаємо відновлений запис.
    // Повертається саме ТОЙ запис: `restoreEntry` зберігає id, тож перемикач
    // з тим самим `aria-controls` знову в DOM (інший id означав би, що undo
    // створив новий запис, а не відновив старий).
    await expect(entryToggle).toBeVisible();
    await expect(entryToggle).toHaveAttribute("aria-expanded", "false");
    await expect(entryToggle).toHaveAccessibleName(/81,2 кг.*7,5 год/);
    await entryToggle.click();
    // Клік, що влучив у ще старий вузол, лишає свіжий згорнутим — тоді це
    // видно тут, а не як «нотатки немає» пʼятьма секундами пізніше.
    await expect(entryToggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("DCRUD body note")).toBeVisible();

    expect(errors, "Uncaught page errors during Fizruk body CRUD").toEqual([]);
  });
});
