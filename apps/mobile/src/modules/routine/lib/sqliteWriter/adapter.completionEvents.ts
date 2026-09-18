import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type { DualWriteRuntime } from "@sergeant/dualwrite-core";
import { buildCompletionEventId } from "@sergeant/routine-domain";
import { resolveOriginDeviceId } from "@sergeant/shared";

import { fireSyncOutboxUpsert } from "@/core/syncEngine/fireSyncOutboxUpsert";
import { mobileKVStore } from "@/lib/storage";
import { COMPLETION_EVENT_INSERT_SQL } from "./adapter.completionEvents.sql";
import type { CompletionEventAppendOp } from "./diff";

/**
 * Хендлер op-kind-у `completion-event-append` — append-only журнал відміток.
 *
 * ДЗЕРКАЛО `apps/web/src/modules/routine/lib/sqliteWriter/adapter.completionEvents.ts`.
 * Розходження web/mobile тут = розходження ДАНИХ (канон §11), тому будь-яка
 * правка має їхати в обидва файли одним PR-ом.
 *
 * W1-ROUTINE-APPEND, СТАДІЯ 1. Окремий файл, а не ще одна функція в
 * `adapter.ts` (735 рядків) — і водночас
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
 *   - `dayAnchor = 'device-local'`: `dateKey` рахує `dateKeyFromDate`
 *     (`packages/routine-domain/src/dateKeys.ts`) з локального часу
 *     пристрою. Це ЧЕСНА фіксація поточної поведінки, а не схвалення
 *     доктрини — рішення Kyiv vs device-local (W1-TIME-DOCTRINE) ще не
 *     ухвалене, і з сирих `occurred_at` + `tz_offset_min` ключ можна
 *     буде перерахувати.
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
    "device-local",
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
      day_anchor: "device-local",
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
   * (`resolveOriginDeviceId` + `mobileKVStore`). Читання з KV дешеве і
   * синхронне; якщо сховище недоступне — подія все одно пишеться, просто
   * без атрибуції пристрою.
   */
  deviceId(): string | null {
    try {
      return resolveOriginDeviceId({ store: mobileKVStore });
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
      return -new Date().getTimezoneOffset();
    } catch {
      return null;
    }
  },
};
