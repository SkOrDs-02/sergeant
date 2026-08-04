/**
 * W1-PANTRY-APPEND стадія 2 — типи й diff-функція для append-only журналу
 * руху комори (`nutrition_pantry_events`).
 *
 * Окремий файл, а не ще один блок у `diff.ts` (671 рядок при ліміті 600,
 * Hard Rule #18) — той самий подряд, що вже застосований до
 * `adapter.goalPeriods.ts` / `adapter.completionEvents.ts` на боці
 * адаптера: append-only-семантика фізично відокремлена від LWW-diff-у
 * решти nutrition-сутностей.
 *
 * Канон: docs/01-product/model/nutrition.md §9
 * ADR:   docs/04-governance/adr/0077-pantry-append-only-ledger.md
 */
import type { NutritionDualWriteOp, NutritionDualWriteState } from "./diff.js";

/**
 * Один рядок append-only журналу руху комори, готовий до запису. Форма —
 * плаский підмножина `PantryEvent` (`@sergeant/nutrition-domain/pantryLedger`),
 * без `occurredAt`/`deletedAt`: ті ставить адаптер із `clientTs`, як і решта
 * нутриційних append-only журналів (`GoalPeriodInsertOp`).
 *
 * `id` — `string | null`. `null` означає «адаптер сам згенерує
 * `crypto.randomUUID()`» (звичайна дія юзера: consume/replenish/adjust —
 * повтор НЕ повинен схлопуватись, дві реальні дії з тим самим payload-ом
 * лишаються двома рядками). Ненульове значення — ДЕТЕРМІНОВАНИЙ id від
 * `buildPantryInitialCheckpointId` (лише backfill-чекпойнти `'initial'`,
 * див. ADR-0077 §5): повтор МАЄ схлопнутись через `INSERT OR IGNORE`.
 */
export interface NutritionPantryEventSnapshot {
  readonly id: string | null;
  readonly pantryId: string;
  readonly itemId: string | null;
  readonly itemKey: string;
  readonly kind: "consume" | "replenish" | "adjust" | "initial";
  readonly deltaQty: number | null;
  readonly absQty: number | null;
  readonly unit: string | null;
  readonly source: string;
  readonly mealId: string | null;
}

/**
 * Сходинка в append-only журналі комори.
 *
 * ПАРАЛЕЛЬНО, А НЕ ЗАМІСТЬ `pantry-upsert`: `nutrition_pantry_items.qty`
 * лишається єдиним джерелом залишку для UI. Диспетчеризація — не через
 * порівняння `prev.pantries` / `next.pantries` (як `pantry-upsert`), а через
 * `next.pantryEvents` — явну чергу подій, яку заповнюють мутатори
 * `useNutritionPantries.ts` і HubChat-екзекутор `consume_from_pantry` ПЕРЕД
 * викликом дуал-райту. Причина: сама лише різниця "було X, стало Y" не несе
 * `kind` (спожив? поповнив? відредагував вручну?) — цю інформацію знає лише
 * викликач у момент дії, тому вона мусить прийти вже готовою.
 */
export interface PantryEventAppendOp {
  readonly kind: "pantry-event-append";
  readonly event: NutritionPantryEventSnapshot;
}

/**
 * Емітує `pantry-event-append` для кожного елемента `next.pantryEvents`,
 * якого не було в `prev.pantryEvents`.
 *
 * Свідомо НЕ diff-ить `prev.pantries` / `next.pantries` (як `pantry-upsert`)
 * — див. AI-CONTEXT біля `PantryEventAppendOp`: `kind` події не виводиться
 * зі стану, його приносить викликач. `slice(prevEvents.length)` — це просто
 * «нові в кінці черги», не set-diff: `pantryEvents` — append-only черга
 * ОДНОГО переходу, а не персистований знімок, тож порядок і довжина
 * монотонні за конструкцією виклику (`nutritionStorage.ts`).
 */
export function diffPantryEventOps(
  prev: NutritionDualWriteState,
  next: NutritionDualWriteState,
  ops: NutritionDualWriteOp[],
): void {
  const prevEvents = prev.pantryEvents ?? [];
  const nextEvents = next.pantryEvents ?? [];
  if (nextEvents.length <= prevEvents.length) return;
  for (const event of nextEvents.slice(prevEvents.length)) {
    ops.push({ kind: "pantry-event-append", event });
  }
}
