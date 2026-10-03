import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type { DualWriteRuntime } from "@sergeant/dualwrite-core";
import { buildCompletionEventId } from "@sergeant/routine-domain";
import { resolveOriginDeviceId } from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";

import { fireSyncOutboxUpsert } from "../../../../core/syncEngine/fireSyncOutboxUpsert.js";
import { ROUTINE_DAY_ANCHOR } from "../dayAnchor.js";
import { COMPLETION_EVENT_INSERT_SQL } from "./adapter.sql.js";
import type { CompletionEventAppendOp } from "./diff.js";

/**
 * Хендлер op-kind-у `completion-event-append` — append-only журнал відміток.
 *
 * W1-ROUTINE-APPEND, СТАДІЯ 1. Окремий файл, а не ще одна функція в
 * `adapter.ts` (561 рядок при ліміті 600, Hard Rule #18) — і водночас
 * фізична межа: append-only-логіка не має змішуватись із LWW-upsert-ами
 * решти таблиць.
 *
 * Що тут ВАЖЛИВО і чого свідомо НЕМАЄ:
 *
 *   - `INSERT OR IGNORE`, без `ON CONFLICT DO UPDATE` і без `deleted_at`.
 *     Подія незмінна; ретрай того самого запису — тихий no-op завдяки
 *     детермінованому `id`.
 *   - жодного `routine_streaks`-інкремента. Лічильник кліків — власність
 *     старого шляху (`addCompletion`/`removeCompletion` в `adapter.ts`);
 *     дублювати його з журналу означало б рахувати кожен toggle двічі.
 *   - `dayAnchor` — НЕ літерал. Значення приходить із
 *     `ROUTINE_DAY_ANCHOR` (`../dayAnchor.ts`), тобто з того самого
 *     файлу, що продукує «сьогодні» для UI. Доти, доки тут стояв
 *     захардкоджений `'device-local'`, колонка брехала: `date_key`
 *     приходив із київського «сьогодні» (`RoutineApp.helpers.todayDate`
 *     / `HabitDetailSheet.todayKey`, обидва через `getKyivDateParts`), а
 *     метадані заявляли девайсовий анкер — тобто будь-яка майбутня
 *     міграція чи аналітика, що довіриться колонці, класифікує ці рядки
 *     не туди. Сирі `occurred_at` + `tz_offset_min` лишаються поруч, тож
 *     ключ і далі можна перерахувати, якщо колись знадобиться.
 *   - **Cutover 2026-09-01 (LOG-3, ADR-0078):** `ROUTINE_DAY_ANCHOR`
 *     перемкнуто `kyiv` → `device-local` — `date_key` тепер рахується за
 *     годинником пристрою. Рядки, записані ДО цієї дати, лишаються з
 *     `day_anchor = 'kyiv'` (а ще старіші — з `'device-local'`, хоча ключ
 *     у них був київський, див. коментар вище) — історія не
 *     переанкорюється (ADR-0078 §4).
 */
export async function appendCompletionEvent(
  client: SqliteMigrationClient,
  op: CompletionEventAppendOp,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  const deviceId = completionEventEnv.deviceId();
  const tzOffsetMin = completionEventEnv.tzOffsetMin();
  const id = buildCompletionEventId({
    habitId: op.habitId,
    dateKey: op.dateKey,
    state: op.state,
    deviceId,
  });

  await client.run(COMPLETION_EVENT_INSERT_SQL, [
    id,
    userId,
    op.habitId,
    op.dateKey,
    op.state,
    clientTs,
    tzOffsetMin,
    ROUTINE_DAY_ANCHOR,
    "ui",
    deviceId,
    clientTs,
  ]);

  fireSyncOutboxUpsert(client, {
    userId,
    table: "routine_completion_events",
    op: "insert",
    clientTs,
    row: {
      id,
      user_id: userId,
      habit_id: op.habitId,
      date_key: op.dateKey,
      state: op.state,
      occurred_at: clientTs,
      tz_offset_min: tzOffsetMin,
      day_anchor: ROUTINE_DAY_ANCHOR,
      source: "ui",
      device_id: deviceId,
      created_at: clientTs,
    },
  });
}

/**
 * Єдина точка, де append-шлях читає ОТОЧЕННЯ (пристрій, таймзона).
 *
 * Винесено в експортований обʼєкт навмисно: `adapter.snapshot.test.ts`
 * пінить SQL і параметри байт-у-байт, а device-id та tz-offset залежать
 * від машини, де крутиться CI. Тест підміняє ці два методи через
 * `vi.spyOn` — без цього гейт був би flaky. Прод-код ходить сюди ж.
 */
export const completionEventEnv = {
  /**
   * Той самий device-id, що синк ставить у `X-Origin-Device-Id`
   * (`resolveOriginDeviceId` + `webKVStore`). Читання з KV дешеве і
   * синхронне; якщо сховище недоступне — подія все одно пишеться, просто
   * без атрибуції пристрою.
   */
  deviceId(): string | null {
    try {
      return resolveOriginDeviceId({ store: webKVStore });
    } catch {
      return null;
    }
  },
  /** Зсув таймзони пристрою у хвилинах (схід від UTC — додатний). */
  tzOffsetMin(): number | null {
    try {
      // Потрібен саме зсув таймзони ПРИСТРОЮ, а не Kyiv-якірний день:
      // подія фіксує сирий факт, щоб доктрину (Kyiv vs device-local)
      // можна було переграти пізніше з `occurred_at` + `tz_offset_min`.
      // eslint-disable-next-line no-restricted-syntax -- див. коментар вище
      return -new Date().getTimezoneOffset();
    } catch {
      return null;
    }
  },
};
