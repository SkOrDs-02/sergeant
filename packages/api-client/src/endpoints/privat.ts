import type { HttpClient } from "../httpClient";
import type { QueryValue } from "../types";

/**
 * Креденшели передаються рівно один раз — у `connect`. Далі вони живуть
 * зашифровані на сервері (`privat_connection`) і резолвляться за сесією, тож
 * жоден інший виклик їх не приймає і клієнту не треба їх зберігати. До цієї
 * зміни merchant-токен лежав у `localStorage` і був видимий у DevTools —
 * спека `docs/90-work/planning/specs/beta-security-readiness.md` (F1).
 */
export interface PrivatCredentials {
  merchantId: string;
  token: string;
}

export interface PrivatConnectionStatus {
  connected: boolean;
  merchantId: string | null;
}

/**
 * Шейпи відповідей з Privatbank corporate API (через проксі `/api/privat`).
 * Див. https://docs.api.privatbank.ua/#/
 *
 * Усі числові поля повертаються як рядки (`"0.00"`) — це особливість
 * Privat-API, не баг типізації.
 */

export interface PrivatBalanceRecord {
  acc: string;
  currency: string;
  balanceIn?: string;
  balanceInEq?: string;
  balanceOut?: string;
  balanceOutEq?: string;
  turnoverDebt?: string;
  turnoverDebtEq?: string;
  turnoverCred?: string;
  turnoverCredEq?: string;
  bgfIBrnm?: string;
  brnm?: string;
  dpd?: string;
  nameACC?: string;
  flmt?: string;
  atp?: string;
  type?: string;
  flags?: string;
}

export interface PrivatBalanceFinalResponse {
  status?: string;
  balances?: PrivatBalanceRecord[];
  exist_next_page?: boolean;
  next_page_id?: string;
}

export interface PrivatStatementEntry {
  AUT_MY_ACC: string;
  AUT_MY_CRF: string;
  AUT_MY_MFO: string;
  AUT_MY_NAM: string;
  AUT_CNTR_ACC: string;
  AUT_CNTR_CRF: string;
  AUT_CNTR_MFO: string;
  AUT_CNTR_NAM: string;
  CCY: string;
  DAT_KL: string;
  DAT_OD: string;
  REF: string;
  ID?: string;
  PR_PR: string;
  SUM?: string;
  SUM_E?: string;
  OSND?: string;
  [key: string]: unknown;
}

export interface PrivatStatementsResponse {
  status?: string;
  transactions?: PrivatStatementEntry[];
  exist_next_page?: boolean;
  next_page_id?: string;
}

export interface PrivatEndpoints {
  request: <T = unknown>(
    path: string,
    query?: Record<string, QueryValue>,
    opts?: { signal?: AbortSignal },
  ) => Promise<T>;
  balanceFinal: (opts?: {
    signal?: AbortSignal;
  }) => Promise<PrivatBalanceFinalResponse>;
  connect: (
    creds: PrivatCredentials,
    opts?: { signal?: AbortSignal },
  ) => Promise<{ connected: boolean; merchantId: string }>;
  disconnect: (opts?: {
    signal?: AbortSignal;
  }) => Promise<{ connected: boolean }>;
  status: (opts?: { signal?: AbortSignal }) => Promise<PrivatConnectionStatus>;
}

/**
 * Усі виклики до Privatbank ідуть через наш проксі `/api/privat?path=…`.
 * Автентифікація — сесійна кука, як і на решті `/api/*`: креденшели банку
 * сервер бере з `privat_connection`, а не із заголовків запиту.
 */
export function createPrivatEndpoints(http: HttpClient): PrivatEndpoints {
  const request = <T = unknown>(
    path: string,
    query?: Record<string, QueryValue>,
    opts?: { signal?: AbortSignal },
  ) =>
    http.get<T>("/api/privat", {
      query: { path, ...(query ?? {}) },
      signal: opts?.signal,
    });

  return {
    request,
    balanceFinal: (opts) =>
      request<PrivatBalanceFinalResponse>(
        "/statements/balance/final",
        { country: "UA", showRest: "true" },
        opts,
      ),
    connect: (creds, opts) =>
      http.post<{ connected: boolean; merchantId: string }>(
        "/api/privat/connect",
        creds,
        { signal: opts?.signal },
      ),
    disconnect: (opts) =>
      http.post<{ connected: boolean }>("/api/privat/disconnect", undefined, {
        signal: opts?.signal,
      }),
    status: (opts) =>
      http.get<PrivatConnectionStatus>("/api/privat/status", {
        signal: opts?.signal,
      }),
  };
}
