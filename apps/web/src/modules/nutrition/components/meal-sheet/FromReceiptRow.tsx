/**
 * FromReceiptRow — позиції останнього чека Сільпо як джерело прийому їжі.
 *
 * AI-CONTEXT: третій рядок-джерело у вкладці «Пошук», поруч із шаблонами
 * (`MealTemplatesRow`) і коморою (`FromPantryRow`) — той самий рух «узяти
 * вже відоме». НЕ окрема вкладка: `SourceTabs` це `grid-cols-4` з 44px
 * підлогою, пʼята колонка ламає touch-target на вузьких екранах.
 *
 * Відрізняється від комори тим, що дає ВАГУ, а не лише назву: чек знає і
 * фасування («330г»), і вагу вагового товару («0.212 кг»). Саме вага й
 * економить руки — назву людина набрала б і сама.
 *
 * Вага підставляється не завжди: `receiptQtyToGrams` мовчить на закупівлі
 * («1 кг яблук»), обʼємі та штучних юнітах — краще порожнє поле, ніж
 * вгадане.
 *
 * ponytail: один останній чек, не архів. Кулінарію їдять того ж дня, коли
 * купили; знадобиться глибше — бери N чеків і зливай позиції, але це вже
 * N detail-запитів на кожне відкриття аркуша.
 *
 * Status: Active
 */
import { useMemo, type Dispatch, type SetStateAction } from "react";
import { mapReceiptItemToCategory } from "@sergeant/finyk-domain/domain";
import { normalizeReceiptItemName } from "@sergeant/nutrition-domain";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { cn } from "@shared/lib/ui/cn";
import { receiptQtyToGrams } from "@shared/lib/format/receiptQty";
import { messages } from "@shared/i18n/uk";
import { useSilpoSyncState } from "@finyk/hooks/useSilpoSyncState";
import {
  useSilpoReceipts,
  useSilpoReceiptDetail,
} from "@finyk/hooks/useSilpoReceipts";
import type { MealFormState } from "./mealFormUtils";

/** Довший рядок чіпсів гортати довше, ніж набрати назву. */
const MAX_CHIPS = 12;

interface FromReceiptRowProps {
  /**
   * `false` — не робимо жодного мережевого запиту. Гейт потрібен, бо
   * `useSilpoSyncState` має `staleTime` лише 30 c і `refetchOnWindowFocus`,
   * тож без нього кожен вхід у крок джерела бив би `sync-state` навіть у
   * тих, хто Сільпо не звʼязував.
   */
  enabled: boolean;
  setForm: Dispatch<SetStateAction<MealFormState>>;
  setFoodQuery: Dispatch<SetStateAction<string>>;
  setPickedGrams: Dispatch<SetStateAction<string>>;
}

export function FromReceiptRow({
  enabled,
  setForm,
  setFoodQuery,
  setPickedGrams,
}: FromReceiptRowProps) {
  const { status } = useSilpoSyncState({ enabled });
  const connected = enabled && status === "connected";

  // Той самий тихий degrade, що в `SilpoPantryReplenishEntry`: без
  // звʼязаної інтеграції рядок не рендериться і мережу не чіпає.
  const { receipts } = useSilpoReceipts({ limit: 1 }, { enabled: connected });
  const receiptId = connected ? (receipts[0]?.receiptId ?? null) : null;
  const detail = useSilpoReceiptDetail(receiptId);

  const rows = useMemo(() => {
    const items = detail.data?.items ?? [];
    return (
      items
        // Побутова хімія й аптека — не їжа. Мапер той самий, що вже
        // фільтрує позиції в `SilpoPantryReplenishSheet`.
        .filter((item) => mapReceiptItemToCategory(item) === "groceries")
        .map((item) => ({
          id: item.id,
          name: item.name,
          // У пошук іде ОЧИЩЕНА назва: «Молоко Яготинське 2.6% 900г» як
          // запит до каталогу гірший за «Молоко Яготинське» — пакувальні
          // токени звужують видачу до нуля. У полі назви лишається те, що
          // надруковано в чеку: людина має впізнати свою покупку.
          query: normalizeReceiptItemName(item.name),
          grams: receiptQtyToGrams(item.qty, item.unit),
        }))
        .slice(0, MAX_CHIPS)
    );
  }, [detail.data]);

  if (!connected || rows.length === 0) return null;

  return (
    <div className="mb-4 rounded-2xl border border-line bg-panel/40 px-3 py-3">
      <SectionHeading as="div" size="xs" variant="nutrition" className="mb-2">
        {messages.nutrition.fromReceipt}
      </SectionHeading>
      <div className="flex flex-wrap gap-1.5">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => {
              setForm((s) => ({ ...s, name: row.name, err: "" }));
              setFoodQuery(row.query);
              if (row.grams != null) setPickedGrams(String(row.grams));
            }}
            className={cn(
              "px-2.5 py-1.5 rounded-xl text-style-caption border",
              "transition-[background-color,border-color,color]",
              "bg-panelHi text-text border-line hover:border-nutrition/50",
            )}
          >
            {row.name}
            {row.grams != null && (
              <span className="ml-1 text-style-caption opacity-70">
                {row.grams} {messages.nutrition.gramsShort}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
