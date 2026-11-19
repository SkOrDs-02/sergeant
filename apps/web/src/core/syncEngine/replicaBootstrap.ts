/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Локальна копія акаунта один раз отримує з сервера ВСЕ, включно з записами,
 * які цей самий пристрій колись туди відправив.
 *
 * **Чому інакше записи «зникають».** Pull відсіює власні оп-и пристрою
 * (`origin_device_id IS DISTINCT FROM $3` у `syncV2Pull.ts` і `"skipped"` у
 * `applyPullOp.ts`): сервер вважає, що пристрій і так їх має. Але id
 * пристрою переживає скидання локальної копії: вихід і повторний вхід
 * (розділ акаунта стирається, а id лежить в анонімному KV, і його скидання
 * на виході влучає лише в розділ акаунта), сесію, де сховище працювало лише
 * в памʼяті, очищення сховища системою. Тоді pull з нуля приносив «сервер
 * мінус усе, що записав цей пристрій», і людина бачила дані місячної
 * давнини (дослідження 2026-11-19, відтворено тестом). Курсор живе в самому
 * файлі розділу й на новій копії стартує з 0, тож повний pull і мав лікувати:
 * заважав лише фільтр.
 *
 * **Що робимо.** Розділ, у якому ще немає позначки «відновлено», проходить
 * pull від нуля з одноразовим id {@link REPLICA_BOOTSTRAP_ORIGIN}. Він не
 * збігається з жодним реальним (ті — UUID), тож серверний фільтр пропускає
 * все, і рядки з `origin_device_id = NULL` теж: порожній заголовок їх би
 * відкинув, бо `NULL IS DISTINCT FROM NULL` хибне (див.
 * `packages/shared/src/lib/originDeviceId.ts`). Це етап 1 ADR-0106 («повний
 * pull без фільтра origin»), застосований один раз на копію. Серверних змін
 * немає, тож вікно деплою (фронт раніше за бекенд) нічого не ламає.
 *
 * Позначки немає в кожному НОВОМУ файлі розділу (вхід після виходу,
 * перевстановлення, очищене сховище) і в кожній сесії лише в памʼяті — саме
 * ті випадки, де записи зникали. Наявні копії проходять відновлення один раз
 * при викатці: так повертаються записи, які вже зникли раніше. Це той самий
 * шлях, що й перший вхід на новому пристрої (pull усього журналу, LWW у
 * `applyPullOp` зі строгим `>`), тож неспушені локальні правки новіші за
 * повернені оп-и й не затираються.
 *
 * **Власні `increment` пропускаються.** Вони не ідемпотентні
 * (`routine_streaks`, PN-лічильник): повтор на копії, де вони вже є, подвоїв
 * би лічильник. На новій копії через це бракує лише власних кліків у цьому
 * лічильнику, який вебова частина не показує; серверне значення від цього
 * не змінюється.
 *
 * **Лише з порожньою чергою.** Відновлення СТАРТУЄ, тільки коли в
 * `sync_op_outbox` цього користувача немає `pending`: неспушене жорстке
 * видалення інакше програло б повтору старого власного `insert` (рядок
 * повернувся б локально, а ехо видалення сюди не приходить). Так само
 * ADR-0106 рахує хеш лише при порожньому outbox. `dead_letter` / `rejected`
 * не заважають: на сервері їх немає, і повтор лише вирівнює копію з ним.
 * Поки черга не спорожніла, pull іде звичайно, а старт відкладається.
 *
 * **Перерване відновлення.** Позначка «триває» пишеться ДО першої сторінки
 * разом зі скиданням курсора на 0 і знімається лише після проходу до кінця
 * (`next_cursor === null`). Закрили застосунок посеред — наступний тік
 * продовжує з курсора в тому ж режимі, інакше решта власних оп-ів знову
 * відсіялась би.
 *
 * Межа: ретеншн журналу (ADR-0105) ще вимкнено. Щойно його ввімкнуть, pull
 * від нуля перестане відтворювати стан, і відновлення має перейти на
 * snapshot (етап 2 ADR-0106). Неспушене («У черзі») при перевстановленні
 * втрачається: його на сервері немає.
 */
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type { SyncV2PullOp } from "@sergeant/api-client";
import {
  readCursorValue,
  writeCursorValue,
  writePullSinceCursor,
} from "./syncOpCursor.js";

/**
 * Значення `X-Origin-Device-Id` на час відновлення. Ніколи не збігається з
 * реальним id (UUID) і коротше за серверну межу в 64 символи.
 */
export const REPLICA_BOOTSTRAP_ORIGIN = "replica-bootstrap";

export type PullMode = "normal" | "bootstrap";

const STATE_IN_PROGRESS = 1;
const STATE_DONE = 2;

function stateKey(userId: string): string {
  return `replica_bootstrap:${userId}`;
}

/** Чи є в черзі ще не відправлені записи цього користувача. */
async function hasPendingOutbox(
  client: SqliteMigrationClient,
  userId: string,
): Promise<boolean> {
  try {
    const rows = await client.all<{ one: number }>(
      `SELECT 1 AS one FROM sync_op_outbox
        WHERE user_id = ? AND status = 'pending' LIMIT 1`,
      [userId],
    );
    return rows.length > 0;
  } catch {
    // Черги в цьому розділі ще немає: нічого й не чекає відправки.
    return false;
  }
}

/**
 * Режим цього проходу pull. Розділ без позначки й без неспушеного починає
 * відновлення: курсор скидається на 0, позначка стає «триває». Повертає
 * курсор, з якого тягнути.
 */
export async function resolvePullMode(
  client: SqliteMigrationClient,
  userId: string,
  since: number,
): Promise<{ mode: PullMode; since: number }> {
  const state = await readCursorValue(client, stateKey(userId));
  if (state === STATE_DONE) return { mode: "normal", since };
  if (state === STATE_IN_PROGRESS) return { mode: "bootstrap", since };
  if (await hasPendingOutbox(client, userId)) return { mode: "normal", since };
  // Позначка спершу, курсор потім: обірваний між ними старт лишає «триває»
  // зі старим курсором, і наступний тік бере відновлення з нього, а не
  // мовчки повертається до звичайного pull.
  await writeCursorValue(client, stateKey(userId), STATE_IN_PROGRESS);
  if (since !== 0) await writePullSinceCursor(client, userId, 0);
  return { mode: "bootstrap", since: 0 };
}

/** Відновлення пройшло до кінця: далі звичайний pull із фільтром власних. */
export async function markReplicaBootstrapDone(
  client: SqliteMigrationClient,
  userId: string,
): Promise<void> {
  await writeCursorValue(client, stateKey(userId), STATE_DONE);
}

/**
 * Чи пропустити оп у режимі відновлення: власний `increment` уже може бути
 * в цій копії, а повтор подвоїв би лічильник (див. шапку).
 */
export function skipDuringBootstrap(
  op: SyncV2PullOp,
  ownDeviceId: string,
): boolean {
  return op.op === "increment" && op.origin_device_id === ownDeviceId;
}
