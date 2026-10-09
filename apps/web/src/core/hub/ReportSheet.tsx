/**
 * Last validated: 2026-10-09
 * Status: Active
 *
 * Оболонка звітної картки хабу: панель мови H (redesign v3), без бордера й
 * тіні. Матеріал «край і зріз» лишився тільки на чеку Фініка.
 */
import type { ReactNode } from "react";

export interface ReportSheetProps {
  /** Згорнутий стан картки — впливає лише на щільність падінга. */
  collapsed: boolean;
  children: ReactNode;
}

export function ReportSheet({ collapsed, children }: ReportSheetProps) {
  return (
    <div className="rounded-xl bg-panel">
      <div className={collapsed ? "p-3" : "p-4 space-y-3"}>{children}</div>
    </div>
  );
}
