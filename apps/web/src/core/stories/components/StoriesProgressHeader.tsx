import { Icon } from "@shared/components/ui/Icon";
import type { Slide } from "../types";

interface Props {
  slides: Slide[];
  currentIndex: number;
  progress: number;
  paused: boolean;
  activeLabel: string;
  weekRange?: string;
  onClose: () => void;
}

/**
 * Top chrome: per-slide progress bars, header label, close button.
 *
 * The wrapper stops `pointerdown` propagation so taps on the close
 * button / progress bars never register as tap-to-navigate on the
 * underlying gesture surface.
 */
export function StoriesProgressHeader({
  slides,
  currentIndex,
  progress,
  paused,
  activeLabel,
  weekRange,
  onClose,
}: Props) {
  return (
    <div
      data-story-ui
      className="absolute inset-x-0 top-0 px-3 pt-[max(0.5rem,env(safe-area-inset-top,0px))] pb-2"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1">
        {slides.map((s, i) => {
          const fill =
            i < currentIndex ? 100 : i === currentIndex ? progress : 0;
          const isActive = i === currentIndex;
          return (
            <div
              key={s.id}
              className="flex-1 h-[3px] rounded-full bg-white/25 overflow-hidden"
            >
              <div
                className="h-full bg-white rounded-full"
                style={{
                  width: `${fill}%`,
                  // Keep a short linear transition so the rAF-driven width
                  // updates don't look jittery between frames.
                  transition:
                    isActive && !paused ? "width 50ms linear" : "none",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="w-7 h-7 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center text-[13px]">
          📊
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-bold text-white truncate">
            Дайджест · {activeLabel}
          </div>
          <div className="text-[10.5px] text-white/75 truncate">
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
          className="w-9 h-9 rounded-full bg-white/15 border border-white/20 text-white hover:bg-white/25 flex items-center justify-center transition-colors"
        >
          <Icon name="close" size={16} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
