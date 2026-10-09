import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";

/**
 * Системний сигнал одним рядком факту (мова H, redesign v3): офлайн,
 * помилка сховища, застарілі дані, попередження інтеграції. Без боксу,
 * іконки й заливки; тон тексту каже вагу. Заміна колишнього `Banner`, клас
 * наджів якого знято (рішення власника 2026-10-09).
 *
 * - `muted` - довідковий факт, другим сірим;
 * - `ink` - попередження, чорнилом 600;
 * - `danger` - помилка або втрата даних, кольором небезпеки.
 */
export type NoticeTone = "muted" | "ink" | "danger";

const TONE: Record<NoticeTone, string> = {
  muted: "text-muted",
  ink: "text-text font-semibold",
  danger: "text-danger-ink font-semibold",
};

export interface NoticeProps extends HTMLAttributes<HTMLDivElement> {
  tone?: NoticeTone;
  /** Дія поруч із фактом (кнопка або посилання). */
  action?: ReactNode;
  children?: ReactNode;
}

export function Notice({
  tone = "muted",
  action,
  className,
  children,
  ...props
}: NoticeProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline gap-x-3 gap-y-1 text-style-label",
        TONE[tone],
        className,
      )}
      {...props}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}
