/**
 * Runs `reconcileBiometricsWithServerProfile` AND
 * `reconcileMemoryBankWithServerProfile` once per authenticated login
 * session (L-8, 2026-08-08 — the memory bank leg is new; biometrics
 * already had it). Mounted app-wide (not gated to any one module) in
 * `RootLayout.tsx`'s `AppShell`, mirroring the `*DualWriteBoot` gates there.
 *
 * The `GET /api/me/profile` fetch itself goes through React Query
 * (`hubKeys.profile(userId)`, Hard Rule #2, user-scoped since CodeRabbit
 * PR #627 — see that factory entry) so it participates in the normal
 * cache / devtools story; the reconcile side-effects below run against
 * that ONE cached response exactly once per `userId` (tracked via a ref)
 * so a background refetch never re-triggers the push-or-hydrate decision
 * mid-session.
 *
 * Also wires `memoryBank.ts`'s `subscribeLocalMemoryEdit` →
 * `pushMemoryBankToServer` — the "push after every local save" leg of
 * L-8, mirroring `useBiometrics.saveBiometrics`'s own push. Wired HERE
 * (not inside `memoryBank.ts` itself) to avoid a `memoryBank.ts` ↔
 * `profileWriteThrough.ts` import cycle: this hook already imports both.
 */
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { meApi } from "@shared/api";
import { logger } from "@shared/lib";
import { hubKeys } from "@shared/lib/api/queryKeys";
import { useAuth } from "../auth/AuthContext";
import { setBiometricsOwner } from "./biometrics";
import { setMemoryBankOwner, subscribeLocalMemoryEdit } from "./memoryBank";
import {
  pushMemoryBankToServer,
  reconcileBiometricsWithServerProfile,
  reconcileMemoryBankWithServerProfile,
} from "./profileWriteThrough";

export function useProfileWriteThroughBoot(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Tags every local biometrics / memory-bank write (this reconcile's own
  // hydrate below, or a manual save on either surface) with the current
  // session's owner — feeds the cross-account upload guard in
  // `profileWriteThrough.ts` (CodeRabbit PR #627, mirrored for the memory
  // bank by L-8).
  useEffect(() => {
    setBiometricsOwner(userId);
    setMemoryBankOwner(userId);
  }, [userId]);

  // L-8: push-after-every-local-save for the memory bank. Gated on
  // `userId` the same way `useBiometrics.saveBiometrics` gates its own
  // push on `user?.id` — signed-out edits (demo mode, pre-login) never
  // reach the network. Re-subscribes whenever `userId` changes so the
  // closure always captures the CURRENT session, not a stale one from a
  // prior sign-in on a shared device.
  useEffect(() => {
    return subscribeLocalMemoryEdit((entries) => {
      if (!userId) return;
      void pushMemoryBankToServer(entries);
    });
  }, [userId]);

  const query = useQuery({
    queryKey: hubKeys.profile(userId ?? "anon"),
    queryFn: ({ signal }) => meApi.getProfile({ signal }),
    enabled: userId !== null,
    staleTime: Infinity,
  });

  const reconciledForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      // Signed out — clear the guard so the NEXT sign-in (possibly a
      // different account on a shared device) reconciles again.
      reconciledForUserRef.current = null;
      return;
    }
    if (!query.data) return;
    if (reconciledForUserRef.current === userId) return;
    reconciledForUserRef.current = userId;
    const profile = query.data;
    Promise.all([
      reconcileBiometricsWithServerProfile(profile, userId),
      reconcileMemoryBankWithServerProfile(profile, userId),
    ]).catch((err: unknown) => {
      logger.warn("[profileWriteThrough] boot reconcile failed", err);
    });
  }, [userId, query.data]);
}
