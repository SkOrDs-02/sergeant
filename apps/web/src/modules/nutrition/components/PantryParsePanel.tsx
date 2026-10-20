/**
 * Last validated: 2026-09-01
 * Status: Active
 *
 * Два допоміжні блоки режиму «Списком» у Коморі:
 * - `PantryListGuide` — згортка з правилами запису (нативний `<details>`,
 *   тому нуль стану і нуль записів у localStorage; стан показує шеврон);
 * - `PantryParsePreview` — підтвердження розібраних позицій перед тим,
 *   як вони потраплять у комору.
 *
 * UX-4 (аудит 2026-09-01): рядки з `ambiguousQty` (голе хвостове число без
 * одиниці ≥ порога — «Нутелла 350») несуть інлайн-вибір «шт»/«г» ПРЯМО в
 * рядку, а не окрему модалку. Це навмисно: у списку може одночасно
 * зʼявитись кілька неоднозначних позицій, і жодна з них не має блокувати
 * підтвердження решти — «Додати N» лишається доступним із дефолтом «шт»,
 * доки людина не тапне.
 */
import { useId, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { ChoiceCheckbox, ChoiceGroup } from "@shared/components/ui/Choice";
import { MorphChevron } from "@shared/components/ui/MorphChevron";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import type { PantryItem } from "../lib/pantryTextParser";
import type { PantryParsePreview as PantryParsePreviewData } from "../hooks/useNutritionPantries";
import type { AmbiguousPantryUnit } from "../lib/pantryAmbiguousUnitMemory";

function formatQty(item: PantryItem): string {
  if (item.qty != null && item.unit) return `${item.qty} ${item.unit}`;
  if (item.qty != null) return String(item.qty);
  return item.unit || "";
}

const GUIDE = messages.nutrition.pantryGuide;
const PREVIEW = messages.nutrition.pantryPreview;
const AMBIGUOUS = messages.nutrition.pantryAmbiguousQty;
const UNIT_CTA: Record<AmbiguousPantryUnit, string> = {
  шт: AMBIGUOUS.piecesCta,
  г: AMBIGUOUS.gramsCta,
};
const UNITS = Object.keys(UNIT_CTA) as AmbiguousPantryUnit[];

export function PantryListGuide() {
  return (
    <details className="mt-2 group">
      <summary className="text-style-caption text-subtle cursor-pointer list-none flex items-center justify-between gap-2 min-h-[44px] rounded-lg focus-ring">
        {GUIDE.summary}
        <MorphChevron
          open={false}
          className="text-subtle group-open:rotate-90"
        />
      </summary>
      <div className="mt-1 text-style-caption text-subtle grid gap-1">
        <p>
          {GUIDE.separators}{" "}
          <span className="text-text">{GUIDE.separatorsExample}</span>
        </p>
        <p>
          {GUIDE.qtyPlacement}{" "}
          <span className="text-text">{GUIDE.qtyExampleLeading}</span>
          {", "}
          <span className="text-text">{GUIDE.qtyExampleTrailing}</span>
        </p>
        <p>
          {GUIDE.unitsLabel}{" "}
          <span className="text-text">{GUIDE.unitsList}</span>
          {". "}
          {GUIDE.unitsFallback}
        </p>
        <p>{GUIDE.aiNote}</p>
        <p>{GUIDE.confirmNote}</p>
      </div>
    </details>
  );
}

interface PantryParsePreviewProps {
  preview: PantryParsePreviewData;
  onConfirm: (items: PantryItem[]) => void;
  onDismiss: () => void;
  busy: boolean;
  /**
   * Викликається одразу на тап «шт»/«г» для неоднозначного рядка (не чекає
   * «Додати N») — вибір запамʼятовується для продукту незалежно від того,
   * підтвердить людина решту списку чи скасує його.
   */
  onResolveAmbiguousUnit?: (
    item: PantryItem,
    unit: AmbiguousPantryUnit,
  ) => void;
}

export function PantryParsePreview({
  preview,
  onConfirm,
  onDismiss,
  busy,
  onResolveAmbiguousUnit,
}: PantryParsePreviewProps) {
  const countId = useId();
  const [excluded, setExcluded] = useState<Set<number>>(() => new Set());
  const [unitOverrides, setUnitOverrides] = useState<
    Record<number, AmbiguousPantryUnit>
  >({});

  // Новий розбір приходить у той самий змонтований блок — знята галочка
  // (і будь-який раніше обраний «шт»/«г») з попереднього результату не
  // повинна тихо тягнутись у новий.
  const [prevPreview, setPrevPreview] = useState(preview);
  if (prevPreview !== preview) {
    setPrevPreview(preview);
    setExcluded(new Set());
    setUnitOverrides({});
  }

  function chooseUnit(i: number, unit: AmbiguousPantryUnit) {
    setUnitOverrides((cur) => ({ ...cur, [i]: unit }));
    const item = preview.items[i];
    if (item) onResolveAmbiguousUnit?.(item, unit);
  }

  // Підтвердження несе фінальну одиницю (обрану чи дефолтну «шт»), а
  // прапорець неоднозначності далі не тече — комора його не читає.
  const resolvedItems = preview.items.map((item, i) => {
    const override = unitOverrides[i];
    if (!override) return item;
    const { ambiguousQty: _drop, ...rest } = item;
    void _drop;
    return { ...rest, unit: override };
  });
  const selected = resolvedItems.filter((_, i) => !excluded.has(i));

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span id={countId} className="text-style-label text-text">
          {PREVIEW.parsedCount} {preview.items.length}
        </span>
        {preview.source === "local" && (
          <span className="text-style-caption text-subtle">
            {PREVIEW.localFallback}
          </span>
        )}
      </div>

      <ul
        role="group"
        aria-labelledby={countId}
        className="divide-y divide-line mb-3"
      >
        {preview.items.map((item, i) => {
          const resolvedUnit = unitOverrides[i] ?? item.unit;
          const qty = item.ambiguousQty
            ? String(item.qty ?? "")
            : formatQty(item);
          return (
            <li key={`${item.name}_${i}`}>
              <ChoiceCheckbox
                checked={!excluded.has(i)}
                onChange={() =>
                  setExcluded((cur) => {
                    const next = new Set(cur);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    return next;
                  })
                }
                label={
                  <span className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-style-label text-text",
                        excluded.has(i) && "line-through opacity-50",
                      )}
                    >
                      {item.name}
                    </span>
                    {qty && (
                      <span className="shrink-0 text-style-caption text-subtle">
                        {qty}
                      </span>
                    )}
                    {item.ambiguousQty && (
                      <span className="shrink-0 text-style-caption text-muted">
                        {AMBIGUOUS.badge}
                      </span>
                    )}
                  </span>
                }
              />
              {item.ambiguousQty && (
                // Відступ = позначка рядка: `px-3` (12) + 20 + `gap-3` (12).
                <div className="flex items-center gap-2 pb-2 pl-11">
                  <span className="text-style-caption text-subtle">
                    {AMBIGUOUS.question}
                  </span>
                  <ChoiceGroup
                    size="sm"
                    ariaLabel={`${item.name}: ${AMBIGUOUS.question}`}
                    value={UNITS.find((u) => u === resolvedUnit) ?? null}
                    onChange={(unit) => chooseUnit(i, unit)}
                    items={UNITS.map((unit) => ({
                      value: unit,
                      label: `${item.qty} ${UNIT_CTA[unit]}`,
                    }))}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="solid"
          onClick={() => onConfirm(selected)}
          disabled={busy || selected.length === 0}
          className="pointer-coarse:min-h-[44px]"
        >
          {PREVIEW.confirm} {selected.length}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDismiss}
          disabled={busy}
          className="pointer-coarse:min-h-[44px]"
        >
          {PREVIEW.dismiss}
        </Button>
      </div>
    </div>
  );
}
