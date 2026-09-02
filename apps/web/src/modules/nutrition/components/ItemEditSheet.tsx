/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import type { Dispatch, SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Input } from "@shared/components/ui/Input";
import { Button } from "@shared/components/ui/Button";
import { Sheet } from "@shared/components/ui/Sheet";
import { normalizeUnit } from "../lib/pantryTextParser";
import { normalizeAmountInput } from "@shared/lib/format/amount";
import { NAME_MAX_LEN } from "@shared/lib/text/limits";
import type { Pantry } from "@sergeant/nutrition-domain";

/** Абсурдна кількість позиції — межа проти зайвого нуля, не дієтологія. */
const MAX_ITEM_QTY = 100_000;

export interface ItemEditState {
  open: boolean;
  idx: number;
  name: string;
  qty: string;
  unit: string;
  err: string;
  /** Місце, у якому позиція лежить зараз. Порожньо — легасі-шлях тексту. */
  pantryId: string;
}

interface ItemEditSheetProps {
  itemEdit: ItemEditState;
  setItemEdit: Dispatch<SetStateAction<ItemEditState>>;
  onClose: () => void;
  onSave: (
    idx: number,
    name: string | null,
    qty: number | null,
    unit: string | null,
    pantryId: string | null,
  ) => void;
  /** Місця зберігання — для перемикача нижче. */
  places: readonly Pantry[];
}

export function ItemEditSheet({
  itemEdit,
  setItemEdit,
  onClose,
  onSave,
  places,
}: ItemEditSheetProps) {
  return (
    <Sheet
      open={!!itemEdit.open}
      onClose={onClose}
      title={itemEdit.name}
      description="Назва, кількість і одиниці (порожньо: прибрати)"
      panelClassName="nutrition-sheet"
      zIndex={120}
    >
      {/* Поле назви — виправлення помилки згортання чи категоризації за
          два тапи. До 2026-08-29 назва тільки виводилась у заголовку, тож
          єдиним способом її поправити було видалити позицію і створити
          заново, втративши залишок. */}
      <div className="mb-3">
        <SectionHeading as="div" size="xs" variant="nutrition" className="mb-1">
          Назва
        </SectionHeading>
        <Input
          value={itemEdit.name}
          onChange={(e) =>
            setItemEdit((s) => ({ ...s, name: e.target.value, err: "" }))
          }
          placeholder="напр. Молоко"
          maxLength={NAME_MAX_LEN}
          showCharCount={false}
          aria-label="Назва"
        />
      </div>

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
            maxLength={12}
            showCharCount={false}
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
            maxLength={16}
            showCharCount={false}
            aria-label="Одиниця"
          />
        </div>
      </div>

      {/*
        Місце живе тут, а не в рядку списку. Перемикач у КОЖНОМУ рядку
        рябів дужче за самі продукти і сперечався з назвою за ширину
        (звіт власника 2026-09-02); список має відповідати на «що в мене
        є», а «де воно лежить» — це вже про одну конкретну позицію, тобто
        рівно та розмова, яку веде цей аркуш.
      */}
      {itemEdit.pantryId && places.length > 1 && (
        <div className="mt-3">
          <SectionHeading
            as="div"
            size="xs"
            variant="nutrition"
            className="mb-1"
          >
            Місце
          </SectionHeading>
          <select
            value={itemEdit.pantryId}
            onChange={(e) =>
              setItemEdit((st) => ({ ...st, pantryId: e.target.value }))
            }
            aria-label="Місце зберігання позиції"
            className="input-focus-nutrition w-full min-h-[44px] rounded-2xl bg-panel border border-line px-3 text-style-label text-text"
          >
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || "Комора"}
              </option>
            ))}
          </select>
        </div>
      )}

      {itemEdit.err ? (
        <div className="text-style-caption text-danger-strong dark:text-danger mt-2">
          {itemEdit.err}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button
          type="button"
          className="h-12 min-h-[44px] bg-nutrition-strong text-white hover:bg-nutrition-hover"
          onClick={() => {
            const nameStr = String(itemEdit.name || "").trim();
            if (!nameStr) {
              setItemEdit((s) => ({ ...s, err: "Впиши назву продукту." }));
              return;
            }
            const qtyStr = String(itemEdit.qty || "").trim();
            const unitStr = String(itemEdit.unit || "").trim();
            // Кома — норма на UA-клавіатурі, тож нормалізуємо так само,
            // як усюди; вручну відсікаємо Infinity, відʼємне й абсурдну
            // кількість (спека beta-input-boundaries).
            const qty =
              qtyStr === "" ? null : Number(normalizeAmountInput(qtyStr));
            if (
              qtyStr !== "" &&
              (!Number.isFinite(qty) ||
                (qty as number) < 0 ||
                (qty as number) > MAX_ITEM_QTY)
            ) {
              setItemEdit((s) => ({ ...s, err: "Некоректна кількість." }));
              return;
            }
            const unit = unitStr === "" ? null : normalizeUnit(unitStr);
            // Місце їде разом зі «Зберегти», а не одразу при виборі: поруч
            // стоїть «Скасувати», і переїзд, який уже стався, зробив би цю
            // кнопку брехнею.
            onSave(
              itemEdit.idx,
              nameStr,
              Number.isFinite(qty) ? qty : null,
              unit,
              itemEdit.pantryId || null,
            );
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
