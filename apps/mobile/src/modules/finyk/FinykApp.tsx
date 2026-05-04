/**
 * Finyk — module root shell for the mobile app.
 *
 * Mobile port of the web `apps/web/src/modules/finyk/FinykApp.tsx`. The
 * shell now renders the full ported {@link Overview} screen (Phase 4
 * / PR #: "Overview page"). All hero / pulse / planned-flow / budget /
 * category cards live under `./pages/Overview/` and consume pure
 * selectors from `@sergeant/finyk-domain`.
 *
 * Routing: the nested `expo-router` Stack (see `app/(tabs)/finyk/_layout.tsx`)
 * already exposes Transactions / Budgets / Analytics / Assets as sibling
 * screens; Overview itself is the stack's index (`app/(tabs)/finyk/index.tsx`
 * renders this component). `<Overview onNavigate />` hands those routes
 * off to `expo-router` via `router.push()`.
 */
import { useCallback } from "react";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Overview } from "./pages/Overview";
import type { OverviewNavRoute } from "./pages/Overview";
import { useFinykDualWriteBoot } from "./hooks/useFinykDualWriteBoot";
import { useFinykSqliteReadBoot } from "./hooks/useFinykSqliteReadBoot";

export function FinykApp() {
  // Stage 4 PR #036: install the dual-write context once the user is
  // known and the flag is on. Without this the `triggerFinykDualWrite`
  // calls in `assetsStore.ts` and friends early-out at the
  // `isFinykDualWriteRegistered()` gate, leaving SQLite empty.
  useFinykDualWriteBoot();

  // Stage 4 PR #037: warm the SQLite read cache so the per-store
  // overlays under `feature.finyk.sqlite_v2.read_sqlite` can swap MMKV
  // first-paint values for the local SQLite mirror. Idempotent + flag-
  // gated; a no-op when the flag is off.
  useFinykSqliteReadBoot();

  const router = useRouter();
  const handleNavigate = useCallback(
    (route: OverviewNavRoute) => {
      // Subscriptions / Assets / Analytics / Budgets / Transactions all
      // live as siblings inside the `(tabs)/finyk/` stack. Subscriptions
      // is not yet a dedicated route, so we fall back to Transactions
      // until that screen lands in a follow-up PR.
      switch (route) {
        case "transactions":
        case "subscriptions":
          router.push("/(tabs)/finyk/transactions");
          break;
        case "budgets":
          router.push("/(tabs)/finyk/budgets");
          break;
        case "analytics":
          router.push("/(tabs)/finyk/analytics");
          break;
        case "assets":
          router.push("/(tabs)/finyk/assets");
          break;
      }
    },
    [router],
  );

  return (
    <SafeAreaView
      edges={["top"]}
      className="flex-1 bg-bg dark:bg-bg"
      testID="finyk-app-root"
    >
      <Overview onNavigate={handleNavigate} />
    </SafeAreaView>
  );
}

export default FinykApp;
