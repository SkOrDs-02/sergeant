import { useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui";
import { ProposalCard } from "./_PhoneFrame";
import { ComparePair, MiniPhone } from "./_Compare";

/**
 * R2-UI-1 — Scroll-snap KPI carousel on the Hub.
 *
 * Зараз: the Hub top strip shows a single hero total — other key numbers
 * (streak / calories / load) live further down or on other screens.
 * Може бути: a horizontally swipeable, scroll-snapped set of KPI cards so
 * the most-glanced numbers sit one thumb-flick apart. Dots reflect the
 * active card.
 *
 * Mock only — swipe the right strip (or tap a dot) to move between KPIs.
 */

const KPIS = [
  {
    id: "spend",
    label: "Витрати сьогодні",
    value: "₴ 640",
    icon: "credit-card",
    token: "--c-chart-finyk",
    hint: "−12% до вчора",
  },
  {
    id: "streak",
    label: "Серія рутин",
    value: "14 днів",
    icon: "check-circle",
    token: "--c-chart-routine",
    hint: "особистий рекорд",
  },
  {
    id: "kcal",
    label: "Калорії",
    value: "1 820",
    icon: "pie-chart",
    token: "--c-chart-nutrition",
    hint: "з 2 100 ккал",
  },
  {
    id: "load",
    label: "Обʼєм тренувань",
    value: "4.2 т",
    icon: "trending-up",
    token: "--c-chart-fizruk",
    hint: "+8% за тиждень",
  },
] as const;

export function KpiCarouselDemo() {
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  function onScroll() {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== active) setActive(i);
  }

  function goTo(i: number) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  const finyk = "rgb(var(--c-chart-finyk))";

  return (
    <ProposalCard
      id="R2-UI-1"
      title="KPI-карусель на Хабі (scroll-snap)"
      intent="Замість однієї цифри — свайпабельна стрічка ключових метрик зі snap-центруванням. Свайпни стрічку праворуч або тапни крапку."
    >
      <ComparePair
        before={
          <MiniPhone dim>
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="px-4 pt-1 pb-2">
                <span className="text-style-label text-text">Огляд</span>
              </div>
              <div className="px-4">
                <div
                  className="rounded-3xl border p-4 flex flex-col gap-3"
                  style={{
                    borderColor: finyk,
                    backgroundColor: `color-mix(in srgb, ${finyk} 8%, transparent)`,
                  }}
                >
                  <span
                    className="h-9 w-9 rounded-xl flex items-center justify-center"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${finyk} 18%, transparent)`,
                      color: finyk,
                    }}
                  >
                    <Icon name="credit-card" size={18} />
                  </span>
                  <div>
                    <p className="text-style-caption text-muted">
                      Витрати сьогодні
                    </p>
                    <p className="text-2xl font-semibold tabular-nums text-text mt-0.5">
                      ₴ 640
                    </p>
                    <p className="text-2xs mt-1" style={{ color: finyk }}>
                      −12% до вчора
                    </p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="h-10 rounded-xl bg-panel border border-line" />
                  <div className="h-10 rounded-xl bg-panel border border-line" />
                </div>
              </div>
              <p className="text-2xs text-muted text-center px-4 pb-2 pt-4">
                Лише одна метрика зверху
              </p>
            </div>
          </MiniPhone>
        }
        after={
          <MiniPhone>
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="px-4 pt-1 pb-2 flex items-center justify-between">
                <span className="text-style-label text-text">Огляд</span>
                <span className="text-2xs text-muted">свайп →</span>
              </div>

              <div
                ref={trackRef}
                onScroll={onScroll}
                className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
              >
                {KPIS.map((k) => {
                  const color = `rgb(var(${k.token}))`;
                  return (
                    <div
                      key={k.id}
                      className="snap-center shrink-0 w-full px-4"
                    >
                      <div
                        className="rounded-3xl border p-4 flex flex-col gap-3"
                        style={{
                          borderColor: color,
                          backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)`,
                        }}
                      >
                        <span
                          className="h-9 w-9 rounded-xl flex items-center justify-center"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
                            color,
                          }}
                        >
                          <Icon name={k.icon} size={18} />
                        </span>
                        <div>
                          <p className="text-style-caption text-muted">
                            {k.label}
                          </p>
                          <p className="text-2xl font-semibold tabular-nums text-text mt-0.5">
                            {k.value}
                          </p>
                          <p className="text-2xs mt-1" style={{ color }}>
                            {k.hint}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-center gap-1.5 pt-3">
                {KPIS.map((k, i) => (
                  <button
                    key={k.id}
                    type="button"
                    aria-label={k.label}
                    onClick={() => goTo(i)}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === active ? "w-5 bg-accent" : "w-1.5 bg-line",
                    )}
                  />
                ))}
              </div>
              <p className="text-2xs text-muted text-center px-4 pb-2 pt-3">
                4 метрики — один флик пальцем
              </p>
            </div>
          </MiniPhone>
        }
      />
    </ProposalCard>
  );
}
