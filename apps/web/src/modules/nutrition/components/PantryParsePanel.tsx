/**
 * Last validated: 2026-08-02
 * Status: Active
 *
 * Два допоміжні блоки режиму «Списком» у Коморі:
 * - `PantryListGuide` — згортка з правилами запису (нативний `<details>`,
 *   тому нуль стану і нуль записів у localStorage);
 * - `PantryParsePreview` — підтвердження розібраних позицій перед тим,
 *   як вони потраплять у комору.
 */
import { useState } from "react";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import type { PantryItem } from "../lib/pantryTextParser";
import type { PantryParsePreview as PantryParsePreviewData } from "../hooks/useNutritionPantries";

function formatQty(item: PantryItem): string {
  if (item.qty != null && item.unit) return `${item.qty} ${item.unit}`;
  if (item.qty != null) return String(item.qty);
  return item.unit || "";
}

const GUIDE = messages.nutrition.pantryGuide;
const PREVIEW = messages.nutrition.pantryPreview;

export function PantryListGuide() {
  return (
    <details className="mt-2 group">
      <summary className="text-style-caption text-subtle cursor-pointer list-none flex items-center gap-1.5 min-h-[44px] focus-visible:ring-2 focus-visible:ring-focus/45 rounded-xl">
        <span aria-hidden className="transition-transform group-open:rotate-90">
          ›
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
}

export function PantryParsePreview({
  preview,
  onConfirm,
  onDismiss,
  busy,
}: PantryParsePreviewProps) {
  const [excluded, setExcluded] = useState<Set<number>>(() => new Set());

  // Новий розбір приходить у той самий змонтований блок — знята галочка
  // з попереднього результату не повинна тихо викидати позицію з нового.
  const [prevPreview, setPrevPreview] = useState(preview);
  if (prevPreview !== preview) {
    setPrevPreview(preview);
    setExcluded(new Set());
  }

  const selected = preview.items.filter((_, i) => !excluded.has(i));

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
          const qty = formatQty(item);
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
                  <span className="text-xs text-subtle shrink-0">{qty}</span>
                )}
              </label>
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
