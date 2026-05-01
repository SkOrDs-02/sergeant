/**
 * Top-level React Query provider with MMKV-backed persistence.
 *
 * Replaces the plain `QueryClientProvider` with
 * `PersistQueryClientProvider` so that `useQuery` hooks warm-start
 * from disk on app launch — critical for offline-first behavior on
 * mobile, where the user might open the app on a subway platform
 * before any network request has a chance to run.
 *
 * Persistence is wired through `@/sync/persister/mmkvPersister`,
 * which writes to the shared MMKV instance under the mobile-prefixed
 * `STORAGE_KEYS.MOBILE_QUERY_CACHE` key (see
 * `packages/shared/src/lib/storageKeys.ts`).
 */
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import type { PropsWithChildren } from "react";
import { useMemo } from "react";

import {
  createMMKVPersister,
  shouldDehydrateQueryForPersistMobile,
} from "@/sync/persister/mmkvPersister";

// 7 days — long enough that a user who returns after a week still sees
// their last-seen data on launch, short enough that we don't keep
// stale caches from a month ago around indefinitely.
const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

export function QueryProvider({ children }: PropsWithChildren) {
  const client = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // 24h gc window keeps the rehydrated cache useful even
            // when the user opens the app a full day later without
            // network.
            gcTime: 24 * 60 * 60 * 1_000,
          },
        },
      }),
    [],
  );

  const persister = useMemo(() => createMMKVPersister(), []);

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: PERSIST_MAX_AGE_MS,
        // Don't persist auth/me/coach/sync/balance feeds — they
        // contain personally-identifying data that must not survive
        // logout / device hand-off (the persister is keyed by
        // build-id, not user-id). Mirrors the web persister; the
        // shared block-list lives in `@sergeant/shared`
        // `isSensitiveQueryKey`. See PR #004 in
        // `docs/planning/storage-roadmap.md`.
        dehydrateOptions: {
          shouldDehydrateQuery: shouldDehydrateQueryForPersistMobile,
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
