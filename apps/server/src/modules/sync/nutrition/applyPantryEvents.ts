import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../../http/schemas.js";
import {
  isWithinTextBound,
  parseOptionalDate,
  parseOptionalNumber,
  parseOptionalTzOffsetMin,
} from "../syncV2-core.js";
import type { AppliedStatus } from "../syncV2-types.js";

/**
 * Apply-шлях для `nutrition_pantry_events` — append-only журналу руху
 * продуктів у коморі.
 *
 * W1-PANTRY-APPEND, СТАДІЯ 1. Окремий файл, а не ще одна функція в
 * `applySync.ts` (539/600 рядків, Hard Rule #18): append-only-семантика
 * принципово інша за LWW-upsert `applyNutritionPantryItems`, і тримати їх
 * поруч — запрошення «уніфікувати» їх наступним рефакторингом.
 *
 * `applyNutritionPantryItems` цією стадією НЕ чіпається: `qty` і далі
 * ходить старим LWW-шляхом, бо на стадії 1 у цей журнал ніхто не пише і
 * ніхто з нього не читає.
 *
 * Чого тут свідомо НЕМАЄ:
 *
 *   - **LWW-guard.** Подія незмінна. Два пристрої не конкурують за рядок —
 *     вони дописують РІЗНІ рядки, а конфлікт розвʼязує згортка
 *     (`derivePantryQty` у `@sergeant/nutrition-domain`) уже на читанні.
 *     Саме це і є відповідь на audit E-7: за старим шляхом одночасні
 *     consume з телефону і replenish з десктопу давали `lww_conflict` і
 *     втрату однієї з операцій.
 *   - **`op='update'`.** Відхиляється з `append_only_violation`.
 *     Виправлення історії — це НОВА подія ('adjust' з новішим
 *     `occurred_at`), а не редагування старої.
 *   - **Hard-delete.** `op='delete'` ставить ЛИШЕ tombstone (`deleted_at`)
 *     — ретракція помилково записаної події. Тіло рядка не переписується.
 *
 * Ідемпотентність: `INSERT … ON CONFLICT (id) DO NOTHING`. Клієнт генерує
 * `id` детерміновано, тож повторна доставка тієї самої події — тихий
 * no-op, а не дубль (інакше подвійна доставка «мінус 250 г» списала б
 * 500 г). Повертаємо `applied` і в цьому разі: для клієнта важливо, що
 * рядок у черзі можна прибрати, а не чи саме цей push його створив.
 *
 * AI-CONTEXT: `id` / `pantry_id` / `item_id` / `meal_id` тут TEXT, а НЕ
 * UUID — на відміну від `nutrition_pantry_items`. Клієнт генерує НЕ-UUID
 * id (`home`, `p_<ms>_<idx>`, `<pantryId>::<idx>::<name>`), тож UUID-колонка
 * дала б `22P02` → `apply_failed` на кожному реальному push-і (той самий
 * клас багу, що в `docs/90-work/tech-debt/backend.md` § «Routine: PK-тип»).
 * НЕ «наводь симетрію» з сусідньою таблицею — симетрія тут і є баг.
 *
 * Канон: docs/01-product/model/nutrition.md §9
 * ADR:   docs/04-governance/adr/0077-pantry-append-only-ledger.md
 */

/** Закритий enum `kind`. Дзеркалить CHECK у міграції 086. */
const EVENT_KINDS = new Set(["consume", "replenish", "adjust", "initial"]);

/** Види, що несуть знакову `delta_qty`. */
const DELTA_KINDS = new Set(["consume", "replenish"]);

