import type {
  SilpoConnectionStatus as SharedSilpoConnectionStatus,
  SilpoDisconnectResponse as SharedSilpoDisconnectResponse,
  SilpoReceiptChannel as SharedSilpoReceiptChannel,
  SilpoReceiptDetailDto as SharedSilpoReceiptDetailDto,
  SilpoReceiptItemDto as SharedSilpoReceiptItemDto,
  SilpoReceiptsPage as SharedSilpoReceiptsPage,
  SilpoReceiptsQuery as SharedSilpoReceiptsQuery,
  SilpoReceiptSummaryDto as SharedSilpoReceiptSummaryDto,
  SilpoSyncResult as SharedSilpoSyncResult,
  SilpoSyncState as SharedSilpoSyncState,
  SilpoWipeResponse as SharedSilpoWipeResponse,
} from "@sergeant/shared/schemas";
// Рантайм-імпорт — лише з кореневого барела: Vite-аліас `@sergeant/shared`
// у apps/web вказує на файл `src/index.ts`, тож субшлях `/schemas` для
// value-імпортів не резолвиться (type-імпорти стираються до бандлінгу).
import {
  SilpoDisconnectResponseSchema,
  SilpoReceiptDetailDtoSchema,
  SilpoReceiptsPageSchema,
  SilpoSyncResultSchema,
  SilpoSyncStateSchema,
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
 *   - `GET  /api/silpo/sync-state`  → `syncState()`
 *   - `POST /api/silpo/sync`        → `sync()` — errors surface as
 *     `ApiError` (409 `SILPO_NOT_CONNECTED`/`SILPO_REAUTH_REQUIRED`, 429
 *     `SILPO_RATE_LIMITED`, 502 `SILPO_UPSTREAM_ERROR`/`SILPO_SCHEMA_DRIFT`).
 *   - `GET  /api/silpo/receipts`    → `receipts()`
 *   - `GET  /api/silpo/receipts/:id`→ `receiptDetail()` — 404 (`NOT_FOUND`)
 *     surfaces as `ApiError` with `status: 404`, not a `null` return.
 */

export type SilpoConnectionStatus = SharedSilpoConnectionStatus;
export type SilpoSyncState = SharedSilpoSyncState;
export type SilpoDisconnectResponse = SharedSilpoDisconnectResponse;
export type SilpoWipeResponse = SharedSilpoWipeResponse;
export type SilpoSyncResult = SharedSilpoSyncResult;
export type SilpoReceiptChannel = SharedSilpoReceiptChannel;
export type SilpoReceiptItemDto = SharedSilpoReceiptItemDto;
export type SilpoReceiptSummaryDto = SharedSilpoReceiptSummaryDto;
export type SilpoReceiptDetailDto = SharedSilpoReceiptDetailDto;
export type SilpoReceiptsPage = SharedSilpoReceiptsPage;
export type SilpoReceiptsQuery = SharedSilpoReceiptsQuery;

export interface SilpoReceiptsListParams {
  limit?: number;
  cursor?: string;
}

export interface SilpoEndpoints {
  /**
   * `POST /api/silpo/disconnect` — видаляє лише `silpo_connection` (mono-
   * патерн); чеки/items/зв'язки лишаються.
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
   * `GET /api/silpo/sync-state` — стан інтеграції для Settings-картки
   * (connect / connected / reauth-банер).
   */
  syncState: (opts?: Pick<RequestOptions, "signal">) => Promise<SilpoSyncState>;
  /**
   * `POST /api/silpo/sync` — кнопка "Оновити чеки". `status` у відповіді —
   * стан ПІСЛЯ спроби синхронізації (можливий `reauth_required`, якщо
   * lazy-refresh відвалився посеред синку).
   */
  sync: (opts?: Pick<RequestOptions, "signal">) => Promise<SilpoSyncResult>;
  /**
   * `GET /api/silpo/receipts` — cursor-paginated список чеків
   * (`purchasedAt DESC, receiptId DESC`).
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
    syncState: async ({ signal } = {}) => {
      const raw = await http.get<unknown>("/api/silpo/sync-state", { signal });
      return SilpoSyncStateSchema.parse(raw);
    },
    sync: async ({ signal } = {}) => {
      const raw = await http.post<unknown>("/api/silpo/sync", undefined, {
        signal,
      });
      return SilpoSyncResultSchema.parse(raw);
    },
    receipts: async (params, { signal } = {}) => {
      const raw = await http.get<unknown>("/api/silpo/receipts", {
        query: { limit: params?.limit, cursor: params?.cursor },
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
