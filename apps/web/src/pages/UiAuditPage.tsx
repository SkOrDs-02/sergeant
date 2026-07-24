/**
 * UI Audit Page — visual comparison of "Before" vs "After" for the 4 main
 * anti-slop improvements identified in the design review.
 *
 * Route: /ui-audit  (dev/internal only, not linked from the main nav)
 */

import { useState, useEffect } from "react";

/* ─── tiny helpers ─────────────────────────────────────────────────────── */

function Badge({
  label,
  variant,
}: {
  label: string;
  variant: "before" | "after" | "neutral";
}) {
  const styles = {
    before:
      "bg-red-50 text-red-700 border border-red-200 font-semibold text-xs px-2.5 py-0.5 rounded-full",
    after:
      "bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-xs px-2.5 py-0.5 rounded-full",
    neutral:
      "bg-[rgb(var(--c-panel-hi))] text-[rgb(var(--c-muted))] border border-[rgb(var(--c-line))] font-semibold text-xs px-2.5 py-0.5 rounded-full",
  };
  return <span className={styles[variant]}>{label}</span>;
}

function SectionHeader({
  number,
  title,
  subtitle,
}: {
  number: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-4 mb-8">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-base"
        style={{
          background: "rgb(var(--c-text))",
          color: "rgb(var(--c-bg))",
        }}
      >
        {number}
      </div>
      <div>
        <h2
          className="text-xl font-bold leading-tight mb-1"
          style={{ color: "rgb(var(--c-text))" }}
        >
          {title}
        </h2>
        <p className="text-sm" style={{ color: "rgb(var(--c-muted))" }}>
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function CompareCard({
  side,
  children,
}: {
  side: "before" | "after";
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex-1 rounded-2xl overflow-hidden"
      style={{
        background: "rgb(var(--c-panel))",
        border: `1.5px solid ${side === "before" ? "rgb(252 165 165)" : "rgb(167 243 208)"}`,
        boxShadow: "var(--shadow-e1)",
      }}
    >
      <div
        className="px-4 py-2.5 flex items-center gap-2 border-b"
        style={{
          background:
            side === "before" ? "rgb(254 242 242)" : "rgb(240 253 244)",
          borderColor:
            side === "before" ? "rgb(252 165 165)" : "rgb(167 243 208)",
        }}
      >
        <div
          className="w-2 h-2 rounded-full"
          style={{
            background: side === "before" ? "rgb(239 68 68)" : "rgb(34 197 94)",
          }}
        />
        <Badge label={side === "before" ? "До" : "Після"} variant={side} />
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

/* ─── Phone frame wrapper ──────────────────────────────────────────────── */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative mx-auto rounded-[2rem] overflow-hidden"
      style={{
        width: 220,
        height: 400,
        background: "rgb(var(--c-bg))",
        border: "2.5px solid rgb(var(--c-line))",
        boxShadow: "var(--shadow-e3)",
      }}
    >
      {/* notch */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-5 rounded-b-xl z-10"
        style={{ background: "rgb(var(--c-line))" }}
      />
      <div className="absolute inset-0 overflow-y-auto">{children}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 1 — AssistantFAB: нескінченний pulse
   ══════════════════════════════════════════════════════════════════════════ */

function FabBefore() {
  return (
    <PhoneFrame>
      <div className="w-full h-full relative p-3 pt-7">
        {/* fake content */}
        <div
          className="rounded-xl h-24 mb-2"
          style={{ background: "rgb(var(--c-panel))", boxShadow: "var(--shadow-e1)" }}
        />
        <div
          className="rounded-xl h-16 mb-2"
          style={{ background: "rgb(var(--c-panel))", boxShadow: "var(--shadow-e1)" }}
        />
        <div
          className="rounded-xl h-16"
          style={{ background: "rgb(var(--c-panel))", boxShadow: "var(--shadow-e1)" }}
        />
        {/* FAB */}
        <div className="absolute bottom-5 right-4">
          {/* eternal pulse ring 1 */}
          <div
            className="absolute inset-0 rounded-full animate-ping opacity-30"
            style={{ background: "rgb(16 185 129)", scale: "1.4" }}
          />
          {/* eternal pulse ring 2 */}
          <div
            className="absolute inset-0 rounded-full opacity-20"
            style={{
              background: "rgb(16 185 129)",
              animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite 0.5s",
            }}
          />
          <div
            className="relative w-12 h-12 rounded-full flex items-center justify-center"
            style={{
              background: "rgb(16 185 129)",
              boxShadow: "0 0 0 3px rgba(16,185,129,0.25), var(--shadow-e3)",
            }}
          >
            {/* Sparkles icon — the AI cliché */}
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="1.8"
            >
              <path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z" />
              <path d="M19 3L19.8 5.2L22 6L19.8 6.8L19 9L18.2 6.8L16 6L18.2 5.2L19 3Z" />
              <path d="M5 17L5.5 18.5L7 19L5.5 19.5L5 21L4.5 19.5L3 19L4.5 18.5L5 17Z" />
            </svg>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

function FabAfter() {
  const [popped, setPopped] = useState(false);

  useEffect(() => {
    // entrance only — one-shot after mount
    const t = setTimeout(() => setPopped(true), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <PhoneFrame>
      <div className="w-full h-full relative p-3 pt-7">
        <div
          className="rounded-xl h-24 mb-2"
          style={{ background: "rgb(var(--c-panel))", boxShadow: "var(--shadow-e1)" }}
        />
        <div
          className="rounded-xl h-16 mb-2"
          style={{ background: "rgb(var(--c-panel))", boxShadow: "var(--shadow-e1)" }}
        />
        <div
          className="rounded-xl h-16"
          style={{ background: "rgb(var(--c-panel))", boxShadow: "var(--shadow-e1)" }}
        />
        {/* FAB — entrance only, neutral icon */}
        <div
          className="absolute bottom-5 right-4 transition-all duration-500 ease-out"
          style={{
            transform: popped ? "scale(1)" : "scale(0.5)",
            opacity: popped ? 1 : 0,
          }}
        >
          <div
            className="relative w-12 h-12 rounded-full flex items-center justify-center"
            style={{
              background: "rgb(var(--c-text))",
              boxShadow: "var(--shadow-e3)",
            }}
          >
            {/* MessageCircle — neutral, not AI-branded */}
            <svg
              width="21"
              height="21"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgb(var(--c-bg))"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 2 — EmptyState: pulse ring за іконкою
   ══════════════════════════════════════════════════════════════════════════ */

function EmptyStateBefore() {
  return (
    <PhoneFrame>
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 pt-6">
        <div className="relative">
          {/* eternal pulse ring */}
          <div
            className="absolute inset-0 rounded-full animate-ping opacity-20"
            style={{
              background: "rgb(16 185 129)",
              transform: "scale(2.2)",
            }}
          />
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center relative z-10"
            style={{
              background: "rgba(16,185,129,0.12)",
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgb(16 185 129)"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
        </div>
        <p
          className="text-sm font-semibold text-center"
          style={{ color: "rgb(var(--c-text))" }}
        >
          Тут поки порожньо
        </p>
        <p
          className="text-xs text-center leading-relaxed"
          style={{ color: "rgb(var(--c-muted))" }}
        >
          Додайте першу транзакцію, щоб побачити аналіз
        </p>
        <button
          className="mt-1 px-4 py-2 rounded-xl text-sm font-semibold"
          style={{
            background: "rgb(16 185 129)",
            color: "white",
          }}
        >
          Додати
        </button>
      </div>
    </PhoneFrame>
  );
}

function EmptyStateAfter() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <PhoneFrame>
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 pt-6">
        <div
          className="transition-all duration-700 ease-out"
          style={{
            transform: visible ? "translateY(0) scale(1)" : "translateY(12px) scale(0.9)",
            opacity: visible ? 1 : 0,
          }}
        >
          {/* static icon — no eternal ring */}
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{
              background: "rgb(var(--c-panel-hi))",
              border: "1.5px solid rgb(var(--c-line))",
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgb(var(--c-muted))"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
        </div>
        <div
          className="transition-all duration-700 delay-100 ease-out"
          style={{
            transform: visible ? "translateY(0)" : "translateY(8px)",
            opacity: visible ? 1 : 0,
          }}
        >
          <p
            className="text-sm font-semibold text-center mb-1"
            style={{ color: "rgb(var(--c-text))" }}
          >
            Тут поки порожньо
          </p>
          <p
            className="text-xs text-center leading-relaxed"
            style={{ color: "rgb(var(--c-muted))" }}
          >
            Додайте першу транзакцію, щоб побачити аналіз
          </p>
        </div>
        <div
          className="transition-all duration-700 delay-200 ease-out"
          style={{
            transform: visible ? "translateY(0)" : "translateY(8px)",
            opacity: visible ? 1 : 0,
          }}
        >
          <button
            className="mt-1 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{
              background: "rgb(var(--c-text))",
              color: "rgb(var(--c-bg))",
            }}
          >
            Додати
          </button>
        </div>
      </div>
    </PhoneFrame>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 3 — StreakFlame: вічний loop проти entrance-only
   ══════════════════════════════════════════════════════════════════════════ */

function StreakFlameBefore() {
  return (
    <PhoneFrame>
      <div className="flex flex-col items-center justify-center h-full gap-3 pt-6 pb-4">
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "rgb(var(--c-muted))" }}
        >
          Стрік
        </p>
        {/* flame with eternal wobble + glow */}
        <div className="relative" style={{ animation: "wobble 2s ease-in-out infinite" }}>
          <style>{`
            @keyframes wobble { 0%,100%{transform:rotate(-4deg) scale(1)} 50%{transform:rotate(4deg) scale(1.05)} }
            @keyframes flameglow { 0%,100%{filter:drop-shadow(0 0 8px rgba(249,115,22,0.7))} 50%{filter:drop-shadow(0 0 18px rgba(239,68,68,0.9))} }
          `}</style>
          <div style={{ animation: "flameglow 1.5s ease-in-out infinite" }}>
            <svg width="72" height="72" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2C12 2 7 7 7 12C7 14.76 9.24 17 12 17C14.76 17 17 14.76 17 12C17 9.24 14 5 12 2Z"
                fill="url(#fg1)"
              />
              <path
                d="M12 8C12 8 9.5 11 9.5 13C9.5 14.38 10.62 15.5 12 15.5C13.38 15.5 14.5 14.38 14.5 13C14.5 11 12 8 12 8Z"
                fill="#fef3c7"
                opacity="0.85"
              />
              <defs>
                <linearGradient id="fg1" x1="12" y1="2" x2="12" y2="17" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#dc2626" />
                  <stop offset="0.5" stopColor="#ea580c" />
                  <stop offset="1" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          {/* eternal spark particles */}
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full"
              style={{
                background: i % 2 ? "#f59e0b" : "#ef4444",
                top: `${20 + i * 8}%`,
                left: `${i % 2 ? 10 : 75}%`,
                animation: `ping ${0.8 + i * 0.3}s cubic-bezier(0,0,0.2,1) infinite`,
                opacity: 0.7,
              }}
            />
          ))}
        </div>
        <div
          className="text-4xl font-black tabular-nums"
          style={{ color: "#ea580c", fontFamily: "var(--font-mono, monospace)" }}
        >
          14
        </div>
        <p className="text-xs" style={{ color: "rgb(var(--c-muted))" }}>
          днів поспіль
        </p>
        <div className="flex gap-1 mt-1">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map((d, i) => (
            <div
              key={d}
              className="flex flex-col items-center gap-0.5"
            >
              <div
                className="w-6 h-6 rounded-lg text-xs flex items-center justify-center font-bold"
                style={{
                  background: i < 5 ? "#ea580c" : "rgb(var(--c-panel-hi))",
                  color: i < 5 ? "white" : "rgb(var(--c-subtle))",
                  border: i === 4 ? "2px solid #ea580c" : "none",
                }}
              >
                {i < 5 ? "✓" : ""}
              </div>
              <span className="text-[9px]" style={{ color: "rgb(var(--c-subtle))" }}>
                {d}
              </span>
            </div>
          ))}
        </div>
      </div>
    </PhoneFrame>
  );
}

function StreakFlameAfter() {
  const [played, setPlayed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setPlayed(true), 150);
    return () => clearTimeout(t);
  }, []);

  return (
    <PhoneFrame>
      <div className="flex flex-col items-center justify-center h-full gap-3 pt-6 pb-4">
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "rgb(var(--c-muted))" }}
        >
          Стрік
        </p>
        {/* entrance-only scale-in, then static */}
        <div
          className="transition-all duration-600 ease-out"
          style={{
            transform: played ? "scale(1)" : "scale(0.4)",
            opacity: played ? 1 : 0,
          }}
        >
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2C12 2 7 7 7 12C7 14.76 9.24 17 12 17C14.76 17 17 14.76 17 12C17 9.24 14 5 12 2Z"
              fill="url(#fg2)"
            />
            <path
              d="M12 8C12 8 9.5 11 9.5 13C9.5 14.38 10.62 15.5 12 15.5C13.38 15.5 14.5 14.38 14.5 13C14.5 11 12 8 12 8Z"
              fill="#fef3c7"
              opacity="0.85"
            />
            <defs>
              <linearGradient id="fg2" x1="12" y1="2" x2="12" y2="17" gradientUnits="userSpaceOnUse">
                <stop stopColor="#dc2626" />
                <stop offset="0.5" stopColor="#ea580c" />
                <stop offset="1" stopColor="#f59e0b" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div
          className="text-4xl font-black tabular-nums transition-all duration-700 delay-200 ease-out"
          style={{
            color: "rgb(var(--c-text))",
            fontFamily: "var(--font-mono, monospace)",
            transform: played ? "translateY(0)" : "translateY(10px)",
            opacity: played ? 1 : 0,
          }}
        >
          14
        </div>
        <p className="text-xs" style={{ color: "rgb(var(--c-muted))" }}>
          днів поспіль
        </p>
        <div className="flex gap-1 mt-1">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map((d, i) => (
            <div key={d} className="flex flex-col items-center gap-0.5">
              <div
                className="w-6 h-6 rounded-lg text-xs flex items-center justify-center font-bold transition-all duration-500"
                style={{
                  background: i < 5 ? "rgb(var(--c-text))" : "rgb(var(--c-panel-hi))",
                  color: i < 5 ? "rgb(var(--c-bg))" : "rgb(var(--c-subtle))",
                  transitionDelay: `${i * 60}ms`,
                  transform: played ? "scale(1)" : "scale(0.6)",
                  opacity: played ? 1 : 0,
                }}
              >
                {i < 5 ? "✓" : ""}
              </div>
              <span className="text-[9px]" style={{ color: "rgb(var(--c-subtle))" }}>
                {d}
              </span>
            </div>
          ))}
        </div>
      </div>
    </PhoneFrame>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 4 — XP колір: фіолет vs brand hue
   ══════════════════════════════════════════════════════════════════════════ */

function XpBefore() {
  return (
    <PhoneFrame>
      <div className="p-4 pt-8 space-y-3">
        <p
          className="text-xs font-bold uppercase tracking-widest mb-3"
          style={{ color: "rgb(var(--c-muted))" }}
        >
          Прогрес тижня
        </p>
        {/* XP card with violet — breaks the 4-colour rule */}
        <div
          className="rounded-2xl p-4"
          style={{
            background: "rgb(var(--c-panel))",
            boxShadow: "var(--shadow-e1)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(139,92,246,0.12)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="rgb(139,92,246)">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold" style={{ color: "rgb(var(--c-text))" }}>
                  XP очки
                </p>
                <p className="text-[10px]" style={{ color: "rgb(var(--c-subtle))" }}>
                  Рівень 12
                </p>
              </div>
            </div>
            <span
              className="text-xl font-black tabular-nums"
              style={{ color: "rgb(139,92,246)" }}
            >
              2 450
            </span>
          </div>
          {/* violet progress bar */}
          <div
            className="w-full h-2 rounded-full overflow-hidden"
            style={{ background: "rgba(139,92,246,0.15)" }}
          >
            <div
              className="h-full rounded-full"
              style={{ width: "68%", background: "rgb(139,92,246)" }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px]" style={{ color: "rgb(var(--c-subtle))" }}>
              2 450 / 3 600 XP
            </span>
            <span
              className="text-[9px] font-bold"
              style={{ color: "rgb(139,92,246)" }}
            >
              68%
            </span>
          </div>
        </div>
        {/* palette swatch */}
        <div
          className="rounded-xl p-3"
          style={{
            background: "rgb(var(--c-panel-hi))",
            border: "1px solid rgb(var(--c-line))",
          }}
        >
          <p className="text-[9px] font-bold mb-2" style={{ color: "rgb(var(--c-subtle))" }}>
            ACTIVE PALETTE
          </p>
          <div className="flex gap-1.5">
            {[
              { hex: "#f2ecdf", label: "bg" },
              { hex: "#0f1713", label: "text" },
              { hex: "#10b981", label: "primary" },
              { hex: "#8b5cf6", label: "xp !" },
            ].map((c) => (
              <div key={c.hex} className="flex flex-col items-center gap-0.5">
                <div
                  className="w-8 h-8 rounded-lg border"
                  style={{
                    background: c.hex,
                    borderColor: c.label === "xp !" ? "rgb(239,68,68)" : "rgb(var(--c-line))",
                    borderWidth: c.label === "xp !" ? 2 : 1,
                  }}
                />
                <span
                  className="text-[8px] font-bold"
                  style={{
                    color: c.label === "xp !" ? "rgb(239,68,68)" : "rgb(var(--c-subtle))",
                  }}
                >
                  {c.label}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[8px] mt-2" style={{ color: "rgb(239,68,68)" }}>
            5-й колір! Порушує правило 3-4
          </p>
        </div>
      </div>
    </PhoneFrame>
  );
}

function XpAfter() {
  return (
    <PhoneFrame>
      <div className="p-4 pt-8 space-y-3">
        <p
          className="text-xs font-bold uppercase tracking-widest mb-3"
          style={{ color: "rgb(var(--c-muted))" }}
        >
          Прогрес тижня
        </p>
        {/* XP card — uses brand ink instead of violet */}
        <div
          className="rounded-2xl p-4"
          style={{
            background: "rgb(var(--c-panel))",
            boxShadow: "var(--shadow-e1)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: "rgb(var(--c-panel-hi))" }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgb(var(--c-text))"
                  strokeWidth="1.8"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold" style={{ color: "rgb(var(--c-text))" }}>
                  XP очки
                </p>
                <p className="text-[10px]" style={{ color: "rgb(var(--c-subtle))" }}>
                  Рівень 12
                </p>
              </div>
            </div>
            <span
              className="text-xl font-black tabular-nums"
              style={{
                color: "rgb(var(--c-text))",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              2 450
            </span>
          </div>
          {/* ink progress bar — on-brand */}
          <div
            className="w-full h-2 rounded-full overflow-hidden"
            style={{ background: "rgb(var(--c-line))" }}
          >
            <div
              className="h-full rounded-full"
              style={{ width: "68%", background: "rgb(var(--c-text))" }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px]" style={{ color: "rgb(var(--c-subtle))" }}>
              2 450 / 3 600 XP
            </span>
            <span
              className="text-[9px] font-bold"
              style={{ color: "rgb(var(--c-text))" }}
            >
              68%
            </span>
          </div>
        </div>
        {/* palette swatch — 4 colours, no rogue violet */}
        <div
          className="rounded-xl p-3"
          style={{
            background: "rgb(var(--c-panel-hi))",
            border: "1px solid rgb(var(--c-line))",
          }}
        >
          <p className="text-[9px] font-bold mb-2" style={{ color: "rgb(var(--c-subtle))" }}>
            ACTIVE PALETTE
          </p>
          <div className="flex gap-1.5">
            {[
              { hex: "#f2ecdf", label: "bg" },
              { hex: "#0f1713", label: "ink" },
              { hex: "#10b981", label: "accent" },
              { hex: "#ebe4da", label: "line" },
            ].map((c) => (
              <div key={c.hex} className="flex flex-col items-center gap-0.5">
                <div
                  className="w-8 h-8 rounded-lg border"
                  style={{
                    background: c.hex,
                    borderColor: "rgb(var(--c-line))",
                  }}
                />
                <span className="text-[8px]" style={{ color: "rgb(var(--c-subtle))" }}>
                  {c.label}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[8px] mt-2" style={{ color: "rgb(34,197,94)" }}>
            4 кольори — в рамках правила
          </p>
        </div>
      </div>
    </PhoneFrame>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════════════════════ */

const SECTIONS = ["Всі", "Motion", "Іконки", "Колір"] as const;
type Section = (typeof SECTIONS)[number];

export function UiAuditPage() {
  const [activeSection, setActiveSection] = useState<Section>("Всі");

  const show = (s: Section) => activeSection === "Всі" || activeSection === s;

  return (
    <div
      className="min-h-screen"
      style={{ background: "rgb(var(--c-bg))", fontFamily: "var(--font-sans, sans-serif)" }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-20 border-b"
        style={{
          background: "rgba(var(--c-bg) / 0.92)",
          backdropFilter: "blur(12px)",
          borderColor: "rgb(var(--c-line))",
        }}
      >
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p
                className="text-xs font-bold uppercase tracking-widest mb-0.5"
                style={{ color: "rgb(var(--c-muted))" }}
              >
                Sergeant — UI Audit
              </p>
              <h1
                className="text-2xl font-black leading-tight"
                style={{ color: "rgb(var(--c-text))" }}
              >
                Anti-slop: До / Після
              </h1>
            </div>
            {/* filter tabs */}
            <div
              className="flex gap-1 p-1 rounded-xl"
              style={{ background: "rgb(var(--c-panel))", boxShadow: "var(--shadow-e1)" }}
            >
              {SECTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setActiveSection(s)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
                  style={{
                    background:
                      activeSection === s ? "rgb(var(--c-text))" : "transparent",
                    color:
                      activeSection === s
                        ? "rgb(var(--c-bg))"
                        : "rgb(var(--c-muted))",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-20">

        {/* ── 1. FAB pulse ──────────────────────────────────────────── */}
        {show("Motion") && (
          <section>
            <SectionHeader
              number="1"
              title="AssistantFAB: нескінченний pulse"
              subtitle="Вічний ping-ring + Sparkles-іконка = найсильніший AI-tell"
            />
            <div className="flex gap-6 flex-wrap">
              <CompareCard side="before">
                <div className="flex flex-col items-center gap-4">
                  <FabBefore />
                  <div className="w-full space-y-2">
                    <div
                      className="text-xs rounded-lg px-3 py-2 font-mono leading-relaxed"
                      style={{
                        background: "rgb(254 242 242)",
                        border: "1px solid rgb(252 165 165)",
                        color: "rgb(185 28 28)",
                      }}
                    >
                      {"// 2 вічних цикли"}<br />
                      {"animate-ping → opacity-30"}<br />
                      {"animation: ping 1.5s infinite"}<br />
                      {"// + Sparkles icon"}
                    </div>
                    <p className="text-xs" style={{ color: "rgb(var(--c-muted))" }}>
                      Пульсує постійно, навіть коли нічого не відбувається. Розряджає батарею. Виглядає як демо-апка з v0.
                    </p>
                  </div>
                </div>
              </CompareCard>

              <CompareCard side="after">
                <div className="flex flex-col items-center gap-4">
                  <FabAfter />
                  <div className="w-full space-y-2">
                    <div
                      className="text-xs rounded-lg px-3 py-2 font-mono leading-relaxed"
                      style={{
                        background: "rgb(240 253 244)",
                        border: "1px solid rgb(167 243 208)",
                        color: "rgb(21 128 61)",
                      }}
                    >
                      {"// одноразовий entrance"}<br />
                      {"transition: scale + opacity"}<br />
                      {"duration: 500ms, ease-out"}<br />
                      {"// MessageCircle icon"}
                    </div>
                    <p className="text-xs" style={{ color: "rgb(var(--c-muted))" }}>
                      З&apos;являється один раз при завантаженні. Нейтральна іконка без AI-брендингу. Статичний стан — тиша.
                    </p>
                  </div>
                </div>
              </CompareCard>
            </div>
          </section>
        )}

        {/* ── 2. EmptyState pulse ring ────────────────────────────── */}
        {show("Motion") && (
          <section>
            <SectionHeader
              number="2"
              title="EmptyState: pulse-ring за іконкою"
              subtitle="Вічне кільце за статичним станом сигналізує «дивись сюди» без причини"
            />
            <div className="flex gap-6 flex-wrap">
              <CompareCard side="before">
                <div className="flex flex-col items-center gap-4">
                  <EmptyStateBefore />
                  <div className="w-full space-y-2">
                    <div
                      className="text-xs rounded-lg px-3 py-2 font-mono leading-relaxed"
                      style={{
                        background: "rgb(254 242 242)",
                        border: "1px solid rgb(252 165 165)",
                        color: "rgb(185 28 28)",
                      }}
                    >
                      {"animate-ping scale(2.2)"}<br />
                      {"opacity-20, infinite"}<br />
                      {"bg-emerald-500 — вічно"}
                    </div>
                    <p className="text-xs" style={{ color: "rgb(var(--c-muted))" }}>
                      Постійно мигає навколо іконки. На порожньому стані це виглядає тривожно, а не запрошуюче.
                    </p>
                  </div>
                </div>
              </CompareCard>

              <CompareCard side="after">
                <div className="flex flex-col items-center gap-4">
                  <EmptyStateAfter />
                  <div className="w-full space-y-2">
                    <div
                      className="text-xs rounded-lg px-3 py-2 font-mono leading-relaxed"
                      style={{
                        background: "rgb(240 253 244)",
                        border: "1px solid rgb(167 243 208)",
                        color: "rgb(21 128 61)",
                      }}
                    >
                      {"// entrance stagger"}<br />
                      {"icon → text → button"}<br />
                      {"translateY + opacity"}<br />
                      {"delay: 0 / 100 / 200ms"}
                    </div>
                    <p className="text-xs" style={{ color: "rgb(var(--c-muted))" }}>
                      Елементи з&apos;являються каскадом один раз. Спокійна, нейтральна статика в idle-стані.
                    </p>
                  </div>
                </div>
              </CompareCard>
            </div>
          </section>
        )}

        {/* ── 3. StreakFlame wobble ────────────────────────────────── */}
        {show("Motion") && (
          <section>
            <SectionHeader
              number="3"
              title="StreakFlame: wobble + glow + частинки в циклі"
              subtitle="Тричленний нескінченний loop — батарея, увага, дешевизна"
            />
            <div className="flex gap-6 flex-wrap">
              <CompareCard side="before">
                <div className="flex flex-col items-center gap-4">
                  <StreakFlameBefore />
                  <div className="w-full space-y-2">
                    <div
                      className="text-xs rounded-lg px-3 py-2 font-mono leading-relaxed"
                      style={{
                        background: "rgb(254 242 242)",
                        border: "1px solid rgb(252 165 165)",
                        color: "rgb(185 28 28)",
                      }}
                    >
                      {"wobble: rotate ±4deg ∞"}<br />
                      {"flameglow: drop-shadow ∞"}<br />
                      {"4× spark ping ∞"}<br />
                      {"hardcode: #dc2626 #ea580c"}
                    </div>
                    <p className="text-xs" style={{ color: "rgb(var(--c-muted))" }}>
                      Полум&apos;я хитається вічно. 4 частинки постійно пінгують. Хардкодовані помаранчеві кольори поза токенами.
                    </p>
                  </div>
                </div>
              </CompareCard>

              <CompareCard side="after">
                <div className="flex flex-col items-center gap-4">
                  <StreakFlameAfter />
                  <div className="w-full space-y-2">
                    <div
                      className="text-xs rounded-lg px-3 py-2 font-mono leading-relaxed"
                      style={{
                        background: "rgb(240 253 244)",
                        border: "1px solid rgb(167 243 208)",
                        color: "rgb(21 128 61)",
                      }}
                    >
                      {"// scale entrance, one-shot"}<br />
                      {"flame: scale(0.4→1) 600ms"}<br />
                      {"dots: stagger 60ms each"}<br />
                      {"idle: static, no loop"}
                    </div>
                    <p className="text-xs" style={{ color: "rgb(var(--c-muted))" }}>
                      Полум&apos;я та дні тижня з&apos;являються один раз при відкритті екрану. В idle — статика, нуль CPU/GPU.
                    </p>
                  </div>
                </div>
              </CompareCard>
            </div>
          </section>
        )}

        {/* ── 4. XP colour ───────────────────────────────────────────── */}
        {show("Колір") && (
          <section>
            <SectionHeader
              number="4"
              title="XP-колір: фіолет поза системою"
              subtitle="--c-xp: violet порушує власне правило «no violet» і додає 5-й колір"
            />
            <div className="flex gap-6 flex-wrap">
              <CompareCard side="before">
                <div className="flex flex-col items-center gap-4">
                  <XpBefore />
                  <div className="w-full space-y-2">
                    <div
                      className="text-xs rounded-lg px-3 py-2 font-mono leading-relaxed"
                      style={{
                        background: "rgb(254 242 242)",
                        border: "1px solid rgb(252 165 165)",
                        color: "rgb(185 28 28)",
                      }}
                    >
                      {"--c-xp: #8b5cf6 (violet-500)"}<br />
                      {"5-й колір у 4-колірній системі"}<br />
                      {"порушує Hard Rule #9"}
                    </div>
                    <p className="text-xs" style={{ color: "rgb(var(--c-muted))" }}>
                      Фіолет не має жодного зв&apos;язку з теплою cream-палітрою. Виглядає як Duolingo-копія.
                    </p>
                  </div>
                </div>
              </CompareCard>

              <CompareCard side="after">
                <div className="flex flex-col items-center gap-4">
                  <XpAfter />
                  <div className="w-full space-y-2">
                    <div
                      className="text-xs rounded-lg px-3 py-2 font-mono leading-relaxed"
                      style={{
                        background: "rgb(240 253 244)",
                        border: "1px solid rgb(167 243 208)",
                        color: "rgb(21 128 61)",
                      }}
                    >
                      {"--c-xp → var(--c-text)"}<br />
                      {"прогрес-бар: ink on line-bg"}<br />
                      {"4 кольори, система intact"}
                    </div>
                    <p className="text-xs" style={{ color: "rgb(var(--c-muted))" }}>
                      XP використовує ink-колір системи. Виглядає впевнено і авторськи — без запозиченого фіолету.
                    </p>
                  </div>
                </div>
              </CompareCard>
            </div>
          </section>
        )}

        {/* Summary table */}
        {activeSection === "Всі" && (
          <section>
            <SectionHeader
              number="✓"
              title="Що не чіпати"
              subtitle="Сильні сторони, які дають проєкту рівень зрілого продукту"
            />
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                border: "1.5px solid rgb(var(--c-line))",
                boxShadow: "var(--shadow-e1)",
              }}
            >
              {[
                ["Дизайн-токени", "Elevation e0–e5, WCAG-AA компаньйони, семантичні шари — взірцево"],
                ["Тепла cream-палітра", "Унікальна #f2ecdf база з ink-підтоном — авторський характер"],
                ["Типографіка", "Manrope + JetBrains Mono, чітка шкала, tabular-nums"],
                ["Доступність", "44px тач-таргети, ARIA-ролі, reduceMotion, screen reader support"],
                ["Dark «Ink» тема", "Симетрична до light, інвертована по семантиці, не просто інверсія"],
                ["Українська локалізація", "Плюралізація, живий копірайтинг, без емодзі-сміття"],
              ].map(([name, desc], i) => (
                <div
                  key={name}
                  className="flex items-start gap-4 px-5 py-4"
                  style={{
                    background: i % 2 ? "rgb(var(--c-panel))" : "rgb(var(--c-panel-hi))",
                    borderBottom:
                      i < 5 ? "1px solid rgb(var(--c-line))" : "none",
                  }}
                >
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "rgb(var(--c-text))" }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2 2 4-4" stroke="rgb(var(--c-bg))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "rgb(var(--c-text))" }}>
                      {name}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "rgb(var(--c-muted))" }}>
                      {desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="h-10" />
      </div>
    </div>
  );
}
