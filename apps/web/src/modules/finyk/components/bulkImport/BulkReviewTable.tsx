/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Спільна bulk-review таблиця для скрін-банкінгу і CSV-виписки (спека §
 * Bulk-review UI): чекбокс, дата, опис (inline-edit), сума (inline-edit),
 * категорія (дропдаун per row) + масова категорія для вибраних, бейджі
 * напряму/vision-confidence. Без dedup-статусу (tier1/2) — жодного
 * pre-commit ендпоінта для нього немає, див. `bulkImportRows.ts`
 * докстрінг.
 *
 * Власні категорії (CodeRabbit round 5, PR #818): `customCategories`
 * проп раніше оголошувався, але не деструктурувався — власні категорії
 * користувача просто ніде не зʼявлялись у bulk-review, хоча
 * `ReceiptReviewForm`/`ManualExpenseSheet` їх уже показують. Мержимо їх у
 * ОБИДВА пікери (per-row і масовий), той самий патерн, що
 * `ManualExpenseSheet.tsx` (`customExpenseCategories`/`customCategoryDisplay`):
 * лише для витрат — надходження мають фіксовану 5-слагову таксономію
 * (`INCOME_CATEGORY_SLUGS`) і не знають про власні категорії.
 */
import { useState } from "react";
import { AnimatedCheckbox } from "@shared/components/ui/AnimatedCheckbox";
import { Badge } from "@shared/components/ui/Badge";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { Select } from "@shared/components/ui/Select";
import type { CustomCategoryInput } from "@sergeant/finyk-domain";
import { CATEGORY_DISPLAY, CATEGORY_SLUGS } from "../manualExpenseCategories";
import {
  INCOME_CATEGORY_DISPLAY,
  INCOME_CATEGORY_SLUGS,
} from "../manualIncomeCategories";
import { ReceiptMoneyInput } from "../receiptScan/receiptMoneyInput";
import { selectedRowCount, type BulkReviewRow } from "./bulkImportRows";

const CONFIDENCE_WARN_THRESHOLD = 0.7;

export interface BulkReviewTableProps {
  rows: BulkReviewRow[];
  onToggleRow: (id: string) => void;
  onToggleAll: (selected: boolean) => void;
  onBulkCategory: (category: string) => void;
  onEditRow: (
    id: string,
    patch: Partial<
      Pick<BulkReviewRow, "description" | "amountKopiykas" | "category">
    >,
  ) => void;
  customCategories?: readonly CustomCategoryInput[] | undefined;
  disabled?: boolean | undefined;
}

type CategoryOptions = {
  slugs: readonly string[];
  display: Readonly<Record<string, { label: string }>>;
};

function categoryOptionsFor(
  direction: "expense" | "income",
  expenseOptions: CategoryOptions,
): CategoryOptions {
  return direction === "income"
    ? { slugs: INCOME_CATEGORY_SLUGS, display: INCOME_CATEGORY_DISPLAY }
    : expenseOptions;
}

export function BulkReviewTable({
  rows,
  onToggleRow,
  onToggleAll,
  onBulkCategory,
  onEditRow,
  customCategories = [],
  disabled = false,
}: BulkReviewTableProps) {
  const [bulkCategory, setBulkCategory] = useState("");
  const allSelected = rows.length > 0 && rows.every((r) => r.selected);
  // Item-2 fix (CodeRabbit round 5): the bulk action is expense-only (income
  // has its own 5-slug taxonomy the bulk picker never offers), so its count
  // and enabled-state must track expense selections only — counting every
  // selected row (income included) let the button apply while an
  // income-only selection had nothing valid it could touch.
  const selectedExpenseCount = rows.reduce(
    (n, r) => n + (r.selected && r.direction === "expense" ? 1 : 0),
    0,
  );
  const selectedCount = selectedRowCount(rows);

  const hasTransferLikelyRows = rows.some((r) => r.transferLikely);
  const hasDuplicateLikelyRows = rows.some((r) => r.duplicateLikely);

  const customExpenseCategories = customCategories.filter(
    (c): c is CustomCategoryInput =>
      typeof c?.id === "string" && c.id.trim() !== "",
  );
  const expenseCategoryDisplay: Readonly<Record<string, { label: string }>> = {
    ...CATEGORY_DISPLAY,
    ...Object.fromEntries(
      customExpenseCategories
        .filter((c) => c.label)
        .map((c) => [c.id, { label: c.label ?? "" }]),
    ),
  };
  const expenseCategorySlugs: readonly string[] = [
    ...CATEGORY_SLUGS,
    ...customExpenseCategories.map((c) => c.id),
  ];
  const expenseOptions: CategoryOptions = {
    slugs: expenseCategorySlugs,
    display: expenseCategoryDisplay,
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-panelHi/40 p-2.5">
        <button
          type="button"
          onClick={() => onToggleAll(!allSelected)}
          disabled={disabled}
          className="touch-target flex items-center gap-2 rounded-xl px-1.5 text-style-caption text-text"
        >
          <AnimatedCheckbox
            checked={allSelected}
            variant="finyk"
            size="sm"
            decorative
          />
          Обрано {selectedCount} з {rows.length}
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <Select
            size="sm"
            aria-label="Категорія для вибраних витрат"
            value={bulkCategory}
            disabled={disabled || selectedExpenseCount === 0}
            onChange={(e) => setBulkCategory(e.target.value)}
          >
            <option value="">Категорія для вибраних витрат…</option>
            {expenseCategorySlugs.map((slug) => (
              <option key={slug} value={slug}>
                {expenseCategoryDisplay[slug]?.label ?? slug}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || !bulkCategory || selectedExpenseCount === 0}
            onClick={() => {
              onBulkCategory(bulkCategory);
              setBulkCategory("");
            }}
          >
            Застосувати
          </Button>
        </div>
      </div>

      {hasTransferLikelyRows && (
        <p className="text-style-caption text-subtle">
          Рядки «схоже на переказ» (рух між власними рахунками) за замовчуванням
          не імпортуються, постав галочку, якщо це насправді витрата чи дохід.
        </p>
      )}

      {hasDuplicateLikelyRows && (
        <p className="text-style-caption text-subtle">
          Рядки «схоже, вже є» збігаються датою і сумою з уже збереженими
          витратами (наприклад, цей документ уже імпортували), постав галочку,
          якщо це справді окрема операція.
        </p>
      )}

      <ul className="divide-y divide-line rounded-2xl border border-line">
        {rows.map((row) => {
          const options = categoryOptionsFor(row.direction, expenseOptions);
          const lowConfidence =
            row.confidence != null &&
            row.confidence < CONFIDENCE_WARN_THRESHOLD;
          return (
            <li key={row.id} className="p-2.5">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => onToggleRow(row.id)}
                  disabled={disabled}
                  aria-label={
                    row.selected ? "Зняти вибір рядка" : "Вибрати рядок"
                  }
                  className="touch-target mt-0.5 shrink-0"
                >
                  <AnimatedCheckbox
                    checked={row.selected}
                    variant="finyk"
                    size="sm"
                    decorative
                  />
                </button>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-style-caption text-subtle tabular-nums">
                      {row.date}
                    </span>
                    <Badge
                      variant={
                        row.direction === "income" ? "success" : "neutral"
                      }
                      tone="soft"
                      size="xs"
                    >
                      {row.direction === "income" ? "дохід" : "витрата"}
                    </Badge>
                    {/* Бейджі — підозра, а не вирок: щойно людина сама
                        поставила галочку «імпортувати», підозра знята, і
                        бейдж ховається (бета-фідбек №2, 2026-08-18). */}
                    {row.transferLikely && !row.selected && (
                      <Badge variant="warning" tone="soft" size="xs">
                        схоже на переказ
                      </Badge>
                    )}
                    {row.duplicateLikely && !row.selected && (
                      <Badge variant="warning" tone="soft" size="xs">
                        схоже, вже є
                      </Badge>
                    )}
                    {row.confidence != null && lowConfidence && (
                      <Badge variant="warning" tone="soft" size="xs">
                        перевір суму
                      </Badge>
                    )}
                  </div>
                  <Input
                    value={row.description}
                    onChange={(e) =>
                      onEditRow(row.id, {
                        description: e.target.value.slice(0, 300),
                      })
                    }
                    disabled={disabled}
                    size="sm"
                    aria-label="Опис"
                    placeholder="Опис"
                  />
                  <div className="grid grid-cols-2 gap-1.5">
                    <ReceiptMoneyInput
                      kopiykas={row.amountKopiykas}
                      onCommitKopiykas={(amountKopiykas) =>
                        onEditRow(row.id, { amountKopiykas })
                      }
                      ariaLabel="Сума"
                      disabled={disabled}
                      // `pointer-coarse:text-base!` мусить бути і тут:
                      // `text-style-body!` (важливий, ~15px на вузькому
                      // екрані) інакше переміг би 16px-floor базового
                      // інпута, і iOS-зум повернувся б саме в bulk-таблиці.
                      // `pointer-coarse:min-h-11!` — щоб важливий `h-9!`
                      // не перебивав 44px touch-target floor на тачі.
                      // eslint-disable-next-line sergeant-design/no-raw-type-size -- анти-зум ІНВАРІАНТ контрола вводу (iOS: input <16px → авто-зум), не типографічна шкала.
                      className="h-9! text-left! text-style-body! pointer-coarse:min-h-11! pointer-coarse:text-base!"
                    />
                    <Select
                      size="sm"
                      aria-label="Категорія"
                      value={row.category}
                      disabled={disabled}
                      onChange={(e) =>
                        onEditRow(row.id, { category: e.target.value })
                      }
                    >
                      <option value="" disabled>
                        Категорія
                      </option>
                      {options.slugs.map((slug) => (
                        <option key={slug} value={slug}>
                          {options.display[slug]?.label ?? slug}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
