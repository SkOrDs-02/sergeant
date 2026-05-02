import {
  memo,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { cn } from "../../lib/cn";
import { Icon, type IconName } from "./Icon";
import { hapticTap } from "../../lib/haptic";

/**
 * Sergeant Design System -- FloatingActionButton (FAB)
 *
 * Material-inspired floating action button with expandable quick-action
 * menu. Supports single-action and multi-action patterns.
 *
 * Features:
 * - Fixed positioning with safe-area inset support
 * - Expandable fan menu for multiple actions
 * - Scroll-to-hide behavior
 * - Module variant theming
 * - Keyboard accessible (Enter/Space to toggle, Escape to close)
 * - Reduced motion support
 *
 * @example
 * ```tsx
 * // Simple FAB
 * <FloatingActionButton icon="plus" onClick={handleAdd} />
 *
 * // Expandable FAB
 * <FloatingActionButton
 *   icon="plus"
 *   actions={[
 *     { id: "task", icon: "check", label: "Додати завдання", onClick: addTask },
 *     { id: "note", icon: "edit", label: "Нотатка", onClick: addNote },
 *   ]}
 * />
 * ```
 */

export type FABVariant =
  | "default"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition";
export type FABSize = "md" | "lg";

export interface FABAction {
  id: string;
  icon: IconName;
  label: string;
  onClick: () => void;
  color?: string;
}

const variantStyles: Record<FABVariant, string> = {
  default: "bg-brand-strong text-white shadow-brand/30 hover:brightness-110",
  finyk: "bg-finyk-strong text-white shadow-finyk/30 hover:brightness-110",
  fizruk: "bg-fizruk-strong text-white shadow-fizruk/30 hover:brightness-110",
  routine:
    "bg-routine-strong text-white shadow-routine/30 hover:brightness-110",
  nutrition:
    "bg-nutrition-strong text-white shadow-nutrition/30 hover:brightness-110",
};

const sizeStyles: Record<FABSize, { button: string; icon: number }> = {
  md: { button: "w-14 h-14", icon: 24 },
  lg: { button: "w-16 h-16", icon: 28 },
};

export interface FloatingActionButtonProps {
  icon?: IconName;
  onClick?: () => void;
  actions?: FABAction[];
  variant?: FABVariant;
  size?: FABSize;
  hideOnScroll?: boolean;
  /** Position on screen */
  position?: "bottom-right" | "bottom-center" | "bottom-left";
  /** Extended label (shows text next to icon) */
  label?: string;
  /** Accessible label */
  "aria-label"?: string;
  /** Custom render for trigger button content */
  children?: ReactNode;
  className?: string;
}

export const FloatingActionButton = memo(function FloatingActionButton({
  icon = "plus",
  onClick,
  actions,
  variant = "default",
  size = "md",
  hideOnScroll = false,
  position = "bottom-right",
  label,
  "aria-label": ariaLabel,
  children,
  className,
}: FloatingActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const lastScrollY = useRef(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasActions = actions && actions.length > 0;

  // Scroll-to-hide behavior
  useEffect(() => {
    if (!hideOnScroll) return;

    const handleScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollY.current;

      if (delta > 10 && currentY > 80) {
        setIsHidden(true);
        setIsOpen(false);
      } else if (delta < -10) {
        setIsHidden(false);
      }

      lastScrollY.current = currentY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [hideOnScroll]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleClick = useCallback(() => {
    hapticTap();
    if (hasActions) {
      setIsOpen((prev) => !prev);
    } else {
      onClick?.();
    }
  }, [hasActions, onClick]);

  const handleActionClick = useCallback((action: FABAction) => {
    hapticTap();
    setIsOpen(false);
    action.onClick();
  }, []);

  const positionClasses: Record<string, string> = {
    "bottom-right":
      "fixed bottom-[max(1.5rem,env(safe-area-inset-bottom,0px)+0.75rem)] right-5",
    "bottom-center":
      "fixed bottom-[max(1.5rem,env(safe-area-inset-bottom,0px)+0.75rem)] left-1/2 -translate-x-1/2",
    "bottom-left":
      "fixed bottom-[max(1.5rem,env(safe-area-inset-bottom,0px)+0.75rem)] left-5",
  };

  const styles = sizeStyles[size];

  return (
    <div
      ref={menuRef}
      className={cn(
        positionClasses[position],
        "z-50 flex flex-col-reverse items-center gap-3",
        "transition-all duration-300 ease-out",
        isHidden && "translate-y-24 opacity-0 pointer-events-none",
        className,
      )}
    >
      {/* Main FAB button */}
      <button
        type="button"
        onClick={handleClick}
        aria-label={ariaLabel || label || "Action"}
        aria-haspopup={hasActions ? "menu" : undefined}
        aria-expanded={hasActions ? isOpen : undefined}
        className={cn(
          "inline-flex items-center justify-center rounded-full",
          "shadow-lg transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand",
          "active:scale-95",
          variantStyles[variant],
          label ? "px-6 gap-2" : styles.button,
        )}
      >
        {children || (
          <>
            <Icon
              name={icon}
              size={styles.icon}
              strokeWidth={2.5}
              className={cn(
                "transition-transform duration-200",
                isOpen && "rotate-45",
              )}
            />
            {label && (
              <span className="text-sm font-semibold whitespace-nowrap">
                {label}
              </span>
            )}
          </>
        )}
      </button>

      {/* Expanded action menu */}
      {hasActions && isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm -z-10 motion-safe:animate-fade-in"
            aria-hidden="true"
          />

          {/* Action buttons */}
          <div className="flex flex-col items-center gap-2" role="menu">
            {actions.map((action, index) => (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                onClick={() => handleActionClick(action)}
                className={cn(
                  "flex items-center gap-3 pl-4 pr-5 py-2.5 rounded-full",
                  "bg-panel border border-line shadow-float",
                  "hover:bg-panel-hi active:scale-95",
                  "transition-all duration-200",
                  "motion-safe:animate-fab-item",
                )}
                style={{
                  animationDelay: `${index * 40}ms`,
                  ...(action.color
                    ? ({ "--fab-color": action.color } as React.CSSProperties)
                    : {}),
                }}
              >
                <span
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: action.color
                      ? `${action.color}20`
                      : undefined,
                  }}
                >
                  <Icon
                    name={action.icon}
                    size={18}
                    style={{ color: action.color }}
                  />
                </span>
                <span className="text-sm font-semibold text-text whitespace-nowrap">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});
