import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../../http/schemas.js";
import {
  parseOptionalBoundedNumber,
  parseOptionalDate,
  parseOptionalTzOffsetMin,
} from "../syncV2-core.js";
import type { AppliedStatus } from "../syncV2-types.js";

/**
 * Pre-beta input-boundaries audit (2026-08-04): `nutrition_goal_periods`
 * numeric goals had NO upper bound at all — a `curl` could set
 * `kcal: Number.MAX_SAFE_INTEGER`. Ceilings here are deliberately generous
 * (2-3× the client's `GOAL_BOUNDS` WARN threshold in
 * `packages/nutrition-domain/src/dailyPlanValidation.ts`, which is a soft
 * UI nudge, not a hard cutoff) — this is a physiological-implausibility
 * sanity ceiling to stop overflow/abuse, not a product-decided "reasonable
 * goal" range.
 */
const GOAL_KCAL_MAX = 20_000;
const GOAL_MACRO_G_MAX = 1_000;
const GOAL_WATER_ML_MAX = 10_000;

/**
 * Apply-шлях для `nutrition_goal_periods` — append-only журналу цілей КБЖВ.
 *
 * W1-KBJU-APPEND, СТАДІЯ 1. Окремий файл, а не ще одна функція в
 * `applySync.ts` (539/600 рядків, Hard Rule #18). Але межа тут не лише
 * розмірна: семантика цього хендлера — СВІДОМЕ ВІДХИЛЕННЯ від шаблону, за
 * яким написані ВСІ інші nutrition-хендлери в сусідньому файлі, і тримати
 * їх поруч означало б запросити наступний рефакторинг «уніфікувати».
 *
 * Чим саме він відхиляється — і чому це не недогляд
 * -------------------------------------------------
 * Кожен інший nutrition-хендлер робить per-row LWW: читає `updated_at`
 * існуючого рядка і, якщо той не старший за `clientTs`, віддає
 * `lww_conflict` (див. `applyNutritionPrefs`, `applySync.ts`). Для журналу
 * цілей ця логіка НЕПРАВИЛЬНА.
 *
 * Уяви: телефон у вівторок ставить ціль 2200, ноутбук у четвер ставить
 * 1800. Це не конфлікт — це ДВІ РІЗНІ СХОДИНКИ історії, і обидві мусять
 * лишитись. LWW-шлях залишив би одну і стер би другу, тобто відтворив би
 * рівно ту втрату історії, проти якої існує весь цей журнал (audit E-1).
 * Тому тут:
 *
 *   - **немає LWW-guard-а.** Два пристрої не конкурують за рядок — вони
 *     дописують РІЗНІ рядки. Яка ціль діяла в конкретний день, вирішує
 *     резолвер (`resolveEffectiveGoal` у `@sergeant/nutrition-domain`) уже
 *     на читанні, а не сервер на записі.
 *   - **`op='update'` відхиляється** з `append_only_violation`. Виправлення
 *     — це НОВИЙ період, а не редагування старого.
 *   - **hard-delete немає.** `op='delete'` ставить ЛИШЕ tombstone
 *     (`deleted_at`) — ретракція помилково записаного періоду.
 *
 * Ідемпотентність: `INSERT … ON CONFLICT (id) DO NOTHING`. Клієнт генерує
 * `id` ДЕТЕРМІНОВАНО з (`effective_from`, значення, device), тож повторна
 * доставка того самого push-а — тихий no-op. Це не оптимізація: випадковий
 * `id` дав би на кожному ретраї другу сходинку з тими самими числами, і
 * журнал намірів перестав би бути журналом намірів. Повертаємо `applied` і
 * в разі no-op: клієнту важливо, що рядок у черзі можна прибрати.
 *
 * Межа стадії 1: сервер ПРИЙМАЄ періоди, але ЖОДЕН серіалізатор їх не
 * віддає — `nutrition_prefs.prefs_json` лишається єдиним джерелом цілі для
 * всіх екранів. Тому Hard Rule #3 (трійка server ↔ api-client ↔ contract)
 * тут не спрацьовує: форма жодної API-відповіді не змінилась.
 *
 * Канон: docs/01-product/model/nutrition.md §4 / §12
 * Аудит: docs/90-work/audits/product-knowledge-nutrition.md § E-1 / H2
 */

/** Закритий enum `origin`. Дзеркалить CHECK у міграції 087. */
const GOAL_ORIGINS = new Set(["manual", "preset", "tdee", "backfill"]);

