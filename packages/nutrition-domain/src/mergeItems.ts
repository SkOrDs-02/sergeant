import {
  canonicalFoodKey,
  displayFoodName,
  matchFoodName,
  normalizeUnit,
  type PantryItem,
  type PantryItemSource,
} from "./pantryTextParser.js";
import {
  mergeSources,
  sourcesTotal,
  syntheticSource,
} from "./pantrySources.js";
import { massToVolumeIfKnown } from "./units.js";

interface BaseUnit {
  base: "г" | "мл" | "шт";
  value: number;
}

/**
 * Кількість у базовій одиниці. `name` потрібне не для косметики: маса
 * рідини з ВІДОМОЮ щільністю зводиться до мл (`massToVolumeIfKnown`), і
 * саме це дозволяє «Молоко 900 г» із чека долитись у «Молоко 1 л».
 * Продукт без щільності лишається у своєму вимірі й далі.
 */
function toBaseUnit(
  qty: unknown,
  unit: unknown,
  name?: unknown,
): BaseUnit | null {
  const u = String(unit || "").toLowerCase();
  const q = Number(qty);
  if (!Number.isFinite(q)) return null;
  if (u === "г") return liquidAware({ base: "г", value: q }, name);
  if (u === "кг") return liquidAware({ base: "г", value: q * 1000 }, name);
  if (u === "мл") return { base: "мл", value: q };
  if (u === "л") return { base: "мл", value: q * 1000 };
  if (u === "шт") return { base: "шт", value: q };
  return null;
}

