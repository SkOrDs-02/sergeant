/**
 * Last validated: 2026-08-08
 * Status: Active
 *
 * Заливання демо-payload Фінька з localStorage у SQLite.
 *
 * AI-CONTEXT: демо-сід (`core/onboarding/seedDemoData/seedFinyk.ts`)
 * пише сирим `writeJSON` у `finyk_manual_expenses_v1` /
 * `finyk_custom_cats_v1` / `finyk_monthly_plan` (+ `finyk_tx_cache` для
 * банківського стріму — див. окремий місток нижче), бо він виконується
 * в `main.tsx` ДО React-дерева і одразу робить `location.replace` —
 * жодного хука, а отже й жодного dual-write-триггера, там ще не існує.
 * Доки модуль читав LS, цього вистачало.
 *
 * Далі сталося те саме, що з Фізруком (див. AI-DANGER-блок у
 * `modules/fizruk/lib/demoSeedImport.ts` — той самий root cause,
 * той самий аудит L-8, 2026-08-07): модуль перевели на читання ЛИШЕ з
 * SQLite, residual-дренаж LS→SQLite прибрали як «одноразовий pre-beta
 * drain», і разом із ним тихо помер демо-режим. `onboardingGate.ts`
 * прямим текстом фіксує, що Фінік лишався без цього містка.
 *
 * Формат демо-payload ми контролюємо повністю, тож — як і в Фізруку —
 * достатньо зібрати з нього звичайний dual-write стан і пропустити
 * через ТОЙ САМИЙ diff+apply, яким ходять живі правки користувача.
 * Нового шляху запису не зʼявляється.
 *
 * AI-DANGER: обидва імпортери нижче обовʼязково гейтяться демо-режимом
 * на виклику (`sqliteReadBoot.ts` / `monoMirrorBoot.ts`). Без гейта це
 * воскресило б legacy-LS у СПРАВЖНІХ акаунтів — рівно те, що прибрали
 * навмисно, і що затерло б їхні SQLite-дані старим знімком.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { logger } from "@shared/lib";
import { safeReadLS } from "@shared/lib/storage/storage";

import { blobsFromArray } from "./sqliteWriter/extract.js";
import { applyFinykDualWriteOps } from "./sqliteWriter/adapter.js";
import {
  diffFinykDualWriteOps,
  EMPTY_FINYK_STATE,
  type FinykDualWriteState,
} from "./sqliteWriter/diff.js";
import { writeMonoTransactions } from "./monoMirror.js";

// -----------------------------------------------------------------------
// Місток 1 — dual-write-слайси (ручні витрати, кастомні категорії, план)
// -----------------------------------------------------------------------

/** Ключі, у які пише `seedFinyk()` для dual-write-слайсів. Свідомо продубльовані літералами. */
const DEMO_MANUAL_EXPENSES_KEY = "finyk_manual_expenses_v1";
const DEMO_CUSTOM_CATS_KEY = "finyk_custom_cats_v1";
const DEMO_MONTHLY_PLAN_KEY = "finyk_monthly_plan";

/**
 * Зібрати dual-write стан із демо-payload у localStorage.
 *
 * Покриває лише три слайси, які реально пише `seedFinyk()`:
 * `manualExpenses`, `customCategories`, `prefs` (monthly plan +
 * дефолтний `showBalance`). Решта dual-write-таблиць (бюджети,
 * підписки, борги…) демо не заповнює — там нема чого лити.
 *
 * @returns `null`, якщо в LS нема нічого придатного — тоді імпорт
 *   не має чого робити й не має що логувати.
 */
export function readFinykDemoStateFromLs(): FinykDualWriteState | null {
  const manualExpensesRaw = safeReadLS<readonly unknown[]>(
    DEMO_MANUAL_EXPENSES_KEY,
    null,
  );
  const customCatsRaw = safeReadLS<readonly unknown[]>(
    DEMO_CUSTOM_CATS_KEY,
    null,
  );
  const monthlyPlanRaw = safeReadLS<unknown>(DEMO_MONTHLY_PLAN_KEY, null);

  const manualExpenses = Array.isArray(manualExpensesRaw)
    ? manualExpensesRaw
    : [];
  const customCategories = Array.isArray(customCatsRaw) ? customCatsRaw : [];

  if (
    manualExpenses.length === 0 &&
    customCategories.length === 0 &&
    monthlyPlanRaw == null
  ) {
    return null;
  }

  let monthlyPlanJson: string;
  try {
    monthlyPlanJson = JSON.stringify(monthlyPlanRaw ?? {});
  } catch {
    monthlyPlanJson = "{}";
  }

  return {
    ...EMPTY_FINYK_STATE,
    manualExpenses: blobsFromArray(manualExpenses),
    customCategories: blobsFromArray(customCategories),
    prefs: {
      monthlyPlanJson,
      // Демо не сіє `finyk_show_balance_v1` — дефолт хука теж `true`
      // (див. `useFinykStorageSlots.ts`), тож містимо той самий дефолт
      // тут, а не залишаємо `false`, що затерло б продуктовий дефолт.
      showBalance: true,
      // Демо не сіє ні виключені зі статистики транзакції, ні
      // прихований recurring-банер — порожні масиви, не `null`, бо
      // `prefs-upsert` перезаписує рядок цілком (не merge).
      excludedStatTxIdsJson: "[]",
      dismissedRecurringJson: "[]",
    },
  };
}

