import { useState } from "react";
import { PhoneFrame } from "./_PhoneFrame";

// Tiny inline SVG turbulence → data URI. Cheap, static, no runtime cost.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/**
 * R2-V-19 — Тонкий grain/noise-overlay на cream-поверхнях.
 * Додає «паперову» теплоту без градієнтів (у межах правил дизайну).
 * Дуже низька непрозорість — має відчуватись, а не читатись.
 */
export function GrainOverlayDemo() {
  const [on, setOn] = useState(true);

  return (
    <div className="flex flex-col gap-3">
      <PhoneFrame label={on ? "Grain увімкнено" : "Пласка поверхня"}>
        <div className="relative h-full p-4">
          {on && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 mix-blend-multiply"
              style={{ backgroundImage: GRAIN, opacity: 0.05 }}
            />
          )}
          <div className="relative space-y-3">
            <div className="rounded-2xl bg-elevated p-4">
              <p className="text-2xs uppercase tracking-wide text-muted">Картка</p>
              <p className="text-lg font-semibold text-strong">Паперова текстура</p>
            </div>
            <div className="h-20 rounded-2xl bg-accent/15" />
          </div>
        </div>
      </PhoneFrame>

      <button
        type="button"
        onClick={() => setOn((v) => !v)}
        className="rounded-full bg-elevated px-4 py-2 text-xs font-medium text-strong"
      >
        {on ? "Прибрати grain" : "Показати grain"}
      </button>
      <p className="text-2xs leading-relaxed text-muted">
        Один статичний SVG-шум на 5% через multiply. Не деградує на dark-темі й не б’є по продуктивності.
      </p>
    </div>
  );
}
