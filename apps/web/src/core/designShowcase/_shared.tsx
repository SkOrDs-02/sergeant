import type { ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";
import { SectionHeading } from "@shared/components/ui";

export const NAV_SECTIONS = [
  { id: "colors", label: "Кольори" },
  { id: "typography", label: "Типографіка" },
  { id: "buttons", label: "Кнопки" },
  { id: "badges", label: "Бейджі" },
  { id: "cards", label: "Карти" },
  { id: "forms", label: "Форми" },
  { id: "data", label: "Дані" },
  { id: "navigation", label: "Навігація" },
  { id: "overlays", label: "Overlays" },
  { id: "feedback", label: "Фідбек" },
  { id: "celebration", label: "Святкування" },
  { id: "onboarding", label: "Онбординг" },
  { id: "motion", label: "Motion" },
] as const;

export function Sec({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-16">
      <h2 className="text-xl font-extrabold text-text mb-6 pb-3 border-b border-line">
        {title}
      </h2>
      <div className="space-y-8">{children}</div>
    </section>
  );
}

export function Group({
  label,
  children,
  row = false,
}: {
  label: string;
  children: ReactNode;
  row?: boolean;
}) {
  return (
    <div>
      <SectionHeading size="xs" variant="subtle" className="mb-3">
        {label}
      </SectionHeading>
      <div className={row ? "flex flex-wrap items-center gap-3" : ""}>
        {children}
      </div>
    </div>
  );
}

export function ColorSwatch({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={cn(
          "w-14 h-14 rounded-2xl border border-line shadow-card",
          className,
        )}
      />
      <span className="text-2xs text-subtle text-center font-mono">
        {label}
      </span>
    </div>
  );
}
