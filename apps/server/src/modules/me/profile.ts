import type { Pool, PoolClient } from "pg";
import type { UserProfilePayload, UserProfileResponse } from "@sergeant/shared";

type Queryable = Pick<Pool | PoolClient, "query">;

/**
 * `user_profile` (migration 115) write-through wiring — Stage 2/Stage 4 per
 * the migration's own header comment. This is deliberately NOT an
 * oplog-sync module (no LWW-guard, no `sync_op_log` involvement): one row
 * per user, single JSONB `payload`, plain upsert. Mirrors
 * `dataRights.ts::getUserPreferences` / `upsertUserPreferences` in shape
 * ("defaults, not 404" when no row exists yet).
 */

function maybeIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
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

export async function upsertUserProfile(
  db: Queryable,
  userId: string,
  profile: UserProfilePayload,
): Promise<UserProfileResponse> {
  const result = await db.query<{
    payload: unknown;
    updated_at: Date | string | null;
  }>(
    `INSERT INTO user_profile (user_id, payload, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       payload = EXCLUDED.payload,
       updated_at = NOW()
     RETURNING payload, updated_at`,
    [userId, JSON.stringify(profile)],
  );
  const row = result.rows[0]!;
  return {
    profile: (row.payload ?? {}) as UserProfilePayload,
    updatedAt: maybeIso(row.updated_at),
  };
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
