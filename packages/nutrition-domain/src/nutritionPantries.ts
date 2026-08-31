/**
 * Pure-операції над складами (pantries). Без `localStorage`.
 */
import type { Pantry } from "./nutritionTypes.js";
import type { PantryItem, PantryItemSource } from "./pantryTextParser.js";

export function makeDefaultPantry(): Pantry {
  return { id: "home", name: "Дім", items: [], text: "" };
}

/**
 * Варіанти позиції (картка продукту). Запис без придатної кількості
 * відкидається: він зламав би інваріант «сума варіантів = кількість
 * позиції», а мовчазний нуль у списку виглядав би як вичерпана покупка.
 */
function sanitizePantrySources(raw: unknown): PantryItemSource[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PantryItemSource[] = [];
  for (const s of raw as unknown[]) {
    if (!s || typeof s !== "object") continue;
    const r = s as Record<string, unknown>;
    const name = String(r["name"] || "").trim();
    const qty = Number(r["qty"]);
    const unit = r["unit"] == null ? "" : String(r["unit"]).trim();
    if (!name || !unit || !Number.isFinite(qty) || qty <= 0) continue;
    const packCount = Number(r["packCount"]);
    out.push({
      name,
      qty,
      unit,
      addedAt: r["addedAt"] == null ? null : String(r["addedAt"]),
      packCount:
        Number.isInteger(packCount) && packCount > 1 ? packCount : null,
    });
  }
  return out.length > 0 ? out : null;
}

function sanitizePantryItem(raw: unknown): PantryItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = String(r["name"] || "").trim();
  if (!name) return null;
  const qtyNum = Number(r["qty"]);
  const qty = r["qty"] == null || !Number.isFinite(qtyNum) ? null : qtyNum;
  return {
    name,
    qty,
    unit: r["unit"] == null ? null : String(r["unit"]),
    notes: r["notes"] == null ? null : String(r["notes"]),
    sources: sanitizePantrySources(r["sources"]),
  };
}

export function normalizePantries(raw: unknown): Pantry[] {
  if (!Array.isArray(raw)) return [];
  const out: Pantry[] = [];
  const seenIds = new Set<string>();
  for (const p of raw as unknown[]) {
    if (!p || typeof p !== "object") continue;
    const rp = p as Record<string, unknown>;
    let id = rp["id"] != null ? String(rp["id"]).trim() : "";
    if (!id || seenIds.has(id)) id = `p_${Date.now()}_${out.length}`;
    seenIds.add(id);
    const name = String(rp["name"] || "Комора").trim() || "Комора";
    const items = Array.isArray(rp["items"])
      ? (rp["items"] as unknown[])
          .map(sanitizePantryItem)
          .filter((x): x is PantryItem => x != null)
      : [];
    const text = rp["text"] == null ? "" : String(rp["text"]);
    out.push({ id, name, items, text });
  }
  return out;
}

export function updatePantry(
  pantries: Pantry[] | null | undefined,
  activeId: string | null | undefined,
  fn: (p: Pantry) => Pantry,
): Pantry[] {
  const arr = Array.isArray(pantries) ? pantries : [];
  const id = String(activeId || "home");
  const idx = arr.findIndex((p) => p.id === id);
  if (idx === -1) {
    const created = fn(makeDefaultPantry());
    return [created, ...arr];
  }
  const next = [...arr];
  // `idx >= 0` гарантує існування — strip-имо `undefined` через `!`,
  // бо runtime-fallback (e.g. `makeDefaultPantry()`) seedав би неправильний
  // pantry-id і користувач втратив би state на наступному пасі.
  next[idx] = fn(next[idx]!);
  return next;
}
