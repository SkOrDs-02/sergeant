/**
 * SQL-константа append-only insert-у в журнал відміток.
 *
 * ДЗЕРКАЛО `apps/web/src/modules/routine/lib/sqliteWriter/adapter.sql.ts`
 * (константа `COMPLETION_EVENT_INSERT_SQL`) — байт-у-байт той самий текст.
 * На mobile решта SQL живе inline в `adapter.ts`; журнальний insert
 * винесено в окремий файл, щоб web і mobile snapshot-и порівнювались
 * тривіально, а append-only-семантика мала одну очевидну адресу.
 *
 * `INSERT OR IGNORE`, а НЕ `ON CONFLICT DO UPDATE`: подія незмінна, тож
 * повторна доставка того самого `id` (ретрай write-path-у) має бути
 * тихим no-op-ом, а не перезаписом. LWW-guard-у нема на що почепити —
 * у таблиці нема ні `updated_at`, ні `deleted_at`.
 *
 * AI-DANGER: не «уніфікуй» це з рештою upsert-ів. UPDATE-гілка тут
 * означала б редагування історії.
 */
export const COMPLETION_EVENT_INSERT_SQL = `INSERT OR IGNORE INTO routine_completion_events
           (id, user_id, habit_id, date_key, state, occurred_at,
            tz_offset_min, day_anchor, source, device_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
