/**
 * Last validated: 2026-11-21
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
 * Межа: за увімкненої чистки журналу (`SYNC_OP_LOG_APPLIED_RETENTION_DAYS`,
 * ADR-0105 §2) pull від нуля вже не відтворює стан: сервер відповідає
 * `410 sync_cursor_expired`, і читач відновлює копію зі знімка
 * (`snapshotRestore.ts`), а позначку «готово» ставить сам знімок.
 * Неспушене («У черзі») при перевстановленні втрачається: його на сервері
 * немає.
 *
 * **Примусовий повтор за версією (`sync-lost-ops-repull`).** Позначка
 * «готово» чинна лише разом із версією проходу {@link REPLICA_REPULL_VERSION}
 * (ключ `sync_repull:<userId>`). Копія, що пройшла відновлення раніше
 * (або ніколи), з тими самими запобіжниками проходить його ЩЕ РАЗ, від нуля.
 * Рішення власника 2026-11-21: так лікуються пристрої з перестрибнутим до
 * advisory-локу курсором (`data-12`, оп-и, яких pull не віддав ніколи) і
 * рядки з tombstone, що лишився після «Повернути» до фіксу `data-02` (для
 * них у цьому режимі `applyPullOp` бере рядок сервера і при рівному
 * `updated_at`, див. `healTombstoneTie`). Черга не чіпається: старт лише з
 * порожнім `pending`, тож неспушене спершу доїжджає на сервер. Наступний
 * примусовий прохід = підняти версію.
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
/**
 * Примусовий повтор копії, яка вже колись відновилась повністю (старша
 * версія проходу). Окремо від {@link STATE_IN_PROGRESS}, щоб обірваний
 * повтор на наступному тіку не виглядав як перше відновлення порожньої
 * копії і не вмикав «Завантажую з хмари» (data-59/60) на наповненому
 * пристрої.
 */
const STATE_REPULL_IN_PROGRESS = 3;

/**
 * Версія примусового повного проходу. Позначка «готово» без цієї версії
 * (копія до 2026-11-21) означає ще один прохід від нуля (див. шапку).
 */
export const REPLICA_REPULL_VERSION = 1;

function stateKey(userId: string): string {
  return `replica_bootstrap:${userId}`;
}

function repullKey(userId: string): string {
  return `sync_repull:${userId}`;
}

/** Чи є в черзі ще не відправлені записи цього користувача. */
export async function hasPendingOutbox(
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
): Promise<{ mode: PullMode; since: number; firstReplica: boolean }> {
  const state = await readCursorValue(client, stateKey(userId));
  // Копія вже колись пройшла повне відновлення (зараз лише примусовий
  // повтор за версією): дані на пристрої є, порожній стан не загрожує.
  const firstReplica =
    state !== STATE_DONE && state !== STATE_REPULL_IN_PROGRESS;
  // Стан чинний лише для поточної версії проходу: «готово» чи «триває» зі
  // старшої версії означає новий прохід від нуля.
  const current =
    (await readCursorValue(client, repullKey(userId))) >=
    REPLICA_REPULL_VERSION;
  if (current && state === STATE_DONE)
    return { mode: "normal", since, firstReplica };
  if (
    current &&
    (state === STATE_IN_PROGRESS || state === STATE_REPULL_IN_PROGRESS)
  )
    return { mode: "bootstrap", since, firstReplica };
  if (await hasPendingOutbox(client, userId))
    return { mode: "normal", since, firstReplica };
  // Позначка спершу, курсор потім: обірваний між ними старт лишає «триває»
  // зі старим курсором, і наступний тік бере відновлення з нього, а не
  // мовчки повертається до звичайного pull.
  await writeCursorValue(
    client,
    stateKey(userId),
    firstReplica ? STATE_IN_PROGRESS : STATE_REPULL_IN_PROGRESS,
  );
  await writeCursorValue(client, repullKey(userId), REPLICA_REPULL_VERSION);
  if (since !== 0) await writePullSinceCursor(client, userId, 0);
  return { mode: "bootstrap", since: 0, firstReplica };
}

/**
 * Відновлення пройшло до кінця: далі звичайний pull із фільтром власних.
 * Версію проходу пишемо й тут: знімок (`snapshotRestore.ts`) відновлює
 * копію цілком і так само закриває примусовий прохід.
 */
export async function markReplicaBootstrapDone(
  client: SqliteMigrationClient,
  userId: string,
): Promise<void> {
  await writeCursorValue(client, repullKey(userId), REPLICA_REPULL_VERSION);
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
