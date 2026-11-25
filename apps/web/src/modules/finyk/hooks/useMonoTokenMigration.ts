import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isApiError, monoWebhookApi } from "@shared/api";
import { finykKeys, hubKeys } from "@shared/lib/api/queryKeys";
import {
  safeReadStringLS,
  safeWriteLS,
  safeRemoveLS,
} from "@shared/lib/storage/storage";
import {
  trackEvent,
  ANALYTICS_EVENTS,
} from "../../../core/observability/analytics";
import { useToast } from "@shared/hooks/useToast";

const TOKEN_KEY = "finyk_token";
const REMEMBER_KEY = "finyk_token_remembered";
const MIGRATION_DONE_KEY = "finyk_mono_token_migrated";
// Лічильник остаточних відмов сервера (priv-32). Префікс `finyk_` покриває
// `purgeAppOwnedLocalData`, тож при логауті ключ зникає разом з рештою.
const MIGRATION_FAILURES_KEY = "finyk_mono_token_migration_failures";
/** Після стількох остаточних відмов легасі-токен стирається з пристрою. */
export const MONO_TOKEN_MIGRATION_MAX_FAILURES = 3;

/**
 * Відмова, яку повтор із тим самим токеном не виправить: 4xx від сервера
 * (401/403 без сесії, 400/422 на відкликаний чи битий токен). Мережа,
 * таймаут, 408/429 і 5xx — тимчасові, лічильник не чіпають.
 */
function isPermanentFailure(err: unknown): boolean {
  if (!isApiError(err) || err.kind !== "http") return false;
  return (
    err.status >= 400 &&
    err.status < 500 &&
    err.status !== 408 &&
    err.status !== 429
  );
}

function recordPermanentFailure(): void {
  const prev = Number.parseInt(
    safeReadStringLS(MIGRATION_FAILURES_KEY) ?? "0",
    10,
  );
  const next = (Number.isFinite(prev) && prev > 0 ? prev : 0) + 1;
  if (next >= MONO_TOKEN_MIGRATION_MAX_FAILURES) {
    // Токен Monobank не лежить на пристрої відкритим текстом безстроково:
    // після N відмов перепідключення лише вручну, з налаштувань Фініка.
    removeLegacyTokenKeys();
    safeRemoveLS(MIGRATION_FAILURES_KEY);
    return;
  }
  safeWriteLS(MIGRATION_FAILURES_KEY, String(next));
}

function readLegacyToken(): string {
  const remembered = safeReadStringLS(REMEMBER_KEY);
  if (remembered) return remembered;

  // sessionStorage not covered by safeReadLS — use try/catch
  let sessionToken = "";
  try {
    sessionToken = sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    sessionToken = "";
  }
  if (sessionToken) return sessionToken;

  return safeReadStringLS(TOKEN_KEY) ?? "";
}

function removeLegacyTokenKeys(): void {
  safeRemoveLS(TOKEN_KEY);
  safeRemoveLS(REMEMBER_KEY);
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage may be disabled */
  }
}

/**
 * One-time migration: if the user has a legacy Monobank token stored in
 * localStorage/sessionStorage, POST it to `/api/mono/connect`, then remove
 * the browser-stored keys. Runs once per session (guarded by ref +
 * localStorage flag).
 *
 * `isLoggedIn` — підтверджена сесія (`useSessionReady`), не константа:
 * анонім без кукі отримав би 401 і слав би токен на кожному маунті (priv-32).
 * Остаточні відмови (4xx) рахуються в `MIGRATION_FAILURES_KEY`; після
 * `MONO_TOKEN_MIGRATION_MAX_FAILURES` легасі-ключі видаляються.
 *
 * The `mono_webhook` feature flag was removed when the legacy polling code
 * was deleted — webhook is now the only mode, so this migration always runs
 * for any logged-in user with a legacy token. Keep the hook around for at
 * least one more release cycle so older browsers without `MIGRATION_DONE_KEY`
 * still get cleaned up.
 */
export function useMonoTokenMigration(isLoggedIn: boolean): void {
  const queryClient = useQueryClient();
  const toast = useToast();
  const migratedRef = useRef(false);

  useEffect(() => {
    if (!isLoggedIn || migratedRef.current) return;

    // Already migrated in a previous session
    if (safeReadStringLS(MIGRATION_DONE_KEY) === "1") return;

    const legacyToken = readLegacyToken();
    if (!legacyToken) return;

    migratedRef.current = true;

    (async () => {
      try {
        await monoWebhookApi.connect(legacyToken.trim(), {
          signal: AbortSignal.timeout(30_000),
        });
        removeLegacyTokenKeys();
        safeRemoveLS(MIGRATION_FAILURES_KEY);
        safeWriteLS(MIGRATION_DONE_KEY, "1");

        await queryClient.invalidateQueries({
          queryKey: finykKeys.monoSyncState,
        });
        queryClient.invalidateQueries({
          queryKey: hubKeys.preview("finyk"),
        });

        trackEvent(ANALYTICS_EVENTS.MONO_TOKEN_MIGRATED, {
          source: "auto",
        });

        toast.success(
          "Monobank перепідключено: нові операції приходитимуть самі",
        );
      } catch (err) {
        // Тимчасова відмова — токен лишається до наступного маунту; остаточна
        // рахується, і після N таких токен стирається.
        if (isPermanentFailure(err)) recordPermanentFailure();
        migratedRef.current = false;
      }
    })();
  }, [isLoggedIn, queryClient, toast]);
}
