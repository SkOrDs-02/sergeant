import type {
  SilpoCartApplyRequest as SharedSilpoCartApplyRequest,
  SilpoCartDto as SharedSilpoCartDto,
  SilpoCartItemDto as SharedSilpoCartItemDto,
  SilpoCartMatchDto as SharedSilpoCartMatchDto,
  SilpoCartPreviewQueryDto as SharedSilpoCartPreviewQueryDto,
  SilpoCartPreviewRequest as SharedSilpoCartPreviewRequest,
  SilpoCartPreviewResponse as SharedSilpoCartPreviewResponse,
  SilpoConnectionStatus as SharedSilpoConnectionStatus,
  SilpoDisconnectResponse as SharedSilpoDisconnectResponse,
  SilpoPantryClaimMode as SharedSilpoPantryClaimMode,
  SilpoPantryClaimRequest as SharedSilpoPantryClaimRequest,
  SilpoPantryClaimResponse as SharedSilpoPantryClaimResponse,
  SilpoPantryReleaseRequest as SharedSilpoPantryReleaseRequest,
  SilpoPantryReleaseResponse as SharedSilpoPantryReleaseResponse,
  SilpoReceiptChannel as SharedSilpoReceiptChannel,
  SilpoReceiptDetailDto as SharedSilpoReceiptDetailDto,
  SilpoReceiptItemDto as SharedSilpoReceiptItemDto,
  SilpoReceiptsPage as SharedSilpoReceiptsPage,
  SilpoReceiptsQuery as SharedSilpoReceiptsQuery,
  SilpoReceiptSummaryDto as SharedSilpoReceiptSummaryDto,
  SilpoSettingsRequest as SharedSilpoSettingsRequest,
  SilpoSettingsResponse as SharedSilpoSettingsResponse,
  SilpoSyncResult as SharedSilpoSyncResult,
  SilpoSyncState as SharedSilpoSyncState,
  SilpoRelinkResponse as SharedSilpoRelinkResponse,
  SilpoUnlinkResponse as SharedSilpoUnlinkResponse,
  SilpoWipeResponse as SharedSilpoWipeResponse,
} from "@sergeant/shared/schemas";
// Рантайм-імпорт — лише з кореневого барела: Vite-аліас `@sergeant/shared`
// у apps/web вказує на файл `src/index.ts`, тож субшлях `/schemas` для
// value-імпортів не резолвиться (type-імпорти стираються до бандлінгу).
import {
  SilpoCartApplyRequestSchema,
  SilpoCartDtoSchema,
  SilpoCartPreviewRequestSchema,
  SilpoCartPreviewResponseSchema,
  SilpoDisconnectResponseSchema,
  SilpoPantryClaimRequestSchema,
  SilpoPantryClaimResponseSchema,
  SilpoPantryReleaseRequestSchema,
  SilpoPantryReleaseResponseSchema,
  SilpoReceiptDetailDtoSchema,
  SilpoReceiptsPageSchema,
  SilpoSettingsRequestSchema,
  SilpoSettingsResponseSchema,
  SilpoSyncResultSchema,
  SilpoSyncStateSchema,
  SilpoRelinkResponseSchema,
  SilpoUnlinkResponseSchema,
  SilpoWipeResponseSchema,
} from "@sergeant/shared";
import { applyApiPrefix, DEFAULT_API_PREFIX } from "../httpClient";
import type { HttpClient } from "../httpClient";
import type { RequestOptions } from "../types";

