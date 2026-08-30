/**
 * Варіанти позиції комори — фактичні покупки, які злились в одну картку
 * продукту («Молоко» = «Яготинське 2.6%» + «Галичина 1%»).
 *
 * Status: Active
 *
 * AI-DANGER: усе тут тримає ОДИН інваріант — сума `qty` варіантів дорівнює
 * `qty` позиції, і всі вони в одній базовій одиниці. Позиція, що показує
 * число, якого немає в її варіантах, бреше про залишок; тому кожна
 * операція (злиття, списання, обрізання) повертає повний набір варіантів
 * разом із перерахованою сумою, а не мутує половину стану.
 */
import {
  MAX_PANTRY_SOURCES,
  displayFoodName,
  matchFoodName,
  normalizeUnit,
  type PantryItem,
  type PantryItemSource,
} from "./pantryTextParser.js";
import { baseUnitFor, massToVolumeIfKnown, toBase } from "./units.js";

/** Гасить float-похибку (0.1+0.2=0.30000000000000004) до кухонної точності. */
function roundBase(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/** Сума варіантів у базовій одиниці. */
export function sourcesTotal(
  sources: readonly PantryItemSource[] | null | undefined,
): number {
  if (!Array.isArray(sources)) return 0;
  return roundBase(
    sources.reduce((sum, s) => sum + (Number.isFinite(s.qty) ? s.qty : 0), 0),
  );
}

/**
 * Кількість позиції у базовій одиниці свого виміру, або `null` коли
 * одиниця немасштабована (`уп` — пакет може важити будь-що).
 */
export function itemQtyInBase(
  item: Pick<PantryItem, "name" | "qty" | "unit">,
): { qty: number; unit: string } | null {
  const qty = Number(item.qty);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const unit = item.unit ? normalizeUnit(item.unit) : null;
  if (!unit) return null;
  const based = toBase(qty, unit);
  if (!based) return null;
  // Маса рідини з відомою щільністю рахується в мл — інакше «Молоко 900 г»
  // і «Молоко 1 л» ніколи не зійшлись би в одну картку продукту.
  const out = massToVolumeIfKnown(based, item.name);
  return { qty: roundBase(out.base), unit: baseUnitFor(out.dimension) };
}

/**
 * Варіант, що представляє ВЖЕ наявний залишок позиції без історії покупок.
 *
 * Потрібен, коли до позиції, набитої руками, вперше доливається покупка з
 * чека: без цього запису сума варіантів була б меншою за кількість позиції,
 * і інваріант ламався б з першого ж поповнення.
 */
export function syntheticSource(
  item: Pick<PantryItem, "name" | "qty" | "unit">,
): PantryItemSource | null {
  const based = itemQtyInBase(item);
  if (!based) return null;
  return {
    name: displayFoodName(item.name),
    qty: based.qty,
    unit: based.unit,
    addedAt: null,
  };
}

/**
 * Обрізає список варіантів до {@link MAX_PANTRY_SOURCES}.
 *
 * Спершу вилітають найстаріші ВИЧЕРПАНІ варіанти (`qty` нуль) — вони вже
 * нічого не важать. Якщо вичерпаних немає, найстаріші зливаються в ОДИН
 * запис із сумарною кількістю і родовою назвою позиції: втратити історію
 * назв дешевше, ніж збрехати про суму.
 */
export function capSources(
  sources: readonly PantryItemSource[],
  genericName: string,
): PantryItemSource[] {
  let out = sources.filter((s) => Number.isFinite(s.qty));
  if (out.length <= MAX_PANTRY_SOURCES) return [...out];

  out = out.filter((s) => s.qty > 0);
  if (out.length <= MAX_PANTRY_SOURCES) return [...out];

  const foldCount = out.length - MAX_PANTRY_SOURCES + 1;
  const folded = out.slice(0, foldCount);
  const rest = out.slice(foldCount);
  const first = folded[0]!;
  return [
    {
      name: displayFoodName(genericName) || first.name,
      qty: sourcesTotal(folded),
      unit: first.unit,
      addedAt: first.addedAt,
    },
    ...rest,
  ];
}

/**
 * Зливає варіанти наявної позиції з новими, тримаючи інваріант суми.
 *
 * Порядок — хронологічний: наявні спершу, нові в кінець. Саме на нього
 * спирається списання (`consumeFromSources`), яке починає з найстарішого.
 */
export function mergeSources(
  existing: readonly PantryItemSource[] | null | undefined,
  incoming: readonly PantryItemSource[] | null | undefined,
  genericName: string,
): PantryItemSource[] {
  const a = Array.isArray(existing) ? existing : [];
  const b = Array.isArray(incoming) ? incoming : [];
  const seen = new Set(a.map(sourceKey));
  const fresh = b.filter((s) => {
    const key = sourceKey(s);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return capSources([...a, ...fresh], genericName);
}

/**
 * Ключ ідентичності покупки: назва + кількість + одиниця + ДЕНЬ ПОКУПКИ.
 *
 * Він робить повторний імпорт того самого чека безпечним: другий раз ті
 * самі рядки не додають кількість. Ціна — дві однакові покупки того самого
 * дня, ЯКЩО вони приїхали окремими рядками, зливаються в одну. Це чесний
 * розмін: рітейлер такі рядки й так віддає одним із `qty: 2`, а тихе
 * подвоєння залишку люди помічають лише тоді, коли комора вже бреше.
 *
 * Саме тому `addedAt` береться з дати ЧЕКА, а не з дати імпорту — інакше
 * той самий чек, підтверджений завтра, мав би інший ключ.
 */
function sourceKey(s: PantryItemSource): string {
  return JSON.stringify([
    matchFoodName(s.name),
    s.qty,
    s.unit,
    s.addedAt ?? "",
  ]);
}

/**
 * Списує `deductBase` (у базовій одиниці) з обраного варіанта.
 *
 * `preferredName` — назва варіанта, який обрала людина; `null` означає
 * «з найстарішого»: куплене раніше псується першим. Якщо в обраному
 * варіанті бракує, залишок добирається з решти, теж від найстарішого.
 * Вичерпані варіанти зникають зі списку.
 */
export function consumeFromSources(
  sources: readonly PantryItemSource[] | null | undefined,
  deductBase: number,
  preferredName?: string | null,
): PantryItemSource[] {
  const list = (Array.isArray(sources) ? sources : []).map((s) => ({ ...s }));
  if (list.length === 0 || !Number.isFinite(deductBase) || deductBase <= 0) {
    return list;
  }

  const preferredKey = preferredName ? matchFoodName(preferredName) : "";
  const order = list.map((_, i) => i);
  if (preferredKey) {
    const idx = list.findIndex((s) => matchFoodName(s.name) === preferredKey);
    if (idx >= 0) {
      order.splice(order.indexOf(idx), 1);
      order.unshift(idx);
    }
  }

  let left = deductBase;
  for (const i of order) {
    if (left <= 0) break;
    const cur = list[i]!;
    const take = Math.min(cur.qty, left);
    cur.qty = roundBase(cur.qty - take);
    left = roundBase(left - take);
  }

  return list.filter((s) => s.qty > 0);
}

/**
 * Чи тримається інваріант «сума варіантів = кількість позиції».
 *
 * Порівняння в базовій одиниці: позиція може лежати в `кг`, а варіанти —
 * завжди в `г`. Допуск 0.001 гасить float-похибку, а не приховує помилку
 * обліку: реальне розходження завжди більше за міліграм.
 */
export function pantrySourcesInvariantHolds(item: PantryItem): boolean {
  const sources = item.sources;
  if (!Array.isArray(sources) || sources.length === 0) return true;
  const based = itemQtyInBase(item);
  if (!based) return false;
  return Math.abs(sourcesTotal(sources) - based.qty) <= 0.001;
}
