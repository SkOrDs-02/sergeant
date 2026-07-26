import { useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { PhoneFrame, ProposalCard } from "./_PhoneFrame";

/**
 * R2-UI-2 — Sticky mini-summary bar.
 *
 * Today the header only condenses on scroll. The proposal keeps the primary
 * number available: once the hero total scrolls out of view, a compact bar
 * slides in at the top showing the same figure, so the user never loses the
 * headline metric while browsing the list underneath.
 *
 * Mock only — scroll the phone body; the mini-bar appears past the hero.
 */

export function StickySummaryDemo() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setShowBar(el.scrollTop > 96);
  }

  return (
    <ProposalCard
      id="R2-UI-2"
      title="Липкий міні-підсумок при скролі"
      intent="Коли hero-тотал іде вгору за екран, зверху зʼявляється компактний рядок із тією ж цифрою. Прокрути тіло телефона."
    >
      <PhoneFrame>
        <div className="relative flex-1 min-h-0 flex flex-col">
          {/* sticky mini bar */}
          <div
            className={cn(
              "absolute top-0 inset-x-0 z-10 px-4 py-2.5 flex items-center justify-between",
              "bg-panelHi/95 backdrop-blur border-b border-line transition-all duration-300",
              showBar ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0",
            )}
          >
            <span className="text-style-caption text-muted">Витрачено</span>
            <span className="text-style-label tabular-nums text-text">₴ 12 480</span>
          </div>

          <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
            {/* hero */}
            <div className="px-4 pt-3 pb-5">
              <p className="text-style-caption text-muted">Витрачено цього місяця</p>
              <p className="text-4xl font-semibold tabular-nums text-text mt-1">₴ 12 480</p>
              <p className="text-2xs text-muted mt-1">з бюджету ₴ 18 000</p>
            </div>
            {/* list */}
            <div className="px-4 space-y-2 pb-6">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-14 rounded-2xl bg-panel border border-line flex items-center px-3 gap-3">
                  <span className="h-8 w-8 rounded-lg bg-surface-muted shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="h-2.5 w-24 rounded bg-surface-muted" />
                    <div className="h-2 w-16 rounded bg-surface-muted" />
                  </div>
                  <span className="text-style-caption tabular-nums text-muted">₴ {120 + i * 30}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </PhoneFrame>
    </ProposalCard>
  );
}