/**
 * Silpo MCP integration — wire types. SSOT lives in
 * `@sergeant/shared/schemas` (`packages/shared/src/schemas/silpo.ts`); this
 * module only re-exports `z.infer<>` of those schemas (Hard Rule #3) and
 * wraps `HttpClient` calls with runtime `.parse()` so a server response that
 * drifted from the shared schema fails loudly on the client instead of
 * silently propagating a malformed shape into React state.
 *
 * Route inventory (`apps/server/src/routes/silpo.ts`), all gated by
 * `requireSession()` + `SILPO_ENABLED` kill switch (503 `SILPO_DISABLED`
 * when off):
 *   - `GET  /api/silpo/connect`     — 302 browser redirect to Silpo OAuth.
 *     NAVIGATION-ONLY — never call through `HttpClient.get`/`fetch`. Use
 *     `silpoConnectUrl()` to build the URL and assign
 *     `window.location.href`.
 *   - `GET  /api/silpo/callback`    — 302 server-side OAuth callback.
 *     Never called directly by any client — the browser lands there after
 *     the Silpo redirect. Not wrapped here.
 *   - `POST /api/silpo/disconnect`  → `disconnect()`
 *   - `POST /api/silpo/wipe`        → `wipe()`
 *   - `DELETE /api/silpo/receipts/link/:transactionId` → `unlinkReceipt()`
 *   - `POST /api/silpo/receipts/link/:transactionId` → `relinkReceipt()` —
 *     скасування попереднього; знімає відхилення й ставить пару назад.
 *   - `GET  /api/silpo/sync-state`  → `syncState()`
 *   - `POST /api/silpo/sync`        → `sync()` — errors surface as
 *     `ApiError` (409 `SILPO_NOT_CONNECTED`/`SILPO_REAUTH_REQUIRED`, 429
 *     `SILPO_RATE_LIMITED`, 502 `SILPO_UPSTREAM_ERROR`/`SILPO_SCHEMA_DRIFT`/
 *     `SILPO_TOOL_ERROR`).
 *   - `GET  /api/silpo/receipts`    → `receipts()`
 *   - `GET  /api/silpo/receipts/:id`→ `receiptDetail()` — 404 (`NOT_FOUND`)
 *     surfaces as `ApiError` with `status: 404`, not a `null` return.
 *   - `POST /api/silpo/cart/preview`→ `cartPreview()` — search-only, ніколи
 *     не пише в кошик. `results[]` — по одному на request-item, у порядку
 *     запиту.
 *   - `POST /api/silpo/cart/apply`  → `cartApply()` — confirm-before-write;
 *     зіпсований `lagerId` → 400 `VALIDATION` ДО будь-якого мережевого
 *     виклику (декодиться на сервері перш ніж торкнутись MCP).
 *   - `POST /api/silpo/cart/clear`  → `cartClear()` — спорожнити кошик;
 *   - `GET  /api/silpo/cart`        → `cartGet()` — порожній кошик
 *     деградує до `{items: [], totalKop: 0, cartUrl: null}`, не помилки.
 */

export type SilpoConnectionStatus = SharedSilpoConnectionStatus;
export type SilpoSyncState = SharedSilpoSyncState;
export type SilpoDisconnectResponse = SharedSilpoDisconnectResponse;
export type SilpoWipeResponse = SharedSilpoWipeResponse;
export type SilpoUnlinkResponse = SharedSilpoUnlinkResponse;
export type SilpoRelinkResponse = SharedSilpoRelinkResponse;
export type SilpoSyncResult = SharedSilpoSyncResult;
export type SilpoReceiptChannel = SharedSilpoReceiptChannel;
export type SilpoReceiptItemDto = SharedSilpoReceiptItemDto;
export type SilpoReceiptSummaryDto = SharedSilpoReceiptSummaryDto;
export type SilpoReceiptDetailDto = SharedSilpoReceiptDetailDto;
export type SilpoReceiptsPage = SharedSilpoReceiptsPage;
export type SilpoReceiptsQuery = SharedSilpoReceiptsQuery;

// ── Pantry auto-import (спека silpo-pantry-auto-import.md) ─────────────────
export type SilpoSettingsRequest = SharedSilpoSettingsRequest;
export type SilpoSettingsResponse = SharedSilpoSettingsResponse;
export type SilpoPantryClaimMode = SharedSilpoPantryClaimMode;
export type SilpoPantryClaimRequest = SharedSilpoPantryClaimRequest;
export type SilpoPantryClaimResponse = SharedSilpoPantryClaimResponse;
export type SilpoPantryReleaseRequest = SharedSilpoPantryReleaseRequest;
export type SilpoPantryReleaseResponse = SharedSilpoPantryReleaseResponse;

// ── Cart (Track G — MCP write path) ─────────────────────────────────────
export type SilpoCartPreviewRequest = SharedSilpoCartPreviewRequest;
/** Один рядок запиту `cartPreview()` — `{name, quantity?}`. */
export type SilpoCartPreviewItem =
  SharedSilpoCartPreviewRequest["items"][number];
