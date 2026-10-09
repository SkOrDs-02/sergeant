import { useRef, type ReactNode } from "react";
import { useVisualKeyboardInset } from "@sergeant/shared";
import { cn } from "../../lib/ui/cn";
import { hapticTap } from "../../lib/adapters/haptic";
import {
  FAB_INSET_VAR,
  useBottomInsetVar,
} from "@shared/hooks/useBottomInsetVar";
import { Button } from "./Button";

/**
 * Головна дія екрана модуля (мова H, redesign v3): кнопка-outline на всю
 * ширину, закріплена над tab bar, названа тим, що додає («Додати витрату»).
 * Заміна круглого FAB (каталог п. 7).
 *
 * Смугу, яку займає, публікує в `--sgt-fab-inset`, тож `page-tabbar-pad`
 * дає контенту запас і останній рядок не ховається під кнопкою. Під
 * відкритою клавіатурою кнопка зникає, як і нав.
 */
export interface AddActionBarProps {
  label: string;
  onClick: () => void;
  /** Додаткові дії праворуч (наприклад, «Чек», «Імпорт» у Фініку). */
  extra?: ReactNode;
  className?: string;
}

export function AddActionBar({
  label,
  onClick,
  extra,
  className,
}: AddActionBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const kbOpen = useVisualKeyboardInset(true) > 0;
  useBottomInsetVar(ref, FAB_INSET_VAR, !kbOpen);
  if (kbOpen) return null;

  return (
    <div
      ref={ref}
      data-testid="add-action-bar"
      className={cn(
        "fixed inset-x-0 z-40 mx-auto flex max-w-lg gap-2 px-5 pb-2 pt-2 bg-bg",
        "bottom-[max(var(--sgt-bottom-nav-inset,0px),var(--sgt-consent-banner-inset,0px))]",
        className,
      )}
    >
      <Button
        variant="outline"
        size="lg"
        className="min-w-0 flex-1 whitespace-nowrap px-4"
        onClick={() => {
          hapticTap();
          onClick();
        }}
      >
        {label}
      </Button>
      {extra}
    </div>
  );
}
