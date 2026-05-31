import { memo } from "react";
import { FlowRow, type FlowItem } from "./FlowRow";
import { Button } from "@shared/components/ui/Button";
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
        <Button
          variant="ghost"
          size="xs"
          module="finyk"
          onClick={() => onNavigate("budgets")}
        >
          Усі →
        </Button>
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
