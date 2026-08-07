import { useEffect, useLayoutEffect, useRef } from "react";
import { Icon } from "@shared/components/ui/Icon";
import type { Slide } from "../types";

interface Props {
  slides: Slide[];
  currentIndex: number;
  durationMs: number;
  paused: boolean;
  activeLabel: string;
  weekRange?: string | undefined;
  onClose: () => void;
}

/**
 * Reads the horizontal scale currently painted on the bar.
 *
 * During a transition `getComputedStyle` reports the interpolated value, so
 * this doubles as "how far along is the animation right now" — which is what
 * a pause needs in order to freeze in place and later resume from there.
 */
function readScaleX(el: HTMLElement): number {
  const transform = getComputedStyle(el).transform;
  if (!transform || transform === "none") return 0;
  const matrix = /matrix3?d?\(([^)]+)\)/.exec(transform);
  const first = matrix?.[1]?.split(",")[0];
  if (first === undefined) return 0;
  const value = Number(first.trim());
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Top chrome: per-slide progress bars, header label, close button.
 *
 * The wrapper stops `pointerdown` propagation so taps on the close
 * button / progress bars never register as tap-to-navigate on the
 * underlying gesture surface.
 *
 * AI-CONTEXT: the active bar is animated by ONE CSS transform transition
 * per slide, set up imperatively below — not by a width that JavaScript
 * repaints every frame. The old per-frame approach was invisible on desktop
 * and broken on the target device: it only moved when `requestAnimationFrame`
 * fired, and in an iOS PWA resumed from the background rAF can stay suspended
 * indefinitely, so the bar stuttered or froze while slides kept advancing on
 * the timer. A compositor-driven `transform` needs neither rAF nor a free main
 * thread, and `transform` (unlike `width`) costs no layout. Keep it that way:
 * do not reintroduce a JS-driven width, and do not render an inline transform
 * for the active bar in JSX — React would clobber the running animation.
 */
export function StoriesProgressHeader({
  slides,
  currentIndex,
  durationMs,
  paused,
  activeLabel,
  weekRange,
  onClose,
}: Props) {
  const activeBarRef = useRef<HTMLDivElement | null>(null);

  // Reset before paint so a new slide never flashes the previous bar's fill.
  useLayoutEffect(() => {
    const el = activeBarRef.current;
    if (!el) return;
    el.style.transition = "none";
    el.style.transform = "scaleX(0)";
  }, [currentIndex]);

  useEffect(() => {
    const el = activeBarRef.current;
    if (!el) return;

    const scale = readScaleX(el);
    if (paused) {
      // Freeze exactly where the compositor got to.
      el.style.transition = "none";
      el.style.transform = `scaleX(${scale})`;
      return;
    }

    const remaining = Math.max(0, durationMs * (1 - scale));
    el.style.transition = "none";
    el.style.transform = `scaleX(${scale})`;
    // Force a style flush so the browser treats the line below as a new
    // transition starting from `scale` rather than collapsing both writes.
    void el.offsetWidth;
    el.style.transition = `transform ${remaining}ms linear`;
    el.style.transform = "scaleX(1)";
  }, [currentIndex, durationMs, paused]);

  return (
    <div
      data-story-ui
      className="absolute inset-x-0 top-0 px-3 pt-[max(0.5rem,env(safe-area-inset-top,0px))] pb-2"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1">
        {slides.map((s, i) => {
          const isActive = i === currentIndex;
          return (
            <div
              key={s.id}
              className="flex-1 h-[3px] rounded-full bg-white/25 overflow-hidden"
            >
              <div
                ref={isActive ? activeBarRef : undefined}
                data-testid={isActive ? "active-story-progress" : undefined}
                className="h-full w-full bg-white rounded-full origin-left"
                // Static bars only. The active one is driven imperatively
                // above; giving it an inline transform here would restart
                // its animation on every unrelated re-render.
                style={
                  isActive
                    ? undefined
                    : {
                        transform: `scaleX(${i < currentIndex ? 1 : 0})`,
                        transition: "none",
                      }
                }
              />
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2">
        {/* icon-size, not type */}
        <div className="w-7 h-7 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center text-white">
          <Icon name="bar-chart-2" size={14} aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-style-label font-bold text-white truncate">
            Дайджест · {activeLabel}
          </div>
          <div className="text-style-caption text-white/75 truncate">
            {weekRange}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Закрити"
          className="w-9 h-9 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] rounded-full bg-white/15 border border-white/20 text-white hover:bg-white/25 flex items-center justify-center transition-colors"
        >
          <Icon name="close" size={16} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
