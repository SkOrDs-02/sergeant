import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { Icon, type IconName } from "./Icon";
import { hapticTap } from "../../lib/haptic";

export interface QuickAction {
  id: string;
  icon: IconName;
  label: string;
  color?: string;
  onClick: () => void;
}

interface QuickActionsMenuProps {
  /** Trigger element that opens the menu on long-press */
  trigger: React.ReactNode;
  /** Actions to display in the radial menu */
  actions: QuickAction[];
  /** Position of the menu relative to trigger */
  position?: "top" | "bottom";
  /** Called when menu opens */
  onOpen?: () => void;
  /** Called when menu closes */
  onClose?: () => void;
}

const LONG_PRESS_DELAY = 500; // ms
const ACTION_RADIUS = 80; // px from center

/**
 * QuickActionsMenu - A radial menu that appears on long-press.
 *
 * Used for FAB quick actions, module shortcuts, etc.
 */
export function QuickActionsMenu({
  trigger,
  actions,
  position = "top",
  onOpen,
  onClose,
}: QuickActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressing = useRef(false);

  const startLongPress = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      isLongPressing.current = true;

      longPressTimer.current = setTimeout(() => {
        if (isLongPressing.current && triggerRef.current) {
          hapticTap();
          setAnchorRect(triggerRef.current.getBoundingClientRect());
          setIsOpen(true);
          onOpen?.();
        }
      }, LONG_PRESS_DELAY);
    },
    [onOpen],
  );

  const endLongPress = useCallback(() => {
    isLongPressing.current = false;
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    onClose?.();
  }, [onClose]);

  const handleActionClick = useCallback(
    (action: QuickAction) => {
      hapticTap();
      close();
      action.onClick();
    },
    [close],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    };
  }, []);

  // Calculate action positions in a semi-circle
  const getActionPosition = (index: number, total: number) => {
    // Spread actions in a semi-circle (180 degrees for top, 180 for bottom)
    const startAngle = position === "top" ? -180 : 0;
    const endAngle = position === "top" ? 0 : 180;
    const angleRange = endAngle - startAngle;
    const step = total > 1 ? angleRange / (total - 1) : 0;
    const angle = startAngle + step * index;
    const radian = (angle * Math.PI) / 180;

    return {
      x: Math.cos(radian) * ACTION_RADIUS,
      y: Math.sin(radian) * ACTION_RADIUS,
    };
  };

  return (
    <>
      <div
        ref={triggerRef}
        onTouchStart={startLongPress}
        onTouchEnd={endLongPress}
        onTouchCancel={endLongPress}
        onMouseDown={startLongPress}
        onMouseUp={endLongPress}
        onMouseLeave={endLongPress}
        onContextMenu={(e) => e.preventDefault()}
        className="touch-none"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        {trigger}
      </div>

      {isOpen &&
        anchorRect &&
        createPortal(
          <div className="fixed inset-0 z-50" role="presentation">
            {/* Backdrop */}
            <button
              type="button"
              className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in duration-150 cursor-default"
              onClick={close}
              aria-label="Закрити меню"
              tabIndex={-1}
            />

            {/* Menu container positioned at trigger */}
            <div
              className="absolute"
              style={{
                left: anchorRect.left + anchorRect.width / 2,
                top: position === "top" ? anchorRect.top : anchorRect.bottom,
              }}
            >
              {/* Actions */}
              {actions.map((action, index) => {
                const pos = getActionPosition(index, actions.length);
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => handleActionClick(action)}
                    className={cn(
                      "absolute flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-1/2",
                      "animate-in zoom-in-50 fade-in duration-200",
                    )}
                    style={{
                      left: pos.x,
                      top: pos.y,
                      animationDelay: `${index * 30}ms`,
                    }}
                    role="menuitem"
                  >
                    <div
                      className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center",
                        "bg-panel border border-line shadow-float",
                        "hover:scale-110 active:scale-95 transition-transform",
                      )}
                      style={{
                        backgroundColor: action.color
                          ? `${action.color}20`
                          : undefined,
                        borderColor: action.color
                          ? `${action.color}40`
                          : undefined,
                      }}
                    >
                      <Icon
                        name={action.icon}
                        size={20}
                        style={{ color: action.color }}
                      />
                    </div>
                    <span className="text-xs font-medium text-text whitespace-nowrap bg-panel/90 px-2 py-0.5 rounded-full">
                      {action.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
