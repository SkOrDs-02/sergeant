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
import { useOnboardingDoneOnRealEntry } from "../../../core/onboarding/useOnboardingDoneOnRealEntry";
import { useRoutineAutoMark } from "./useRoutineAutoMark";

export default function RoutineBootCluster(): null {
  useOnboardingDoneOnRealEntry("routine");
  useRoutineDualWriteBoot();
  useRoutineSqliteReadBoot();
  useRoutineQuickStatsBoot();
  // Р-1 (в): автовідмітка з подій інших модулів, усю сесію.
  useRoutineAutoMark();
  return null;
}
