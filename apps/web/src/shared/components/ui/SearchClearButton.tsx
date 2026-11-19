/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Кнопка «Очистити пошук» для полів `type="search"` (спека
 * `docs/work/specs/hub-newcomer-card-and-insights.md`). Нативний хрестик
 * браузера випадає зі стилю продукту і на coarse-екрані замалий, тому поле,
 * яке ставить цю кнопку, ховає його класом {@link HIDE_NATIVE_SEARCH_CANCEL}.
 * Ховати нативний хрестик без власної кнопки не можна: інколи він єдиний
 * спосіб очистити поле одним тапом.
 */
import { Button } from "./Button";
import { Icon } from "./Icon";
import { cn } from "@shared/lib/ui/cn";

/** Ховає нативний хрестик `type="search"` (WebKit / Blink). */
export const HIDE_NATIVE_SEARCH_CANCEL =
  "[&::-webkit-search-cancel-button]:appearance-none";

export interface SearchClearButtonProps {
  /** Доступне імʼя, напр. «Очистити пошук». */
  label: string;
  onClear: () => void;
  className?: string | undefined;
}

/**
 * `Button iconOnly size="sm"` дає 44 px під `pointer: coarse`, тож зона
 * дотику не залежить від того, де кнопка стоїть.
 */
export function SearchClearButton({
  label,
  onClear,
  className,
}: SearchClearButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      iconOnly
      aria-label={label}
      onClick={onClear}
      className={cn(className)}
    >
      <Icon name="close" size="md" aria-hidden />
    </Button>
  );
}
