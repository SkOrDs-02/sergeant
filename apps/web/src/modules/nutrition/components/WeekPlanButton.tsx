import { cn } from "@shared/lib/ui/cn";
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
      <button
        type="button"
        onClick={() => {
          if (gate.requireAccess()) void onClick();
        }}
        disabled={disabled}
        className={cn(
          "text-style-label w-full h-11 rounded-2xl border border-nutrition/40",
          "text-nutrition-strong dark:text-nutrition hover:bg-nutrition/10 disabled:opacity-50 transition-colors",
          "focus-ring",
        )}
      >
        {busy ? "…" : "План на тиждень"}
      </button>
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
