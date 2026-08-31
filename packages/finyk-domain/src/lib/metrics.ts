/**
 * Канонічний «всесвіт витрат» ФІНІК — одна відповідь на питання
 * «які транзакції взагалі беруть участь у статистиці витрат».
 *
 * AI-CONTEXT: до цього файлу правило «що входить у витрати» жило в шести
 * читачах одночасно і в кожного воно було своє:
 *   - `useOverviewData.ts` — банк + ручні витрати, канонічний excluded-set;
 *   - `useWeeklyDigest.ts` / `useCoachInsight.ts` — лише банк (ручні витрати
 *     не бачать узагалі);
 *   - `hubChatContext/readAllData.ts` — excluded-set без
 *     `finyk_excluded_stat_txs`;
 *   - `chatActions/queryFinykActions.ts` — виключає лише `hidden`, зате
 *     мерджить ручні витрати;
 *   - mobile Hub-Reports — hidden + transfers, без сплітів.
 * Наслідок: користувач із готівковою витратою і хоч одним «виключено зі
 * статистики» бачить різні «витрати» на різних поверхнях в одну хвилину.
 *
 * Цей модуль **не перемикає** жоден із тих call-site-ів (W1-CANON-AGG,
 * стадія 1 — additive). Він лише дає канонічну реалізацію, на яку стадія 2
 * буде переводити читачів по одному. Реєстр розбіжностей і статус кожного
 * конвеєра: `docs/02-engineering/architecture/metric-registry.md`.
 *
 * DOM-free: функції приймають ВЖЕ ПРОЧИТАНІ структури (масиви/мапи) і нічого
 * не читають із `localStorage` / MMKV / SQLite. Читання лишається в
 * платформних адаптерах (`apps/web/src/modules/finyk/lib/lsStats.ts` на web).
 */

import { INTERNAL_TRANSFER_ID } from "../constants";
import {
  manualExpenseToTransaction,
  type ManualExpenseEntry,
} from "../domain/transactions.js";
import { txTimeMs, type SpendingTxLike } from "./transactions.js";

/**
 * Мінімальна форма транзакції для всесвіту витрат: те саме, що приймають
 * `calcFinykSpendingTotal` / `calcFinykPeriodAggregate`, плюс `time`
 * (секунди або мілісекунди — нормалізується всередині) і канонічні
 * `categoryId` / `type` — за ними впізнається переказ, позначений на самій
 * транзакції, а не в мапі оверрайдів.
 */
export interface FinykUniverseTx extends SpendingTxLike {
  time?: number;
  categoryId?: string | undefined;
  type?: string | undefined;
}

/** Запис отримуваного боргу; важливі лише привʼязані транзакції. */
export interface FinykReceivableLike {
  linkedTxIds?: readonly string[] | null;
}

export interface FinykExcludedTxIdsInput {
  /** `finyk_hidden_txs` — приховані користувачем транзакції. */
  hiddenTxIds?: readonly string[] | null;
  /** `finyk_tx_cats` — мапа txId → categoryId; внутрішні перекази вилітають. */
  txCategories?: Readonly<Record<string, string | undefined>> | null;
  /** `finyk_recv` — погашення боргів, привʼязані до транзакцій. */
  receivables?: readonly (FinykReceivableLike | null | undefined)[] | null;
  /** `finyk_excluded_stat_txs` — явне «виключити зі статистики». */
  excludedStatTxIds?: readonly string[] | null;
  /**
   * Самі транзакції — потрібні лише для того, щоб побачити переказ,
   * позначений НА ТРАНЗАКЦІЇ (`categoryId: "internal_transfer"` або
   * `type: "transfer"`), а не в мапі оверрайдів `finyk_tx_cats`.
   *
   * AI-CONTEXT: обидві мітки рівноправні — `resolveType` у
   * `domain/transactions.ts` сам ставить `type: "transfer"` нормалізованій
   * транзакції з переказною категорією, а `isAlreadyTransfer`
   * (`domain/transferMatching.ts`) уже читає всі три джерела. Без цього
   * поля excluded-set бачив лише мапу, тож ручний запис або імпорт із
   * переказною категорією рахувався витратою.
   */
  transactions?: readonly (FinykUniverseTx | null | undefined)[] | null;
}

/** Переказ, позначений на самій транзакції (не через мапу оверрайдів). */
function isTxLevelTransfer(tx: FinykUniverseTx): boolean {
  return tx.categoryId === INTERNAL_TRANSFER_ID || tx.type === "transfer";
}

