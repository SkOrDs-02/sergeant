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
 *  - finyk + routine dual-write registration — installed once and
 *    **persisted** for the app session. We deliberately do NOT return
 *    the teardown: it clears the shared `registeredContext` singleton,
 *    which would silently disable a module's own dual-write if HubChat
 *    unmounts after registering. App-wide single registration is the
 *    intended shape.
 *
 * AI-DANGER: read and write registration must cover the SAME modules.
 * This hook warmed the routine READ cache but registered only the
 * finyk write context, so a habit created through a chat tool reached
 * the warm cache and then died on reload — `saveRoutineState` has no
 * localStorage fallback (Stage 8 PR #057r tombstoned it), so an
 * unregistered `triggerRoutineDualWrite` is a silent no-op. HubChat is
 * mounted app-wide by `HubChatOverlay` in `RootLayout`, so the routine
 * module shell (the only other place `bootRoutineDualWrite` runs) is
 * usually NOT mounted when a chat tool fires. Adding a read warmer here
 * without its write counterpart reintroduces the same data loss.
 *
 * The identity comes from `useLocalUserId`, so anonymous visitors
 * register too — see
 * `docs/90-work/planning/specs/anonymous-local-first-persistence.md`.
 */

import { useEffect, useRef } from "react";
import { useLocalUserId } from "../../auth/useLocalUserId";
import { useFinykSqliteReadBoot } from "../../../modules/finyk/hooks/useFinykSqliteReadBoot";
import { useSqliteReadBoot } from "../../../modules/routine/hooks/useSqliteReadBoot";
import { bootFinykDualWrite } from "../../../modules/finyk/lib/dualWriteBoot";
import { bootRoutineDualWrite } from "../../../modules/routine/lib/dualWriteBoot";

export function useHubChatStorageBoot(): void {
  // Read paths — warm the finyk + routine caches the executors read.
  useFinykSqliteReadBoot();
  useSqliteReadBoot();

  // Write path — register the dual-write contexts so the chat-action
  // writes (`finykChatWrite`, `saveRoutineState`, …) have a context to
  // apply through.
  const userId = useLocalUserId();
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
    bootRoutineDualWrite({ getUserId: () => userIdRef.current });
  }, [userId]);
}
