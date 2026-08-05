/**
 * Runs `reconcileBiometricsWithServerProfile` once per authenticated login
 * session. Mounted app-wide (not gated to any one module) in
 * `RootLayout.tsx`'s `AppShell`, mirroring the `*DualWriteBoot` gates there.
 *
 * The `GET /api/me/profile` fetch itself goes through React Query
 * (`hubKeys.profile`, Hard Rule #2) so it participates in the normal cache /
 * devtools story; the reconcile side-effect below runs against that cached
 * response exactly once per `userId` (tracked via a ref) so a background
 * refetch never re-triggers the push-or-hydrate decision mid-session.
 */
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { meApi } from "@shared/api";
import { logger } from "@shared/lib";
import { hubKeys } from "@shared/lib/api/queryKeys";
import { useAuth } from "../auth/AuthContext";
import { reconcileBiometricsWithServerProfile } from "./profileWriteThrough";

export function useProfileWriteThroughBoot(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const query = useQuery({
    queryKey: hubKeys.profile,
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
    reconcileBiometricsWithServerProfile(query.data).catch((err: unknown) => {
      logger.warn("[profileWriteThrough] boot reconcile failed", err);
    });
  }, [userId, query.data]);
}
