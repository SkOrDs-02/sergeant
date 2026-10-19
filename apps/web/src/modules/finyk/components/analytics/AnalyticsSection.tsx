import { memo, type ReactNode } from "react";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";

interface AnalyticsSectionProps {
  hero?: boolean;
  title: string;
  children: ReactNode;
  className?: string;
}

// Презентаційний контейнер-секція. memo, бо приймає лише `title/className/children`
// і не має побічних ефектів — уникаємо рендеру при оновленнях, не повʼязаних з пропсами.
export const AnalyticsSection = memo(function AnalyticsSection({
  title,
  children,
  className,
  hero = false,
}: AnalyticsSectionProps) {
  return (
    <Card
      prominence={hero ? "hero" : "panel"}
      tone={hero ? "finyk" : undefined}
      padding="lg"
      className={className}
    >
      <SectionHeading as="div" size="lg" className="mb-4" variant="text">
        {title}
      </SectionHeading>
      {children}
    </Card>
  );
});
