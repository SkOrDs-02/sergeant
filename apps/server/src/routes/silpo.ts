import type { Request, Response } from "express";
import { Router } from "express";
import { env } from "../env/env.js";
import { query } from "../db.js";
import { logger } from "../obs/logger.js";
import { rateLimitExpress, requireSession, setModule } from "../http/index.js";
import { parseQuery, parseBody } from "../http/validate.js";
import { getWebAppOrigin } from "../auth/verificationMail.js";
import {
  SilpoDisconnectResponseSchema,
  SilpoReceiptDetailDtoSchema,
  SilpoReceiptsPageSchema,
  SilpoReceiptsQuerySchema,
  SilpoSyncResultSchema,
  SilpoSyncStateSchema,
  SilpoRelinkRequestSchema,
  SilpoRelinkResponseSchema,
  SilpoUnlinkResponseSchema,
  SilpoWipeResponseSchema,
} from "../http/schemas.js";
import {
  buildAuthorizationUrl,
  consumeAuthorizationState,
  exchangeCode,
} from "../modules/silpo/oauth.js";
import {
  clearOAuthBindingCookie,
  setOAuthBindingCookie,
  verifyOAuthBinding,
} from "../modules/silpo/oauthBinding.js";
import { persistTokens, silpoKeyRing } from "../modules/silpo/tokenStore.js";
import { diagnoseSilpo } from "../modules/silpo/diagnose.js";
import { AppError, ExternalServiceError } from "../obs/errors.js";
import {
  getReceiptDetail,
  listReceipts,
  pullAndSyncReceipts,
  relinkReceiptToTransaction,
  unlinkReceiptFromTransaction,
} from "../modules/silpo/receipts.js";
import {
  assertSilpoEnabled,
  getUserId,
  type AuthedRequest,
} from "../modules/silpo/routeHelpers.js";
import {
  cartApplyHandler,
  cartClearHandler,
  cartGetHandler,
  cartPreviewHandler,
} from "./silpoCart.js";
import {
  pantryClaimHandler,
  pantryReleaseHandler,
  settingsHandler,
} from "./silpoPantry.js";

/**
 * `GET /api/silpo/connect|callback`, `POST /api/silpo/disconnect|wipe|sync`,
 * `GET /api/silpo/sync-state|receipts|receipts/:id`. Mirrors the Monobank
 * route shape (`routes/mono-webhook.js` + `modules/mono/connection.ts`)
 * where the flow allows — OAuth redirect handshake is new here (Monobank
 * uses a static personal token, no browser round-trip).
 *
 * Every handler is gated by `assertSilpoEnabled` (kill switch — spec § Рішення дизайну,
 * "`SILPO_ENABLED` як kill switch"). `SILPO_ENABLED=false` лишається
 * дефолтом: обидва продуктові гейти знято 2026-08-18 (оферта — як
 * операційний ризик, приватність — текст затверджено), але вмикання в
 * проді — окремий ops-крок із власним DCR-клієнтом
 * (`docs/start/instructions/enable-silpo-integration.md`).
 *
 * Сесію вимагають УСІ роути, крім `GET /api/silpo/callback`: він
 * реєструється до router-level `requireSession()`, бо приземляється на
 * PUBLIC_API_BASE_URL, де куки сесії (домен BETTER_AUTH_URL) немає ні в
 * кого. Контекст користувача там приходить зі `state`.
 *
 * Every route also carries its own `rateLimitExpress` bucket (CodeQL
 * "missing rate limiting" finding, review round) — unlike `finyk`/
 * `nutrition`, this router has no single broad `r.use(...)` bucket covering
 * `/api/silpo/*`, so each `r.get`/`r.post` below needs an explicit limiter.
 */

function callbackRedirectUri(): string | null {
  return env.PUBLIC_API_BASE_URL
    ? `${env.PUBLIC_API_BASE_URL}/api/silpo/callback`
    : null;
}

