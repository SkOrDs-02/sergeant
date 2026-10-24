import { Suspense, memo } from "react";
import { Card } from "@shared/components/ui/Card";
import { NetworthChart } from "../../components/charts/lazy";
import { ChartFallback } from "../../components/charts/ChartFallback";

interface NetworthSectionProps {
  networthHistory: ReadonlyArray<{ month: string; networth: number }>;
}

/**
 * Секція графіка нетворсу. Показує графік, коли історія має ≥2 точки,
 * інакше нічого.
 */
const NetworthSectionImpl = function NetworthSection({
  networthHistory,
}: NetworthSectionProps) {
  if (networthHistory.length >= 2) {
    return (
      <Card padding="none" className="px-5 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-style-caption text-subtle">
            Динаміка капіталу
          </span>
          <span className="text-style-caption text-muted">
            {networthHistory.length} міс.
          </span>
        </div>
        <Suspense fallback={<ChartFallback className="h-20" />}>
          <NetworthChart data={networthHistory} />
        </Suspense>
      </Card>
    );
  }

  // Порожня панель без дії не каже нічого (redesign v3.2, 17).
  return null;
};

export const NetworthSection = memo(NetworthSectionImpl);
