/**
 * Last validated: 2026-07-20
 * Status: Active
 *
 * Inline category override picker for TxRow. Extracted for Hard Rule #18.
 */
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { stripLeadingEmoji } from "./txRowHelpers";

interface CategoryOption {
  id: string;
  label: string;
}

interface TxRowCategoryPickerProps {
  categories: readonly CategoryOption[];
  currentCatId: string;
  overrideCatId?: string | null | undefined;
  txId: string;
  onCatChange?: ((id: string, catId: string | null) => void) | null | undefined;
  onClose: () => void;
}

export function TxRowCategoryPicker({
  categories,
  currentCatId,
  overrideCatId,
  txId,
  onCatChange,
  onClose,
}: TxRowCategoryPickerProps) {
  return (
    <div className="flex flex-wrap gap-1.5 pb-3 px-2">
      {categories.map((c) => (
        <button
          key={c.id}
          onClick={() => {
            onCatChange?.(
              txId,
              c.id === currentCatId && overrideCatId ? null : c.id,
            );
            onClose();
          }}
          className={cn(
            "text-xs px-3 py-2 rounded-xl border transition-colors min-h-[34px]",
            c.id === currentCatId
              ? "bg-text text-bg border-text"
              : "border-line text-subtle hover:border-muted hover:text-text",
          )}
        >
          {stripLeadingEmoji(c.label)}
        </button>
      ))}
      {overrideCatId && (
        <button
          onClick={() => {
            onCatChange?.(txId, null);
            onClose();
          }}
          className="text-xs px-3 py-2 rounded-xl border border-dashed border-danger/40 text-danger-strong/60 dark:text-danger/60 hover:text-danger transition-colors"
        >
          <Icon name="close" size={13} aria-hidden /> Скинути
        </button>
      )}
    </div>
  );
}
