/**
 * Last validated: 2026-10-09
 * Status: Active
 *
 * Оболонка звітного рядка хабу (мова H, H-reports): рядок на hairline,
 * розгорнутий показує графік під собою. Без панелі, бордера й тіні.
 */
import type { ReactNode } from "react";

export interface ReportSheetProps {
  /** Згорнутий стан рядка — впливає лише на відступ під розгорнутим. */
  collapsed: boolean;
  children: ReactNode;
}

export function ReportSheet({ collapsed, children }: ReportSheetProps) {
  return (
    <div className={collapsed ? "py-0.5" : "space-y-3 pb-4 pt-0.5"}>
      {children}
    </div>
  );
}
