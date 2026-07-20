/**
 * Last validated: 2026-07-20
 * Status: Active
 *
 * Inline split editor for TxRow. Extracted for Hard Rule #18 max-lines.
 */
import type { Dispatch, SetStateAction } from "react";
import { formatMoney } from "@sergeant/shared";
import type { TxSplit } from "@sergeant/finyk-domain/domain/types";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import {
  CATEGORY_ICON_MAP,
  SPLIT_INPUT_CLASS,
  stripLeadingEmoji,
} from "./txRowHelpers";

interface SplitCategoryOption {
  id: string;
  label: string;
}

interface TxRowSplitEditorProps {
  totalAmt: number;
  draftSplits: TxSplit[];
  setDraftSplits: Dispatch<SetStateAction<TxSplit[]>>;
  splitCategoryPicker: number | null;
  setSplitCategoryPicker: Dispatch<SetStateAction<number | null>>;
  splitCategoryOptions: readonly SplitCategoryOption[];
  remaining: number;
  existingSplitsCount: number;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function TxRowSplitEditor({
  totalAmt,
  draftSplits,
  setDraftSplits,
  splitCategoryPicker,
  setSplitCategoryPicker,
  splitCategoryOptions,
  remaining,
  existingSplitsCount,
  onSave,
  onDelete,
  onClose,
}: TxRowSplitEditorProps) {
  return (
    <div className="pb-3 px-2 space-y-2">
      <div className="text-style-caption text-subtle">
        Розподіл · {formatMoney(totalAmt, { minFractionDigits: 2 })} всього
      </div>
      {draftSplits.map((sp, i) => (
        <div key={i} className="relative flex items-center gap-2">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={splitCategoryPicker === i}
            onClick={() =>
              setSplitCategoryPicker((current) => (current === i ? null : i))
            }
            className={cn(
              SPLIT_INPUT_CLASS,
              "flex items-center gap-2 text-left",
            )}
          >
            <Icon
              name={CATEGORY_ICON_MAP[sp.categoryId] ?? "tag"}
              size={15}
              aria-hidden
            />
            <span className="truncate">
              {stripLeadingEmoji(
                splitCategoryOptions.find((c) => c.id === sp.categoryId)
                  ?.label ?? sp.categoryId,
              )}
            </span>
            <Icon
              name="chevron-down"
              size={13}
              className="ml-auto"
              aria-hidden
            />
          </button>
          {splitCategoryPicker === i && (
            <div
              role="listbox"
              aria-label="Категорія частини розподілу"
              className="absolute left-0 right-28 top-10 z-20 max-h-56 overflow-y-auto rounded-xl border border-line bg-panel p-1.5 shadow-lg"
            >
              {splitCategoryOptions.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  role="option"
                  aria-selected={category.id === sp.categoryId}
                  onClick={() => {
                    setDraftSplits((prev) =>
                      prev.map((part, index) =>
                        index === i
                          ? { ...part, categoryId: category.id }
                          : part,
                      ),
                    );
                    setSplitCategoryPicker(null);
                  }}
                  className={cn(
                    "flex min-h-[44px] w-full items-center gap-2 rounded-xl px-2 text-left text-style-caption",
                    category.id === sp.categoryId
                      ? "bg-primary/10 text-primary"
                      : "text-text hover:bg-panelHi",
                  )}
                >
                  <Icon
                    name={CATEGORY_ICON_MAP[category.id] ?? "tag"}
                    size={16}
                    aria-hidden
                  />
                  {stripLeadingEmoji(category.label)}
                </button>
              ))}
            </div>
          )}
          <input
            type="number"
            value={sp.amount || ""}
            onChange={(e) =>
              setDraftSplits((prev) =>
                prev.map((p, j) =>
                  j === i
                    ? { ...p, amount: parseFloat(e.target.value) || 0 }
                    : p,
                ),
              )
            }
            className="input-focus-finyk w-24 text-xs h-9 rounded-xl border border-line bg-panelHi px-2 text-right text-text"
            placeholder="₴"
          />
          {draftSplits.length > 2 && (
            <button
              type="button"
              aria-label="Видалити частину розподілу"
              onClick={() =>
                setDraftSplits((prev) => prev.filter((_, j) => j !== i))
              }
              className="text-danger-strong/50 dark:text-danger/50 hover:text-danger text-sm shrink-0"
            >
              <Icon name="trash" size={14} aria-hidden />
            </button>
          )}
        </div>
      ))}
      <div
        className={cn(
          "text-xs px-1 tabular-nums",
          Math.abs(remaining) < 0.01
            ? "text-success-strong dark:text-success"
            : "text-warning-strong dark:text-warning",
        )}
      >
        {Math.abs(remaining) < 0.01 ? (
          <span className="inline-flex items-center gap-1">
            <Icon name="check" size={13} aria-hidden /> Суми збігаються
          </span>
        ) : (
          `Залишок: ${formatMoney(remaining, { minFractionDigits: 2 })}`
        )}
      </div>
      <button
        onClick={() =>
          setDraftSplits((prev) => [
            ...prev,
            {
              categoryId: "other",
              amount: Math.max(0, Math.round(remaining * 100) / 100),
            },
          ])
        }
        className="text-xs text-primary/70 hover:text-primary transition-colors"
      >
        + Додати частину
      </button>
      <div className="flex gap-2 pt-1">
        <Button
          variant="primary"
          module="finyk"
          size="xs"
          onClick={onSave}
          disabled={Math.abs(remaining) >= 0.01}
          className="flex-1"
        >
          Зберегти
        </Button>
        {existingSplitsCount > 0 && (
          <button
            onClick={onDelete}
            className="text-xs py-2 px-3 rounded-xl border border-danger/30 text-danger-strong/70 dark:text-danger/70 hover:text-danger transition-colors"
          >
            Видалити
          </button>
        )}
        <button
          type="button"
          aria-label="Закрити редактор розподілу"
          onClick={onClose}
          className="text-xs py-2 px-3 rounded-xl border border-line text-subtle hover:text-text transition-colors"
        >
          <Icon name="close" size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
}
