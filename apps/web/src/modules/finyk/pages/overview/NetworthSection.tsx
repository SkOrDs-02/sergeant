import { Suspense, memo } from "react";
import { Card } from "@shared/components/ui/Card";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Icon } from "@shared/components/ui/Icon";
import { NetworthChart } from "../../components/charts/lazy";
import { ChartFallback } from "../../components/charts/ChartFallback";

interface NetworthSectionProps {
  networthHistory: ReadonlyArray<{ month: string; networth: number }>;
}

/**
 * Секція графіка нетворсу. Показує графік якщо історія містить ≥2 точки,
 * інакше — compact `EmptyState` (tier 2) з module-tuned-акцентом замість
 * сирого `<p>` у dashed-картці (доки даних мало, surface усе ще треба
 * представити як «card-section без items», `docs/design/empty-states.md`).
 */
const NetworthSectionImpl = function NetworthSection({
  networthHistory,
}: NetworthSectionProps) {
  if (networthHistory.length >= 2) {
    return (
      <Card
        variant="default"
        radius="lg"
        padding="none"
        className="px-5 pt-4 pb-3"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-style-caption text-subtle">
            Динаміка нетворсу
          </span>
          <span className="text-xs text-muted">
            {networthHistory.length} міс.
          </span>
        </div>
        <Suspense fallback={<ChartFallback className="h-20" />}>
          <NetworthChart data={networthHistory} />
        </Suspense>
      </Card>
    );
  }

  return (
    <Card
      variant="default"
      radius="lg"
      padding="none"
      className="border-dashed"
    >
      <EmptyState
        compact
        module="finyk"
        icon={<Icon name="trending-up" size={20} />}
        title="Поки що мало знімків"
        description="Графік нетворсу з'явиться після кількох змін балансу."
      />
    </Card>
  );
};

export const NetworthSection = memo(NetworthSectionImpl);
