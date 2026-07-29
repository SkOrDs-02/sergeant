import { useRef, useState } from "react";
import { useReducedMotion } from "@shared/hooks";
import { ComparePair, MiniPhone } from "./_Compare";

/**
 * R2-V-8 — Depth-паралакс hero на скрол.
 *
 * Зараз: hero Хабу плаский — усі шари рухаються синхронно зі скролом.
 * Може бути: шари hero рухаються з різною швидкістю (useScrollParallax уже
 * існує в кодовій базі) → відчуття глибини. Вимкнено за reduced-motion.
 *
 * Прокрути кожну рамку — ліва рухається одним шаром, права з паралаксом.
 */
function HeroScroll({ parallax }: { parallax: boolean }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [y, setY] = useState(0);

  const active = parallax && !reduced;
  const back = active ? y * 0.35 : y * 0.08;
  const fore = active ? y * 0.08 : y * 0.08;

  return (
    <div
      ref={ref}
      onScroll={() => ref.current && setY(ref.current.scrollTop)}
      className="no-scrollbar h-full overflow-y-auto"
    >
      <div className="relative h-40 overflow-hidden bg-panel">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            transform: `translateY(${back * -1}px) scale(1.1)`,
            background:
              "radial-gradient(60% 60% at 50% 20%, rgb(var(--c-accent-rgb)/0.4), transparent 70%)",
          }}
        />
        <div
          className="absolute inset-x-0 bottom-3 px-4"
          style={{ transform: `translateY(${fore * -1}px)` }}
        >
          <p className="text-2xs uppercase tracking-wide text-muted">Баланс</p>
          <p className="text-2xl font-semibold text-text">₴ 12 480</p>
        </div>
      </div>
      <div className="space-y-2 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-12 rounded-xl bg-panel border border-line"
          />
        ))}
      </div>
    </div>
  );
}

export function ParallaxHeroDemo() {
  return (
    <ComparePair
      before={
        <MiniPhone dim>
          <HeroScroll parallax={false} />
        </MiniPhone>
      }
      after={
        <MiniPhone>
          <HeroScroll parallax />
        </MiniPhone>
      }
    />
  );
}
