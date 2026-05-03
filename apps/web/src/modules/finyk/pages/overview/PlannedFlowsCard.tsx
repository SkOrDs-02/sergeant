import { memo } from "react";
import { FlowRow, type FlowItem } from "./FlowRow";
import { Card } from "@shared/components/ui/Card";

interface PlannedFlowsCardProps {
  plannedFlows: (FlowItem & { id: string })[];
  onNavigate: (page: string) => void;
  showBalance: boolean;
}

/**
 * Список «Найближчі платежі» (до 5 рядків). plannedFlows — вже відфільтрований
 * і відсортований масив, тому компонент просто маппить його.
 */
const PlannedFlowsCardImpl = function PlannedFlowsCard({
  plannedFlows,
  onNavigate,
  showBalance,
}: PlannedFlowsCardProps) {
  if (plannedFlows.length === 0) return null;

  return (
    <Card radius="lg" padding="none" className="overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <span className="text-style-caption text-subtle">
          Найближчі платежі
        </span>
        <button
          onClick={() => onNavigate("budgets")}
          className="text-xs text-primary/80 hover:text-primary transition-colors py-2 px-1 min-h-[36px]"
        >
          Усі →
        </button>
      </div>
      <div className="px-5 pb-3">
        {plannedFlows.slice(0, 5).map((f) => (
          <FlowRow key={f.id} flow={f} showAmount={showBalance} />
        ))}
      </div>
    </Card>
  );
};

export const PlannedFlowsCard = memo(PlannedFlowsCardImpl);
