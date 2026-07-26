import { useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { PhoneFrame, ProposalCard } from "./_PhoneFrame";

/**
 * UI-10 — Position indicator for horizontal swipeable carousels.
 *
 * The app already has `.swipeable` snap carousels, but no dots/progress, so
 * you can't tell how many cards remain. This prototype tracks scrollLeft and
 * renders an active-dot row + a thin progress track underneath.
 */
const CARDS = [
  { title: "Баланс", value: "12 480 ₴", accent: "bg-finyk-soft text-finyk" },
  { title: "Тренування", value: "4 / 5", accent: "bg-fizruk-soft text-fizruk" },
  { title: "Звички", value: "7 днів", accent: "bg-routine-soft text-routine" },
  {
    title: "Калорії",
    value: "1 840",
    accent: "bg-nutrition-soft text-nutrition",
  },
];

export function CarouselDotsDemo() {
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const ratio = max > 0 ? el.scrollLeft / max : 0;
    setProgress(ratio);
    setActive(Math.round(ratio * (CARDS.length - 1)));
  }

  return (
    <ProposalCard
      id="UI-10"
      title="Індикатор позиції в каруселях"
      intent="Крапки + тонкий прогрес-трек показують, скільки ще карток. Свайпай стрічку вбік."
    >
      <PhoneFrame>
        <div className="flex-1 min-h-0 flex flex-col justify-center gap-4">
          <div
            ref={ref}
            onScroll={onScroll}
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory px-4 pb-1 no-scrollbar"
          >
            {CARDS.map((c) => (
              <div
                key={c.title}
                className="snap-center shrink-0 w-[200px] h-32 rounded-2xl bg-panel border border-line p-4 flex flex-col justify-between"
              >
                <span
                  className={cn(
                    "self-start px-2 py-0.5 rounded-md text-2xs",
                    c.accent,
                  )}
                >
                  {c.title}
                </span>
                <span className="text-style-title text-text tabular-nums">
                  {c.value}
                </span>
              </div>
            ))}
          </div>

          <div className="px-4 space-y-2">
            <div className="flex items-center justify-center gap-1.5">
              {CARDS.map((c, i) => (
                <span
                  key={c.title}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === active ? "w-5 bg-accent" : "w-1.5 bg-divider-strong",
                  )}
                />
              ))}
            </div>
            <div className="h-0.5 rounded-full bg-line overflow-hidden">
              <div
                className="h-full bg-accent/60 rounded-full transition-[width]"
                style={{ width: `${Math.max(12, progress * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </PhoneFrame>
    </ProposalCard>
  );
}