/** Redirects the browser back to the web Settings page with a `?silpo=` status flag. Falls back to a JSON body when the web origin cannot be resolved (misconfigured deploy — see `getWebAppOrigin`). */
function redirectToSettings(
  res: Response,
  status: "connected" | "error",
  reason?: string,
): void {
  const webOrigin = getWebAppOrigin();
  if (!webOrigin) {
    res.status(status === "connected" ? 200 : 400).json({ status, reason });
    return;
  }
  const url = new URL("/settings", webOrigin);
  url.searchParams.set("silpo", status);
  if (reason) url.searchParams.set("reason", reason);
  res.redirect(302, url.toString());
}

// ────────────────────────────── Connect / callback ───────────────────────────

export async function connectHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const redirectUri = callbackRedirectUri();
  if (!redirectUri) {
    res.status(503).json({
      error: "Сільпо-інтеграція не налаштована на сервері",
      code: "SILPO_CONFIG_MISSING",
    });
    return;
  }

  try {
    const { url, state } = await buildAuthorizationUrl({ userId, redirectUri });
    // sec-15: привʼязуємо state до цього браузера (див. `oauthBinding.ts`).
    setOAuthBindingCookie(res, state, redirectUri.startsWith("https://"));
    res.redirect(302, url);
  } catch (err) {
    logger.warn({
      msg: "silpo_connect_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    res.status(502).json({
      error: "Не вдалося розпочати підключення до Сільпо",
      code: "SILPO_UPSTREAM_ERROR",
    });
  }
}

