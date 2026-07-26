import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../../../shared/hooks/useReducedMotion";
import { PhoneFrame } from "./_PhoneFrame";

function RevealRow({ index, reduced }: { index: number; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(reduced);

  useEffect(() => {
    if (reduced) {
      setShown(true);
      return;
    }
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
  }, [reduced]);

  return (
    <div
      ref={ref}
      className="rounded-xl bg-elevated p-3"
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(16px) scale(0.98)",
        transition: "opacity 500ms ease, transform 500ms cubic-bezier(0.22,1,0.36,1)",
        transitionDelay: `${(index % 3) * 60}ms`,
      }}
    >
      <div className="mb-2 h-3 w-1/2 rounded-full bg-muted/25" />
      <div className="h-6 w-2/3 rounded-full bg-accent/20" />
    </div>
  );
}

/**
 * R2-V-17 — Scroll-driven reveal карток.
 * Картки мʼяко зʼявляються при вході у viewport (аналог animation-timeline: view()).
 * За reduced-motion усе видно одразу без анімації.
 */
export function ScrollRevealDemo() {
  const reduced = useReducedMotion();

  return (
    <div className="flex flex-col gap-3">
      <PhoneFrame label="Скрол ↓, картки зʼявляються">
        <div data-scrollroot className="no-scrollbar h-full space-y-3 overflow-y-auto p-4">
          <div className="pt-2 pb-1 text-2xs uppercase tracking-wide text-muted">Активність</div>
          {Array.from({ length: 9 }).map((_, i) => (
            <RevealRow key={i} index={i} reduced={reduced} />
          ))}
        </div>
      </PhoneFrame>
      <p className="text-2xs leading-relaxed text-muted">
        Staggered fade-in по 3 у ряд. Тільки при першій появі — повторний скрол нічого не смикає.
      </p>
    </div>
  );
}