function liquidAware(mass: BaseUnit, name: unknown): BaseUnit {
  const out = massToVolumeIfKnown(
    { dimension: "mass", base: mass.value },
    name,
  );
  return out.dimension === "volume"
    ? { base: "мл", value: out.base }
    : { base: "г", value: out.base };
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

/**
 * Чия display-назва виграє, коли дві позиції злились в одну.
 *
 * Базове правило — **перемагає та, що вже лежить у коморі**. Користувач її
 * бачить; тихо перейменовувати позицію на кожному доливанні («Яготинське
 * молоко» → «молоко», бо дописали «500 мл молока») було б несподівано.
 * Перейменування лишається явною дією через редагування позиції.
 *
 * Єдиний виняток — «гоєння» записів, збережених до розділення display/match:
 * якщо назви збігаються **з точністю до регістру** (однаковий `matchFoodName`)
 * і збережена не має жодної великої літери, а нова має — беремо нову. Так
 * комора, набита раніше суцільним нижнім регістром, поступово підхоплює
 * правильні бренди («яготинське молоко» → «Яготинське молоко»), і при цьому
 * жодна відмінкова/множинна форма (аліас) назву не перезаписує.
 */
function pickDisplayName(existing: unknown, incoming: unknown): string {
  const cur = displayFoodName(existing);
  const next = displayFoodName(incoming);
  if (!cur) return next;
  if (!next) return cur;
  if (matchFoodName(cur) !== matchFoodName(next)) return cur;
  const curHasUpper = cur !== cur.toLowerCase();
  const nextHasUpper = next !== next.toLowerCase();
  return !curHasUpper && nextHasUpper ? next : cur;
}

function roundNice(n: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return n;
  // 1 знак після коми для невеликих дробів, інакше ціле
  if (Math.abs(x) < 10 && Math.round(x) !== x) return Math.round(x * 10) / 10;
  return Math.round(x);
}

/**
 * Позиція з варіантами тримає `qty`/`unit` у БАЗОВІЙ одиниці — інакше
 * інваріант «сума варіантів = кількість позиції» довелось би доводити через
 * конверсію на кожному читанні. Зручна одиниця (`кг`/`л`) лишається тільки
 * позиціям без варіантів, набитим руками.
 */
function withSources(
  base: PantryItem,
  sources: readonly PantryItemSource[],
): PantryItem {
  const first = sources[0];
  if (!first) return { ...base, sources: null };
  return {
    ...base,
    qty: sourcesTotal(sources),
    unit: first.unit,
    sources: [...sources],
  };
}

/**
 * Варіанти наявної позиції: власні, або синтетичний із її залишку — щоб
 * перше ж доливання з чека не «загубило» те, що вже лежало в коморі.
 */
function existingSourcesOf(item: PantryItem): readonly PantryItemSource[] {
  if (Array.isArray(item.sources) && item.sources.length > 0) {
    return item.sources;
  }
  const synthetic = syntheticSource(item);
  return synthetic ? [synthetic] : [];
}

export function mergeItems(
  oldItems: readonly PantryItem[] | unknown,
  newItems: readonly PantryItem[] | unknown,
): PantryItem[] {
  const a = (Array.isArray(oldItems) ? oldItems : []) as PantryItem[];
  const b = (Array.isArray(newItems) ? newItems : []) as PantryItem[];
  const merged: PantryItem[] = [...a];

  for (const it of b) {
    // `display` іде у показ і в новий запис, `key` — лише у зіставлення.
    const display = displayFoodName(it?.name);
    if (!display) continue;
    const key = canonicalFoodKey(display);

    const rawQty =
      it?.qty != null &&
      it.qty !== ("" as unknown) &&
      Number.isFinite(Number(it.qty))
        ? Number(it.qty)
        : null;
    const rawUnit = it?.unit ? normalizeUnit(it.unit) : null;
    const incomingSources: readonly PantryItemSource[] = Array.isArray(
      it?.sources,
    )
      ? it.sources
      : [];

    // Гола назва без кількості/одиниці трактується як "1 шт" — це дозволяє
    // сумувати "огірок" з існуючим "огірки 4 шт" так само, як "огірок 1".
    const incomingQty: number | null = rawQty == null && !rawUnit ? 1 : rawQty;
    const incomingUnit: string | null =
      rawQty == null && !rawUnit ? "шт" : rawUnit;

    // Гібрид: сумуємо лише якщо є qty+unit і одиниці сумісні (або однакові)
    if (incomingQty != null && incomingUnit) {
      const baseIncoming = toBaseUnit(incomingQty, incomingUnit, display);
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
          const baseX = toBaseUnit(qx, ux, x?.name);
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
          const baseX = toBaseUnit(qx, ux, cur.name);
          if (baseX) {
            const name = pickDisplayName(cur.name, display);
            const hasSources =
              incomingSources.length > 0 ||
              (Array.isArray(cur.sources) && cur.sources.length > 0);
            if (hasSources) {
              // Ручне доливання до позиції-картки («молоко 200 мл» поверх
              // двох покупок з чека) варіантів не несе. Без синтетичного
              // запису його кількість зникла б: qty позиції перераховується
              // з варіантів, і те, чого в них немає, просто не існує.
              const incoming =
                incomingSources.length > 0
                  ? incomingSources
                  : ([
                      syntheticSource({
                        name: display,
                        qty: incomingQty,
                        unit: incomingUnit,
                      }),
                    ].filter(Boolean) as PantryItemSource[]);
              // Картка продукту: числа лишаються в базовій одиниці, а
              // «Яготинське 2.6%» не зникає разом із брендом.
              merged[idx] = withSources(
                { ...cur, name },
                mergeSources(existingSourcesOf(cur), incoming, name),
              );
              continue;
            }
            const totalBase: BaseUnit = {
              base: baseX.base,
              value: baseX.value + baseIncoming.value,
            };
            const out = fromBaseUnit(totalBase, ux);
            merged[idx] = {
              ...cur,
              name,
              qty: roundNice(out.qty),
              unit: out.unit,
            };
            continue;
          }
        }
      }
    }

    // Якщо не сумуємо — перевіряємо чи є запис з тим самим (канонічним) імʼям
    const sameNameIdx = merged.findIndex(
      (x) => canonicalFoodKey(x?.name) === key,
    );

    // Маса і обʼєм — РІЗНІ позиції, навіть за однакової назви: щільність
    // невідома, тож «Молоко 900 г» і «Молоко 1 л» не мають спільного числа.
    // Раніше друга з них мовчки зникала — dedup-гілка нижче лишала стару
    // кількість і викидала нову покупку взагалі.
    if (sameNameIdx >= 0 && incomingQty != null && incomingUnit) {
      const baseIncoming = toBaseUnit(incomingQty, incomingUnit, display);
      const cur = merged[sameNameIdx]!;
      const baseCur = toBaseUnit(cur.qty, normalizeUnit(cur.unit), cur.name);
      if (baseIncoming && baseCur && baseIncoming.base !== baseCur.base) {
        const fresh: PantryItem = {
          name: display,
          qty: incomingQty,
          unit: incomingUnit,
          notes: it?.notes ?? null,
        };
        merged.push(
          incomingSources.length > 0
            ? withSources(fresh, incomingSources)
            : fresh,
        );
        continue;
      }
    }

    if (sameNameIdx >= 0) {
      // Аналогічно вище: `findIndex` повернув валідний індекс,
      // отже `merged[sameNameIdx]` є.
      const cur = merged[sameNameIdx]!;
      const winningName = pickDisplayName(cur.name, display);
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
          name: winningName,
          qty: incomingQty,
          unit: incomingUnit,
          notes: cur.notes ?? it?.notes ?? null,
        };
      } else if (winningName !== cur.name) {
        // Точний дубль / несумісні одиниці — кількість не чіпаємо, але
        // «гоєння» регістру пропускати немає причин.
        merged[sameNameIdx] = { ...cur, name: winningName };
      }
      // Кількість в усіх інших випадках (включно з точним дублем) лишаємо як є
      continue;
    }

    const fresh: PantryItem = {
      name: display,
      qty: incomingQty,
      unit: incomingUnit,
      notes: it?.notes ?? null,
    };
    merged.push(
      incomingSources.length > 0 ? withSources(fresh, incomingSources) : fresh,
    );
  }

  return merged;
}
