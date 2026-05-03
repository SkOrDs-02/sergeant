import { Sheet } from "@shared/components/ui/Sheet";
import { mergeExpenseCategoryDefinitions } from "../../constants";

export interface TransactionsBatchToolbarProps {
  selectMode: boolean;
  selectedSize: number;
  onOpenCatPicker: () => void;
  onApplyHide: () => void;
  onApplyExclude: () => void;
  batchCatPicker: boolean;
  onCloseCatPicker: () => void;
  onApplyCategory: (catId: string) => void;
  customCategories: Parameters<typeof mergeExpenseCategoryDefinitions>[0];
}

/**
 * Floating bottom toolbar that appears while the user is in batch
 * select-mode, plus the bottom-sheet category picker that opens from
 * its "Категорія" action. Both pieces share the same enter / exit
 * lifecycle, so they live together.
 *
 * Visibility:
 *   - the toolbar renders only when `selectMode === true`;
 *   - action buttons render only when at least one row is selected
 *     (so an empty selection shows just the prompt);
 *   - the sheet is independently mounted because its open-state
 *     overlaps with select-mode but is not the same.
 */
export function TransactionsBatchToolbar({
  selectMode,
  selectedSize,
  onOpenCatPicker,
  onApplyHide,
  onApplyExclude,
  batchCatPicker,
  onCloseCatPicker,
  onApplyCategory,
  customCategories,
}: TransactionsBatchToolbarProps) {
  return (
    <>
      {selectMode && (
        <div className="fixed bottom-0 left-0 right-0 z-60 safe-area-pb">
          <div className="max-w-4xl mx-auto px-4 pb-[calc(60px+env(safe-area-inset-bottom,0)+0.5rem)] pt-3">
            <div className="bg-panel border border-line rounded-2xl shadow-float px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-style-label text-text">
                {selectedSize > 0
                  ? `${selectedSize} обрано`
                  : "Оберіть транзакції"}
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {selectedSize > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={onOpenCatPicker}
                      className="text-style-label px-4 py-2 rounded-xl bg-primary text-bg min-h-[40px] transition-colors"
                    >
                      Категорія
                    </button>
                    <button
                      type="button"
                      onClick={onApplyHide}
                      className="text-style-label px-4 py-2 rounded-xl border border-line bg-panelHi text-text min-h-[40px] transition-colors hover:border-muted"
                    >
                      Приховати
                    </button>
                    <button
                      type="button"
                      onClick={onApplyExclude}
                      className="text-style-label px-4 py-2 rounded-xl border border-line bg-panelHi text-text min-h-[40px] transition-colors hover:border-muted"
                    >
                      Зі статистики
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <Sheet
        open={batchCatPicker}
        onClose={onCloseCatPicker}
        title="Вибрати категорію"
        description={`Застосується до ${selectedSize} транзакц${selectedSize === 1 ? "ії" : "ій"}`}
        panelClassName="finyk-sheet"
        zIndex={70}
        bodyClassName="px-4 pb-6 flex flex-col gap-1"
      >
        {mergeExpenseCategoryDefinitions(customCategories)
          .filter((c) => c.id !== "income")
          .map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onApplyCategory(cat.id)}
              className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-panelHi transition-colors min-h-[48px]"
            >
              <span className="text-lg">
                {(cat as { emoji?: string }).emoji}
              </span>
              <span className="text-style-label text-text">{cat.label}</span>
            </button>
          ))}
      </Sheet>
    </>
  );
}
