import { memo } from "react";
import { FlowRow, type FlowItem } from "../overview/FlowRow";
import { Card } from "@shared/components/ui/Card";
import { messages } from "@shared/i18n/uk";

interface PlannedFlowsCardProps {
  plannedFlows: (FlowItem & { id: string })[];
  showBalance: boolean;
}

/**
 * Список «Найближчі платежі» (до 5 рядків). plannedFlows — вже відфільтрований
 * і відсортований масив, тому компонент просто маппить його.
 *
 * Живе в Плануванні (переїхав з Огляду 2026-09-03): це майбутнє, а не факт.
 * Кнопки «Усі →» більше немає — повний список підписок стоїть одразу під
 * карткою на тій самій сторінці.
 */
const PlannedFlowsCardImpl = function PlannedFlowsCard({
  plannedFlows,
  showBalance,
}: PlannedFlowsCardProps) {
  if (plannedFlows.length === 0) return null;

  return (
    <Card radius="lg" padding="none" className="overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <span className="text-style-caption text-subtle">
          {messages.finyk.planning.upcomingTitle}
        </span>
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
