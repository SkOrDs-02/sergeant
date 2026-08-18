/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Один рядок редагування позиції чека (name/qty/priceKopiykas/sumKopiykas)
 * — спека § Web UI: "позиції списком" на review-екрані.
 */
import { useDecimalDraft } from "@shared/hooks/useDecimalDraft";
import { Icon } from "@shared/components/ui/Icon";
import { Input } from "@shared/components/ui/Input";
import type { ReceiptDraftItem } from "@sergeant/api-client";
import { ReceiptMoneyInput } from "./receiptMoneyInput";

/** Дзеркалить `RECEIPT_ITEM_NAME_MAX_LEN` / `RECEIPT_ITEM_QTY_ABS_MAX`
 * (`packages/shared/src/schemas/receipts.ts`) — локальні UI-капи, не
 * імпорт (типи цього PR-у йдуть лише з `@sergeant/api-client`, схемні
 * константи лишаються серверною/contract-межею). */
const ITEM_NAME_MAX_LEN = 300;
const ITEM_QTY_MAX = 1_000_000;

export type EditableItemPatch = Partial<
  Pick<ReceiptDraftItem, "name" | "qty" | "priceKopiykas" | "sumKopiykas">
>;

export interface ReceiptReviewItemRowProps {
  item: ReceiptDraftItem;
  index: number;
  disabled?: boolean | undefined;
  onEditItem: (index: number, patch: EditableItemPatch) => void;
  onRemove: (index: number) => void;
}

function QtyInput({
  qty,
  disabled,
  onCommit,
}: {
  qty: number;
  disabled?: boolean | undefined;
  onCommit: (qty: number) => void;
}) {
  const draft = useDecimalDraft(qty, ITEM_QTY_MAX, (v) => onCommit(v ?? 0));
  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft.value}
      onChange={draft.onChange}
      disabled={disabled}
      aria-label="Кількість"
      placeholder="1"
      className="input-focus-finyk h-9 min-w-0 rounded-xl border border-line bg-panelHi px-2 text-style-caption text-text tabular-nums"
    />
  );
}

export function ReceiptReviewItemRow({
  item,
  index,
  disabled,
  onEditItem,
  onRemove,
}: ReceiptReviewItemRowProps) {
  return (
    <li className="py-2 border-b border-line/60 last:border-0">
      <div className="flex items-center gap-2">
        <Input
          value={item.name}
          onChange={(e) =>
            onEditItem(index, {
              name: e.target.value.slice(0, ITEM_NAME_MAX_LEN),
            })
          }
          disabled={disabled}
          size="sm"
          className="flex-1 min-w-0"
          aria-label={`Назва позиції ${index + 1}`}
          placeholder="Назва товару"
        />
        <button
          type="button"
          onClick={() => onRemove(index)}
          disabled={disabled}
          aria-label={`Видалити позицію ${index + 1}`}
          className="shrink-0 touch-target flex items-center justify-center rounded-xl text-danger-strong dark:text-danger hover:bg-danger/10 transition-colors"
        >
          <Icon name="trash" size={14} aria-hidden />
        </button>
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        <QtyInput
          qty={item.qty}
          disabled={disabled}
          onCommit={(qty) => onEditItem(index, { qty })}
        />
        <ReceiptMoneyInput
          kopiykas={item.priceKopiykas}
          onCommitKopiykas={(priceKopiykas) =>
            onEditItem(index, { priceKopiykas })
          }
          ariaLabel={`Ціна позиції ${index + 1}`}
          disabled={disabled}
        />
        <ReceiptMoneyInput
          kopiykas={item.sumKopiykas}
          onCommitKopiykas={(sumKopiykas) => onEditItem(index, { sumKopiykas })}
          ariaLabel={`Сума позиції ${index + 1}`}
          disabled={disabled}
          className="font-semibold"
        />
      </div>
    </li>
  );
}
