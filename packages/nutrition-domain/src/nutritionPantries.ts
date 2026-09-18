/**
 * Pure-операції над складами (pantries). Без `localStorage`.
 */
import type { Pantry } from "./nutritionTypes.js";
import type { PantryItem, PantryItemSource } from "./pantryTextParser.js";

export interface StoragePlace {
  readonly id: string;
  readonly name: string;
}

/**
 * Місця зберігання: комора перестала бути одним контекстом і стала
 * набором місць у межах одного дому.
 *
 * AI-CONTEXT: id тут фіксовані, бо автовизначення місця (`placeForFood`)
 * має куди класти результат, а назву людина може перейменувати будь-коли.
 * Id дефолтного місця лишається `home` — це id наявної комори і в
 * `nutrition_pantries`, і в append-only журналі руху (ADR-0077). Змінити
 * його на `pantry` заради красивішого рядка означало б осиротити історію
 * подій, тобто переписати минуле там, де ADR це прямо забороняє.
 */
export const STORAGE_PLACES: readonly StoragePlace[] = [
  { id: "fridge", name: "Холодильник" },
  { id: "freezer", name: "Морозилка" },
  { id: "home", name: "Комора" },
];

export const DEFAULT_PLACE_ID = "home";

const KNOWN_PLACE_IDS = new Set(STORAGE_PLACES.map((p) => p.id));

/** Легасі-назва дефолтної комори до введення місць зберігання. */
const LEGACY_DEFAULT_NAME = "Дім";

export function isKnownStoragePlace(id: unknown): boolean {
  return KNOWN_PLACE_IDS.has(String(id));
}

export function makeDefaultPantry(): Pantry {
  return { id: DEFAULT_PLACE_ID, name: "Комора", items: [], text: "" };
}

/**
 * Гарантує наявність трьох відомих місць, не рухаючи жодної позиції.
 *
 * Холодильник і морозилка створюються ПОРОЖНІМИ (спека § «Наявні дані не
 * переїжджають мовчки»): розкладання наявного запасу — окрема дія людини,
 * бо в append-only ledger-і це подія історії, а не косметика.
 */
export function ensureStoragePlaces(
  raw: Pantry[] | null | undefined,
): Pantry[] {
  const arr = Array.isArray(raw) ? raw : [];
  const byId = new Map(arr.map((p) => [p.id, p]));
  const known = STORAGE_PLACES.map((place): Pantry => {
    const existing = byId.get(place.id);
    if (!existing)
      return { id: place.id, name: place.name, items: [], text: "" };
    // Перейменування від людини лишається; переїжджає лише легасі-дефолт.
    return existing.name === LEGACY_DEFAULT_NAME
      ? { ...existing, name: place.name }
      : existing;
  });
  return [...known, ...arr.filter((p) => !KNOWN_PLACE_IDS.has(p.id))];
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
