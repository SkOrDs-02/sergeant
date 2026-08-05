/**
 * Runs `reconcileBiometricsWithServerProfile` once per authenticated login
 * session. Mounted app-wide (not gated to any one module) in
 * `RootLayout.tsx`'s `AppShell`, mirroring the `*DualWriteBoot` gates there.
 *
 * The `GET /api/me/profile` fetch itself goes through React Query
 * (`hubKeys.profile(userId)`, Hard Rule #2, user-scoped since CodeRabbit
 * PR #627 — see that factory entry) so it participates in the normal
 * cache / devtools story; the reconcile side-effect below runs against
 * that cached response exactly once per `userId` (tracked via a ref) so a
 * background refetch never re-triggers the push-or-hydrate decision
 * mid-session.
 */
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { meApi } from "@shared/api";
import { logger } from "@shared/lib";
import { hubKeys } from "@shared/lib/api/queryKeys";
import { useAuth } from "../auth/AuthContext";
import { setBiometricsOwner } from "./biometrics";
import { reconcileBiometricsWithServerProfile } from "./profileWriteThrough";

export function useProfileWriteThroughBoot(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Tags every local biometrics write (this reconcile's own hydrate below,
  // or a manual `BiometricsSection` save) with the current session's
  // owner — feeds the cross-account upload guard in
  // `profileWriteThrough.ts` (CodeRabbit PR #627).
  useEffect(() => {
    setBiometricsOwner(userId);
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
    reconcileBiometricsWithServerProfile(query.data, userId).catch(
      (err: unknown) => {
        logger.warn("[profileWriteThrough] boot reconcile failed", err);
      },
    );
  }, [userId, query.data]);
}
