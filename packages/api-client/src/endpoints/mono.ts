import type {
  MonoAccountDto as SharedMonoAccountDto,
  MonoTransactionDto as SharedMonoTransactionDto,
  MonoTransactionsPage as SharedMonoTransactionsPage,
  MonoSyncState as SharedMonoSyncState,
  MonoConnectionStatus as SharedMonoConnectionStatus,
  MonoConnectResponse as SharedMonoConnectResponse,
  MonoDisconnectResponse as SharedMonoDisconnectResponse,
  MonoBackfillResponse as SharedMonoBackfillResponse,
} from "@sergeant/shared/schemas";
import type { HttpClient } from "../httpClient";

/**
 * Опис полів береться з Monobank Personal API:
 * https://api.monobank.ua/docs/personal.html
 *
 * Index-signature `[key: string]: unknown` залишений як safety-net: зовнішнє
 * API періодично додає нові поля, і ми не хочемо ламати типізацію на цьому.
 */

export type MonoCashbackType = "" | "None" | "UAH" | "Miles" | string;

// ── Webhook migration DTOs (Track A/B/C) ─────────────────────────────────
//
// SSOT for the `/api/mono/*` HTTP contract lives in
// `@sergeant/shared/schemas/api` (AGENTS.md Hard Rule #3). The server
// validates each response via `.parse()` before `res.json()`, and these
// `z.infer<>` re-exports are how this client stays type-locked to the
// same Zod schemas — preventing the silent "client interface drifts past
// server reality" bug that motivated the rule.

export type MonoConnectionStatus = SharedMonoConnectionStatus;
export type MonoAccountDto = SharedMonoAccountDto;
export type MonoTransactionDto = SharedMonoTransactionDto;
export type MonoSyncState = SharedMonoSyncState;
export type MonoTransactionsPage = SharedMonoTransactionsPage;
export type MonoConnectResponse = SharedMonoConnectResponse;
export type MonoDisconnectResponse = SharedMonoDisconnectResponse;
export type MonoBackfillResponse = SharedMonoBackfillResponse;

export interface MonoAccount {
  id: string;
  sendId?: string;
  currencyCode?: number;
  cashbackType?: MonoCashbackType;
  balance?: number;
  creditLimit?: number;
  maskedPan?: string[];
  type?: string;
  iban?: string;
  [key: string]: unknown;
}

export interface MonoJar {
  id: string;
  sendId?: string;
  title?: string;
  description?: string;
  currencyCode?: number;
  balance?: number;
  goal?: number;
  [key: string]: unknown;
}

export interface MonoClientInfo {
  clientId?: string;
  name?: string;
  webHookUrl?: string;
  permissions?: string;
  accounts?: MonoAccount[];
  jars?: MonoJar[];
  [key: string]: unknown;
}

// ── Webhook API (Track A) — only mode after roadmap-A polling cleanup ──

export interface MonoWebhookEndpoints {
  connect: (
    token: string,
    opts?: { signal?: AbortSignal },
  ) => Promise<MonoConnectResponse>;
  disconnect: (opts?: {
    signal?: AbortSignal;
  }) => Promise<MonoDisconnectResponse>;
  syncState: (opts?: { signal?: AbortSignal }) => Promise<MonoSyncState>;
  accounts: (opts?: { signal?: AbortSignal }) => Promise<MonoAccountDto[]>;
  transactions: (
    params: {
      from?: string;
      to?: string;
      accountId?: string;
      limit?: number;
      cursor?: string;
    },
    opts?: { signal?: AbortSignal },
  ) => Promise<MonoTransactionsPage>;
  backfill: (opts?: { signal?: AbortSignal }) => Promise<MonoBackfillResponse>;
}

export function createMonoWebhookEndpoints(
  http: HttpClient,
): MonoWebhookEndpoints {
  return {
    connect: (token, opts) =>
      http.post<MonoConnectResponse>(
        "/api/mono/connect",
        { token },
        { signal: opts?.signal },
      ),
    disconnect: (opts) =>
      http.post<MonoDisconnectResponse>("/api/mono/disconnect", undefined, {
        signal: opts?.signal,
      }),
    syncState: (opts) =>
      http.get<MonoSyncState>("/api/mono/sync-state", {
        signal: opts?.signal,
      }),
    accounts: (opts) =>
      http.get<MonoAccountDto[]>("/api/mono/accounts", {
        signal: opts?.signal,
      }),
    transactions: (params, opts) =>
      http.get<MonoTransactionsPage>("/api/mono/transactions", {
        query: params,
        signal: opts?.signal,
      }),
    backfill: (opts) =>
      http.post<MonoBackfillResponse>("/api/mono/backfill", undefined, {
        signal: opts?.signal,
      }),
  };
}
