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
import { useFinykDualWriteBoot } from "./useFinykDualWriteBoot";
import { useFinykSqliteReadBoot } from "./useFinykSqliteReadBoot";
import { useFinykMonoMirrorBoot } from "./useFinykMonoMirrorBoot";
import { useFinykQuickStatsBoot } from "./useFinykQuickStatsBoot";

export default function FinykBootCluster(): null {
  useFinykDualWriteBoot();
  useFinykSqliteReadBoot();
  useFinykMonoMirrorBoot();
  useFinykQuickStatsBoot();
  return null;
}
