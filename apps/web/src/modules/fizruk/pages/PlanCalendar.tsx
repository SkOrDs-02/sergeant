import { Button } from "@shared/components/ui/Button";
import { RecoveryFocusCard } from "../components/RecoveryFocusCard";
import { TodayPlanCard } from "../components/TodayPlanCard";

export function PlanCalendar({
  onOpenRoutine,
}: {
  onOpenRoutine?: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad space-y-4">
        <TodayPlanCard />

        <RecoveryFocusCard
          onOpenAtlas={() => {
            window.location.hash = "#atlas";
          }}
        />

        <div className="space-y-2">
          {onOpenRoutine && (
            <Button
              className="w-full h-12 min-h-[44px]"
              onClick={onOpenRoutine}
            >
              Запланувати тренування
            </Button>
          )}
          {onOpenRoutine ? (
            <button
              type="button"
              onClick={onOpenRoutine}
              className="block w-full text-xs text-subtle hover:text-text text-center leading-snug min-h-[44px] px-2 py-2 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fizruk"
            >
              Заплановані тренування відображатимуться у{" "}
              <span className="underline underline-offset-2">
                календарі модуля «Рутина»
              </span>
            </button>
          ) : (
            <p className="text-xs text-subtle text-center leading-snug">
              Заплановані тренування відображатимуться у календарі модуля
              «Рутина»
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
