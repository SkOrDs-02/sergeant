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
 * Три останні чеки, не архів. Одного не вистачало рівно в той день, коли
 * рядок потрібен найбільше: купив зранку, купив увечері, сів вносити
 * увечері — і ранкова покупка вже недосяжна (звіт власника 2026-08-31).
 * Ціна — три detail-запити на відкриття аркуша замість одного, і ті
 * діляться кешем із секцією чека в деталях транзакції.
 *
 * Status: Active
 */
import { useMemo, type Dispatch, type SetStateAction } from "react";
import { mapReceiptItemToCategory } from "@sergeant/finyk-domain/domain";
import { normalizeReceiptItemName } from "@sergeant/nutrition-domain";
import { CollapsibleSection } from "@shared/components/ui/CollapsibleSection";
import { ADD_MEAL_SECTION_KEYS } from "./addMealSections";
import { cn } from "@shared/lib/ui/cn";
import { receiptQtyToGrams } from "@shared/lib/format/receiptQty";
import { messages } from "@shared/i18n/uk";
import { useSilpoSyncState } from "@finyk/hooks/useSilpoSyncState";
import {
  useSilpoReceipts,
  useSilpoReceiptDetails,
} from "@finyk/hooks/useSilpoReceipts";
import type { MealFormState } from "./mealFormUtils";

/** Довший рядок чіпсів гортати довше, ніж набрати назву. */
const MAX_CHIPS = 12;

/** Покупки того самого дня: ранкова й вечірня ходки плюс запас. */
const RECENT_RECEIPTS = 3;

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
  /**
   * Позиція обрана — аркуш підхопить перший результат пошуку карткою з
   * КБЖУ. Тут лише сигнал: сам вибір продукту робить `AddMealSheet`, бо
   * результати пошуку живуть у нього, а не в цьому рядку.
   */
  onPicked: (query: string) => void;
}

export function FromReceiptRow({
  enabled,
  setForm,
  setFoodQuery,
  setPickedGrams,
  onPicked,
}: FromReceiptRowProps) {
  const { status } = useSilpoSyncState({ enabled });
  const connected = enabled && status === "connected";

  // Той самий тихий degrade, що в `SilpoPantryReplenishEntry`: без
  // звʼязаної інтеграції рядок не рендериться і мережу не чіпає.
  const { receipts } = useSilpoReceipts(
    { limit: RECENT_RECEIPTS },
    { enabled: connected },
  );
  const receiptIds = useMemo(
    () => (connected ? receipts.map((r) => r.receiptId) : []),
    [connected, receipts],
  );
  const details = useSilpoReceiptDetails(receiptIds);

  const rows = useMemo(() => {
    // Чеки йдуть від найсвіжішого, тож перше входження назви — найсвіжіша
    // покупка: саме її вага й потрібна, якщо той самий товар брали двічі.
    const seen = new Set<string>();
    const items = details.flatMap((d) => d.items ?? []);
    return (
      items
        .filter((item) => {
          const key = normalizeReceiptItemName(item.name).toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
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
  }, [details]);

  if (!connected || rows.length === 0) return null;

  return (
    <CollapsibleSection
      storageKey={ADD_MEAL_SECTION_KEYS.receipt}
      title={messages.nutrition.fromReceipt}
      defaultOpen={false}
      collapsedSubtitle={`${rows.length} позицій`}
      className="mb-4"
    >
      <div className="rounded-2xl border border-line bg-panel/40 px-3 py-3">
        <div className="flex flex-wrap gap-1.5">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => {
                setForm((s) => ({ ...s, name: row.name, err: "" }));
                setFoodQuery(row.query);
                if (row.grams != null) setPickedGrams(String(row.grams));
                onPicked(row.query);
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
    </CollapsibleSection>
  );
}
