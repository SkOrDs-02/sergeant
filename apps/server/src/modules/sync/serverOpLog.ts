/**
 * Last validated: 2026-08-28
 * Status: Active
 *
 * Серверний писар у `sync_op_log` — для рядків, які СЕРВЕР створює сам,
 * прямим SQL, поза `POST /api/sync/v2/push`.
 *
 * **Навіщо.** `syncV2Pull` читає ВИКЛЮЧНО `sync_op_log`
 * (`syncV2.ts::syncV2Pull`). Рядок, вставлений прямим INSERT-ом у
 * модульну таблицю, не має там жодного сліду — і НІКОЛИ не доїжджає на
 * пристрої, скільки б разів клієнт не пулив. Саме так імпорт виписки
 * (`finyk/import/commit.ts`) створював `finyk_manual_expenses`, яких
 * користувач не бачив у «Операціях», хоча повторне завантаження того
 * самого файлу чесно казало «схоже, вони вже є» (звіт власника
 * 2026-08-28). Емісія опа лікує це в корені: рядок їде тим самим
 * pull-каналом, що й будь-яка інша зміна, на ВСІ пристрої.
 *
 * **`origin_device_id = NULL` — навмисно.** Pull відсіює свій же пристрій
 * умовою `origin_device_id IS DISTINCT FROM $3`; `NULL` не збігається з
 * жодним device id, тож серверний оп отримують УСІ пристрої, включно з
 * тим, що ініціював запит. Міграція 027 прямо передбачає цей випадок
 * («NULL is legal … server-side replays»).
 *
 * **Ідемпотентність.** `idempotency_key` детермінований (його будує
 * викликач), `ON CONFLICT (user_id, idempotency_key) DO NOTHING` — тож
 * повторний прогін того самого серверного шляху не плодить опів.
 *
 * **`clientTs` — це LWW-годинник рядка, не «зараз».** Клієнт застосовує
 * оп із `applyPullOp.ts` і пише `client_ts` у локальний `updated_at`,
 * порівнюючи його з наявним: передавай `updated_at` РЯДКА, а не час
 * запиту — інакше серверна репліка старого рядка перекриє свіжішу
 * локальну правку.
 *
 * AI-DANGER: `status` тут завжди `'applied'` — це authoritative-оп, а не
 * журнал спроби. Не переводь його в `'duplicate'`/`'rejected'`: pull
 * фільтрує саме за `status = 'applied'`, і будь-яке інше значення тихо
 * зробить оп невидимим (той самий клас мовчазної втрати, що й повна
 * відсутність запису).
 */
import type { PoolClient } from "pg";

export interface ServerSyncOp {
  /** Детермінований ключ, ≤64 символів (конвенція API-шару, міграція
   * 027) — повторний виклик із тим самим ключем no-op. */
  idempotencyKey: string;
  op: "insert" | "delete";
  /** Повний payload рядка у формі КОЛОНОК цільової таблиці (`id`,
   * `user_id`, `data_json`, `created_at`, `updated_at`, `deleted_at`) —
   * клієнтський `applyPullOp` мапить ключі на колонки один-до-одного. */
  row: Record<string, unknown>;
  /** `updated_at` рядка, не час запиту (§ докстрінг). */
  clientTs: Date;
}

/**
 * Пише опи одним statement-ом (`unnest`, без інтерпольованих
 * плейсхолдерів — та сама обережність до `no-restricted-syntax`, що в
 * `finyk/import/batches.ts`). Повертає кількість РЕАЛЬНО вставлених
 * рядків: 0 означає, що всі ключі вже були (штатний повтор), а не збій.
 *
 * Викликати ВСЕРЕДИНІ тієї самої транзакції, що й сама зміна даних —
 * інакше ROLLBACK лишить оп про рядок, якого немає.
 */
export async function emitServerSyncOps(
  client: PoolClient,
  userId: string,
  tableName: string,
  ops: readonly ServerSyncOp[],
): Promise<number> {
  if (ops.length === 0) return 0;

  const result = await client.query(
    `INSERT INTO sync_op_log
       (user_id, idempotency_key, table_name, op, row, client_ts,
        origin_device_id, status, reject_reason)
     SELECT $1, s.k, $2, s.o, s.r::jsonb, s.t,
            NULL, 'applied', NULL
       FROM unnest($3::text[], $4::text[], $5::text[], $6::timestamptz[])
            AS s(k, o, r, t)
     ON CONFLICT (user_id, idempotency_key) DO NOTHING`,
    [
      userId,
      tableName,
      ops.map((o) => o.idempotencyKey),
      ops.map((o) => o.op),
      ops.map((o) => JSON.stringify(o.row)),
      ops.map((o) => o.clientTs.toISOString()),
    ],
  );
  return result.rowCount ?? 0;
}