export async function callbackHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;

  const {
    code,
    state,
    error: oauthError,
  } = req.query as {
    code?: string;
    state?: string;
    error?: string;
  };

  if (oauthError) {
    redirectToSettings(res, "error", "denied");
    return;
  }
  if (
    !code ||
    typeof code !== "string" ||
    !state ||
    typeof state !== "string"
  ) {
    redirectToSettings(res, "error", "invalid_request");
    return;
  }

  // sec-15: ДО споживання state перевіряємо, що колбек приніс той самий
  // браузер, що зробив `/connect`. Без цього чужий authorize-URL, пересланий
  // жертві, зберіг би токени жертви на userId ініціатора. Чужий state не
  // споживаємо: це не наш flow, і його власник завершить його сам.
  if (!verifyOAuthBinding(req, state)) {
    logger.warn({ msg: "silpo_callback_binding_mismatch" });
    redirectToSettings(res, "error", "invalid_state");
    return;
  }
  const secureCookie = callbackRedirectUri()?.startsWith("https://") ?? false;
  // Кука своє відслужила за будь-якого подальшого результату.
  clearOAuthBindingCookie(res, secureCookie);

  const pending = await consumeAuthorizationState(state);
  if (!pending) {
    // Unknown, expired or already-consumed state — the only hard gate here.
    redirectToSettings(res, "error", "invalid_state");
    return;
  }

  // `state` — НОСІЙ контексту, не просто nonce: `user_id` лежить у
  // `silpo_oauth_state` (міграція 126), записаний на `/connect`, де сесія
  // ще була. Саме тому цей роут навмисно НЕ під `requireSession()`.
  //
  // Причина не в тому, що сесія «може протухнути за 10 хвилин». Колбек
  // приземляється на PUBLIC_API_BASE_URL (api.167-233-98-92.sslip.io), а
  // сесія Better Auth живе у контексті BETTER_AUTH_URL
  // (sergeant.vercel.app) — це РІЗНІ сайти, і Vercel не проксіює /api/*
  // на бекенд. Тобто на колбеку сесії немає НІКОЛИ й ні в кого: вимога
  // `requireSession()` тут робила фічу непрацездатною для всіх, віддаючи
  // 401-JSON у вкладку замість екрана налаштувань.
  //
  // Звірки з `req.user` тут свідомо НЕМАЄ: роут стоїть до `requireSession()`,
  // тож `req.user` не заповнюється ніколи, і така умова була б мертвим
  // кодом, що вдає захист.
  //
  // Але одного `state` для визначення власника НЕДОСТАТНЬО (sec-15,
  // RFC 9700 § 4.7). `state` видно в `Location` будь-якого `/connect`:
  // зловмисник під своєю сесією забирає свій authorize-URL і пересилає його
  // жертві (свіжий можна генерувати на льоту, TTL 10 хв не заважає). Жертва
  // погоджується на справжній сторінці Сільпо, колбек обмінює ЇЇ `code` і
  // кладе ЇЇ токени на userId зловмисника, а той читає чеки й керує кошиком
  // жертви. Тобто підсунутий чужий `state` шкодить саме жертві; колишній
  // висновок «привʼяже до самого зловмисника, отже нешкідливо» був хибним.
  //
  // Тому `state` привʼязаний до браузера: `/connect` ставить HttpOnly
  // SameSite=Lax куку з `sha256(state)` (Path=/api/silpo/callback, 10 хв), а
  // перевірка вище, ДО споживання state, вимагає її збігу. Кука є лише в
  // браузері, який зробив `/connect`; у браузер жертви зловмисник її
  // підкласти не може, тож пересланий URL закінчується `invalid_state`, а
  // токени не зберігаються. Replay того самого state неможливий: він
  // згорає одним атомарним `DELETE ... RETURNING`.
  const userId = pending.userId;

  const ring = silpoKeyRing();
  if (!ring) {
    redirectToSettings(res, "error", "config_missing");
    return;
  }

  try {
    const tokens = await exchangeCode({
      code,
      codeVerifier: pending.codeVerifier,
      redirectUri: pending.redirectUri,
    });
    if (!tokens.refresh_token) {
      // Migration 123 has NOT NULL refresh_token_* columns — a code
      // exchange without one is unusable and must not be persisted.
      logger.warn({ msg: "silpo_callback_missing_refresh_token" });
      redirectToSettings(res, "error", "missing_refresh_token");
      return;
    }
    await persistTokens(userId, ring, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAtMs: tokens.expires_in
        ? Date.now() + tokens.expires_in * 1000
        : null,
    });
    logger.info({ msg: "silpo.connected" });
    redirectToSettings(res, "connected");
  } catch (err) {
    logger.warn({
      msg: "silpo_callback_exchange_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    redirectToSettings(res, "error", "exchange_failed");
  }
}

// ────────────────────────────── Disconnect / wipe ─────────────────────────────

/** Mono-pattern: deletes only `silpo_connection` — receipts/items/links survive. */
export async function disconnectHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  await query("DELETE FROM silpo_connection WHERE user_id = $1", [userId], {
    op: "silpo_connection_delete",
  });
  logger.info({ msg: "silpo.disconnected" });
  res.status(200).json(SilpoDisconnectResponseSchema.parse({ ok: true }));
}

/** Full erasure: `silpo_receipts` cascades to items + `silpo_tx_receipt_links`. User-confirmed `finyk_tx_splits` / pantry-events are NEVER touched. */
export async function wipeHandler(req: Request, res: Response): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const result = await query(
    "DELETE FROM silpo_receipts WHERE user_id = $1",
    [userId],
    { op: "silpo_receipts_wipe" },
  );
  const deletedReceipts = result.rowCount ?? 0;
  logger.info({ msg: "silpo.wiped", deletedReceipts });
  res
    .status(200)
    .json(SilpoWipeResponseSchema.parse({ ok: true, deletedReceipts }));
}

// ────────────────────────────────── Sync ───────────────────────────────────

type SyncStateConnRow = {
  status: "connected" | "reauth_required";
  access_token_expires_at: Date | string | null;
  last_sync_at: Date | string | null;
  last_failed_at: Date | string | null;
  last_error_code: string | null;
  pantry_auto_import_since: Date | string | null;
};
type SyncStateCountRow = { count: string };

function toIsoOrNull(v: Date | string | null): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : v;
}

