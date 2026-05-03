import { safeRemoveLS } from "@shared/lib/storage/storage";
import type { ImportMonobankRangeAction, ChatActionResult } from "../types";

export function importMonobankRange(
  action: ImportMonobankRangeAction,
): ChatActionResult {
  const { from, to } = action.input;
  const fromStr = String(from || "").trim();
  const toStr = String(to || "").trim();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(fromStr) || !dateRe.test(toStr))
    return "Дати мають бути у форматі YYYY-MM-DD.";
  const fromD = new Date(`${fromStr}T00:00:00`);
  const toD = new Date(`${toStr}T00:00:00`);
  if (
    !Number.isFinite(fromD.getTime()) ||
    !Number.isFinite(toD.getTime()) ||
    fromD > toD
  ) {
    return "Некоректний діапазон дат.";
  }
  const clearedMonths: string[] = [];
  const cur = new Date(fromD.getFullYear(), fromD.getMonth(), 1);
  const end = new Date(toD.getFullYear(), toD.getMonth(), 1);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m0 = cur.getMonth();
    try {
      safeRemoveLS(`finyk_tx_cache_${y}_${m0}`);
    } catch {}
    clearedMonths.push(`${y}-${String(m0 + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  try {
    if (typeof window !== "undefined" && typeof CustomEvent === "function") {
      window.dispatchEvent(
        new CustomEvent("hub:finyk-mono-import-range", {
          detail: { from: fromStr, to: toStr },
        }),
      );
    }
  } catch {}
  return `Запит на оновлення Монобанку з ${fromStr} до ${toStr} прийнято. Очищено кеш за ${clearedMonths.length} міс. (${clearedMonths.join(", ")}). Оновиться при відкритті Фініка.`;
}
