/**
 * Status: Active
 *
 * Side-effect-only boot cluster for the Routine
 * module, extracted out of `core/app/RootLayout.tsx` so it can be reached
 * through `React.lazy()`.
 */
import { useRoutineDualWriteBoot } from "./useRoutineDualWriteBoot";
import { useSqliteReadBoot as useRoutineSqliteReadBoot } from "./useSqliteReadBoot";
import { useRoutineQuickStatsBoot } from "./useRoutineQuickStatsBoot";

export default function RoutineBootCluster(): null {
  useRoutineDualWriteBoot();
  useRoutineSqliteReadBoot();
  useRoutineQuickStatsBoot();
  return null;
}