export type SilpoCartMatchDto = SharedSilpoCartMatchDto;
export type SilpoCartPreviewQueryDto = SharedSilpoCartPreviewQueryDto;
export type SilpoCartPreviewResponse = SharedSilpoCartPreviewResponse;
export type SilpoCartApplyRequest = SharedSilpoCartApplyRequest;
/** Один рядок запиту `cartApply()` — `{lagerId, quantity}`. `lagerId` — опаковий токен з `cartPreview()`, ніколи не парситься клієнтом. */
export type SilpoCartSelection =
  SharedSilpoCartApplyRequest["selections"][number];
export type SilpoCartItemDto = SharedSilpoCartItemDto;
export type SilpoCartDto = SharedSilpoCartDto;

export interface SilpoReceiptsListParams {
  limit?: number;
  cursor?: string;
  /**
   * Точковий пошук чека, привʼязаного до конкретної mono-транзакції.
   * Фільтрує на сервері по `silpo_tx_receipt_links`, тож картка транзакції
   * не залежить від того, на якій сторінці лежить її чек.
   */
  transactionId?: string;
}

export interface SilpoEndpoints {
  /**
   * `POST /api/silpo/disconnect` — видаляє лише `silpo_connection` (mono-
   * патерн); чеки/items/звʼязки лишаються.
   */
  disconnect: (
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<SilpoDisconnectResponse>;
  /**
   * `POST /api/silpo/wipe` — повне видалення всіх Silpo-даних користувача
   * (каскадом: чеки → items → `finyk_tx_receipt_links`). Підтверджені
   * `finyk_tx_splits` не чіпаються.
   */
  wipe: (opts?: Pick<RequestOptions, "signal">) => Promise<SilpoWipeResponse>;
  /**
   * `DELETE /api/silpo/receipts/link/:transactionId` — знімає хибний
   * звʼязок «транзакція ↔ чек» (matcher лінкує за збігом суми у вікні
   * ±1 доба, тож чужа покупка на ту саму суму дає хибну пару). Пара
   * запамʼятовується як відхилена, тому наступний sync її НЕ відновить.
   * Чек не видаляється — він повертається в «Чеки без транзакції».
   * `404`, якщо звʼязку не було.
   */
  unlinkReceipt: (
    transactionId: string,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<SilpoUnlinkResponse>;
  /**
   * `POST /api/silpo/receipts/link/:transactionId` — ставить пару назад і
   * знімає відхилення, записане `unlinkReceipt()`. Це «Повернути» під
   * кнопкою «Це не той чек»; той самий примітив пізніше понесе й ручне
   * привʼязування. `404`, якщо чек не належить користувачу.
   */
  relinkReceipt: (
    transactionId: string,
    receiptId: string,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<SilpoRelinkResponse>;
  /**
   * `GET /api/silpo/sync-state` — стан інтеграції для Settings-картки
   * (connect / connected / reauth-банер). Несе й `pantryAutoImportSince`
   * (тумблер автоімпорту, спека `docs/work/specs/silpo-pantry-auto-import.md`).
   */
  syncState: (opts?: Pick<RequestOptions, "signal">) => Promise<SilpoSyncState>;
  /**
   * `PUT /api/silpo/settings` - тумблер «Додавати продукти з чеків у комору
   * автоматично». Увімкнення ставить `pantry_auto_import_since = now()` на
   * сервері; вимкнення - `null`.
   */
  updateSettings: (
    body: SilpoSettingsRequest,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<SilpoSettingsResponse>;
  /**
   * `POST /api/silpo/receipts/:id/pantry-claim` - атомарне бронювання
   * позицій чека ПЕРЕД записом у комору. Клієнт пише в комору ЛИШЕ
   * `claimedItemIds` з відповіді, не весь запит: другий пристрій, що
   * прийшов пізніше з тим самим `auto`-чеком, отримує порожній масив.
   */
  pantryClaim: (
    receiptId: string,
    body: SilpoPantryClaimRequest,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<SilpoPantryClaimResponse>;
  /**
   * `POST /api/silpo/receipts/:id/pantry-release` - знімає бронювання.
   * `decline: true` - «Повернути» в тості автоімпорту: чек більше не
   * потрапляє в автоімпорт (ручний лишається доступним).
   */
  pantryRelease: (
    receiptId: string,
    body: SilpoPantryReleaseRequest,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<SilpoPantryReleaseResponse>;
  /**
   * `POST /api/silpo/sync` — кнопка "Оновити чеки". `status` у відповіді —
   * стан ПІСЛЯ спроби синхронізації (можливий `reauth_required`, якщо
   * lazy-refresh відвалився посеред синку).
   */
  sync: (opts?: Pick<RequestOptions, "signal">) => Promise<SilpoSyncResult>;
  /**
   * `GET /api/silpo/receipts` — cursor-paginated список чеків
   * (`purchasedAt DESC, receiptId DESC`). `params.transactionId` звужує
   * вибірку до чека саме цієї транзакції (серверний фільтр по лінку).
   */
  receipts: (
    params?: SilpoReceiptsListParams,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<SilpoReceiptsPage>;
  /**
   * `GET /api/silpo/receipts/:id` — summary + line items. 404 → `ApiError`
   * (`status: 404`, `code: "NOT_FOUND"`), не `null`.
   */
  receiptDetail: (
    receiptId: string,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<SilpoReceiptDetailDto>;
  /**
   * `POST /api/silpo/cart/preview` — search-only, ніколи не пише в кошик.
   * `items` — 1..100 рядків списку покупок. Помилки: `ApiError` (409
   * `SILPO_NOT_CONNECTED`/`SILPO_REAUTH_REQUIRED`, 429 `SILPO_RATE_LIMITED`,
   * 502 `SILPO_UPSTREAM_ERROR`/`SILPO_SCHEMA_DRIFT`/`SILPO_TOOL_ERROR`, 503 `SILPO_DISABLED`/
   * `SILPO_CONFIG_MISSING`, 400 `VALIDATION`).
   */
  cartPreview: (
    items: SilpoCartPreviewItem[],
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<SilpoCartPreviewResponse>;
  /**
   * `POST /api/silpo/cart/apply` — confirm-before-write; `selections` — 1..100
   * `{lagerId, quantity}` пар з `cartPreview()`. Зіпсований `lagerId` → 400
   * `VALIDATION` ДО будь-якого мережевого виклику. Повертає пост-write стан
   * кошика (форма `cartGet()`).
   */
  cartApply: (
    selections: SilpoCartSelection[],
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<SilpoCartDto>;
  /**
   * `POST /api/silpo/cart/clear` — спорожнити зовнішній кошик. Тіла немає:
   * кошик у користувача один. Повертає пост-write стан (форма `cartGet()`);
   * акаунт без кошика взагалі — теж успіх із порожнім станом.
   */
  cartClear: (opts?: Pick<RequestOptions, "signal">) => Promise<SilpoCartDto>;
  /**
   * `GET /api/silpo/cart` — поточний стан кошика. Порожній кошик →
   * `{items: [], totalKop: 0, cartUrl: null}`, не помилка.
   */
  cartGet: (opts?: Pick<RequestOptions, "signal">) => Promise<SilpoCartDto>;
}

export function createSilpoEndpoints(http: HttpClient): SilpoEndpoints {
  return {
    disconnect: async ({ signal } = {}) => {
      const raw = await http.post<unknown>("/api/silpo/disconnect", undefined, {
        signal,
      });
      return SilpoDisconnectResponseSchema.parse(raw);
    },
    wipe: async ({ signal } = {}) => {
      const raw = await http.post<unknown>("/api/silpo/wipe", undefined, {
        signal,
      });
      return SilpoWipeResponseSchema.parse(raw);
    },
    unlinkReceipt: async (transactionId, { signal } = {}) => {
      const raw = await http.del<unknown>(
        `/api/silpo/receipts/link/${encodeURIComponent(transactionId)}`,
        undefined,
        { signal },
      );
      return SilpoUnlinkResponseSchema.parse(raw);
    },
    relinkReceipt: async (transactionId, receiptId, { signal } = {}) => {
      const raw = await http.post<unknown>(
        `/api/silpo/receipts/link/${encodeURIComponent(transactionId)}`,
        { receiptId },
        { signal },
      );
      return SilpoRelinkResponseSchema.parse(raw);
    },
    syncState: async ({ signal } = {}) => {
      const raw = await http.get<unknown>("/api/silpo/sync-state", { signal });
      return SilpoSyncStateSchema.parse(raw);
    },
    updateSettings: async (body, { signal } = {}) => {
      const parsedBody = SilpoSettingsRequestSchema.parse(body);
      const raw = await http.put<unknown>("/api/silpo/settings", parsedBody, {
        signal,
      });
      return SilpoSettingsResponseSchema.parse(raw);
    },
    pantryClaim: async (receiptId, body, { signal } = {}) => {
      const parsedBody = SilpoPantryClaimRequestSchema.parse(body);
      const raw = await http.post<unknown>(
        `/api/silpo/receipts/${encodeURIComponent(receiptId)}/pantry-claim`,
        parsedBody,
        { signal },
      );
      return SilpoPantryClaimResponseSchema.parse(raw);
    },
    pantryRelease: async (receiptId, body, { signal } = {}) => {
      const parsedBody = SilpoPantryReleaseRequestSchema.parse(body);
      const raw = await http.post<unknown>(
        `/api/silpo/receipts/${encodeURIComponent(receiptId)}/pantry-release`,
        parsedBody,
        { signal },
      );
      return SilpoPantryReleaseResponseSchema.parse(raw);
    },
    sync: async ({ signal } = {}) => {
      const raw = await http.post<unknown>("/api/silpo/sync", undefined, {
        signal,
      });
      return SilpoSyncResultSchema.parse(raw);
    },
    receipts: async (params, { signal } = {}) => {
      const raw = await http.get<unknown>("/api/silpo/receipts", {
        query: {
          limit: params?.limit,
          cursor: params?.cursor,
          transactionId: params?.transactionId,
        },
        signal,
      });
      return SilpoReceiptsPageSchema.parse(raw);
    },
    receiptDetail: async (receiptId, { signal } = {}) => {
      const raw = await http.get<unknown>(
        `/api/silpo/receipts/${encodeURIComponent(receiptId)}`,
        { signal },
      );
      return SilpoReceiptDetailDtoSchema.parse(raw);
    },
    cartPreview: async (items, { signal } = {}) => {
      const body = SilpoCartPreviewRequestSchema.parse({ items });
      const raw = await http.post<unknown>("/api/silpo/cart/preview", body, {
        signal,
      });
      return SilpoCartPreviewResponseSchema.parse(raw);
    },
    cartApply: async (selections, { signal } = {}) => {
      const body = SilpoCartApplyRequestSchema.parse({ selections });
      const raw = await http.post<unknown>("/api/silpo/cart/apply", body, {
        signal,
      });
      return SilpoCartDtoSchema.parse(raw);
    },
    cartClear: async ({ signal } = {}) => {
      const raw = await http.post<unknown>("/api/silpo/cart/clear", undefined, {
        signal,
      });
      return SilpoCartDtoSchema.parse(raw);
    },
    cartGet: async ({ signal } = {}) => {
      const raw = await http.get<unknown>("/api/silpo/cart", { signal });
      return SilpoCartDtoSchema.parse(raw);
    },
  };
}

/**
 * Будує URL для `GET /api/silpo/connect` — **navigation-only** endpoint
 * (302 redirect у Silpo OAuth), тому він НЕ загорнутий у `SilpoEndpoints`
 * як `HttpClient`-виклик: `fetch`/`XMLHttpRequest` не може прогнати
 * браузер крізь OAuth consent screen, а `credentials`/CSRF-заголовки
 * `HttpClient` тут зайві (це не JSON API-виклик).
 *
 * Використання (web):
 * ```ts
 * window.location.href = silpoConnectUrl({ baseUrl: apiBaseUrl });
 * ```
 *
 * Застосовує ту саму `/api` → `/api/v1` (за замовчуванням) переписку, що й
 * `HttpClient` (`applyApiPrefix`), щоб шлях лишався консистентним із рештою
 * викликів цього клієнта.
 */
export function silpoConnectUrl(
  config: { baseUrl?: string; apiPrefix?: string } = {},
): string {
  const { baseUrl = "", apiPrefix = DEFAULT_API_PREFIX } = config;
  const prefixedPath = applyApiPrefix("/api/silpo/connect", apiPrefix);
  const base = baseUrl.replace(/\/$/, "");
  return base ? `${base}${prefixedPath}` : prefixedPath;
}
