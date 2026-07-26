import { useRef, useState } from "react";
import { useReducedMotion } from "../../../../shared/hooks/useReducedMotion";
import { PhoneFrame } from "./_PhoneFrame";

/**
 * R2-V-8 — Depth-паралакс hero на скрол.
 * Хук useScrollParallax уже існує, але не застосований у hero Хабу.
 * Тут показуємо, як шари hero рухаються з різною швидкістю при скролі
 * (вимкнено за reduced-motion — усе рухається синхронно).
 */
export function ParallaxHeroDemo() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [y, setY] = useState(0);

  const onScroll = () => {
    if (ref.current) setY(ref.current.scrollTop);
  };

  const back = reduced ? 0 : y * 0.35;
  const fore = reduced ? 0 : y * 0.08;

  return (
    <div className="flex flex-col gap-3">
      <PhoneFrame label="Скрол ↓ у рамці">
        <div ref={ref} onScroll={onScroll} className="no-scrollbar h-full overflow-y-auto">
          <div className="relative h-40 overflow-hidden bg-elevated">
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
              <p className="text-2xl font-semibold text-strong">₴ 12 480</p>
            </div>
          </div>
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-elevated" />
            ))}
          </div>
        </div>
      </PhoneFrame>
      <p className="text-2xs leading-relaxed text-muted">
        Фон рухається швидше за передній план → відчуття глибини. Різниця швидкостей мінімальна, без «плавання» контенту.
      </p>
    </div>
  );
}