/**
 * `GET /api/silpo/diag` — «що саме зламано», без походу в серверні логи.
 *
 * `SILPO_SCHEMA_DRIFT` показує людині одну копію на кілька різних причин, а
 * причину пише лише в лог (звіт власника 2026-09-13: «пише все одно, що
 * змінили формат»). Цей ендпоінт віддає рівно ті докази, яких бракує:
 * чи на місці потрібні тули і якої форми відповідь. Вміст покупок не
 * повертає — самі імена ключів і лічильники (Hard Rule #21).
 */
export async function diagHandler(req: Request, res: Response): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const result = await diagnoseSilpo(userId);
  logger.info({ msg: "silpo_diag_ran", result });
  res.status(200).json(result);
}

export async function syncStateHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const [connResult, countResult] = await Promise.all([
    query<SyncStateConnRow>(
      // last_sync_at — персистований момент успішного pullAndSyncReceipts
      // (не MAX(created_at) по чеках: sync без нових чеків теж «оновлення»).
      `SELECT status, access_token_expires_at, last_sync_at,
                last_failed_at, last_error_code, pantry_auto_import_since
           FROM silpo_connection WHERE user_id = $1`,
      [userId],
      { op: "silpo_sync_state_connection" },
    ),
    query<SyncStateCountRow>(
      `SELECT COUNT(*)::text AS count
         FROM silpo_receipts WHERE user_id = $1`,
      [userId],
      { op: "silpo_sync_state_receipts" },
    ),
  ]);

  const conn = connResult.rows[0];
  const counts = countResult.rows[0];

  res.status(200).json(
    SilpoSyncStateSchema.parse({
      status: conn?.status ?? "disconnected",
      accessTokenExpiresAt: toIsoOrNull(conn?.access_token_expires_at ?? null),
      lastSyncAt: toIsoOrNull(conn?.last_sync_at ?? null),
      lastFailedAt: toIsoOrNull(conn?.last_failed_at ?? null),
      lastErrorCode: conn?.last_error_code ?? null,
      receiptsCount: Number(counts?.count ?? 0),
      pantryAutoImportSince: toIsoOrNull(
        conn?.pantry_auto_import_since ?? null,
      ),
    }),
  );
}

/** "Оновити чеки" button. Errors are thrown as `AppError` subclasses (Express 5 forwards async rejections to `errorHandler` automatically) — this is an explicit user action, a clean 4xx/5xx is the correct response, not a swallowed staleness banner. */
/**
 * Коди, на яких копія помилки нічого не пояснює: «Сільпо змінили формат
 * відповіді» і «не віддав чеки» описують СИМПТОМ, а причина лишалась у
 * серверному лозі. Для них — і тільки для них — доганяємо діагноз.
 */
const DIAGNOSABLE_SYNC_CODES = new Set([
  "SILPO_SCHEMA_DRIFT",
  "SILPO_TOOL_ERROR",
]);

export async function syncHandler(req: Request, res: Response): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  try {
    const result = await pullAndSyncReceipts(userId);
    res.status(200).json(SilpoSyncResultSchema.parse(result));
  } catch (err) {
    throw await withSyncDiagnosis(userId, err);
  }
}

/**
 * Дописує причину в текст помилки синку.
 *
 * Звіт власника 2026-09-13: «пише все одно, що змінили формат». Так і мало
 * бути — копія не залежала від причини, а причину писав лише лог. Спершу це
 * лікували окремим ендпоінтом `/api/silpo/diag`, але його треба ЗНАТИ й
 * відкривати руками, та ще й під тією ж сесією (на піддомені API кука не
 * їде — перевірено). Тож діагноз доганяємо самі, рівно там, де людина вже
 * бачить помилку: у тій самій червоній плашці, без жодної нової кнопки.
 *
 * Ціна — один додатковий похід до Сільпо, і ЛИШЕ на вже невдалому синку
 * (успішний шлях не чіпаємо). Провал самої діагностики нічого не ламає:
 * повертаємо вихідну помилку як є.
 */
