import { Suspense, memo } from "react";
import { Card } from "@shared/components/ui/Card";
import { NetworthChart } from "../../components/charts/lazy";
import { ChartFallback } from "../../components/charts/ChartFallback";

interface NetworthSectionProps {
  networthHistory: ReadonlyArray<{ month: string; networth: number }>;
}

/**
 * Секція графіка нетворсу. Показує графік якщо історія містить ≥2 точки,
 * інакше — placeholder-картку з підказкою.
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
      padding="xl"
      className="border-dashed text-center"
    >
      <p className="text-sm text-subtle">
        Ще мало знімків для графіка нетворсу — з’явиться після кількох змін
        балансу.
      </p>
    </Card>
  );
};

export const NetworthSection = memo(NetworthSectionImpl);
