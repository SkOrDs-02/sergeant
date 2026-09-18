import { forwardRef, type ReactNode } from "react";
import { Button, type ButtonProps } from "./Button";

/**
 * Sergeant Design System — IconButton
 *
 * A variant of {@link Button} with enforced icon-only geometry and a
 * TypeScript-level requirement for `aria-label`. Use this instead of
 * hand-rolling `<button className="h-9 w-9 ..."><Icon /></button>` to
 * keep touch targets (≥44×44 on `md`+), focus rings, hover states and
 * accessibility affordances identical to the rest of the app.
 *
 *   <IconButton
 *     aria-label="Відкрити меню"
 *     variant="ghost"
 *     size="md"
 *     onClick={openMenu}
 *   >
 *     <Icon name="menu" />
 *   </IconButton>
 *
 * All `Button` props are supported (variant, size, loading, disabled, …)
 * except the `iconOnly` toggle, which is baked in.
 */

export interface IconButtonProps extends Omit<ButtonProps, "iconOnly"> {
  /** Accessible label — required so screen readers announce the action. */
  "aria-label": string;
  /** The visual icon (SVG / Icon component). */
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ children, size = "md", ...props }, ref) {
    return (
      <Button ref={ref} iconOnly size={size} {...props}>
        {children}
      </Button>
    );
  },
);
