/* eslint-disable sergeant-design/no-cyrillic-jsx-literal -- Developer-only comparison mockups keep review copy beside each visual variant. */
import { useState, type ReactNode } from "react";

const NAV = [
  { label: "Дім", d: "M3 11l9-8 9 8M5 10v10h14V10" },
  { label: "Гроші", d: "M3 6h18v12H3zM3 10h18" },
  { label: "Спорт", d: "M6 12h12M8 8v8M16 8v8" },
  { label: "Профіль", d: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0" },
] as const;

const ACCENT = "rgb(var(--c-finyk-accent))";
const EASE = "cubic-bezier(0.22,1,0.36,1)";

function NavIcon({ d, color }: { d: string; color: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

function NavShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative mx-auto w-full max-w-[260px] overflow-hidden rounded-2xl border shadow-lg"
      style={{
        height: 260,
        background: "rgb(var(--c-bg))",
        borderColor: "rgb(var(--c-line))",
      }}
    >
      <div className="absolute top-0 inset-x-0 h-5 flex items-center justify-center z-10">
        <div
          className="w-14 h-1.5 rounded-full"
          style={{ background: "rgb(var(--c-line))" }}
        />
      </div>
      <div className="absolute inset-0 overflow-hidden">
        <div className="flex items-center justify-center h-full">
          <p className="text-xs" style={{ color: "rgb(var(--c-subtle))" }}>
            Тапни вкладку ↓
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

export function NavNowGlow() {
  const [active, setActive] = useState(0);
  return (
    <NavShell>
      <div
        className="absolute bottom-0 inset-x-0 h-14 flex items-center justify-around"
        style={{
          background: "rgb(var(--c-panel))",
          borderTop: "1px solid rgb(var(--c-line))",
        }}
      >
        {NAV.map((item, index) => {
          const selected = index === active;
          return (
            <button
              key={item.label}
              type="button"
              aria-label={item.label}
              aria-pressed={selected}
              onClick={() => setActive(index)}
              className="flex flex-col items-center gap-0.5 rounded-xl px-2 py-1"
              style={{
                boxShadow: selected
                  ? `0 0 12px 2px rgb(var(--c-finyk-accent) / 0.5)`
                  : "none",
              }}
            >
              <NavIcon
                d={item.d}
                color={selected ? ACCENT : "rgb(var(--c-muted))"}
              />
              <span
                className="text-xs"
                style={{ color: selected ? ACCENT : "rgb(var(--c-muted))" }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </NavShell>
  );
}

export function NavVarIconPill() {
  const [active, setActive] = useState(0);
  return (
    <NavShell>
      <div
        className="absolute bottom-0 inset-x-0 h-14 flex items-center justify-around px-1"
        style={{
          background: "rgb(var(--c-panel))",
          borderTop: "1px solid rgb(var(--c-line))",
        }}
      >
        {NAV.map((item, index) => {
          const selected = index === active;
          return (
            <button
              key={item.label}
              type="button"
              aria-label={item.label}
              aria-pressed={selected}
              onClick={() => setActive(index)}
              className="flex items-center rounded-full overflow-hidden"
              style={{
                gap: selected ? 6 : 0,
                paddingLeft: selected ? 10 : 8,
                paddingRight: selected ? 12 : 8,
                paddingTop: 6,
                paddingBottom: 6,
                background: selected
                  ? "rgb(var(--c-finyk-accent) / 0.16)"
                  : "transparent",
                transition: `background 260ms ${EASE}, gap 260ms ${EASE}, padding 260ms ${EASE}`,
              }}
            >
              <NavIcon
                d={item.d}
                color={selected ? ACCENT : "rgb(var(--c-muted))"}
              />
              <span
                className="text-xs font-semibold whitespace-nowrap"
                style={{
                  color: ACCENT,
                  maxWidth: selected ? 60 : 0,
                  opacity: selected ? 1 : 0,
                  transition: `max-width 260ms ${EASE}, opacity 200ms ${EASE}`,
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </NavShell>
  );
}
