import { cn } from "@shared/lib/ui/cn";

/**
 * Мова H (редизайн v3 PR4): вибір у формі (тип прийому, одиниця порції)
 * — радіо на hairline, а не сегмент і не пігулки в hue. Обраний пункт
 * несе чорнило й підкреслення, решта другим сірим.
 */
export const choiceRowClass = "flex flex-wrap border-b border-line";

export function choiceItemClass(active: boolean): string {
  return cn(
    "-mb-px min-h-[44px] border-b-2 px-3 text-style-label focus-ring",
    active
      ? "border-text font-semibold text-text"
      : "border-transparent text-muted hover:text-text",
  );
}

/** Квадратна кнопка ± біля поля кількості (макет H-meal). */
export const stepButtonClass =
  "flex h-8 w-8 items-center justify-center rounded-[7px] border border-line text-style-title text-text hover:bg-line/40 focus-ring pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]";