async function withSyncDiagnosis(
  userId: string,
  err: unknown,
): Promise<unknown> {
  if (!(err instanceof AppError) || !DIAGNOSABLE_SYNC_CODES.has(err.code)) {
    return err;
  }
  try {
    const diagnosis = await diagnoseSilpo(userId);
    if ("unavailable" in diagnosis) {
      logger.warn({
        msg: "silpo_sync_diagnosis_unavailable",
        state: diagnosis.unavailable,
      });
      return new ExternalServiceError(
        `${err.message}. Причину дізнатись не вдалось: ${diagnosis.unavailable}`,
        { code: err.code },
      );
    }
    logger.info({ msg: "silpo_sync_diagnosed", verdict: diagnosis.verdict });
    // Вердикт ЗАМІНЯЄ загальну копію, а не дописується до неї.
    //
    // Перша версія дописувала («…недоступне. <вердикт>») — і це зробило
    // результат нерозрізненним: власник відповів «так само пише змінили
    // формат», а з тексту неможливо було зрозуміти, чи код не спрацював,
    // чи спрацював і людина просто переказала початок речення. Ще й
    // вердикт про справжній дрейф сам містить слово «формат».
    //
    // Тепер стара фраза не може зʼявитись на діагностованому шляху взагалі,
    // а три різні стани дають три різні тексти — це й потрібно, щоб
    // СКРІНШОТ був доказом. Доти вони зливались в один рядок, і на
    // скріншоті 2026-09-13 неможливо було відрізнити:
    //   1. «Чеки не оновились. <вердикт>»       — код виконався, причина є;
    //   2. «…недоступне. Причину дізнатись…»    — виконався, діагностика
    //      не мала куди піти (немає підключення);
    //   3. «…недоступне. Діагностика впала: …»  — виконався, діагностика
    //      кинула помилку;
    //   4. РІВНО стара фраза без хвоста         — цей код НЕ виконався,
    //      тобто на сервері старий образ.
    // Четвертий випадок тепер єдиний, що дає голу стару копію.
    return new ExternalServiceError(`Чеки не оновились. ${diagnosis.verdict}`, {
      code: err.code,
    });
  } catch (diagErr) {
    const detail = diagErr instanceof Error ? diagErr.message : String(diagErr);
    logger.warn({ msg: "silpo_sync_diagnosis_failed", err: detail });
    return new ExternalServiceError(
      `${err.message}. Діагностика впала: ${detail}`,
      { code: err.code },
    );
  }
}

// ──────────────────────────────────── Receipts read ────────────────────────

export async function receiptsListHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const { limit, cursor, transactionId } = parseQuery(
    SilpoReceiptsQuerySchema,
    req,
  );
  const page = await listReceipts(userId, { limit, cursor, transactionId });
  res.status(200).json(SilpoReceiptsPageSchema.parse(page));
}

export async function receiptDetailHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const receiptIdParam = req.params["id"];
  const receiptId =
    typeof receiptIdParam === "string" ? receiptIdParam : undefined;
  if (!receiptId) {
    res.status(400).json({ error: "Missing receipt id", code: "VALIDATION" });
    return;
  }
  const detail = await getReceiptDetail(userId, receiptId);
  if (!detail) {
    res.status(404).json({ error: "Чек не знайдено", code: "NOT_FOUND" });
    return;
  }
  res.status(200).json(SilpoReceiptDetailDtoSchema.parse(detail));
}

/**
 * `DELETE /api/silpo/receipts/link/:transactionId` — знімає хибну пару
 * «транзакція ↔ чек». Matcher детермінований (збіг суми в межах ±1 доба),
 * тож чужа покупка на ту саму суму дає хибний лінк, і до цього ендпоїнта
 * єдиним способом його прибрати був `POST /api/silpo/wipe` — знесення ВСІХ
 * чеків заради однієї помилки.
 *
 * `404`, коли лінка не було: мовчазний успіх зробив би кнопку «відвʼязати»
 * брехливою (рапортувала б перемогу над уже знятим чи чужим звʼязком).
 */