export async function applyNutritionPantryEvents(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;

  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  if (row["user_id"] == null) {
    return { status: "rejected", reason: "missing_user_id" };
  }
  if (row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  // Ретракція помилкової події — єдина дозволена мутація вже записаного
  // рядка. Owner-guard прошито у WHERE: чужу подію не ретрагувати.
  if (op.op === "delete") {
    const res = await client.query(
      `UPDATE nutrition_pantry_events
          SET deleted_at = $1, updated_at = $1
        WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL`,
      [clientTs, id, userId],
    );
    // Нема живого рядка — або вже ретраговано (ідемпотентний повтор), або
    // події взагалі нема. Перше — `applied`, друге — `not_found`; розрізняємо
    // окремим SELECT-ом, щоб повтор доставки не застрягав у черзі назавжди.
    if (res.rowCount === 0) {
      const existing = await client.query<{ user_id: string }>(
        `SELECT user_id FROM nutrition_pantry_events WHERE id = $1`,
        [id],
      );
      if (existing.rows.length === 0) {
        return { status: "rejected", reason: "not_found" };
      }
      if (existing.rows[0]!.user_id !== userId) {
        return { status: "rejected", reason: "fk_violation" };
      }
    }
    return { status: "applied" };
  }

  // Усе, що не `insert`/`delete`, — порушення append-only-інваріанта.
  // `increment` сюди не доходить (engine-гейт `INCREMENT_OP_SUPPORTED_TABLES`
  // віддає `op_not_supported` раніше), але гілка лишається закритою явно.
  if (op.op !== "insert") {
    return { status: "rejected", reason: "append_only_violation" };
  }

  const pantryId =
    typeof row["pantry_id"] === "string" && row["pantry_id"].length > 0
      ? row["pantry_id"]
      : null;
  if (!pantryId) {
    return { status: "rejected", reason: "missing_pantry_id" };
  }

  // `item_key` (canonicalFoodKey) — те, на чому ключується згортка:
  // `item_id` містить індекс і назву, тож перейменування дає новий id.
  // Подія без ключа нікуди не згорнеться, тож у журнал вона не потрапляє.
  const itemKey =
    typeof row["item_key"] === "string" && row["item_key"].length > 0
      ? row["item_key"]
      : null;
  if (!itemKey) return { status: "rejected", reason: "missing_id" };
  // Pre-beta input-boundaries audit: `item_key` is `canonicalFoodKey`,
  // derived from a user-typed food name — bound it like any other name field.
  if (!isWithinTextBound(itemKey)) {
    return { status: "rejected", reason: "text_too_long" };
  }

  const kind = typeof row["kind"] === "string" ? row["kind"] : "";
  if (!EVENT_KINDS.has(kind)) {
    return { status: "rejected", reason: "invalid_event_kind" };
  }

  const deltaQty = parseOptionalNumber(row["delta_qty"]);
  if (deltaQty === "invalid") {
    return { status: "rejected", reason: "invalid_qty" };
  }
  const absQty = parseOptionalNumber(row["abs_qty"]);
  if (absQty === "invalid") {
    return { status: "rejected", reason: "invalid_qty" };
  }

  // Дзеркало CHECK `nutrition_pantry_events_qty_shape`. Перевіряємо тут, щоб
  // клієнт отримав осмислений reason замість `apply_failed` від CHECK-а БД.
  if (DELTA_KINDS.has(kind)) {
    if (deltaQty == null) {
      return { status: "rejected", reason: "missing_delta_or_abs" };
    }
  } else if (absQty == null) {
    return { status: "rejected", reason: "missing_delta_or_abs" };
  }

  const itemId = typeof row["item_id"] === "string" ? row["item_id"] : null;
  const unit = typeof row["unit"] === "string" ? row["unit"] : null;
  const source = typeof row["source"] === "string" ? row["source"] : "manual";
  const mealId = typeof row["meal_id"] === "string" ? row["meal_id"] : null;
  // `tz_offset_min` (міграція 109) — опційне: старі клієнти його ще не
  // шлють, тоді лишається NULL (ADR-0078 device-local day boundary). Поза
  // реальним діапазоном UTC-офсетів — reject, а не мовчазний NULL
  // (pre-beta input-boundaries audit, CodeRabbit PR #627).
  const tzOffsetMin = parseOptionalTzOffsetMin(row["tz_offset_min"]);
  if (tzOffsetMin === "invalid") {
    return { status: "rejected", reason: "invalid_tz_offset_min" };
  }

  // `occurred_at` свідомо перевикористовує reason `invalid_created_at`
  // замість власного літерала: обидва поля — timestamptz однієї події, а
  // кожен новий reason коштує кардинальності в
  // `sync_op_log_apply_total{reason}` (див. metrics.md §4).
  const occurredAt = parseOptionalDate(row["occurred_at"]);
  if (occurredAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }

  await client.query(
    `INSERT INTO nutrition_pantry_events
       (id, user_id, pantry_id, item_id, item_key, kind, delta_qty, abs_qty,
        unit, source, meal_id, occurred_at, tz_offset_min, created_at,
        updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (id) DO NOTHING`,
    [
      id,
      userId,
      pantryId,
      itemId,
      itemKey,
      kind,
      deltaQty ?? null,
      absQty ?? null,
      unit,
      source,
      mealId,
      occurredAt ?? clientTs,
      tzOffsetMin,
      createdAt ?? clientTs,
      clientTs,
      deletedAt ?? null,
    ],
  );
  return { status: "applied" };
}
