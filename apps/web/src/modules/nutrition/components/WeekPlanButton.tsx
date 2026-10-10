import { Button } from "@shared/components/ui/Button";
import { useLocale } from "@shared/i18n/useLocale";
import { PaywallModal, useFeatureGate } from "../../../core/billing";

interface WeekPlanButtonProps {
  onClick: () => void | Promise<void>;
  disabled?: boolean | undefined;
  busy?: boolean | undefined;
}

/**
 * Кнопка тижневого плану харчування. План на тиждень тільки в Premium
 * (спека access-tiers): Free бачить кнопку, але тап відкриває пейвол
 * `week_plan` замість запиту. Сервер гейтить `week-plan` сам (402), це лише
 * попередження до витрати часу на генерацію.
 */
export function WeekPlanButton({
  onClick,
  disabled,
  busy,
}: WeekPlanButtonProps) {
  const gate = useFeatureGate("nutrition.weekPlan");
  const { messages } = useLocale();
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => {
          if (gate.requireAccess()) void onClick();
        }}
        disabled={disabled}
      >
        {busy ? "…" : "План на тиждень"}
      </Button>
      {gate.paywallOpen && (
        <PaywallModal
          open
          onClose={gate.closePaywall}
          surface={gate.paywallSurface}
          title={messages.paywall["nutrition.weekPlan"].title}
          description={messages.paywall["nutrition.weekPlan"].description}
        />
      )}
    </>
  );
}