export async function receiptUnlinkHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const transactionIdParam = req.params["transactionId"];
  const transactionId =
    typeof transactionIdParam === "string" ? transactionIdParam : undefined;
  if (!transactionId) {
    res
      .status(400)
      .json({ error: "Missing transaction id", code: "VALIDATION" });
    return;
  }

  const receiptId = await unlinkReceiptFromTransaction(userId, transactionId);
  if (!receiptId) {
    res.status(404).json({ error: "Звʼязок не знайдено", code: "NOT_FOUND" });
    return;
  }
  logger.info({ msg: "silpo.receipt.unlinked" });
  res
    .status(200)
    .json(SilpoUnlinkResponseSchema.parse({ ok: true, receiptId }));
}

/**
 * `POST /api/silpo/receipts/link/:transactionId` — «Повернути» після
 * «Це не той чек».
 *
 * Без цього ендпоїнта відчеплення було безповоротним: відхилення лягало в
 * `silpo_tx_receipt_link_rejections` назавжди, і навіть повторний sync пару
 * вже не відновлював. Промах по кнопці коштував чека (репорт founder-а,
 * 2026-08-25).
 *
 * `404`, коли чек не належить користувачу, — з тієї ж причини, що й в
 * unlink: мовчазний успіх зробив би кнопку брехливою.
 */
export async function receiptRelinkHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const transactionIdParam = req.params["transactionId"];
  const transactionId =
    typeof transactionIdParam === "string" ? transactionIdParam : undefined;
  if (!transactionId) {
    res
      .status(400)
      .json({ error: "Missing transaction id", code: "VALIDATION" });
    return;
  }

  // Кидає `ValidationError` — errorHandler віддає 400; окремої гілки тут
  // не треба (той самий патерн, що й `cartApplyHandler` нижче).
  const body = parseBody(SilpoRelinkRequestSchema, req);

  const linked = await relinkReceiptToTransaction(
    userId,
    transactionId,
    body.receiptId,
  );
  if (!linked) {
    res.status(404).json({ error: "Чек не знайдено", code: "NOT_FOUND" });
    return;
  }
  logger.info({ msg: "silpo.receipt.relinked" });
  res.status(200).json(SilpoRelinkResponseSchema.parse({ ok: true }));
}

// ──────────────────────────────────── Router ────────────────────────────────

