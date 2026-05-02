import { useState, useEffect, useRef } from "react";
import { privatApi, isApiError } from "@shared/api";
import { normalizeTransaction } from "@sergeant/finyk-domain/domain/transactions";
import {
  readRaw,
  writeRaw,
  removeItem,
  readJSON,
  writeJSON,
} from "../lib/finykStorage";

const PRIVAT_ID_KEY = "finyk_privat_id";
const PRIVAT_TOKEN_KEY = "finyk_privat_token";
const PRIVAT_CACHE_KEY = "finyk_privat_tx_cache";
const PRIVAT_BALANCE_KEY = "finyk_privat_balance_cache";
const PRIVAT_CACHE_TTL = 30 * 60 * 1000;

function loadStoredCreds() {
  let id = readRaw(PRIVAT_ID_KEY, "");
  let token = readRaw(PRIVAT_TOKEN_KEY, "");
  if (!id) {
    try {
      id = sessionStorage.getItem(PRIVAT_ID_KEY) || "";
    } catch {
      id = "";
    }
  }
  if (!token) {
    try {
      token = sessionStorage.getItem(PRIVAT_TOKEN_KEY) || "";
    } catch {
      token = "";
    }
  }
  return { id, token };
}

function saveCreds(id: string, token: string, remember: boolean) {
  if (remember) {
    writeRaw(PRIVAT_ID_KEY, id);
    writeRaw(PRIVAT_TOKEN_KEY, token);
    try {
      sessionStorage.removeItem(PRIVAT_ID_KEY);
      sessionStorage.removeItem(PRIVAT_TOKEN_KEY);
    } catch {}
  } else {
    try {
      sessionStorage.setItem(PRIVAT_ID_KEY, id);
      sessionStorage.setItem(PRIVAT_TOKEN_KEY, token);
    } catch {}
    removeItem(PRIVAT_ID_KEY);
    removeItem(PRIVAT_TOKEN_KEY);
  }
}

