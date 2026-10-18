/**
 * Status: Active
 *
 * Side-effect-only boot cluster for the Finyk
 * module, extracted out of `core/app/RootLayout.tsx` so it can be reached
 * through `React.lazy()`.
 *
 * The read/mirror boots also rebuild the derived Hub quick-stats snapshot
 * after login, so the card never depends on opening the Finyk screen first.
 */
import { LOCAL_ANON_USER_ID } from "../../../core/auth/localIdentity";
import { useLocalUserId } from "../../../core/auth/useLocalUserId";
import { useMonobankWebhook } from "./useMonobankWebhook";
import { useFinykDualWriteBoot } from "./useFinykDualWriteBoot";
import { useFinykSqliteReadBoot } from "./useFinykSqliteReadBoot";
import { useFinykMonoMirrorBoot } from "./useFinykMonoMirrorBoot";
import { useFinykQuickStatsBoot } from "./useFinykQuickStatsBoot";

export default function FinykBootCluster(): null {
  const userId = useLocalUserId();
  // Bank webhooks land on the server. Refresh their local mirror on every
  // authenticated route, not only when FinykApp happens to be mounted.
  useMonobankWebhook({
    enabled: userId !== null && userId !== LOCAL_ANON_USER_ID,
    loadJars: false,
  });
  useFinykDualWriteBoot();
  useFinykSqliteReadBoot();
  useFinykMonoMirrorBoot();
  useFinykQuickStatsBoot();
  return null;
}