/**
 * Канонічний excluded-set Фініка: `hidden` + внутрішні перекази +
 * привʼязані до receivables транзакції + явно виключені зі статистики.
 *
 * Це та сама четвірка, що її збирає web-адаптер
 * `getFinykExcludedTxIdsFromStorage` (`apps/web/.../lib/lsStats.ts`) — але
 * без читання сховища, тож правило можна перевикористати на mobile і в
 * тестах. Канон: `docs/01-product/model/finyk.md` §5 і §139-149.
 */
export function buildFinykExcludedTxIds(
  input: FinykExcludedTxIdsInput = {},
): Set<string> {
  const out = new Set<string>();

  for (const id of input.hiddenTxIds ?? []) {
    if (id) out.add(String(id));
  }

  const cats = input.txCategories;
  if (cats && typeof cats === "object") {
    for (const [txId, catId] of Object.entries(cats)) {
      if (txId && catId === INTERNAL_TRANSFER_ID) out.add(String(txId));
    }
  }

  for (const tx of input.transactions ?? []) {
    if (tx?.id && isTxLevelTransfer(tx)) out.add(String(tx.id));
  }

  for (const r of input.receivables ?? []) {
    for (const id of r?.linkedTxIds ?? []) {
      if (id) out.add(String(id));
    }
  }

  for (const id of input.excludedStatTxIds ?? []) {
    if (id) out.add(String(id));
  }

  return out;
}

export interface FinykSpendingUniverseInput extends FinykExcludedTxIdsInput {
  /** Банківські транзакції (mono-mirror / MMKV-кеш), amount у копійках. */
  bankTxs?: readonly FinykUniverseTx[] | null;
  /** Ручні витрати/доходи користувача (`addManualExpense`-записи, грн). */
  manualExpenses?: readonly (ManualExpenseEntry | null | undefined)[] | null;
  /** Нижня межа вікна (мс), включно. За замовчуванням — без обмеження. */
  start?: number;
  /** Верхня межа вікна (мс), виключно. За замовчуванням — без обмеження. */
  end?: number;
}

export interface FinykSpendingUniverse {
  /** Банк + ручні записи в одному нормалізованому списку. */
  transactions: FinykUniverseTx[];
  /** Канонічний excluded-set для цього ж всесвіту. */
  excludedTxIds: Set<string>;
}

/**
 * Збирає канонічний всесвіт витрат: банківські транзакції + ручні витрати,
 * зведені до однієї нормалізованої форми, плюс excluded-set, який до них
 * застосовують `calcFinykSpendingTotal` / `calcFinykPeriodAggregate` /
 * `calcFinykSpendingByDate`.
 *
 * Ручні витрати мерджаться через `manualExpenseToTransaction` — рівно як це
 * робить Overview (`useOverviewData.ts`), єдина поверхня, що сьогодні бачить
 * готівку. Канон finyk §5 («гібрид: банк і ручний світ рівні») вимагає цього
 * від усіх поверхонь; переведення решти читачів — стадія 2, не цей патч.
 *
 * `start`/`end` — необовʼязкове вікно (мс): зручно, коли викликач хоче
 * звузити ручні записи до місяця/тижня перед агрегацією. Агрегатори і самі
 * вміють різати за вікном, тож за замовчуванням фільтр вимкнено.
 */
export function buildFinykSpendingUniverse(
  input: FinykSpendingUniverseInput = {},
): FinykSpendingUniverse {
  const start = input.start;
  const end = input.end;
  const hasWindow = start !== undefined || end !== undefined;

  const inWindow = (tx: FinykUniverseTx): boolean => {
    if (!hasWindow) return true;
    const ms = txTimeMs(tx.time);
    if (!Number.isFinite(ms)) return false;
    if (start !== undefined && ms < start) return false;
    if (end !== undefined && ms >= end) return false;
    return true;
  };

  const bank = Array.isArray(input.bankTxs) ? input.bankTxs : [];
  const transactions: FinykUniverseTx[] = [];
  for (const tx of bank) {
    if (!tx || !tx.id) continue;
    if (!inWindow(tx)) continue;
    transactions.push(tx);
  }

  const manual = Array.isArray(input.manualExpenses)
    ? input.manualExpenses
    : [];
  for (const entry of manual) {
    if (!entry) continue;
    const tx = manualExpenseToTransaction(entry);
    if (!inWindow(tx)) continue;
    transactions.push(tx);
  }

  return {
    transactions,
    // Транзакції передаємо у excluded-set явно: серед них уже є
    // нормалізовані ручні записи, у яких переказ позначений полем
    // `categoryId`/`type`, а не рядком у `finyk_tx_cats`.
    excludedTxIds: buildFinykExcludedTxIds({ ...input, transactions }),
  };
}