export function createSilpoRouter(): Router {
  const r = Router();
  r.use("/api/silpo", setModule("finyk"));
  // `/callback` реєструється ДО router-level `requireSession()` — порядок
  // тут і є механізмом: Express виконує middleware у порядку реєстрації,
  // тож усе нижче `r.use(requireSession())` вимагає сесію, а цей роут — ні
  // (чому саме — розписано в `callbackHandler`).
  //
  // Той самий bucket/limit, що й у `connect`: це ДРУГА половина одного
  // authorization_code round-trip, частіше за `connect` він не викликається.
  r.get(
    "/api/silpo/callback",
    rateLimitExpress({
      key: "api:silpo:callback",
      limit: 10,
      windowMs: 60_000,
    }),
    callbackHandler,
  );

  r.use("/api/silpo", requireSession());

  r.get(
    "/api/silpo/connect",
    rateLimitExpress({ key: "api:silpo:connect", limit: 10, windowMs: 60_000 }),
    connectHandler,
  );
  r.post(
    "/api/silpo/disconnect",
    rateLimitExpress({
      key: "api:silpo:disconnect",
      limit: 10,
      windowMs: 60_000,
    }),
    disconnectHandler,
  );
  r.post(
    "/api/silpo/wipe",
    // Destructive (cascades to receipts/items/links) — throttled as tightly
    // as `sync`, not the lighter `disconnect` bucket.
    rateLimitExpress({ key: "api:silpo:wipe", limit: 5, windowMs: 60_000 }),
    wipeHandler,
  );
  r.get(
    "/api/silpo/sync-state",
    rateLimitExpress({
      key: "api:silpo:sync-state",
      limit: 60,
      windowMs: 60_000,
    }),
    syncStateHandler,
  );
  r.put(
    "/api/silpo/settings",
    rateLimitExpress({
      key: "api:silpo:settings",
      limit: 20,
      windowMs: 60_000,
    }),
    settingsHandler,
  );
  r.post(
    "/api/silpo/sync",
    rateLimitExpress({ key: "api:silpo:sync", limit: 5, windowMs: 60_000 }),
    syncHandler,
  );
  // Ліміт як у `sync`: діагностика робить такі самі виклики до Сільпо.
  r.get(
    "/api/silpo/diag",
    rateLimitExpress({ key: "api:silpo:diag", limit: 5, windowMs: 60_000 }),
    diagHandler,
  );
  r.get(
    "/api/silpo/receipts",
    rateLimitExpress({
      key: "api:silpo:receipts",
      limit: 60,
      windowMs: 60_000,
    }),
    receiptsListHandler,
  );
  r.get(
    "/api/silpo/receipts/:id",
    rateLimitExpress({
      key: "api:silpo:receipt-detail",
      limit: 60,
      windowMs: 60_000,
    }),
    receiptDetailHandler,
  );
  r.delete(
    "/api/silpo/receipts/link/:transactionId",
    // Пише два рядки (відхилення + зняття лінка) і впливає на майбутні
    // синки — відро як у `disconnect`, не як у читальних роутів.
    rateLimitExpress({
      key: "api:silpo:receipt-unlink",
      limit: 10,
      windowMs: 60_000,
    }),
    receiptUnlinkHandler,
  );
  r.post(
    "/api/silpo/receipts/link/:transactionId",
    // Те саме відро за формою, що й unlink: пара кнопок «відчепити ↔
    // повернути» має однакову ціну, інакше швидкий undo впирався б у
    // ліміт, якого сама дія не мала.
    rateLimitExpress({
      key: "api:silpo:receipt-relink",
      limit: 10,
      windowMs: 60_000,
    }),
    receiptRelinkHandler,
  );
  r.post(
    "/api/silpo/receipts/:id/pantry-claim",
    // Бронювання перед записом - той самий порядок величини, що й
    // `receipt-relink`: пише один рядок на позицію, не читальний роут.
    rateLimitExpress({
      key: "api:silpo:pantry-claim",
      limit: 30,
      windowMs: 60_000,
    }),
    pantryClaimHandler,
  );
  r.post(
    "/api/silpo/receipts/:id/pantry-release",
    rateLimitExpress({
      key: "api:silpo:pantry-release",
      limit: 30,
      windowMs: 60_000,
    }),
    pantryReleaseHandler,
  );
  r.post(
    "/api/silpo/cart/preview",
    rateLimitExpress({
      key: "api:silpo:cart-preview",
      limit: 10,
      windowMs: 60_000,
    }),
    cartPreviewHandler,
  );
  r.post(
    "/api/silpo/cart/apply",
    // Writes to an external system (Track G confirm-before-write) — tightest
    // bucket in this router, same order of magnitude as `sync`/`wipe`.
    rateLimitExpress({
      key: "api:silpo:cart-apply",
      limit: 5,
      windowMs: 60_000,
    }),
    cartApplyHandler,
  );
  r.post(
    "/api/silpo/cart/clear",
    // Те саме відро, що й `apply`: обидві дії пишуть у зовнішній кошик.
    rateLimitExpress({
      key: "api:silpo:cart-clear",
      limit: 5,
      windowMs: 60_000,
    }),
    cartClearHandler,
  );
  r.get(
    "/api/silpo/cart",
    rateLimitExpress({
      key: "api:silpo:cart-get",
      limit: 30,
      windowMs: 60_000,
    }),
    cartGetHandler,
  );

  return r;
}
