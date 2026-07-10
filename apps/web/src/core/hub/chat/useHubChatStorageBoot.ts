/**
 * Warms the SQLite storage layer that the Hub chat-action executors
 * read and write off-React.
 *
 * The chat-action layer (`core/lib/chatActions/**`) runs synchronously
 * outside React, so it cannot use the finyk/routine `useStorage` hooks.
 * It reads the canonical state from the warm SQLite caches
 * (`getCachedFinykSqliteState()`, `loadRoutineState()`) and mirrors its
 * writes through the finyk dual-write context. Both must be warmed /
 * registered before a tool fires — that is this hook's job, mounted in
 * `HubChat`.
 *
 * Composition:
 *  - `useFinykSqliteReadBoot` / `useSqliteReadBoot` — idempotent,
 *    fire-and-forget read-cache warmers (module-level `booted` guards
 *    mean a co-mounted module shell that already warmed them is a
 *    no-op; no teardown).
 *  - finyk dual-write registration — installed once and **persisted**
 *    for the app session. We deliberately do NOT return the teardown:
 *    it clears the shared `registeredContext` singleton, which would
 *    silently disable the finyk module's own dual-write if HubChat
 *    unmounts after registering. App-wide single registration is the
 *    intended shape.
 */

import { useEffect, useRef } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useFinykSqliteReadBoot } from "../../../modules/finyk/hooks/useFinykSqliteReadBoot";
import { useSqliteReadBoot } from "../../../modules/routine/hooks/useSqliteReadBoot";
import { bootFinykDualWrite } from "../../../modules/finyk/lib/dualWriteBoot";

export function useHubChatStorageBoot(): void {
  // Read paths — warm the finyk + routine caches the executors read.
  useFinykSqliteReadBoot();
  useSqliteReadBoot();

  // Write path — register the finyk dual-write context so the
  // chat-action write mirrors (`triggerManualExpenseSqliteMirror`, …)
  // have a context to apply through.
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const userIdRef = useRef<string | null>(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current || !userId) return;
    registered.current = true;
    // Persist for the session — see file header on the teardown hazard.
    bootFinykDualWrite({ getUserId: () => userIdRef.current });
  }, [userId]);
}