/** Kyiv-локальний day key 'YYYY-MM-DD'. Дзеркалить CHECK у міграції 087. */
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function applyNutritionGoalPeriods(
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

  // Ретракція помилкового періоду — єдина дозволена мутація вже записаного
  // рядка. Owner-guard прошито у WHERE: чужий період не ретрагувати.
  if (op.op === "delete") {
    const res = await client.query(
      `UPDATE nutrition_goal_periods
          SET deleted_at = $1, updated_at = $1
        WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL`,
      [clientTs, id, userId],
    );
    // Нема живого рядка — або вже ретраговано (ідемпотентний повтор), або
    // періоду взагалі нема. Перше — `applied`, друге — `not_found`;
    // розрізняємо окремим SELECT-ом, щоб повтор доставки не застряг у
    // черзі назавжди.
    if (res.rowCount === 0) {
      const existing = await client.query<{ user_id: string }>(
        `SELECT user_id FROM nutrition_goal_periods WHERE id = $1`,
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

  // `effective_from` — те, ЗАРАДИ чого існує вся таблиця: без дати сходинка
  // нікуди не приклеїться і резолвер її ніколи не побачить. Перевіряємо і
  // форму, а не лише наявність: клієнт з іншою доктриною часу заслав би
  // ISO-instant, і день «поїхав» би на межі доби.
  const effectiveFrom =
    typeof row["effective_from"] === "string" ? row["effective_from"] : "";
  if (!DAY_KEY_RE.test(effectiveFrom)) {
    return { status: "rejected", reason: "missing_date_key" };
  }

  const origin =
    typeof row["origin"] === "string" && row["origin"].length > 0
      ? row["origin"]
      : "manual";
  if (!GOAL_ORIGINS.has(origin)) {
    return { status: "rejected", reason: "invalid_goal_origin" };
  }

  // Кожна ціль NULLABLE — «ціль не задана» це валідний стан, і він НЕ
  // дорівнює нулю. `parseOptionalNumber` розрізняє `null` (нема) і
  // `"invalid"` (є, але сміття) — друге відхиляємо, перше пропускаємо.
  const kcal = parseOptionalBoundedNumber(row["kcal"], { max: GOAL_KCAL_MAX });
  if (kcal === "invalid") return { status: "rejected", reason: "invalid_kcal" };
  const proteinG = parseOptionalBoundedNumber(row["protein_g"], {
    max: GOAL_MACRO_G_MAX,
  });
  if (proteinG === "invalid") {
    return { status: "rejected", reason: "invalid_protein_g" };
  }
  const fatG = parseOptionalBoundedNumber(row["fat_g"], {
    max: GOAL_MACRO_G_MAX,
  });
  if (fatG === "invalid") {
    return { status: "rejected", reason: "invalid_fat_g" };
  }
  const carbsG = parseOptionalBoundedNumber(row["carbs_g"], {
    max: GOAL_MACRO_G_MAX,
  });
  if (carbsG === "invalid") {
    return { status: "rejected", reason: "invalid_carbs_g" };
  }
  // `water_ml` свідомо перевикористовує `invalid_qty` замість власного
  // літерала: кожен новий reason коштує кардинальності в
  // `sync_op_log_apply_total{reason}` (metrics.md §4), а окремий дашборд
  // саме по воді ніхто не будує.
  const waterMl = parseOptionalBoundedNumber(row["water_ml"], {
    max: GOAL_WATER_ML_MAX,
  });
  if (waterMl === "invalid") {
    return { status: "rejected", reason: "invalid_qty" };
  }

  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }

  // `tz_offset_min` (міграція 109) — опційне: старі клієнти його ще не
  // шлють, тоді лишається NULL (ADR-0078 device-local day boundary).
  // Поза реальним діапазоном UTC-офсетів (curl бай-пасить клієнтську
  // перевірку) — reject, а не мовчазний NULL (pre-beta input-boundaries
  // audit, CodeRabbit PR #627).
  const tzOffsetMin = parseOptionalTzOffsetMin(row["tz_offset_min"]);
  if (tzOffsetMin === "invalid") {
    return { status: "rejected", reason: "invalid_tz_offset_min" };
  }

  await client.query(
    `INSERT INTO nutrition_goal_periods
       (id, user_id, effective_from, kcal, protein_g, fat_g, carbs_g,
        water_ml, origin, tz_offset_min, created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id) DO NOTHING`,
    [
      id,
      userId,
      effectiveFrom,
      kcal ?? null,
      proteinG ?? null,
      fatG ?? null,
      carbsG ?? null,
      waterMl ?? null,
      origin,
      tzOffsetMin,
      createdAt ?? clientTs,
      clientTs,
      deletedAt ?? null,
    ],
  );
  return { status: "applied" };
}
