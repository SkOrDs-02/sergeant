/**
 * Last validated: 2026-09-01
 * Status: Active
 *
 * Два допоміжні блоки режиму «Списком» у Коморі:
 * - `PantryListGuide` — згортка з правилами запису (нативний `<details>`,
 *   тому нуль стану і нуль записів у localStorage);
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
import { useState } from "react";
import { Icon } from "@shared/components/ui/Icon";
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

export function PantryListGuide() {
  return (
    <details className="mt-2 group">
      <summary className="text-style-caption text-subtle cursor-pointer list-none flex items-center gap-1.5 min-h-[44px] focus-visible:ring-2 focus-visible:ring-focus/45 rounded-xl">
        {/* Каретка згортки. Обертання лишається на обгортці, а не на самій
            іконці: `<details>` міняє `group-open`, і поворот має читати
            стан елемента, а не стан іконки. */}
        <span aria-hidden className="transition-transform group-open:rotate-90">
          <Icon name="chevron-right" size="xs" />
        </span>
        {GUIDE.summary}
      </summary>
      <div className="mt-1 pl-4 text-style-caption text-subtle grid gap-1">
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
    <div className="mt-3 rounded-2xl border border-nutrition/30 bg-nutrition/5 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-style-label text-text">
          {PREVIEW.parsedCount} {preview.items.length}
        </span>
        {preview.source === "local" && (
          <span className="text-style-caption text-subtle">
            {PREVIEW.localFallback}
          </span>
        )}
      </div>

      <ul className="grid gap-0.5 mb-3">
        {preview.items.map((item, i) => {
          const resolvedUnit = unitOverrides[i] ?? item.unit;
          const qty = item.ambiguousQty
            ? String(item.qty ?? "")
            : formatQty(item);
          return (
            <li key={`${item.name}_${i}`}>
              <label className="flex items-center gap-2.5 px-1 min-h-[44px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={!excluded.has(i)}
                  onChange={() =>
                    setExcluded((cur) => {
                      const next = new Set(cur);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                  className="shrink-0 w-5 h-5 accent-nutrition"
                />
                <span
                  className={cn(
                    "text-style-label text-text truncate",
                    excluded.has(i) && "line-through opacity-50",
                  )}
                >
                  {item.name}
                </span>
                {qty && (
                  <span className="text-style-caption text-subtle shrink-0">
                    {qty}
                  </span>
                )}
                {item.ambiguousQty && (
                  <span className="text-style-caption text-warning-strong dark:text-warning shrink-0">
                    {AMBIGUOUS.badge}
                  </span>
                )}
              </label>
              {item.ambiguousQty && (
                <div className="flex items-center gap-2 pl-8 pb-1.5">
                  <span className="text-style-caption text-subtle">
                    {AMBIGUOUS.question}
                  </span>
                  {(["шт", "г"] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => chooseUnit(i, unit)}
                      aria-pressed={resolvedUnit === unit}
                      className={cn(
                        "text-style-caption px-2.5 py-1 min-h-[32px] rounded-xl border transition-colors",
                        resolvedUnit === unit
                          ? "bg-nutrition-strong text-white border-nutrition-strong"
                          : "border-line text-subtle hover:text-text hover:border-nutrition/50",
                      )}
                    >
                      {item.qty}{" "}
                      {unit === "шт" ? AMBIGUOUS.piecesCta : AMBIGUOUS.gramsCta}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onConfirm(selected)}
          disabled={busy || selected.length === 0}
          className={cn(
            "text-style-label px-4 h-11 rounded-2xl",
            "bg-nutrition-strong text-white hover:bg-nutrition-hover disabled:opacity-50 transition-colors",
          )}
        >
          {PREVIEW.confirm} {selected.length}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={busy}
          className="text-style-label px-4 h-11 rounded-2xl text-subtle hover:text-text transition-colors"
        >
          {PREVIEW.dismiss}
        </button>
      </div>
    </div>
  );
}
