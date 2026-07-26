import { ComparePair, CompareTile } from "./_Compare";

/**
 * V-10 — Graduated macro rings.
 *
 * Nutrition today renders macros as three horizontal fill bars
 * (`DailyPlanMacros`, `width: %`). The proposal shows them as concentric
 * progress rings — a denser, more glanceable "at a glance" summary that reuses
 * the existing chart tokens (kcal / protein / fat / carbs).
 *
 * Mock only — static sample values.
 */

const MACROS = [
  { key: "kcal", label: "Ккал", pct: 0.72, token: "--c-chart-nutrition" },
  { key: "protein", label: "Білки", pct: 0.55, token: "--c-chart-finyk" },
  { key: "fat", label: "Жири", pct: 0.4, token: "--c-chart-routine" },
  { key: "carbs", label: "Вугл", pct: 0.83, token: "--c-chart-fizruk" },
] as const;

export function MacroRingDemo() {
  return (
    <ComparePair
      before={
        <CompareTile dim className="items-stretch">
          <div className="w-full flex flex-col gap-3">
            {MACROS.map((m) => (
              <div key={m.key} className="flex flex-col gap-1">
                <div className="flex justify-between text-2xs text-muted">
                  <span>{m.label}</span>
                  <span className="tabular-nums">
                    {Math.round(m.pct * 100)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${m.pct * 100}%`,
                      backgroundColor: `rgb(var(${m.token}))`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-2xs text-muted">Три-чотири смуги — вертикально</p>
        </CompareTile>
      }
      after={
        <CompareTile>
          <div className="relative h-32 w-32">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
              {MACROS.map((m, i) => {
                const r = 52 - i * 13;
                const c = 2 * Math.PI * r;
                return (
                  <g key={m.key}>
                    <circle
                      cx="60"
                      cy="60"
                      r={r}
                      fill="none"
                      strokeWidth="8"
                      className="stroke-surface-muted"
                    />
                    <circle
                      cx="60"
                      cy="60"
                      r={r}
                      fill="none"
                      strokeWidth="8"
                      strokeLinecap="round"
                      stroke={`rgb(var(${m.token}))`}
                      strokeDasharray={c}
                      strokeDashoffset={c * (1 - m.pct)}
                      className="transition-[stroke-dashoffset] duration-700"
                    />
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
            {MACROS.map((m) => (
              <span
                key={m.key}
                className="inline-flex items-center gap-1 text-2xs text-muted"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: `rgb(var(${m.token}))` }}
                />
                {m.label}
              </span>
            ))}
          </div>
        </CompareTile>
      }
    />
  );
}
