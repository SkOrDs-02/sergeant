import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../../http/schemas.js";
import { parseOptionalDate, parseOptionalTzOffsetMin } from "../syncV2-core.js";
import type { AppliedStatus } from "../syncV2-types.js";

/**
 * Apply-шлях для `routine_completion_events` — append-only журналу відміток.
 *
 * W1-ROUTINE-APPEND, СТАДІЯ 1. Окремий файл, а не ще одна функція в
 * `applySync.ts` (256 рядків): append-only-семантика принципово інша за
 * LWW-upsert `applyRoutineEntries`, і тримати їх поруч — запрошення
 * «уніфікувати» їх наступним рефакторингом.
 *
 * Чого тут свідомо НЕМАЄ:
 *
 *   - **LWW-guard.** Подія незмінна, її нема з чим порівнювати: у таблиці
 *     нема ні `updated_at`, ні `deleted_at`. Два пристрої не конкурують за
 *     рядок — вони дописують РІЗНІ рядки, а конфлікт розвʼязує згортка
 *     (`foldCompletionEvents` у `@sergeant/routine-domain`) уже на читанні.
 *   - **update / delete.** Обидва відхиляються з `append_only_violation`.
 *     Виправлення історії — це НОВА подія з новішим `occurred_at`, а не
 *     редагування старої.
 *   - **tombstone-resurrection guard.** Нема tombstone-ів.
 *
 * Ідемпотентність: `INSERT ... ON CONFLICT (id) DO NOTHING`. Клієнт
 * генерує `id` детерміновано (`buildCompletionEventId`), тож повторна
 * доставка того самого toggle-а — тихий no-op, а не дубль. Повертаємо
 * `applied` і в цьому разі: для клієнта важливо, що рядок у черзі можна
 * прибрати, а не чи саме цей push його створив — але ЛИШЕ якщо рядок,
 * на який спрацював конфлікт, належить тому самому користувачу (див.
 * owner-guard після INSERT-а).
 *
 * AI-CONTEXT: `id` тут — TEXT, а НЕ UUID. Це свідомий обхід пастки
 * `routine_entries.id UUID` (`026_routine_tables.sql`), через яку реальний
 * push із браузера падає на `22P02` → `apply_failed`
 * (`docs/work/specs/tech-debt/backend.md` § «Routine: PK-тип»). НЕ «наводь
 * симетрію» з `routine_entries` — симетрія тут і є баг.
 *
 * Стадія 1 нічого не читає: жоден продуктовий ендпойнт, digest чи
 * chat-tool із цієї таблиці не селектить. Якщо шлях зламається —
 * продукт не помітить.
 */
export async function applyRoutineCompletionEvents(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;

  // Все, що не `insert`, — порушення append-only-інваріанта. `increment`
  // сюди не доходить (engine-гейт `INCREMENT_OP_SUPPORTED_TABLES` віддає
  // `op_not_supported` раніше), але гілка лишається закритою явно.
  if (op.op !== "insert") {
    return { status: "rejected", reason: "append_only_violation" };
  }

  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  if (row["user_id"] == null) {
    return { status: "rejected", reason: "missing_user_id" };
  }
  if (row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const habitId = typeof row["habit_id"] === "string" ? row["habit_id"] : null;
  if (!habitId) return { status: "rejected", reason: "missing_id" };

  const dateKey = typeof row["date_key"] === "string" ? row["date_key"] : null;
  if (!dateKey) return { status: "rejected", reason: "missing_date_key" };

  const state = row["state"] === "undone" ? "undone" : "done";

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

  // `tz_offset_min` (міграція 085) — опційне: старі клієнти його не шлють,
  // тоді лишається NULL (ADR-0078 device-local day boundary). Поза реальним
  // діапазоном UTC-офсетів — reject, а не мовчазний запис: колонка в 085 без
  // CHECK, а журнал існує рівно для того, щоб колись перерахувати день-ключ
  // із сирих `occurred_at` + `tz_offset_min`. Сире `Number.isInteger` без
  // меж пускало сюди `999999`, і це отруювало б саме той перерахунок.
  // Дзеркалимо сусідів — `applyPantryEvents.ts`, `applySyncGoals.ts`.
  const tzOffsetMin = parseOptionalTzOffsetMin(row["tz_offset_min"]);
  if (tzOffsetMin === "invalid") {
    return { status: "rejected", reason: "invalid_tz_offset_min" };
  }
  const dayAnchor =
    typeof row["day_anchor"] === "string" ? row["day_anchor"] : "unknown";
  const source = typeof row["source"] === "string" ? row["source"] : "ui";
  const deviceId =
    typeof row["device_id"] === "string" ? row["device_id"] : null;

  const res = await client.query(
    `INSERT INTO routine_completion_events
       (id, user_id, habit_id, date_key, state, occurred_at,
        tz_offset_min, day_anchor, source, device_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO NOTHING`,
    [
      id,
      userId,
      habitId,
      dateKey,
      state,
      occurredAt ?? clientTs,
      tzOffsetMin,
      dayAnchor,
      source,
      deviceId,
      createdAt ?? clientTs,
    ],
  );

  // `DO NOTHING` мовчазний за визначенням, і сам по собі він не розрізняє
  // «мій повтор» від «чужий рядок із таким самим id». Перевірка `row.user_id`
  // вище цього не закриває: вона звіряє payload із сесією, а не з тим, ХТО
  // вже володіє рядком у таблиці. Підібраний `id` (він тут TEXT і будується
  // клієнтом детерміновано, тобто вгадуваний) давав no-op і чесний `applied`
  // — тобто відмітка мовчки не доїжджала, і виглядало це як успіх. Owner-guard
  // дзеркалить сусідів (`applyPantryEvents.ts`, `applySyncGoals.ts`), тільки
  // там він стоїть на ретракції, а тут — на вставці, бо іншої мутації немає.
  if (res.rowCount === 0) {
    const existing = await client.query<{ user_id: string }>(
      `SELECT user_id FROM routine_completion_events WHERE id = $1`,
      [id],
    );
    // Рядок зник між INSERT-ом і SELECT-ом — таблиця append-only, тож це
    // неможливо штатно; трактуємо як не-наш рядок, а не як успіх.
    if (existing.rows.length === 0 || existing.rows[0]!.user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
  }
  return { status: "applied" };
}
