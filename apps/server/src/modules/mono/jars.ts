import { query } from "../../db.js";
import { logger } from "../../obs/logger.js";
import { MONO_API_TIMEOUT_MS } from "./connection.js";
import {
  monoKeyRing,
  decryptAndLazyReencrypt,
  type MonoTokenRow,
} from "./tokenStore.js";

/**
 * Shape of one entry in Monobank's `/personal/client-info` `jars[]` array.
 * Docs: https://api.monobank.ua/docs/personal.html
 */
export interface MonoClientInfoJar {
  id: string;
  sendId?: string;
  title?: string;
  description?: string;
  currencyCode?: number;
  balance?: number;
  goal?: number;
}

export interface UpsertJarsOptions {
  /**
   * `true` лише коли `jars` — повна й авторитетна відповідь Monobank:
   * `/personal/client-info` повернув 2xx і поле `jars` у ній є масивом.
   * Тоді банки користувача, яких у списку немає, видаляються (закрита банка
   * не має лишатись у капіталі). Відсутнє поле `jars` авторитетним
   * порожнім списком НЕ є: викликач передає `false`.
   */
  authoritative?: boolean;
}

/**
 * Upsert jars from a client-info response into `mono_jar` (migration 088).
 * Mirrors the `mono_account` upsert loop in `connection.ts` — same
 * `ON CONFLICT (user_id, mono_jar_id) DO UPDATE` shape.
 *
 * За `authoritative: true` після upsert-у ще й прибирає з `mono_jar` банки,
 * яких Mono більше не віддає (закриті/розбиті). `mono_account.is_jar` і
 * `mono_transaction` не чіпає: історія операцій банки лишається.
 */
export async function upsertJars(
  userId: string,
  jars: readonly MonoClientInfoJar[],
  options: UpsertJarsOptions = {},
): Promise<void> {
  const authoritative = options.authoritative === true;

  // Порожній неавторитетний `jars[]` — «невідомо, що там у Mono»: поле
  // відсутнє у відповіді, а не явно порожнє. Видаляти за такого нічого, а
  // реконсиляція безпредметна, тож гілка лишається чистим no-op-ом. (Явно
  // порожній `jars[]` з успішного client-info — авторитетний: людина закрила
  // останню банку, і DELETE нижче мусить її прибрати.)
  if (jars.length === 0 && !authoritative) return;

  for (const jar of jars) {
    await query(
      `INSERT INTO mono_jar
         (user_id, mono_jar_id, send_id, title, description, currency_code,
          balance, goal, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (user_id, mono_jar_id) DO UPDATE SET
         send_id = EXCLUDED.send_id,
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         currency_code = EXCLUDED.currency_code,
         balance = EXCLUDED.balance,
         goal = EXCLUDED.goal,
         last_seen_at = NOW()`,
      [
        userId,
        jar.id,
        jar.sendId ?? null,
        jar.title ?? null,
        jar.description ?? null,
        jar.currencyCode ?? 0,
        jar.balance ?? null,
        jar.goal ?? null,
      ],
      { op: "mono_jar_upsert" },
    );
  }

  // Закриті банки. Monobank віддає в client-info лише живі банки; закриття
  // («розбити») переносить гроші на картку, тож без видалення рядок `mono_jar`
  // лишався б із останнім балансом назавжди, а `sumJarsUAH` додавав би його в
  // капітал вдруге. Цілі, привʼязані до такої банки, клієнт уже переживає
  // (`jarsById.get` дає undefined). Працює й для явно порожнього `jars[]`.
  if (authoritative) {
    await query(
      `DELETE FROM mono_jar
        WHERE user_id = $1
          AND NOT (mono_jar_id = ANY($2::text[]))`,
      [userId, jars.map((j) => j.id)],
      { op: "mono_jar_prune_closed" },
    );
  }

  // Нема живих банок — нема чого й реконсилювати.
  if (jars.length === 0) return;

  // Реконсиляція заглушок-привидів (міграція 119).
  //
  // Вебхук створює рядок у `mono_account` для БУДЬ-ЯКОГО невідомого
  // рахунку, включно з банкою — інакше транзакцію банки нікуди покласти
  // (FK `mono_transaction` → `mono_account`). Момент, коли ми вперше
  // дізнаємось, що цей id насправді банка, — саме тут: client-info
  // приніс `jars[]`. Позначка знімає рядок зі списку карток і з
  // капіталу, а транзакції на ньому лишаються.
  //
  // Чому не досить позначки в самому вебхуку: банку можна створити й
  // одразу поповнити між двома читаннями client-info, тож заглушка
  // зʼявляється РАНІШЕ за відповідний `mono_jar`. Ця гілка добирає такі
  // випадки на наступному ж синку.
  //
  // `is_jar = FALSE` у WHERE робить UPDATE no-op-ом у сталому стані —
  // жодного запису, коли реконсилювати нічого.
  await query(
    `UPDATE mono_account a
        SET is_jar = TRUE
       FROM mono_jar j
      WHERE a.user_id = $1
        AND a.is_jar = FALSE
        AND j.user_id = a.user_id
        AND j.mono_jar_id = a.mono_account_id`,
    [userId],
    { op: "mono_account_jar_reconcile" },
  );
}

/**
 * Best-effort refresh of `mono_jar` from a fresh `/personal/client-info`
 * call, using the user's already-stored (encrypted) Mono token.
 *
 * Called from `GET /api/mono/jars` so jar balances stay fresh "at every
 * regular sync / Фінік open" (spec decision #5 — no separate realtime
 * needed) without a cron or webhook: reads are infrequent (React Query
 * `staleTime` on the web side already throttles this to a few calls/hour
 * per user) and Monobank's client-info endpoint has no documented rate
 * limit tighter than the webhook-register call this module already makes
 * at connect time.
 *
 * Swallows all errors — a Monobank outage must never turn a jars read into
 * a 500; the handler falls back to whatever `mono_jar` already has from the
 * last successful refresh.
 */
export async function refreshJarsFromMono(userId: string): Promise<void> {
  const ring = monoKeyRing();
  if (!ring) return;

  try {
    const connResult = await query<MonoTokenRow>(
      `SELECT token_ciphertext, token_iv, token_tag, token_key_version
       FROM mono_connection WHERE user_id = $1 AND status = 'active'`,
      [userId],
      { op: "mono_jars_refresh_connection_select" },
    );
    const row = connResult.rows[0];
    if (!row) return;

    const token = await decryptAndLazyReencrypt(row, userId, ring);
    const res = await fetch("https://api.monobank.ua/personal/client-info", {
      headers: { "X-Token": token },
      signal: AbortSignal.timeout(MONO_API_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn({
        msg: "mono_jars_refresh_upstream_error",
        status: res.status,
      });
      return;
    }

    const clientInfo = (await res.json()) as { jars?: MonoClientInfoJar[] };
    // Авторитетний список — лише успішна відповідь (`res.ok` вище) з полем
    // `jars`-масивом. Відсутнє поле не вважаємо порожнім списком: інакше
    // збій чи зміна формату у Mono стерли б усі банки користувача.
    await upsertJars(userId, clientInfo.jars ?? [], {
      authoritative: Array.isArray(clientInfo.jars),
    });
  } catch (err) {
    logger.warn({
      msg: "mono_jars_refresh_failed",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