function clearCreds() {
  removeItem(PRIVAT_ID_KEY);
  removeItem(PRIVAT_TOKEN_KEY);
  try {
    sessionStorage.removeItem(PRIVAT_ID_KEY);
    sessionStorage.removeItem(PRIVAT_TOKEN_KEY);
  } catch {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrivatTx = any;
interface PrivatTxCache {
  txs: PrivatTx[];
  timestamp: number;
}
function loadTxCache(): PrivatTxCache | null {
  const c = readJSON<PrivatTxCache | null>(PRIVAT_CACHE_KEY, null);
  if (!c || typeof c !== "object") return null;
  if (!c.timestamp || Date.now() - c.timestamp > PRIVAT_CACHE_TTL) return null;
  if (!Array.isArray(c.txs) || c.txs.length === 0) return null;
  return c;
}

function saveTxCache(txs: PrivatTx[]) {
  writeJSON(PRIVAT_CACHE_KEY, { txs, timestamp: Date.now() });
}

interface PrivatBalanceCache {
  accounts: PrivatTx[];
  timestamp: number;
}
function loadBalanceCache(): PrivatTx[] | null {
  const c = readJSON<PrivatBalanceCache | null>(PRIVAT_BALANCE_KEY, null);
  if (!c || typeof c !== "object") return null;
  if (!c.timestamp || Date.now() - c.timestamp > PRIVAT_CACHE_TTL) return null;
  return Array.isArray(c.accounts) ? c.accounts : null;
}

function saveBalanceCache(accounts: PrivatTx[]) {
  writeJSON(PRIVAT_BALANCE_KEY, { accounts, timestamp: Date.now() });
}

function fmtDate(isoDate: string) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  if (y && m && d) return `${d}-${m}-${y}`;
  return isoDate;
}

function toTimestamp(trandate: string, trantime: string) {
  try {
    const [d, m, y] = (trandate || "").split(".");
    const dateStr = `${y}-${m}-${d}T${trantime || "00:00:00"}`;
    const ts = new Date(dateStr).getTime();
    if (!isNaN(ts)) return Math.floor(ts / 1000);
  } catch {}
  return Math.floor(Date.now() / 1000);
}

function normalizePrivatTransaction(
  row: Record<string, unknown> & {
    SUM?: string | number;
    TRANDATE?: string;
    TRANTIME?: string;
    OSND?: string;
    PRYZNACH?: string;
    AUT_CNTR_NAM?: string;
    REF?: string;
    REFN?: string;
    DOC_NUMBER?: string;
    AUT_MY_ACC?: string;
  },
  accountId: string | null | undefined,
) {
  const amountRaw = parseFloat(String(row.SUM ?? "")) || 0;
  const amountKopecks = Math.round(amountRaw * 100);
  const ts = toTimestamp(row.TRANDATE ?? "", row.TRANTIME ?? "");
  const description =
    row.OSND || row.PRYZNACH || row.AUT_CNTR_NAM || "Транзакція";
  const sourceId =
    row.REF || row.REFN || row.DOC_NUMBER || `${ts}_${amountKopecks}`;

  return normalizeTransaction(
    {
      id: `privat_${sourceId}`,
      time: ts,
      amount: amountKopecks,
      description,
      mcc: 0,
      raw: row,
    },
    { source: "privatbank", accountId: accountId || row.AUT_MY_ACC || null },
  );
}

function normalizeAccount(raw: Record<string, unknown>) {
  const r = raw as {
    acc?: string;
    id?: string;
    AUT_MY_ACC?: string;
    balance?: string | number;
    creditLimit?: string | number;
    currency?: string;
    alias?: string;
  };
  return {
    id: r.acc || r.id || r.AUT_MY_ACC || "",
    balance: Math.round((parseFloat(String(r.balance ?? "")) || 0) * 100),
    creditLimit: Math.round(
      (parseFloat(String(r.creditLimit ?? "")) || 0) * 100,
    ),
    currency: r.currency || "UAH",
    type: "privatbank",
    alias: r.alias || r.acc || "",
    _source: "privatbank",
  };
}

type PrivatApiResponse = {
  StatementsResponse?: { data?: unknown[] };
  data?: unknown[];
} & Record<string, unknown>;

async function apiFetch(
  merchantId: string,
  merchantToken: string,
  path: string,
  queryParams: Record<string, string> = {},
): Promise<PrivatApiResponse> {
  try {
    return await privatApi.request(
      { merchantId, merchantToken },
      path,
      queryParams,
    );
  } catch (e) {
    if (isApiError(e) && e.kind === "http") {
      const msg = e.serverMessage || `HTTP ${e.status}`;
      if (e.isAuth) {
        const err = new Error(msg);
        err.name = "AuthError";
        throw err;
      }
      throw new Error(msg);
    }
    throw e;
  }
}

export function usePrivatbank(enabled = true) {
  const [credentials, setCredentials] = useState(() =>
    enabled ? loadStoredCreds() : { id: "", token: "" },
  );
  const [accounts, setAccounts] = useState<PrivatTx[]>([]);
  const [transactions, setTransactions] = useState<PrivatTx[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [loadingTx, setLoadingTx] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [syncState, setSyncState] = useState<{
    status: string;
    source: string;
    lastSuccess: Date | null;
    lastError: string;
  }>({
    status: "idle",
    source: "none",
    lastSuccess: null,
    lastError: "",
  });

  const { id: storedId, token: storedToken } = credentials;

  const fetchTransactions = async (
    merchantId: string,
    merchantToken: string,
    accs: PrivatTx[],
  ) => {
    setLoadingTx(true);
    setSyncState((s) => ({ ...s, status: "loading", source: "none" }));
    try {
      const now = new Date();
      const startDate = fmtDate(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
      );
      const endDate = fmtDate(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
      );

      const allTxs: PrivatTx[] = [];
      for (const acc of accs) {
        try {
          const data = await apiFetch(
            merchantId,
            merchantToken,
            "/statements/transactions",
            {
              acc: acc.id,
              startDate,
              endDate,
              country: "UA",
              limit: "500",
            },
          );

          const rows: unknown[] =
            data?.StatementsResponse?.data ||
            data?.data ||
            (Array.isArray(data) ? (data as unknown[]) : []);

          const normalized = rows.map((r) =>
            normalizePrivatTransaction(
              r as Parameters<typeof normalizePrivatTransaction>[0],
              acc.id,
            ),
          );
          allTxs.push(...normalized);
        } catch (e) {
          const err = e as { name?: string; message?: string };
          if (err.name === "AuthError") throw e;
          console.warn(`[privat] failed for account ${acc.id}:`, err.message);
        }
      }

      const unique = Array.from(
        new Map(allTxs.map((t) => [t.id, t])).values(),
      ).sort((a, b) => b.time - a.time);

      setTransactions(unique);
      saveTxCache(unique);
      const now2 = new Date();
      setLastUpdated(now2);
      setSyncState({
        status: "success",
        source: "network",
        lastSuccess: now2,
        lastError: "",
      });
    } catch (e) {
      const err = e as { name?: string; message?: string };
      if (err.name === "AuthError") {
        setError(
          "Невірні credentials PrivatBank. Перевір Merchant ID та токен.",
        );
        setSyncState((s) => ({
          ...s,
          status: "error",
          lastError: err.message ?? "",
        }));
        return;
      }
      const cached = loadTxCache();
      if (cached) {
        setTransactions(cached.txs);
        setLastUpdated(new Date(cached.timestamp));
        setSyncState((s) => ({
          ...s,
          status: "partial",
          source: "cache",
          lastError: err.message ?? "",
        }));
      } else {
        setSyncState((s) => ({
          ...s,
          status: "error",
          source: "none",
          lastError: err.message ?? "",
        }));
      }
      setError(err.message || "Помилка завантаження транзакцій PrivatBank");
    } finally {
      setLoadingTx(false);
    }
  };

  const connect = async (
    merchantId: string,
    merchantToken: string,
    remember = false,
  ) => {
    setConnecting(true);
    setError("");

    const cleanId = (merchantId || "").trim();
    const cleanToken = (merchantToken || "").trim();

    if (!cleanId || !cleanToken) {
      setError("Введи Merchant ID та токен");
      setConnecting(false);
      return;
    }

    try {
      const cachedAccounts = loadBalanceCache();
      let accs;

      if (cachedAccounts) {
        accs = cachedAccounts;
      } else {
        const data = await apiFetch(
          cleanId,
          cleanToken,
          "/statements/balance/final",
          {
            country: "UA",
            showRest: "true",
          },
        );

        const rawAccs: unknown[] =
          data?.StatementsResponse?.data ||
          data?.data ||
          (Array.isArray(data) ? (data as unknown[]) : []);

        accs = rawAccs.map((r) =>
          normalizeAccount(r as Record<string, unknown>),
        );
        saveBalanceCache(accs);
      }

      setAccounts(accs);
      setConnected(true);
      saveCreds(cleanId, cleanToken, remember);
      setCredentials({ id: cleanId, token: cleanToken });

      const cached = loadTxCache();
      if (cached) {
        setTransactions(cached.txs);
        setLastUpdated(new Date(cached.timestamp));
        setSyncState({
          status: "success",
          source: "cache",
          lastSuccess: new Date(cached.timestamp),
          lastError: "",
        });
      } else {
        await fetchTransactions(cleanId, cleanToken, accs);
      }
    } catch (e) {
      const err = e as { name?: string; message?: string };
      if (err.name === "AuthError") {
        setError(
          "Невірні credentials PrivatBank. Перевір Merchant ID та токен.",
        );
      } else {
        setError(err.message || "Помилка підключення до PrivatBank");
      }
    } finally {
      setConnecting(false);
    }
  };

  const refresh = async () => {
    if (!storedId || !storedToken) return;
    try {
      const data = await apiFetch(
        storedId,
        storedToken,
        "/statements/balance/final",
        {
          country: "UA",
          showRest: "true",
        },
      );
      const rawAccs: unknown[] =
        data?.StatementsResponse?.data ||
        data?.data ||
        (Array.isArray(data) ? (data as unknown[]) : []);
      const accs = rawAccs.map((r) =>
        normalizeAccount(r as Record<string, unknown>),
      );
      setAccounts(accs);
      saveBalanceCache(accs);
      await fetchTransactions(storedId, storedToken, accs);
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message || "Помилка оновлення PrivatBank");
    }
  };

  const disconnect = () => {
    clearCreds();
    setCredentials({ id: "", token: "" });
    setAccounts([]);
    setTransactions([]);
    setConnected(false);
    setError("");
    setSyncState({
      status: "idle",
      source: "none",
      lastSuccess: null,
      lastError: "",
    });
    removeItem(PRIVAT_CACHE_KEY);
    removeItem(PRIVAT_BALANCE_KEY);
  };

  const clearCache = () => {
    removeItem(PRIVAT_CACHE_KEY);
    removeItem(PRIVAT_BALANCE_KEY);
    setTransactions([]);
    setAccounts([]);
    setLastUpdated(null);
  };

  const connectRef = useRef<typeof connect | null>(null);
  connectRef.current = connect;

  useEffect(() => {
    if (!enabled) return;
    if (storedId && storedToken) {
      setConnected(true);
      connectRef.current?.(storedId, storedToken, false);
    }
  }, [enabled, storedId, storedToken]);

  return {
    merchantId: storedId,
    connected,
    accounts,
    transactions,
    connecting,
    loadingTx,
    error,
    lastUpdated,
    syncState,
    connect,
    refresh,
    disconnect,
    clearCache,
  };
}
