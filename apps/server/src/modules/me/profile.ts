import type { Pool, PoolClient } from "pg";
import type { UserProfilePayload, UserProfileResponse } from "@sergeant/shared";

type Queryable = Pick<Pool | PoolClient, "query">;

/**
 * `user_profile` (migration 115) write-through wiring - Stage 2/Stage 4 per
 * the migration's own header comment. Still NOT an oplog-sync module (no
 * `sync_op_log` involvement): one row per user, single JSONB `payload`.
 * Mirrors `dataRights.ts::getUserPreferences` / `upsertUserPreferences` in
 * shape ("defaults, not 404" when no row exists yet).
 *
 * `upsertUserProfile` carries a narrow LWW-guard since 2026-09-23 (owner
 * decision, `docs/work/specs/tech-debt/backend.md`), scoped to the
 * `memoryBank` section only, see {@link resolveMemoryBankGuard}. Biometrics
 * and every other section of the payload stay blind-replace ON PURPOSE: a
 * single shared timestamp across sections would be wrong the moment
 * biometrics and the memory bank are edited on different devices at
 * different times.
 *
 * Known limitation (documented, not fixed, accepted 2026-09-23):
 * `memoryBank.updatedAt` is CLIENT-set on every local edit (the one
 * exception is a server-side bump in {@link removeMemoryBankEntry}), so a
 * device with a badly lagging clock can still lose its own genuinely newer
 * edit to a device with a correct clock. Narrow scenario (two devices
 * editing the bank within the guard's decision window, one with a broken
 * clock); a wrong clock is a pre-existing user problem the guard does not
 * make worse, it only stops the wider, silent "any late push wins"
 * resurrection bug.
 */

function maybeIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function extractMemoryBankSection(
  payload: unknown,
): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const memoryBank = (payload as Record<string, unknown>)["memoryBank"];
  if (
    !memoryBank ||
    typeof memoryBank !== "object" ||
    Array.isArray(memoryBank)
  ) {
    return null;
  }
  return memoryBank as Record<string, unknown>;
}

/** `null` коли `value` не рядок або не парситься у валідну дату. */
function parseValidDateMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * LWW-guard рівно для секції `memoryBank` (рішення власника 2026-09-23).
 * Спрацьовує лише коли ОБИДВІ мітки `memoryBank.updatedAt` (збережена і
 * вхідна) парсяться у валідну дату І вхідна СТАРІША за збережену: тоді
 * збережена секція `memoryBank` лишається, а решта payload-а (біометрія,
 * усе інше) береться з вхідного. У будь-якому іншому випадку (відсутня
 * секція/мітка з будь-якого боку, непарсна мітка, рівні мітки, вхідна
 * новіша) поведінка та сама, що й раніше: вхідний payload повністю
 * замінює збережений (зворотно сумісно зі старими клієнтами без
 * `memoryBank.updatedAt`).
 */
function resolveMemoryBankGuard(
  storedPayload: unknown,
  incomingPayload: UserProfilePayload,
): UserProfilePayload {
  const storedBank = extractMemoryBankSection(storedPayload);
  const incomingBank = extractMemoryBankSection(incomingPayload);
  if (!storedBank || !incomingBank) return incomingPayload;

  const storedMs = parseValidDateMs(storedBank["updatedAt"]);
  const incomingMs = parseValidDateMs(incomingBank["updatedAt"]);
  if (storedMs === null || incomingMs === null || incomingMs >= storedMs) {
    return incomingPayload;
  }

  return { ...incomingPayload, memoryBank: storedBank };
}

export async function getUserProfile(
  db: Queryable,
  userId: string,
): Promise<UserProfileResponse> {
  const result = await db.query<{
    payload: unknown;
    updated_at: Date | string | null;
  }>(`SELECT payload, updated_at FROM user_profile WHERE user_id = $1`, [
    userId,
  ]);
  if (result.rows.length === 0) {
    return { profile: {}, updatedAt: null };
  }
  const row = result.rows[0]!;
  return {
    profile: (row.payload ?? {}) as UserProfilePayload,
    updatedAt: maybeIso(row.updated_at),
  };
}

/**
 * Race-safe вибір: транзакція + `SELECT ... FOR UPDATE` на pooled client
 * (той самий ідіом, що `listRoute.ts::deleteMemoryHandler`), а не один
 * атомарний `INSERT ... ON CONFLICT DO UPDATE SET payload = CASE ...`.
 * Причина: порівняння міток часу лишається
 * в JS (`Date.parse`, ніколи не кидає), а не в SQL-каст `::timestamptz`,
 * який на спотвореному збереженому рядку впав би помилкою просто на
 * звичайному записі профілю. `FOR UPDATE` блокує рядок на час транзакції,
 * тож два паралельні PUT-и того самого юзера не бачать один одного
 * "напівпримінений" стан і не губляться в read-modify-write гонці.
 */
