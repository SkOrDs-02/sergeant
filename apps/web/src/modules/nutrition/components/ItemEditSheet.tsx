import type { Dispatch, SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Input } from "@shared/components/ui/Input";
import { Button } from "@shared/components/ui/Button";
import { Sheet } from "@shared/components/ui/Sheet";
import { normalizeUnit } from "../lib/pantryTextParser";

export interface ItemEditState {
  open: boolean;
  idx: number;
  name: string;
  qty: string;
  unit: string;
  err: string;
}

interface ItemEditSheetProps {
  itemEdit: ItemEditState;
  setItemEdit: Dispatch<SetStateAction<ItemEditState>>;
  onClose: () => void;
  onSave: (idx: number, qty: number | null, unit: string | null) => void;
}

export function ItemEditSheet({
  itemEdit,
  setItemEdit,
  onClose,
  onSave,
}: ItemEditSheetProps) {
  return (
    <Sheet
      open={!!itemEdit.open}
      onClose={onClose}
      title={itemEdit.name}
      description="Кількість і одиниці (порожньо — прибрати)"
      panelClassName="nutrition-sheet"
      zIndex={120}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <SectionHeading
            as="div"
            size="xs"
            variant="nutrition"
            className="mb-1"
          >
            Кількість
          </SectionHeading>
          <Input
            value={itemEdit.qty}
            onChange={(e) =>
              setItemEdit((s) => ({ ...s, qty: e.target.value, err: "" }))
            }
            inputMode="decimal"
            placeholder="напр. 2.5"
            aria-label="Кількість"
          />
        </div>
        <div>
          <SectionHeading
            as="div"
            size="xs"
            variant="nutrition"
            className="mb-1"
          >
            Одиниця
          </SectionHeading>
          <Input
            value={itemEdit.unit}
            onChange={(e) =>
              setItemEdit((s) => ({ ...s, unit: e.target.value, err: "" }))
            }
            placeholder="г / кг / мл / л / шт"
            aria-label="Одиниця"
          />
        </div>
      </div>

      {itemEdit.err ? (
        <div className="text-xs text-danger mt-2">{itemEdit.err}</div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button
          type="button"
          className="h-12 min-h-[44px] bg-nutrition-strong text-white hover:bg-nutrition-hover"
          onClick={() => {
            const qtyStr = String(itemEdit.qty || "").trim();
            const unitStr = String(itemEdit.unit || "").trim();
            const qty = qtyStr === "" ? null : Number(qtyStr.replace(",", "."));
            if (qtyStr !== "" && !Number.isFinite(qty)) {
              setItemEdit((s) => ({ ...s, err: "Некоректна кількість." }));
              return;
            }
            const unit = unitStr === "" ? null : normalizeUnit(unitStr);
            onSave(itemEdit.idx, Number.isFinite(qty) ? qty : null, unit);
          }}
        >
          Зберегти
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-12 min-h-[44px]"
          onClick={onClose}
        >
          Скасувати
        </Button>
      </div>
    </Sheet>
  );
}
