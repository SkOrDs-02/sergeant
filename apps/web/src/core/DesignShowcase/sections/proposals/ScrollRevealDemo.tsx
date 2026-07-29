import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../../../shared/hooks/useReducedMotion";
import { ComparePair, MiniPhone } from "./_Compare";

function RevealRow({
  index,
  reduced,
  animate,
}: {
  index: number;
  reduced: boolean;
  animate: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const isShown = reduced || !animate || shown;

  useEffect(() => {
    if (reduced || !animate) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setShown(true);
      },
      { threshold: 0.5, root: el.closest("[data-scrollroot]") },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced, animate]);

  return (
    <div
      ref={ref}
      className="rounded-xl bg-panel p-3"
      style={
        animate
          ? {
              opacity: isShown ? 1 : 0,
              transform: isShown ? "none" : "translateY(16px) scale(0.98)",
              transition:
                "opacity 500ms ease, transform 500ms cubic-bezier(0.22,1,0.36,1)",
              transitionDelay: `${(index % 3) * 60}ms`,
            }
          : undefined
      }
    >
      <div className="mb-2 h-3 w-1/2 rounded-full bg-muted/25" />
      <div className="h-6 w-2/3 rounded-full bg-accent/20" />
    </div>
  );
}

function ScrollList({
  animate,
  reduced,
}: {
  animate: boolean;
  reduced: boolean;
}) {
  return (
    <div
      data-scrollroot
      className="no-scrollbar h-full space-y-3 overflow-y-auto p-4"
    >
      <div className="pt-1 pb-1 text-style-caption uppercase tracking-wide text-muted">
        Активність
      </div>
      {Array.from({ length: 9 }).map((_, i) => (
        <RevealRow key={i} index={i} reduced={reduced} animate={animate} />
      ))}
    </div>
  );
}

/**
 * R2-V-17 — Scroll-driven reveal карток.
 * Ліворуч: картки просто є (як зараз). Праворуч: staggered fade-in при вході у viewport.
 * За reduced-motion усе видно одразу без анімації.
 */
export function ScrollRevealDemo() {
  const reduced = useReducedMotion();

  return (
    <ComparePair
      before={
        <MiniPhone dim>
          <ScrollList animate={false} reduced={reduced} />
        </MiniPhone>
      }
      after={
        <MiniPhone>
          <ScrollList animate reduced={reduced} />
        </MiniPhone>
      }
    />
  );
}
