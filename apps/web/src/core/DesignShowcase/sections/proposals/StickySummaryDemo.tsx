import { useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { ProposalCard } from "./_PhoneFrame";
import { ComparePair, MiniPhone } from "./_Compare";

/**
 * R2-UI-2 — Sticky mini-summary bar.
 *
 * Зараз: the header only condenses on scroll — once the hero total leaves
 * the viewport, the headline number is gone until you scroll back up.
 * Може бути: a compact bar slides in at the top showing the same figure, so
 * the user keeps the primary metric while browsing the list underneath.
 *
 * Mock only — scroll either phone body; only the right one keeps the total.
 */

function ListRows() {
  return (
    <div className="px-4 space-y-2 pb-6">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="h-14 rounded-2xl bg-panel border border-line flex items-center px-3 gap-3"
        >
          <span className="h-8 w-8 rounded-lg bg-surface-muted shrink-0" />
          <div className="flex-1 space-y-1">
            <div className="h-2.5 w-24 rounded bg-surface-muted" />
            <div className="h-2 w-16 rounded bg-surface-muted" />
          </div>
          <span className="text-style-caption tabular-nums text-muted">
            ₴ {120 + i * 30}
          </span>
        </div>
      ))}
    </div>
  );
}

function Hero() {
  return (
    <div className="px-4 pt-3 pb-5">
      <p className="text-style-caption text-muted">Витрачено цього місяця</p>
      <p className="text-4xl font-semibold tabular-nums text-text mt-1">
        ₴ 12 480
      </p>
      <p className="text-style-caption text-muted mt-1">з бюджету ₴ 18 000</p>
    </div>
  );
}

export function StickySummaryDemo() {
  const beforeRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<HTMLDivElement>(null);
  const [beforeScrolled, setBeforeScrolled] = useState(false);
  const [showBar, setShowBar] = useState(false);

  return (
    <ProposalCard
      id="R2-UI-2"
      title="Липкий міні-підсумок при скролі"
      intent="Коли hero-тотал іде вгору за екран, зараз цифра зникає; у пропозиції зверху лишається компактний рядок із тією ж сумою. Прокрути тіло телефона."
    >
      <ComparePair
        before={
          <MiniPhone dim>
            <div className="relative flex-1 min-h-0 flex flex-col">
              <div
                className={cn(
                  "absolute top-0 inset-x-0 z-10 px-4 py-2 text-center transition-opacity",
                  beforeScrolled ? "opacity-100" : "opacity-0",
                )}
              >
                <span className="text-style-caption text-muted">Огляд</span>
              </div>
              <div
                ref={beforeRef}
                onScroll={() =>
                  setBeforeScrolled((beforeRef.current?.scrollTop ?? 0) > 96)
                }
                className="flex-1 min-h-0 overflow-y-auto no-scrollbar"
              >
                <Hero />
                <ListRows />
              </div>
              <p className="text-style-caption text-muted text-center px-4 pb-2">
                Тотал зникає під час скролу
              </p>
            </div>
          </MiniPhone>
        }
        after={
          <MiniPhone>
            <div className="relative flex-1 min-h-0 flex flex-col">
              <div
                className={cn(
                  "absolute top-0 inset-x-0 z-10 px-4 py-2.5 flex items-center justify-between",
                  "bg-panelHi/95 backdrop-blur border-b border-line transition-all duration-300",
                  showBar
                    ? "translate-y-0 opacity-100"
                    : "-translate-y-full opacity-0",
                )}
              >
                <span className="text-style-caption text-muted">Витрачено</span>
                <span className="text-style-label tabular-nums text-text">
                  ₴ 12 480
                </span>
              </div>
              <div
                ref={afterRef}
                onScroll={() =>
                  setShowBar((afterRef.current?.scrollTop ?? 0) > 96)
                }
                className="flex-1 min-h-0 overflow-y-auto no-scrollbar"
              >
                <Hero />
                <ListRows />
              </div>
              <p className="text-style-caption text-muted text-center px-4 pb-2">
                Сума завжди під рукою
              </p>
            </div>
          </MiniPhone>
        }
      />
    </ProposalCard>
  );
}
