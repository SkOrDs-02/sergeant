/**
 * UI Mockups Page — раунд 2: галереї варіантів для двох пунктів, які користувач
 * попросив пропрацювати далі (мобільний PWA).
 *
 *   #13 — роздільники списку транзакцій (волосяні лінії відхилено як «голий вигляд»)
 *   #20 — морфний індикатор активної вкладки bottom-nav (ідея схвалена, треба варіанти)
 *
 * Route: /ui-mockups  (dev/internal only, не лінкується з основної навігації).
 * Лише дизайн-токени (`rgb(var(--c-*))`), без нових залежностей. Це прев'ю для
 * узгодження, а не фінальна імплементація у відповідних компонентах.
 */

import { useState } from "react";

/* ─── tiny helpers ─────────────────────────────────────────────────────── */

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
    <div className="flex items-start gap-4 mb-6">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-base"
        style={{ background: "rgb(var(--c-text))", color: "rgb(var(--c-bg))" }}
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

/** Картка одного варіанта: «Зараз» (червона), нейтральний варіант, або
 *  рекомендований (зелена рамка). */
function VariantCard({
  tone,
  label,
  note,
  hint,
  children,
}: {
  tone: "now" | "option" | "pick";
  label: string;
  note?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const border =
    tone === "now"
      ? "rgb(252 165 165)"
      : tone === "pick"
        ? "rgb(167 243 208)"
        : "rgb(var(--c-line))";
  const headBg =
    tone === "now"
      ? "rgb(254 242 242)"
      : tone === "pick"
        ? "rgb(240 253 244)"
        : "rgb(var(--c-panel-hi))";
  const dot =
    tone === "now"
      ? "rgb(239 68 68)"
      : tone === "pick"
        ? "rgb(34 197 94)"
        : "rgb(var(--c-muted))";
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgb(var(--c-panel))",
        border: `1.5px solid ${border}`,
        boxShadow: "var(--shadow-e1)",
      }}
    >
      <div
        className="px-4 py-2.5 flex items-center gap-2 border-b"
        style={{ background: headBg, borderColor: border }}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: dot }}
        />
        <span
          className="font-semibold text-xs"
          style={{ color: "rgb(var(--c-text))" }}
        >
          {label}
        </span>
        {hint ? (
          <span
            className="ml-auto text-[11px] font-medium"
            style={{ color: "rgb(var(--c-muted))" }}
          >
            {hint}
          </span>
        ) : null}
      </div>
      <div className="p-5">{children}</div>
      {note ? (
        <p
          className="px-5 pb-4 -mt-2 text-[11px] leading-relaxed"
          style={{ color: "rgb(var(--c-subtle))" }}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

/* ─── Phone frame wrapper ──────────────────────────────────────────────── */
function PhoneFrame({
  children,
  height = 360,
}: {
  children: React.ReactNode;
  height?: number;
}) {
  return (
    <div
      className="relative mx-auto rounded-[2rem] overflow-hidden"
      style={{
        width: 232,
        height,
        background: "rgb(var(--c-bg))",
        border: "2.5px solid rgb(var(--c-line))",
        boxShadow: "var(--shadow-e3)",
      }}
    >
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-5 rounded-b-xl z-20"
        style={{ background: "rgb(var(--c-line))" }}
      />
      <div className="absolute inset-0 overflow-hidden">{children}</div>
    </div>
  );
}

function FakeHeader({ title }: { title: string }) {
  return (
    <div className="pt-7 px-4 pb-2">
      <p
        className="text-[10px] font-bold uppercase tracking-widest"
        style={{ color: "rgb(var(--c-muted))" }}
      >
        {title}
      </p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   #13 — РОЗДІЛЬНИКИ СПИСКУ ТРАНЗАКЦІЙ · дані
   ══════════════════════════════════════════════════════════════════════════ */

type Tx = {
  t: string;
  c: string;
  a: string;
  day: "Сьогодні" | "Вчора";
};

const TX: Tx[] = [
  { t: "Сільпо", c: "Продукти", a: "−480 ₴", day: "Сьогодні" },
  { t: "Uklon", c: "Транспорт", a: "−120 ₴", day: "Сьогодні" },
  { t: "Зарплата", c: "Дохід", a: "+38 000 ₴", day: "Вчора" },
  { t: "Netflix", c: "Підписки", a: "−259 ₴", day: "Вчора" },
  { t: "АТБ", c: "Продукти", a: "−315 ₴", day: "Вчора" },
];

const DAYS = ["Сьогодні", "Вчора"] as const;
const DAY_TOTAL: Record<string, string> = {
  Сьогодні: "−600 ₴",
  Вчора: "+37 426 ₴",
};

/** семантичний колір-токен на категорію (для варіанта B) */
const CAT_COLOR: Record<string, string> = {
  Продукти: "var(--c-info)",
  Транспорт: "var(--c-warning)",
  Дохід: "var(--c-success)",
  Підписки: "var(--c-nutrition-accent)",
};
function catColor(c: string) {
  return CAT_COLOR[c] ?? "var(--c-finyk-accent)";
}

function Amount({ a }: { a: string }) {
  const positive = a.startsWith("+");
  return (
    <span
      className="text-xs font-bold tabular-nums shrink-0"
      style={{
        color: positive ? "rgb(var(--c-success))" : "rgb(var(--c-text))",
        fontFamily: "var(--font-mono, monospace)",
      }}
    >
      {a}
    </span>
  );
}

/* ── #13 · Зараз: зебра ─────────────────────────────────────────────────── */
function TxNowZebra() {
  return (
    <PhoneFrame>
      <FakeHeader title="Транзакції" />
      <div className="px-3">
        {TX.map((tx, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 py-2 px-2 rounded-lg"
            style={{
              background:
                i % 2 === 1 ? "rgb(var(--c-panel-hi) / 0.5)" : "transparent",
            }}
          >
            <div
              className="w-7 h-7 rounded-lg shrink-0"
              style={{ background: "rgb(var(--c-panel-hi))" }}
            />
            <div className="min-w-0 flex-1">
              <p
                className="text-xs font-semibold truncate"
                style={{ color: "rgb(var(--c-text))" }}
              >
                {tx.t}
              </p>
              <p
                className="text-[10px]"
                style={{ color: "rgb(var(--c-subtle))" }}
              >
                {tx.c}
              </p>
            </div>
            <Amount a={tx.a} />
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

/* ── #13 · Варіант A: групи-картки за днями ─────────────────────────────── */
function TxVarPanels() {
  return (
    <PhoneFrame>
      <FakeHeader title="Транзакції" />
      <div className="px-3 space-y-3">
        {DAYS.map((day) => {
          const rows = TX.filter((t) => t.day === day);
          return (
            <div key={day}>
              <p
                className="text-[10px] font-bold uppercase tracking-wide mb-1.5 px-1"
                style={{ color: "rgb(var(--c-muted))" }}
              >
                {day}
              </p>
              <div
                className="rounded-2xl overflow-hidden"
                style={{
                  background: "rgb(var(--c-panel))",
                  border: "1px solid rgb(var(--c-line))",
                }}
              >
                {rows.map((tx, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 py-2 px-2.5"
                    style={{
                      borderTop:
                        i === 0
                          ? "none"
                          : "1px solid rgb(var(--c-line) / 0.5)",
                    }}
                  >
                    <div
                      className="w-6 h-6 rounded-lg shrink-0"
                      style={{ background: "rgb(var(--c-panel-hi))" }}
                    />
                    <span
                      className="text-xs font-semibold truncate flex-1"
                      style={{ color: "rgb(var(--c-text))" }}
                    >
                      {tx.t}
                    </span>
                    <Amount a={tx.a} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </PhoneFrame>
  );
}

/* ── #13 · Варіант B: inset-роздільники + кольори категорій ─────────────── */
function TxVarInset() {
  return (
    <PhoneFrame>
      <FakeHeader title="Транзакції" />
      <div className="px-3">
        {DAYS.map((day) => {
          const rows = TX.filter((t) => t.day === day);
          return (
            <div key={day} className="mb-1">
              <div
                className="inline-block rounded-full px-2 py-0.5 my-1.5 text-[9px] font-bold uppercase tracking-wide"
                style={{
                  background: "rgb(var(--c-panel-hi))",
                  color: "rgb(var(--c-muted))",
                }}
              >
                {day}
              </div>
              {rows.map((tx, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 py-2"
                  style={{
                    borderTop:
                      i === 0
                        ? "none"
                        : "1px solid rgb(var(--c-line) / 0.5)",
                    marginLeft: i === 0 ? 0 : 34,
                    paddingLeft: i === 0 ? 0 : 0,
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center"
                    style={{
                      background: `rgb(${catColor(tx.c)} / 0.16)`,
                      marginLeft: i === 0 ? 0 : -34,
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: `rgb(${catColor(tx.c)})` }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-xs font-semibold truncate"
                      style={{ color: "rgb(var(--c-text))" }}
                    >
                      {tx.t}
                    </p>
                    <p
                      className="text-[10px] font-medium"
                      style={{ color: `rgb(${catColor(tx.c)})` }}
                    >
                      {tx.c}
                    </p>
                  </div>
                  <Amount a={tx.a} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </PhoneFrame>
  );
}

/* ── #13 · Варіант C: картки-рядки ──────────────────────────────────────── */
function TxVarCards() {
  return (
    <PhoneFrame>
      <FakeHeader title="Транзакції" />
      <div className="px-3">
        {DAYS.map((day) => {
          const rows = TX.filter((t) => t.day === day);
          return (
            <div key={day}>
              <p
                className="text-[10px] font-bold uppercase tracking-wide mb-1.5 mt-1 px-1"
                style={{ color: "rgb(var(--c-muted))" }}
              >
                {day}
              </p>
              <div className="flex flex-col gap-1.5 mb-2">
                {rows.map((tx, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 py-1.5 px-2.5 rounded-xl"
                    style={{
                      background: "rgb(var(--c-panel-hi) / 0.6)",
                      border: "1px solid rgb(var(--c-line) / 0.5)",
                    }}
                  >
                    <div
                      className="w-6 h-6 rounded-lg shrink-0"
                      style={{ background: "rgb(var(--c-panel))" }}
                    />
                    <span
                      className="text-xs font-semibold truncate flex-1"
                      style={{ color: "rgb(var(--c-text))" }}
                    >
                      {tx.t}
                    </span>
                    <Amount a={tx.a} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </PhoneFrame>
  );
}

/* ── #13 · Варіант D: заголовок дня з підсумком ─────────────────────────── */
function TxVarDayTotal() {
  return (
    <PhoneFrame>
      <FakeHeader title="Транзакції" />
      <div className="px-3">
        {DAYS.map((day) => {
          const rows = TX.filter((t) => t.day === day);
          const positive = DAY_TOTAL[day].startsWith("+");
          return (
            <div key={day} className="mb-1">
              <div
                className="flex items-center justify-between rounded-lg px-2.5 py-1.5 my-1.5"
                style={{ background: "rgb(var(--c-panel-hi))" }}
              >
                <span
                  className="text-[10px] font-bold uppercase tracking-wide"
                  style={{ color: "rgb(var(--c-muted))" }}
                >
                  {day}
                </span>
                <span
                  className="text-[11px] font-bold tabular-nums"
                  style={{
                    color: positive
                      ? "rgb(var(--c-success))"
                      : "rgb(var(--c-text))",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {DAY_TOTAL[day]}
                </span>
              </div>
              {rows.map((tx, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 py-2 px-1"
                  style={{
                    borderTop:
                      i === 0
                        ? "none"
                        : "1px solid rgb(var(--c-line) / 0.5)",
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-lg shrink-0"
                    style={{ background: "rgb(var(--c-panel-hi))" }}
                  />
                  <span
                    className="text-xs font-semibold truncate flex-1"
                    style={{ color: "rgb(var(--c-text))" }}
                  >
                    {tx.t}
                  </span>
                  <Amount a={tx.a} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </PhoneFrame>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   #20 — ІНДИКАТОР АКТИВНОЇ ВКЛАДКИ BOTTOM-NAV · дані
   ══════════════════════════════════════════════════════════════════════════ */

const NAV = [
  { label: "Дім", d: "M3 11l9-8 9 8M5 10v10h14V10" },
  { label: "Гроші", d: "M3 6h18v12H3zM3 10h18" },
  { label: "Спорт", d: "M6 12h12M8 8v8M16 8v8" },
  { label: "Профіль", d: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0" },
];
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
    >
      <path d={d} />
    </svg>
  );
}

function NavShell({ children }: { children: React.ReactNode }) {
  return (
    <PhoneFrame height={260}>
      <div className="flex items-center justify-center h-full">
        <p className="text-[11px]" style={{ color: "rgb(var(--c-subtle))" }}>
          Тапни вкладку ↓
        </p>
      </div>
      {children}
    </PhoneFrame>
  );
}

/* ── #20 · Зараз: лише glow-тінь ────────────────────────────────────────── */
function NavNowGlow() {
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
        {NAV.map((n, i) => {
          const on = i === active;
          return (
            <button
              key={n.label}
              onClick={() => setActive(i)}
              className="flex flex-col items-center gap-0.5 rounded-xl px-2 py-1"
              style={{
                boxShadow: on ? `0 0 12px 2px rgb(var(--c-finyk-accent) / 0.5)` : "none",
              }}
            >
              <NavIcon d={n.d} color={on ? ACCENT : "rgb(var(--c-muted))"} />
              <span
                className="text-[9px]"
                style={{ color: on ? ACCENT : "rgb(var(--c-muted))" }}
              >
                {n.label}
              </span>
            </button>
          );
        })}
      </div>
    </NavShell>
  );
}

/* ── #20 · Варіант A: ковзний pill (baseline) ───────────────────────────── */
function NavVarPill() {
  const [active, setActive] = useState(0);
  const count = NAV.length;
  return (
    <NavShell>
      <div
        className="absolute bottom-0 inset-x-0 h-14"
        style={{
          background: "rgb(var(--c-panel))",
          borderTop: "1px solid rgb(var(--c-line))",
        }}
      >
        <div
          className="absolute top-1.5 h-11 rounded-2xl"
          style={{
            width: `calc(${100 / count}% - 10px)`,
            left: `calc(${(100 / count) * active}% + 5px)`,
            background: "rgb(var(--c-finyk-accent) / 0.16)",
            transition: `left 360ms ${EASE}`,
          }}
        />
        <div className="relative h-14 flex items-center justify-around">
          {NAV.map((n, i) => {
            const on = i === active;
            return (
              <button
                key={n.label}
                onClick={() => setActive(i)}
                className="flex flex-col items-center gap-0.5 px-2 py-1"
              >
                <NavIcon d={n.d} color={on ? ACCENT : "rgb(var(--c-muted))"} />
                <span
                  className="text-[9px]"
                  style={{ color: on ? ACCENT : "rgb(var(--c-muted))" }}
                >
                  {n.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </NavShell>
  );
}

/* ── #20 · Варіант B: верхня морф-лінія ─────────────────────────────────── */
function NavVarTopBar() {
  const [active, setActive] = useState(0);
  const count = NAV.length;
  return (
    <NavShell>
      <div
        className="absolute bottom-0 inset-x-0 h-14"
        style={{
          background: "rgb(var(--c-panel))",
          borderTop: "1px solid rgb(var(--c-line))",
        }}
      >
        {/* морфна лінія-індикатор на верхній кромці */}
        <div
          className="absolute -top-px h-[3px] rounded-full"
          style={{
            width: `calc(${100 / count}% - 24px)`,
            left: `calc(${(100 / count) * active}% + 12px)`,
            background: ACCENT,
            transition: `left 340ms ${EASE}, width 340ms ${EASE}`,
          }}
        />
        <div className="relative h-14 flex items-center justify-around">
          {NAV.map((n, i) => {
            const on = i === active;
            return (
              <button
                key={n.label}
                onClick={() => setActive(i)}
                className="flex flex-col items-center gap-0.5 px-2 py-1"
              >
                <NavIcon d={n.d} color={on ? ACCENT : "rgb(var(--c-muted))"} />
                <span
                  className="text-[9px]"
                  style={{ color: on ? ACCENT : "rgb(var(--c-muted))" }}
                >
                  {n.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </NavShell>
  );
}

/* ── #20 · Варіант C: pill навколо іконки + активний лейбл ───────────────── */
function NavVarIconPill() {
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
        {NAV.map((n, i) => {
          const on = i === active;
          return (
            <button
              key={n.label}
              onClick={() => setActive(i)}
              className="flex items-center rounded-full overflow-hidden"
              style={{
                gap: on ? 6 : 0,
                paddingLeft: on ? 10 : 8,
                paddingRight: on ? 12 : 8,
                paddingTop: 6,
                paddingBottom: 6,
                background: on ? "rgb(var(--c-finyk-accent) / 0.16)" : "transparent",
                transition: `background 260ms ${EASE}, gap 260ms ${EASE}, padding 260ms ${EASE}`,
              }}
            >
              <NavIcon d={n.d} color={on ? ACCENT : "rgb(var(--c-muted))"} />
              <span
                className="text-[10px] font-semibold whitespace-nowrap"
                style={{
                  color: ACCENT,
                  maxWidth: on ? 60 : 0,
                  opacity: on ? 1 : 0,
                  transition: `max-width 260ms ${EASE}, opacity 200ms ${EASE}`,
                }}
              >
                {n.label}
              </span>
            </button>
          );
        })}
      </div>
    </NavShell>
  );
}

/* ── #20 · Варіант D: ковзна крапка + підйом іконки ─────────────────────── */
function NavVarDot() {
  const [active, setActive] = useState(0);
  const count = NAV.length;
  return (
    <NavShell>
      <div
        className="absolute bottom-0 inset-x-0 h-14"
        style={{
          background: "rgb(var(--c-panel))",
          borderTop: "1px solid rgb(var(--c-line))",
        }}
      >
        <div className="relative h-14 flex items-center justify-around">
          {NAV.map((n, i) => {
            const on = i === active;
            return (
              <button
                key={n.label}
                onClick={() => setActive(i)}
                className="flex flex-col items-center gap-0.5 px-2 py-1"
              >
                <div
                  style={{
                    transition: `transform 320ms ${EASE}`,
                    transform: on ? "translateY(-3px)" : "none",
                  }}
                >
                  <NavIcon d={n.d} color={on ? ACCENT : "rgb(var(--c-muted))"} />
                </div>
                <span
                  className="text-[9px]"
                  style={{ color: on ? ACCENT : "rgb(var(--c-muted))" }}
                >
                  {n.label}
                </span>
              </button>
            );
          })}
        </div>
        {/* ковзна крапка під активною вкладкою */}
        <div
          className="absolute bottom-1.5 w-1.5 h-1.5 rounded-full"
          style={{
            left: `calc(${(100 / count) * active}% + ${100 / count / 2}% - 3px)`,
            background: ACCENT,
            transition: `left 320ms ${EASE}`,
          }}
        />
      </div>
    </NavShell>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGE
   ══════════════════════════════════════════════════════════════════════════ */

export function UiMockupsPage() {
  return (
    <div
      className="h-dvh overflow-y-auto"
      style={{ background: "rgb(var(--c-bg))" }}
    >
      <header
        className="sticky top-0 z-40 backdrop-blur-md border-b"
        style={{
          background: "rgb(var(--c-panel) / 0.9)",
          borderColor: "rgb(var(--c-line))",
        }}
      >
        <div className="mx-auto max-w-4xl px-4 h-14 flex items-center gap-2 flex-wrap">
          <h1 className="font-extrabold" style={{ color: "rgb(var(--c-text))" }}>
            UI Mockups · раунд 2
          </h1>
          <span className="text-xs" style={{ color: "rgb(var(--c-muted))" }}>
            варіанти #13 і #20 · мобільний PWA · для узгодження
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-8">
        <p
          className="text-sm leading-relaxed mb-10 rounded-xl p-4"
          style={{
            background: "rgb(var(--c-panel))",
            color: "rgb(var(--c-muted))",
            boxShadow: "var(--shadow-e1)",
          }}
        >
          Порівняй варіанти й скажи, який брати в кожному пункті (або комбінацію).
          Мокапи навмисно спрощені — лише токени дизайн-системи, без реальних
          даних. Пункти #9, #11, #18, #19 уже погоджені; #14 відхилено.
        </p>

        {/* ── #13 ─────────────────────────────────────────────────────── */}
        <section className="mb-14">
          <SectionHeader
            number="13"
            title="Роздільники списку транзакцій"
            subtitle="Волосяні лінії виглядали «голо». Ось 4 варіанти з більшою структурою."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <VariantCard
              tone="now"
              label="Зараз · зебра"
              note="Смугастий фон шумить, немає групування за днями, суперечить мові «Папір»."
            >
              <TxNowZebra />
            </VariantCard>
            <VariantCard
              tone="option"
              label="Варіант A · групи-картки за днями"
              note="Кожен день — окрема картка-панель. Заповнена поверхня прибирає відчуття порожнечі; знайомий патерн Wallet/Monobank."
            >
              <TxVarPanels />
            </VariantCard>
            <VariantCard
              tone="option"
              label="Варіант B · inset-лінії + кольори категорій"
              note="Роздільники з відступом під текст + кольоровий токен на категорію. Колір і ритм заповнюють «голизну», лишаючись пласким списком."
            >
              <TxVarInset />
            </VariantCard>
            <VariantCard
              tone="option"
              label="Варіант C · картки-рядки"
              note="Кожна транзакція — окрема м'яка картка з відступами. Найтактильніше, без ліній, але список стає вищим."
            >
              <TxVarCards />
            </VariantCard>
            <VariantCard
              tone="option"
              label="Варіант D · заголовок дня з підсумком"
              note="Заголовок дня — заповнена смуга з денним нетто справа. Додає ваги й корисної інформації + волосяні лінії."
            >
              <TxVarDayTotal />
            </VariantCard>
          </div>
        </section>

        {/* ── #20 ─────────────────────────────────────────────────────── */}
        <section>
          <SectionHeader
            number="20"
            title="Індикатор активної вкладки bottom-nav"
            subtitle="Ідею схвалено. 4 варіанти індикатора — тапай вкладки, щоб побачити рух."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <VariantCard
              tone="now"
              label="Зараз · glow-тінь"
              hint="тапни вкладку"
              note="Активний стан — лише світіння іконки, без руху й без відчуття напрямку."
            >
              <NavNowGlow />
            </VariantCard>
            <VariantCard
              tone="option"
              label="Варіант A · ковзний pill"
              hint="тапни вкладку"
              note="Заповнений squircle перетікає під активну вкладку. Найпомітніший, «важкий» акцент."
            >
              <NavVarPill />
            </VariantCard>
            <VariantCard
              tone="option"
              label="Варіант B · верхня морф-лінія"
              hint="тапни вкладку"
              note="Тонка лінія на верхній кромці ковзає й морфить ширину (Material-стиль). Мінімалістично й легко."
            >
              <NavVarTopBar />
            </VariantCard>
            <VariantCard
              tone="option"
              label="Варіант C · pill навколо іконки + лейбл"
              hint="тапни вкладку"
              note="Лейбли лише в активної вкладки, pill обгортає іконку+текст. Ощадливо за місцем, сучасний iOS-стиль."
            >
              <NavVarIconPill />
            </VariantCard>
            <VariantCard
              tone="option"
              label="Варіант D · ковзна крапка + підйом іконки"
              hint="тапни вкладку"
              note="Маленька крапка ковзає під активною вкладкою, іконка трохи піднімається. Найтонший, найелегантніший акцент."
            >
              <NavVarDot />
            </VariantCard>
          </div>
        </section>
      </div>
    </div>
  );
}
