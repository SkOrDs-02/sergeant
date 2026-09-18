import { Sheet } from "@shared/components/ui/Sheet";
import { mergeExpenseCategoryDefinitions } from "../../constants";
import { CategoryIconChip } from "../../components/CategoryIconChip";
import { isCategoryIdLike } from "../../lib/categoryChip";
import { stripLeadingEmoji } from "../../components/txRowHelpers";

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
 *   - the toolbar renders only once at least one row is selected — the
 *     empty-selection "обери транзакції" hint moved inline into
 *     `TransactionsHeader` (A6/B4) so it no longer floats over content
 *     with nothing to act on;
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
      {selectMode && selectedSize > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-60 safe-area-pb">
          {/* Clears the nav: 60px track + 0.375rem shell top padding
              (round-3 UI audit — reverted the round-2 2*env() term together
              with the shell's env() top mirror) + 0.5rem breathing room;
              the outer `safe-area-pb` already covers the nav's bottom
              inset. */}
          <div className="max-w-4xl mx-auto px-4 pb-[calc(60px+0.375rem+0.5rem)] pt-3">
            <div className="bg-panel border border-line rounded-2xl shadow-float px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-style-label text-text">
                {selectedSize} обрано
              </span>
              <div className="flex items-center gap-2 flex-wrap">
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
                  className="text-style-label touch-target px-4 py-2 rounded-xl border border-line bg-panelHi text-text transition-colors hover:border-muted"
                >
                  Приховати
                </button>
                <button
                  type="button"
                  onClick={onApplyExclude}
                  aria-label="Не враховувати у статистиці"
                  className="text-style-label px-4 py-2 rounded-xl border border-line bg-panelHi text-text min-h-[40px] transition-colors hover:border-muted"
                >
                  Не враховувати
                </button>
              </div>
            </div>
            <div className="mt-2 rounded-xl border border-line bg-panelHi px-3 py-2 text-style-body text-muted">
              <p>
                <strong className="text-text">Приховати</strong>: прибере
                операції зі звичайного списку, але їх можна повернути в
                «Прихованих».
              </p>
              <p className="mt-1">
                <strong className="text-text">Не враховувати</strong>: залишить
                операції у списку, але не включатиме їх у підсумки та графіки.
              </p>
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
              {/*
                Тут стояв слот під емодзі категорії — `<span className="text-lg">`
                із `(cat as { emoji?: string }).emoji`. Він не міг нічого
                показати: `mergeExpenseCategoryDefinitions` збирає результат
                із власних літералів `{ id, label, mccs, keywords }`
                (finyk-domain/constants.ts), тож поле `emoji` втрачається на
                мерджі, а каст приховував це від типів. Тобто рендерився
                порожній flex-елемент, який через `gap-3` давав кожному рядку
                12px відступу зліва ні за що. З 2026-08-21 слот заповнює
                той самий чип, що й у рядку транзакції.
              */}
              <CategoryIconChip
                categoryId={cat.id}
                customCategories={customCategories?.filter(isCategoryIdLike)}
                size={24}
              />
              <span className="text-style-label text-text">
                {stripLeadingEmoji(cat.label)}
              </span>
            </button>
          ))}
      </Sheet>
    </>
  );
}