export async function upsertUserProfile(
  pool: Pool,
  userId: string,
  profile: UserProfilePayload,
): Promise<UserProfileResponse> {
  const client = await pool.connect();
  let rollbackFailed = false;
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ payload: unknown }>(
      `SELECT payload FROM user_profile WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    const nextPayload =
      existing.rows.length > 0
        ? resolveMemoryBankGuard(existing.rows[0]!.payload, profile)
        : profile;

    const result = await client.query<{
      payload: unknown;
      updated_at: Date | string | null;
    }>(
      `INSERT INTO user_profile (user_id, payload, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         payload = EXCLUDED.payload,
         updated_at = NOW()
       RETURNING payload, updated_at`,
      [userId, JSON.stringify(nextPayload)],
    );
    await client.query("COMMIT");
    const row = result.rows[0]!;
    return {
      profile: (row.payload ?? {}) as UserProfilePayload,
      updatedAt: maybeIso(row.updated_at),
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
      rollbackFailed = true;
    });
    throw err;
  } finally {
    if (rollbackFailed) client.release(true);
    else client.release();
  }
}

export interface RemoveMemoryBankEntryResult {
  /** `false` — не було рядка / секції `memoryBank` / факту з таким id (ідемпотентно). */
  removed: boolean;
}

/**
 * L-8 Фаза 2 (2026-08-09) — узгоджене видалення. Викликається з
 * `ai-memory/listRoute.ts::buildMemoryDeleteHandler` в ОДНІЙ транзакції з
 * `DELETE FROM ai_memories`, коли стертий рядок мав `source='profile'`:
 * без цього наступний write-through пуш профілю (Фаза 2 дзеркалення,
 * `profileMirror.ts`) мовчки повертає "видалений" факт назад, бо він і
 * досі сидить у `user_profile.payload.memoryBank.entries` — сервер бачить
 * source_ref, якого немає серед наявних `ai_memories`-рядків, і вставляє
 * його наново.
 *
 * `db` приймає і `Pool`, і транзакційний `PoolClient` — викликач тримає
 * DELETE + цю зміну в ОДНІЙ транзакції (`BEGIN`/`COMMIT`/`ROLLBACK` у
 * `listRoute.ts`), щоб обидві зміни приземлились разом або жодна.
 *
 * `SELECT ... FOR UPDATE` блокує рядок на час транзакції — два паралельні
 * DELETE того самого юзера (різні факти, той самий момент) не мають
 * загубити одна одну через read-modify-write гонку на тому самому JSONB.
 */
export async function removeMemoryBankEntry(
  db: Queryable,
  userId: string,
  entryId: string,
): Promise<RemoveMemoryBankEntryResult> {
  const result = await db.query<{ payload: unknown }>(
    `SELECT payload FROM user_profile WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  if (result.rows.length === 0) {
    // Рядка `user_profile` взагалі немає — узгоджувати нема з чим. Не
    // помилка: наприклад, `ai_memories`-рядок міг лишитись від старого
    // ручного ingest-у до того, як цей юзер хоч раз зберіг профіль.
    return { removed: false };
  }
  const payload = result.rows[0]!.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { removed: false };
  }
  const payloadObj = payload as Record<string, unknown>;
  const memoryBank = payloadObj["memoryBank"];
  if (
    !memoryBank ||
    typeof memoryBank !== "object" ||
    Array.isArray(memoryBank)
  ) {
    return { removed: false };
  }
  const memoryBankObj = memoryBank as Record<string, unknown>;
  const entries = memoryBankObj["entries"];
  if (!Array.isArray(entries)) {
    return { removed: false };
  }

  const nextEntries = entries.filter((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      return true;
    return (entry as Record<string, unknown>)["id"] !== entryId;
  });
  if (nextEntries.length === entries.length) {
    // Факту з таким id у банку вже нема — подвійний тап / гонка кількох
    // вкладок. Ідемпотентно, як і сам DELETE-хендлер у listRoute.ts.
    return { removed: false };
  }

  const nextPayload: Record<string, unknown> = {
    ...payloadObj,
    memoryBank: {
      ...memoryBankObj,
      entries: nextEntries,
      // Бампимо мітку часу секції: інший пристрій, що ще не бачив цього
      // видалення, на наступному reconcile (`reconcileMemoryBankWithServerProfile`
      // у веб-клієнті) порівнює САМЕ `memoryBank.updatedAt`, і серверна
      // версія має виглядати не старішою за той пристрій, що прострочив
      // синхронізацію — інакше стара локальна копія з фактом, що його
      // щойно видалили тут, переможе і воскресить факт при наступному пуші.
      updatedAt: new Date().toISOString(),
    },
  };

  await db.query(
    `UPDATE user_profile SET payload = $2::jsonb, updated_at = NOW() WHERE user_id = $1`,
    [userId, JSON.stringify(nextPayload)],
  );
  return { removed: true };
}
