import {
  canonicalFoodKey,
  normalizeFoodName,
  normalizeUnit,
  type PantryItem,
} from "./pantryTextParser.js";

interface BaseUnit {
  base: "г" | "мл" | "шт";
  value: number;
}

function toBaseUnit(qty: unknown, unit: unknown): BaseUnit | null {
  const u = String(unit || "").toLowerCase();
  const q = Number(qty);
  if (!Number.isFinite(q)) return null;
  if (u === "г") return { base: "г", value: q };
  if (u === "кг") return { base: "г", value: q * 1000 };
  if (u === "мл") return { base: "мл", value: q };
  if (u === "л") return { base: "мл", value: q * 1000 };
  if (u === "шт") return { base: "шт", value: q };
  return null;
}

// Convert a base-unit value back to a human-friendly unit, preferring the
// existing pantry entry's unit so що "1 кг борошна" + "200 г" лишається у
// кг, а не перетворюється на 1200 г (M9 з аудиту).
function fromBaseUnit(
  base: BaseUnit,
  preferredUnit: string | null,
): { qty: number; unit: string } {
  const pref = String(preferredUnit || "").toLowerCase();
  if (base.base === "г") {
    if (pref === "кг") return { qty: base.value / 1000, unit: "кг" };
    return { qty: base.value, unit: "г" };
  }
  if (base.base === "мл") {
    if (pref === "л") return { qty: base.value / 1000, unit: "л" };
    return { qty: base.value, unit: "мл" };
  }
  return { qty: base.value, unit: "шт" };
}

function roundNice(n: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return n;
  // 1 знак після коми для невеликих дробів, інакше ціле
  if (Math.abs(x) < 10 && Math.round(x) !== x) return Math.round(x * 10) / 10;
  return Math.round(x);
}

export function mergeItems(
  oldItems: readonly PantryItem[] | unknown,
  newItems: readonly PantryItem[] | unknown,
): PantryItem[] {
  const a = (Array.isArray(oldItems) ? oldItems : []) as PantryItem[];
  const b = (Array.isArray(newItems) ? newItems : []) as PantryItem[];
  const merged: PantryItem[] = [...a];

  for (const it of b) {
    const n = normalizeFoodName(it?.name);
    if (!n) continue;
    const key = canonicalFoodKey(n);

    const rawQty =
      it?.qty != null &&
      it.qty !== ("" as unknown) &&
      Number.isFinite(Number(it.qty))
        ? Number(it.qty)
        : null;
    const rawUnit = it?.unit ? normalizeUnit(it.unit) : null;

    // Гола назва без кількості/одиниці трактується як "1 шт" — це дозволяє
    // сумувати "огірок" з існуючим "огірки 4 шт" так само, як "огірок 1".
    const incomingQty: number | null = rawQty == null && !rawUnit ? 1 : rawQty;
    const incomingUnit: string | null =
      rawQty == null && !rawUnit ? "шт" : rawUnit;

    // Гібрид: сумуємо лише якщо є qty+unit і одиниці сумісні (або однакові)
    if (incomingQty != null && incomingUnit) {
      const baseIncoming = toBaseUnit(incomingQty, incomingUnit);
      if (baseIncoming) {
        const idx = merged.findIndex((x) => {
          const nx = canonicalFoodKey(x?.name);
          if (nx !== key) return false;
          const qx =
            x?.qty != null &&
            (x.qty as unknown) !== "" &&
            Number.isFinite(Number(x.qty))
              ? Number(x.qty)
              : null;
          const ux = x?.unit ? normalizeUnit(x.unit) : null;
          if (qx == null || !ux) return false;
          const baseX = toBaseUnit(qx, ux);
          return !!baseX && baseX.base === baseIncoming.base;
        });

        if (idx >= 0) {
          // `merged[idx]` гарантовано існує всередині `idx >= 0` блоку,
          // але `noUncheckedIndexedAccess` цього не виводить — non-null
          // assertion безпечніший, ніж runtime-fallback (повернув би
          // баг-mask: silent skip злиття одиниць).
          const cur = merged[idx]!;
          const qx = Number(cur.qty);
          const ux = normalizeUnit(cur.unit);
          const baseX = toBaseUnit(qx, ux);
          if (baseX) {
            const totalBase: BaseUnit = {
              base: baseX.base,
              value: baseX.value + baseIncoming.value,
            };
            const out = fromBaseUnit(totalBase, ux);
            merged[idx] = {
              ...cur,
              qty: roundNice(out.qty),
              unit: out.unit,
            };
            continue;
          }
        }
      }
    }

    // Якщо не сумуємо — перевіряємо чи є запис з тим самим (канонічним) ім'ям
    const sameNameIdx = merged.findIndex(
      (x) => canonicalFoodKey(x?.name) === key,
    );

    if (sameNameIdx >= 0) {
      // Аналогічно вище: `findIndex` повернув валідний індекс,
      // отже `merged[sameNameIdx]` є.
      const cur = merged[sameNameIdx]!;
      const curQty =
        cur?.qty != null &&
        (cur.qty as unknown) !== "" &&
        Number.isFinite(Number(cur.qty))
          ? Number(cur.qty)
          : null;
      const curUnit = cur?.unit ? normalizeUnit(cur.unit) : null;

      // Якщо існуючий без qty/unit — замінюємо на новий (з qty/unit має пріоритет)
      if (curQty == null && !curUnit && (incomingQty != null || incomingUnit)) {
        merged[sameNameIdx] = {
          ...cur,
          name: cur.name,
          qty: incomingQty,
          unit: incomingUnit,
          notes: cur.notes ?? it?.notes ?? null,
        };
      }
      // В усіх інших випадках (включно з точним дублем) — пропускаємо
      continue;
    }

    merged.push({
      name: n,
      qty: incomingQty,
      unit: incomingUnit,
      notes: it?.notes ?? null,
    });
  }

  return merged;
}
