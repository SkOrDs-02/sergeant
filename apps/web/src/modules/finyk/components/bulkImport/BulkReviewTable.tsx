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

function categoryOptionsFor(direction: "expense" | "income"): {
  slugs: string[];
  display: Readonly<Record<string, { label: string }>>;
} {
  return direction === "income"
    ? { slugs: INCOME_CATEGORY_SLUGS, display: INCOME_CATEGORY_DISPLAY }
    : { slugs: CATEGORY_SLUGS, display: CATEGORY_DISPLAY };
}

export function BulkReviewTable({
  rows,
  onToggleRow,
  onToggleAll,
  onBulkCategory,
  onEditRow,
  disabled = false,
}: BulkReviewTableProps) {
  const [bulkCategory, setBulkCategory] = useState("");
  const allSelected = rows.length > 0 && rows.every((r) => r.selected);
  const selectedCount = selectedRowCount(rows);

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
            aria-label="Категорія для вибраних"
            value={bulkCategory}
            disabled={disabled || selectedCount === 0}
            onChange={(e) => setBulkCategory(e.target.value)}
          >
            <option value="">Категорія для вибраних…</option>
            {CATEGORY_SLUGS.map((slug) => (
              <option key={slug} value={slug}>
                {CATEGORY_DISPLAY[slug]?.label ?? slug}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || !bulkCategory || selectedCount === 0}
            onClick={() => {
              onBulkCategory(bulkCategory);
              setBulkCategory("");
            }}
          >
            Застосувати
          </Button>
        </div>
      </div>

      <ul className="divide-y divide-line rounded-2xl border border-line">
        {rows.map((row) => {
          const options = categoryOptionsFor(row.direction);
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
                      className="h-9! text-left! text-style-body!"
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
