/**
 * Last validated: 2026-09-01
 * Status: Active
 *
 * «Шт чи г?» — коли `upsertItem` розбирає голе хвостове число без одиниці
 * ≥ `PANTRY_AMBIGUOUS_QTY_THRESHOLD` (UX-4 аудиту 2026-09-01: «Нутелла 350»
 * мовчки ставало «350 шт», хоча малось на увазі 350 г). Один тап у тому
 * самому потоці додавання «По одному» — не модалка з підтвердженням:
 * позиція нікуди не пишеться, доки людина не обере одиницю, і обидві опції
 * доступні одним дотиком поруч із полем вводу.
 *
 * Список, а не одна картка: `upsertItem` може вкинути кілька неоднозначних
 * позицій за раз (наприклад зі сканера), і кожна чекає своєї відповіді
 * незалежно від інших.
 */
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";
import type { PantryItem } from "../lib/pantryTextParser";
import type { AmbiguousPantryUnit } from "../lib/pantryAmbiguousUnitMemory";

// Доменні значення одиниць (`AmbiguousPantryUnit`), не копія інтерфейсу:
// тримаємо їх поза JSX, щоб i18n-правило не плутало їх із текстом.
const UNIT_PIECES = "шт" as const;
const UNIT_GRAMS = "г" as const;

const COPY = messages.nutrition.pantryAmbiguousQty;

export interface PantryAmbiguousQtyPromptProps {
  items: readonly PantryItem[];
  onResolve: (idx: number, unit: AmbiguousPantryUnit) => void;
  onDismiss: (idx: number) => void;
  busy: boolean;
}

export function PantryAmbiguousQtyPrompt({
  items,
  onResolve,
  onDismiss,
  busy,
}: PantryAmbiguousQtyPromptProps) {
  if (items.length === 0) return null;

  return (
    <ul className="mt-3 grid gap-2">
      {items.map((item, i) => (
        <li
          key={`${item.name}_${item.qty}_${i}`}
          className="rounded-2xl border border-warning/30 bg-warning/5 px-3 py-2"
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="min-w-0 flex items-baseline gap-1.5">
              <span className="text-style-label text-text truncate">
                {item.name}
              </span>
              <span className="text-style-caption text-subtle shrink-0">
                {item.qty}
              </span>
            </span>
            <span className="shrink-0 text-style-caption text-warning-strong dark:text-warning">
              {COPY.badge}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-style-caption text-subtle">
              {COPY.question}
            </span>
            <Button
              type="button"
              variant="outline"
              tone="nutrition"
              size="xs"
              disabled={busy}
              onClick={() => onResolve(i, UNIT_PIECES)}
            >
              {item.qty} {COPY.piecesCta}
            </Button>
            <Button
              type="button"
              variant="outline"
              tone="nutrition"
              size="xs"
              disabled={busy}
              onClick={() => onResolve(i, UNIT_GRAMS)}
            >
              {item.qty} {COPY.gramsCta}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={() => onDismiss(i)}
              className="ml-auto text-subtle"
            >
              {COPY.cancelCta}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
