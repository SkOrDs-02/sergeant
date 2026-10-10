import { useMemo } from "react";
import {
  getFlowSchedule,
  type UseFlowScheduleParams,
} from "../../lib/flowSchedule";
export type { ScheduledFlow } from "../../lib/flowSchedule";
export { PLANNED_FLOWS_HORIZON_DAYS } from "../../lib/flowSchedule";

export function useFlowSchedule(params: UseFlowScheduleParams) {
  const {
    subscriptions,
    manualDebts,
    receivables,
    transactions,
    kyivYear,
    kyivMonth,
    kyivDay,
  } = params;
  return useMemo(
    () =>
      getFlowSchedule({
        subscriptions,
        manualDebts,
        receivables,
        transactions,
        kyivYear,
        kyivMonth,
        kyivDay,
      }),
    [
      subscriptions,
      manualDebts,
      receivables,
      transactions,
      kyivYear,
      kyivMonth,
      kyivDay,
    ],
  );
}
