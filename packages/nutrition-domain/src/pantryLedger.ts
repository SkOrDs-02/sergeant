/**
 * Append-only журнал руху продуктів у коморі і згортка залишку з нього.
 *
 * W1-PANTRY-APPEND, СТАДІЯ 2 (web): `apps/web` тепер ПИШЕ у цей журнал —
 * пʼять мутаторів `useNutritionPantries.ts` + HubChat-екзекутор
 * `consume_from_pantry` емітують події паралельно до старого запису
 * `qty`, і клієнт бекфілить чекпойнти `'initial'` для наявних позицій
 * (`buildPantryInitialCheckpointId` нижче). `nutrition_pantry_items.qty`
 * лишається ЄДИНИМ джерелом залишку для UI — читачів журналу й досі
 * немає (shadow-read/parity — стадія 3, cutover UI на derived — стадія 4).
 *
 * DOM-free: жодного `window`/`localStorage`/React — споживають і `apps/web`,
 * і `apps/mobile`.
 *
 * Модель
 * ------
 * Подія — незмінний факт руху однієї позиції комори:
 *
 *   - `'initial'` / `'adjust'` — ЧЕКПОЙНТ: `absQty` задає абсолютний залишок
 *     на момент `occurredAt` («інвентаризація»). Усе, що було до нього, для
 *     згортки не має значення.
 *   - `'consume'` / `'replenish'` — ДЕЛЬТА: знакова `deltaQty` в одиниці
 *     позиції (споживання відʼємне).
 *
 * Залишок = останній чекпойнт + сума дельт ПІСЛЯ нього.
 *
 * AI-CONTEXT: три речі тут навмисні і ламати їх не можна.
 *
 * 1. **Немає чекпойнта → результат `null`, а НЕ `0`.** Дельти без бази не
 *    дають абсолютного числа. Позиції з `qty IS NULL` («сіль» без кількості
 *    — парсер такі приймає) чекпойнта не отримують ніколи, і після
 *    майбутнього cutover-у (стадія 4) `0` перетворив би «сіль» на «сіль 0»
 *    і викинув би її з UI. Це прямо задокументована вимога backfill-плану.
 * 2. **Результат НЕ обрізається знизу нулем.** Відʼємний залишок — це
 *    сигнал подвійного списання (audit E-2: каструля борщу списується
 *    стільки разів, скільки логів порцій), і його треба БАЧИТИ, а не
 *    ховати за `Math.max(0, …)`.
 * 3. **Розбіжність одиниць зупиняє згортку.** Якщо після чекпойнта в «кг»
 *    прилітає дельта в «шт», скласти їх не можна — жодна груба таблиця
 *    густин (`pantryConsume.ts`) не робить це чесним. Повертаємо `null`
 *    («не знаю»), а не вигадане число. Конверсія одиниць — окреме рішення
 *    продукту, не побічний ефект згортки.
 *
 * Канон: docs/01-product/model/nutrition.md §9
 * ADR:   docs/04-governance/adr/0077-pantry-append-only-ledger.md
 */

/** Тип події руху. Дзеркалить CHECK у `086_nutrition_pantry_events.sql`. */
export type PantryEventKind = "consume" | "replenish" | "adjust" | "initial";

/** Види подій, що несуть знакову `deltaQty`. */
export const PANTRY_DELTA_KINDS: readonly PantryEventKind[] = [
  "consume",
  "replenish",
];

/** Види подій, що несуть абсолютний чекпойнт `absQty`. */
export const PANTRY_CHECKPOINT_KINDS: readonly PantryEventKind[] = [
  "adjust",
  "initial",
];

const ALL_KINDS: readonly string[] = [
  ...PANTRY_DELTA_KINDS,
  ...PANTRY_CHECKPOINT_KINDS,
];

/** Звідки прийшла подія. Дзеркалить COMMENT на колонці `source`. */
export type PantryEventSource =
  | "meal_log"
  | "manual"
  | "parse_pantry"
  | "chat_tool"
  | "shopping_list"
  | "backfill";

/**
 * Один рядок `nutrition_pantry_events` у доменній формі (camelCase).
 *
 * `itemId` нестабільний за конструкцією — клієнт формує його як
 * `${pantryId}::${index}::${name}`, тож перейменування чи зсув у масиві
 * породжує НОВИЙ id. Саме тому згортка ключується на `itemKey`
 * (`canonicalFoodKey(name)`), а `itemId` лишається довідковим.
 */
export interface PantryEvent {
  readonly id: string;
  readonly pantryId: string;
  readonly itemId: string | null;
  readonly itemKey: string;
  readonly kind: PantryEventKind;
  readonly deltaQty: number | null;
  readonly absQty: number | null;
  readonly unit: string | null;
  readonly source: string;
  readonly mealId: string | null;
  /** ISO-8601. Порядок згортки визначає саме він, а не порядок у масиві. */
  readonly occurredAt: string;
  /** Ретракція помилкової події. Згортка такі рядки пропускає. */
  readonly deletedAt: string | null;
}

