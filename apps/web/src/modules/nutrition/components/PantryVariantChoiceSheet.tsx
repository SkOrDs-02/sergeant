/**
 * Last validated: 2026-08-29
 * Status: Active
 *
 * «З чого списати?» — вибір варіанта покупки при списанні позиції комори
 * (спека `docs/90-work/planning/specs/pantry-generic-names.md`, рішення 11).
 *
 * AI-CONTEXT: цей аркуш зʼявляється ВСЕРЕДИНІ збереження прийому їжі, тож
 * умова строга — два і більше варіантів. На одному варіанті списання
 * лишається тихим: зайвий діалог у швидкому сценарії дорожчий за точність.
 * Закриття без вибору теж списує (з найстарішого): прийом їжі вже
 * збережено, і «нічого не списати» лишило б комору із завищеним залишком.
 */
import { Sheet } from "@shared/components/ui/Sheet";
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";
import { formatReceiptQty } from "@shared/lib/format/receiptQty";
import type { PantryItemSource } from "@sergeant/nutrition-domain";

const COPY = messages.nutrition.pantrySources;

export interface PantryVariantChoiceSheetProps {
  choice: {
    itemName: string;
    grams: number;
    sources: readonly PantryItemSource[];
  } | null;
  onResolve: (variantName: string | null) => void;
}

export function PantryVariantChoiceSheet({
  choice,
  onResolve,
}: PantryVariantChoiceSheetProps) {
  return (
    <Sheet
      open={!!choice}
      onClose={() => onResolve(null)}
      title={COPY.consumeTitle}
      description={COPY.consumeDescription}
      panelClassName="nutrition-sheet"
      zIndex={140}
    >
      <ul className="grid gap-2">
        {(choice?.sources ?? []).map((s, i) => (
          <li key={`${s.name}_${s.addedAt ?? ""}_${i}`}>
            <button
              type="button"
              onClick={() => onResolve(s.name)}
              className="w-full flex items-center justify-between gap-3 px-4 touch-target py-2.5 rounded-2xl border border-line bg-panel text-left hover:border-nutrition/50 hover:bg-panelHi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutrition/60 transition-colors"
            >
              <span className="min-w-0 grid">
                <span className="min-w-0 text-style-label text-text truncate">
                  {s.name}
                </span>
                <span className="min-w-0 text-style-caption text-subtle truncate">
                  {s.addedAt ?? COPY.unknownAddedAt}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-style-caption text-subtle">
                {formatReceiptQty(s.qty, s.unit)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Button
        type="button"
        variant="ghost"
        className="mt-3 w-full h-12 min-h-[44px]"
        onClick={() => onResolve(null)}
      >
        {COPY.consumeOldestCta}
      </Button>
    </Sheet>
  );
}
