/**
 * Last validated: 2026-09-12
 * Status: Active
 *
 * Рішення «чи показувати місток «запис із категорією Борг → пасив» на
 * РУЧНОМУ записі, і в якій ролі». Чиста функція без React — щоб її можна
 * було перевірити без рендера всього {@link ManualExpenseSheet} і щоб
 * аркуш лишався під Hard Rule #18 (`max-lines: 600`).
 *
 * **Чому рішення бере ЗБЕРЕЖЕНИЙ запис, а не поля форми.** Привʼязка
 * пише суму знімком у `txLinks` (докблок `LinkedTxMeta` у
 * `debtEngine.ts`). Узяти її з недописаної правки означало б записати в
 * пасив число, якого в сховищі ще немає, — той самий принцип, за яким
 * секція чека Сільпо в цьому ж аркуші читає збережений запис.
 */
import {
  resolveKnownCategory,
  type CategorySlug,
} from "./manualExpenseCategories";
import { upgradeIncomeCategory } from "./manualIncomeCategories";
import { resolveManualExpenseKind } from "@sergeant/finyk-domain/domain/transactions";
import { sumDebtSplitAmountUAH } from "@sergeant/finyk-domain/domain/debtSplitSync";
import type { LinkedTxRole } from "@sergeant/finyk-domain/domain/debtEngine";
import type { TxSplit } from "@sergeant/finyk-domain/domain/types";

/** Категорія-кошик витрат-боргів у ручній таксономії. */
const DEBT_EXPENSE_SLUG: CategorySlug = "debt";
/** Її дзеркало в таксономії надходжень. */
const DEBT_INCOME_SLUG = "debt-income";

/** Збережений ручний запис у тій формі, якої вистачає для рішення. */
export interface SavedManualRecordLike {
  category?: string | undefined;
  kind?: string | undefined;
  /** Legacy-аліас `kind` — див. `resolveManualExpenseKind`. */
  type?: string | undefined;
}

export interface ManualDebtLinkDecision {
  /**
   * `source` — надходження, яким борг виник; `payment` — витрата, що його
   * гасить. Роль керує і копією секції, і тим, чи пропонується створити
   * новий пасив.
   */
  txRole: LinkedTxRole;
  /**
   * Частка суми, розписана на категорію `debt` у сплітах; `null` — запис
   * не розділений, тож береться повна сума.
   */
  splitAmountUAH: number | null;
}

/**
 * @returns `null`, коли містка бути не має: запис ще не збережений, його
 * категорія не боргова, або запис розділений і на борг не віднесено
 * нічого (рівно `0`). Останній випадок — НЕ «взяти повну суму»:
 * привʼязка на 0 ₴ була б мовчазним хибним числом, тим самим класом
 * бага, що й завищення погашення.
 */
export function decideManualDebtLink(
  record: SavedManualRecordLike | null | undefined,
  splits: readonly TxSplit[] | null | undefined,
): ManualDebtLinkDecision | null {
  if (!record) return null;

  const category = String(record.category ?? "");
  const txRole: LinkedTxRole | null =
    resolveManualExpenseKind(record) === "income"
      ? upgradeIncomeCategory(category) === DEBT_INCOME_SLUG
        ? "source"
        : null
      : resolveKnownCategory(category) === DEBT_EXPENSE_SLUG
        ? "payment"
        : null;
  if (!txRole) return null;

  const splitAmountUAH = sumDebtSplitAmountUAH(splits);
  if (splitAmountUAH === 0) return null;

  return { txRole, splitAmountUAH };
}