export interface ImportFinykDemoSeedInput {
  readonly client: SqliteMigrationClient;
  readonly userId: string;
  readonly nowIso: string;
}

/**
 * Залити демо dual-write-payload у SQLite. Ідемпотентно: diff віддає
 * upsert-и за `id`, тож повторний бут переписує ті самі рядки тими
 * самими значеннями — узгоджено з тим, що демо й так відновлює
 * канонічний приклад на кожен cold start (`reseedDemoData`).
 *
 * Ніколи не кидає — демо не має права завалити бут модуля.
 *
 * @returns Скільки операцій застосовано (0, якщо не було чого лити).
 */
export async function importFinykDemoSeed(
  input: ImportFinykDemoSeedInput,
): Promise<number> {
  try {
    const next = readFinykDemoStateFromLs();
    if (!next) return 0;

    const ops = diffFinykDualWriteOps(EMPTY_FINYK_STATE, next);
    if (ops.length === 0) return 0;

    // Свідомо повертаємо `result.applied`, а НЕ `ops.length`: адаптер
    // ловить помилку кожної операції окремо й не кидає назовні, тож
    // `ops.length` рапортував би «залито», навіть коли sqlite мовчки
    // відкинув усе до одної.
    const result = await applyFinykDualWriteOps(input.client, ops, {
      userId: input.userId,
      clientTs: input.nowIso,
    });
    if (result.errored > 0) {
      logger.warn("[finyk.demoSeed] частина демо-даних не долетіла", {
        applied: result.applied,
        errored: result.errored,
      });
    }
    return result.applied;
  } catch (err) {
    logger.warn("[finyk.demoSeed] не вдалось залити демо-дані в SQLite", {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

// -----------------------------------------------------------------------
// Місток 2 — банківські (Mono) транзакції → мірор `finyk_mono_transactions`
// -----------------------------------------------------------------------

/**
 * Ключ, у який пише `seedFinyk()` для банківського стріму. Формат
 * snapshot-у — `{ txs: MonoTx[], timestamp }`, той самий, який раніше
 * читав `useMonobank.loadCacheSnapshot`. Мірор тепер обслуговує
 * продакшн-читачів напряму (`finyk_mono_transactions`), тож 23
 * засіяні транзакції — найбільша частина демо Фінька — інакше мертві.
 */
const DEMO_TX_CACHE_KEY = "finyk_tx_cache";

interface DemoTxCacheBlob {
  txs?: readonly unknown[];
}

/**
 * Зібрати список mono-транзакцій із демо-payload у localStorage.
 *
 * Рядки лише мінімально валідуються (потрібен рядковий `id` — без
 * нього `writeMonoTransactions` пропустить рядок все одно, але
 * дешевше відсіяти сміття тут, ніж ганяти його крізь SQL-цикл).
 * Форма рядків контролюється нами самими (`buildMonoTx` у
 * `seedDemoData/utils.ts`) і є надмножиною канонічного `Transaction` —
 * той самий структурний каст, яким користується `sqliteReader.ts`
 * (`rowToBlob`).
 *
 * @returns `null`, якщо в LS нема жодної придатної транзакції.
 */
export function readFinykDemoMonoTransactionsFromLs(): Transaction[] | null {
  const blob = safeReadLS<DemoTxCacheBlob>(DEMO_TX_CACHE_KEY, null);
  const txsRaw = Array.isArray(blob?.txs) ? blob.txs : [];
  if (txsRaw.length === 0) return null;

  const out: Transaction[] = [];
  for (const row of txsRaw) {
    if (!row || typeof row !== "object") continue;
    const candidate = row as Record<string, unknown>;
    const id = candidate["id"];
    if (typeof id !== "string" || id.length === 0) continue;
    out.push(candidate as Transaction);
  }

  return out.length > 0 ? out : null;
}

export interface ImportFinykDemoMonoTransactionsInput {
  readonly client: SqliteMigrationClient;
  readonly userId: string;
}

/**
 * Залити демо-транзакції у мірор `finyk_mono_transactions`.
 * Ідемпотентно — `writeMonoTransactions` upsert-ить за `(user_id,
 * tx_id)` з LWW-guard-ом на `mono_time`, тож повторний бут не
 * плодить дублікатів.
 *
 * Ніколи не кидає — демо не має права завалити бут модуля. На
 * відміну від dual-write-містка вище, тут нема per-op try/catch
 * усередині `writeMonoTransactions`: одна помилка запису перериває
 * решту батчу, тому обгортаємо весь виклик, а не рахуємо `applied`
 * окремо від `errored`.
 *
 * @returns Скільки транзакцій успішно записано (0, якщо не було чого
 *   лити, або якщо запис повністю провалився).
 */
export async function importFinykDemoMonoTransactions(
  input: ImportFinykDemoMonoTransactionsInput,
): Promise<number> {
  try {
    const txs = readFinykDemoMonoTransactionsFromLs();
    if (!txs) return 0;
    return await writeMonoTransactions(input.client, input.userId, txs);
  } catch (err) {
    logger.warn("[finyk.demoSeed] не вдалось залити демо-транзакції в мірор", {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}