/** Type-guard для `kind`, що прийшов з БД/мережі як довільний рядок. */
export function isPantryEventKind(value: unknown): value is PantryEventKind {
  return typeof value === "string" && ALL_KINDS.includes(value);
}

/** Чи несе подія абсолютний чекпойнт (а не дельту). */
export function isPantryCheckpoint(kind: PantryEventKind): boolean {
  return PANTRY_CHECKPOINT_KINDS.includes(kind);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Гасить накопичену похибку float-суми (0.1 + 0.2 = 0.30000000000000004).
 * Шість знаків — на три порядки точніше за будь-яку кухонну вагу, тож
 * реальні дані не страждають, а parity-звіт стадії 3 не тоне в шумі.
 */
function roundQty(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Хронологічний порядок згортки: `occurredAt` за зростанням, при рівних
 * мітках — стабільний тайбрейк за `id`.
 *
 * Тайбрейк потрібен, бо дві події можуть мати ту саму мітку (масовий
 * backfill, або дві дії в межах одного тику), а згортка мусить давати той
 * самий результат на будь-якому пристрої — інакше parity-звіт стадії 3
 * ловитиме привидів.
 */
function comparePantryEvents(a: PantryEvent, b: PantryEvent): number {
  if (a.occurredAt < b.occurredAt) return -1;
  if (a.occurredAt > b.occurredAt) return 1;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * Живі (не ретраговані) події в хронологічному порядку.
 *
 * Не мутує вхідний масив — виклик із React-стану безпечний.
 */
export function sortPantryEvents(
  events: readonly PantryEvent[],
): PantryEvent[] {
  return events
    .filter((e) => e.deletedAt == null)
    .slice()
    .sort(comparePantryEvents);
}

/**
 * Залишок позиції комори, згорнутий з її подій.
 *
 * @param events Події ОДНІЄЇ позиції (той самий `itemKey` у тій самій
 *   коморі). Групування — обовʼязок викликача; порядок у масиві не
 *   важливий, згортка сортує сама.
 * @returns Залишок в одиниці останнього чекпойнта, або `null` коли залишок
 *   невідомий: немає чекпойнта, немає подій узагалі, або одиниці подій
 *   після чекпойнта несумісні. `null` означає «не знаю», а не «нуль» —
 *   див. AI-CONTEXT угорі файлу.
 */
export function derivePantryQty(events: readonly PantryEvent[]): number | null {
  const live = sortPantryEvents(events);
  if (live.length === 0) return null;

  // Останній чекпойнт із валідним `absQty`. Чекпойнт без числа — це
  // зіпсований рядок, і мовчки вважати його нулем не можна.
  let checkpointIdx = -1;
  for (let i = live.length - 1; i >= 0; i -= 1) {
    const event = live[i]!;
    if (isPantryCheckpoint(event.kind) && isFiniteNumber(event.absQty)) {
      checkpointIdx = i;
      break;
    }
  }
  if (checkpointIdx === -1) return null;

  const checkpoint = live[checkpointIdx]!;
  let total = checkpoint.absQty as number;
  const baseUnit = checkpoint.unit;

  for (let i = checkpointIdx + 1; i < live.length; i += 1) {
    const event = live[i]!;

    // Одиниці мусять збігатись. `null` = «та сама, що в чекпойнта»:
    // старі/backfill-події одиниці могли не нести.
    if (baseUnit != null && event.unit != null && event.unit !== baseUnit) {
      return null;
    }

    if (isPantryCheckpoint(event.kind)) {
      // Недосяжно для валідних даних (ми взяли ОСТАННІЙ чекпойнт), але
      // лишається явним: чекпойнт без `absQty` не має тихо ставати дельтою.
      continue;
    }
    if (!isFiniteNumber(event.deltaQty)) {
      // Дельта без числа робить суму невизначеною. Пропустити її — значить
      // збрехати на розмір цієї дельти.
      return null;
    }
    total += event.deltaQty;
  }

  return roundQty(total);
}

/**
 * Детермінований `id` для backfill-чекпойнта `'initial'` однієї позиції.
 *
 * ADR-0077 §5: клієнт (боот-тайм backfill у `nutritionStorage.ts`) і
 * сервер (майбутній незалежний backfill, якщо колись знадобиться) мають
 * дійти до ОДНОГО й того самого `id` для тієї самої позиції — інакше
 * `INSERT OR IGNORE` / `ON CONFLICT DO NOTHING` не схлопне повтор, і
 * `derivePantryQty` порахує ДВА чекпойнти замість одного, подвоївши
 * залишок. Тому ключ намірено складається лише з ідентичності ПОЗИЦІЇ
 * (`pantryId` + `itemKey`) — БЕЗ `qty`/`unit`/часу: ці значення можуть
 * легально відрізнятись між двома backfill-спробами (юзер відредагував
 * позицію між двома холодними стартами) без права на другий чекпойнт.
 * Мета — «щонайбільше один `'initial'`-рядок на позицію», а не «один
 * рядок на спостережене значення».
 */
export function buildPantryInitialCheckpointId(
  pantryId: string,
  itemKey: string,
): string {
  return `pe::initial::${pantryId}::${itemKey}`;
}
