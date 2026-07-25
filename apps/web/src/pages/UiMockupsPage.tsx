/**
 * UI Mockups Page — інтерактивні «зараз / може бути» прев'ю для UI/UX-пунктів,
 * які користувач попросив візуалізувати перед рішенням (мобільний PWA).
 *
 * Пункти: #9 blur-to-reveal сум, #11 хореографія переходів вкладок хабу,
 * #13 паперові роздільники замість зебри, #14 перемикач щільності списків,
 * #18 long-press peek, #19 scroll-паралакс hero, #20 морфний індикатор
 * активної вкладки bottom-nav.
 *
 * Route: /ui-mockups  (dev/internal only, не лінкується з основної навігації).
 * Лише дизайн-токени (`rgb(var(--c-*))`), без нових залежностей. Це прев'ю
 * для узгодження, а не фінальна імплементація у відповідних компонентах.
 */

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

/* ─── tiny helpers ─────────────────────────────────────────────────────── */

function Badge({
  label,
  variant,
}: {
  label: string;
  variant: "before" | "after";
}) {
  const styles = {
    before:
      "bg-red-50 text-red-700 border border-red-200 font-semibold text-xs px-2.5 py-0.5 rounded-full",
    after:
      "bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-xs px-2.5 py-0.5 rounded-full",
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

function CompareCard({
  side,
  hint,
  children,
}: {
  side: "before" | "after";
  hint?: string;
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
          background: side === "before" ? "rgb(254 242 242)" : "rgb(240 253 244)",
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
        <Badge label={side === "before" ? "Зараз" : "Може бути"} variant={side} />
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
    </div>
  );
}

function CompareRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

/* ─── Phone frame wrapper ──────────────────────────────────────────────── */
function PhoneFrame({
  children,
  height = 380,
}: {
  children: React.ReactNode;
  height?: number;
}) {
  return (
    <div
      className="relative mx-auto rounded-[2rem] overflow-hidden"
      style={{
        width: 240,
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

/* small shared bits */
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
   #9 — BLUR-TO-REVEAL СУМ
   ══════════════════════════════════════════════════════════════════════════ */

function Blur9Before() {
  const [hidden, setHidden] = useState(true);
  return (
    <PhoneFrame height={320}>
      <FakeHeader title="Баланс" />
      <div className="px-4 space-y-3">
        <div
          className="rounded-2xl p-4"
          style={{ background: "rgb(var(--c-panel))", boxShadow: "var(--shadow-e1)" }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px]" style={{ color: "rgb(var(--c-muted))" }}>
              Всього
            </span>
            <button
              onClick={() => setHidden((v) => !v)}
              className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
              style={{ background: "rgb(var(--c-panel-hi))", color: "rgb(var(--c-text))" }}
            >
              {hidden ? "Показати" : "Сховати"}
            </button>
          </div>
          <div
            className="text-2xl font-black tabular-nums"
            style={{ color: "rgb(var(--c-text))", fontFamily: "var(--font-mono, monospace)" }}
          >
            {hidden ? "••• •••" : "128 400 ₴"}
          </div>
          <p className="text-[10px] mt-1" style={{ color: "rgb(var(--c-subtle))" }}>
            Порожнє місце: неясно, скільки цифр, стрибок при показі
          </p>
        </div>
      </div>
    </PhoneFrame>
  );
}

function Blur9After() {
  const [revealed, setRevealed] = useState(false);
  return (
    <PhoneFrame height={320}>
      <FakeHeader title="Баланс" />
      <div className="px-4 space-y-3">
        <div
          className="rounded-2xl p-4"
          style={{ background: "rgb(var(--c-panel))", boxShadow: "var(--shadow-e1)" }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px]" style={{ color: "rgb(var(--c-muted))" }}>
              Всього
            </span>
            <span className="text-[11px]" style={{ color: "rgb(var(--c-subtle))" }}>
              тап, щоб показати
            </span>
          </div>
          <button
            onClick={() => setRevealed((v) => !v)}
            className="block w-full text-left"
          >
            <div
              className="text-2xl font-black tabular-nums transition-all duration-300"
              style={{
                color: "rgb(var(--c-text))",
                fontFamily: "var(--font-mono, monospace)",
                filter: revealed ? "blur(0px)" : "blur(9px)",
                opacity: revealed ? 1 : 0.85,
              }}
            >
              128 400 ₴
            </div>
          </button>
          <p className="text-[10px] mt-1" style={{ color: "rgb(var(--c-subtle))" }}>
            Форма/розмір числа збережені, нуль layout-стрибка
          </p>
        </div>
        <div
          className="rounded-2xl p-4 flex items-center justify-between"
          style={{ background: "rgb(var(--c-panel))", boxShadow: "var(--shadow-e1)" }}
        >
          <span className="text-[11px]" style={{ color: "rgb(var(--c-muted))" }}>
            Картка
          </span>
          <span
            className="text-base font-bold tabular-nums transition-all duration-300"
            style={{
              color: "rgb(var(--c-text))",
              fontFamily: "var(--font-mono, monospace)",
              filter: revealed ? "blur(0px)" : "blur(7px)",
            }}
          >
            42 150 ₴
          </span>
        </div>
      </div>
    </PhoneFrame>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   #11 — ХОРЕОГРАФІЯ ПЕРЕХОДІВ ВКЛАДОК ХАБУ
   ══════════════════════════════════════════════════════════════════════════ */

const HUB_TABS = ["Огляд", "Звіти", "Профіль"];

function tabBody(i: number) {
  const accents = ["var(--c-finyk-accent)", "var(--c-success)", "var(--c-text)"];
  return (
    <div className="px-4 space-y-2">
      <div
        className="rounded-xl h-16"
        style={{ background: `rgb(${accents[i]} / 0.12)` }}
      />
      <div
        className="rounded-xl h-10"
        style={{ background: "rgb(var(--c-panel))", boxShadow: "var(--shadow-e1)" }}
      />
      <div
        className="rounded-xl h-10"
        style={{ background: "rgb(var(--c-panel))", boxShadow: "var(--shadow-e1)" }}
      />
    </div>
  );
}

function TabsStrip({
  active,
  onSelect,
}: {
  active: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="flex gap-1 px-4 pb-2">
      {HUB_TABS.map((t, i) => (
        <button
          key={t}
          onClick={() => onSelect(i)}
          className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
          style={{
            background: i === active ? "rgb(var(--c-text))" : "rgb(var(--c-panel-hi))",
            color: i === active ? "rgb(var(--c-bg))" : "rgb(var(--c-muted))",
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function Tabs11Before() {
  const [active, setActive] = useState(0);
  return (
    <PhoneFrame height={320}>
      <FakeHeader title="Хаб" />
      <TabsStrip active={active} onSelect={setActive} />
      {/* instant swap, no animation */}
      <div key={active}>{tabBody(active)}</div>
      <p
        className="text-[10px] px-4 pt-3"
        style={{ color: "rgb(var(--c-subtle))" }}
      >
        Контент підміняється миттєво — «блимання», без відчуття напрямку
      </p>
    </PhoneFrame>
  );
}

function Tabs11After() {
  const [active, setActive] = useState(0);
  const prev = useRef(0);
  const dir = active >= prev.current ? 1 : -1;
  useEffect(() => {
    prev.current = active;
  }, [active]);
  return (
    <PhoneFrame height={320}>
      <FakeHeader title="Хаб" />
      <TabsStrip active={active} onSelect={setActive} />
      <div className="relative overflow-hidden">
        <div
          key={active}
          style={{
            animation: "mockSlideIn 320ms cubic-bezier(0.22,1,0.36,1)",
            ["--mock-dx" as string]: `${dir * 24}px`,
          }}
        >
          {tabBody(active)}
        </div>
      </div>
      <p
        className="text-[10px] px-4 pt-3"
        style={{ color: "rgb(var(--c-subtle))" }}
      >
        Напрямлений слайд + fade за індексом вкладки — відчуття простору
      </p>
    </PhoneFrame>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   #13 — ПАПЕРОВІ РОЗДІЛЬНИКИ ЗАМІСТЬ ЗЕБРИ
   ══════════════════════════════════════════════════════════════════════════ */

const TX = [
  { t: "Сільпо", c: "Продукти", a: "−480 ₴", day: "Сьогодні" },
  { t: "Uklon", c: "Транспорт", a: "−120 ₴", day: "Сьогодні" },
  { t: "Зарплата", c: "Дохід", a: "+38 000 ₴", day: "Вчора" },
  { t: "Netflix", c: "Підписки", a: "−259 ₴", day: "Вчора" },
  { t: "АТБ", c: "Продукти", a: "−315 ₴", day: "Вчора" },
];

function TxRow({ tx }: { tx: (typeof TX)[number] }) {
  const positive = tx.a.startsWith("+");
  return (
    <div className="flex items-center gap-2.5 py-2">
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
        <p className="text-[10px]" style={{ color: "rgb(var(--c-subtle))" }}>
          {tx.c}
        </p>
      </div>
      <span
        className="text-xs font-bold tabular-nums"
        style={{
          color: positive ? "rgb(var(--c-success))" : "rgb(var(--c-text))",
          fontFamily: "var(--font-mono, monospace)",
        }}
      >
        {tx.a}
      </span>
    </div>
  );
}

function Tx13Before() {
  return (
    <PhoneFrame height={360}>
      <FakeHeader title="Транзакції" />
      <div className="px-3">
        {TX.map((tx, i) => (
          <div
            key={i}
            className="px-2 rounded-lg"
            style={{
              background: i % 2 === 1 ? "rgb(var(--c-panel-hi) / 0.5)" : "transparent",
            }}
          >
            <TxRow tx={tx} />
          </div>
        ))}
        <p className="text-[10px] px-2 pt-2" style={{ color: "rgb(var(--c-subtle))" }}>
          Зебра шумить, немає групування за днями
        </p>
      </div>
    </PhoneFrame>
  );
}

function Tx13After() {
  const groups = ["Сьогодні", "Вчора"] as const;
  return (
    <PhoneFrame height={360}>
      <FakeHeader title="Транзакції" />
      <div className="px-4">
        {groups.map((day) => {
          const rows = TX.filter((t) => t.day === day);
          return (
            <div key={day} className="mb-1">
              <div
                className="sticky top-0 py-1 text-[10px] font-bold uppercase tracking-wide"
                style={{ color: "rgb(var(--c-muted))", background: "rgb(var(--c-bg))" }}
              >
                {day}
              </div>
              {rows.map((tx, i) => (
                <div
                  key={i}
                  style={{
                    borderTop:
                      i === 0 ? "none" : "1px solid rgb(var(--c-line) / 0.6)",
                  }}
                >
                  <TxRow tx={tx} />
                </div>
              ))}
            </div>
          );
        })}
        <p className="text-[10px] pt-1" style={{ color: "rgb(var(--c-subtle))" }}>
          Волосяні роздільники + денні заголовки — чистіший ритм
        </p>
      </div>
    </PhoneFrame>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   #14 — ПЕРЕМИКАЧ ЩІЛЬНОСТІ СПИСКІВ
   ══════════════════════════════════════════════════════════════════════════ */

function Density14Before() {
  return (
    <PhoneFrame height={360}>
      <FakeHeader title="Транзакції" />
      <div className="px-4">
        {TX.concat(TX.slice(0, 1)).map((tx, i) => (
          <div key={i} style={{ borderTop: i === 0 ? "none" : "1px solid rgb(var(--c-line) / 0.6)" }}>
            <TxRow tx={tx} />
          </div>
        ))}
        <p className="text-[10px] pt-2" style={{ color: "rgb(var(--c-subtle))" }}>
          Одна фіксована щільність — на довгих списках багато скролу
        </p>
      </div>
    </PhoneFrame>
  );
}

function Density14After() {
  const [compact, setCompact] = useState(true);
  const rows = TX.concat(TX).slice(0, compact ? 9 : 6);
  return (
    <PhoneFrame height={360}>
      <div className="pt-7 px-4 pb-2 flex items-center justify-between">
        <p
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: "rgb(var(--c-muted))" }}
        >
          Транзакції
        </p>
        <div
          className="flex rounded-lg overflow-hidden"
          style={{ border: "1px solid rgb(var(--c-line))" }}
        >
          {(["Компактно", "Просторо"] as const).map((label, idx) => {
            const isCompact = idx === 0;
            const on = compact === isCompact;
            return (
              <button
                key={label}
                onClick={() => setCompact(isCompact)}
                className="text-[10px] font-semibold px-2 py-1 transition-colors"
                style={{
                  background: on ? "rgb(var(--c-text))" : "transparent",
                  color: on ? "rgb(var(--c-bg))" : "rgb(var(--c-muted))",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="px-4">
        {rows.map((tx, i) => (
          <div
            key={i}
            className="transition-all"
            style={{
              borderTop: i === 0 ? "none" : "1px solid rgb(var(--c-line) / 0.6)",
              paddingTop: compact ? 1 : 6,
              paddingBottom: compact ? 1 : 6,
            }}
          >
            <div style={{ transform: compact ? "scale(0.96)" : "scale(1)", transformOrigin: "left center" }}>
              <TxRow tx={tx} />
            </div>
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   #18 — LONG-PRESS PEEK
   ══════════════════════════════════════════════════════════════════════════ */

function Peek18Before() {
  const [nav, setNav] = useState(false);
  useEffect(() => {
    if (!nav) return;
    const t = setTimeout(() => setNav(false), 900);
    return () => clearTimeout(t);
  }, [nav]);
  return (
    <PhoneFrame height={340}>
      <FakeHeader title="Транзакції" />
      <div className="px-4">
        <button
          onClick={() => setNav(true)}
          className="w-full rounded-xl p-3 text-left"
          style={{ background: "rgb(var(--c-panel))", boxShadow: "var(--shadow-e1)" }}
        >
          <TxRow tx={TX[0]} />
        </button>
        <div
          className="mt-3 rounded-lg p-2 text-[10px] text-center transition-opacity"
          style={{
            background: "rgb(var(--c-panel-hi))",
            color: "rgb(var(--c-muted))",
            opacity: nav ? 1 : 0.4,
          }}
        >
          {nav ? "→ Повний перехід на сторінку деталей" : "Тап = повний перехід. Утримання нічого не робить"}
        </div>
      </div>
    </PhoneFrame>
  );
}

function Peek18After() {
  const [peek, setPeek] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = (_e: ReactPointerEvent) => {
    timer.current = setTimeout(() => setPeek(true), 350);
  };
  const end = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  return (
    <PhoneFrame height={340}>
      <FakeHeader title="Транзакції" />
      <div className="px-4">
        <button
          onPointerDown={start}
          onPointerUp={end}
          onPointerLeave={end}
          className="w-full rounded-xl p-3 text-left select-none"
          style={{ background: "rgb(var(--c-panel))", boxShadow: "var(--shadow-e1)" }}
        >
          <TxRow tx={TX[0]} />
        </button>
        <p className="text-[10px] pt-2 text-center" style={{ color: "rgb(var(--c-subtle))" }}>
          Утримай картку (~0.35с), щоб «підглянути»
        </p>
      </div>

      {peek ? (
        <div
          className="absolute inset-0 z-30 flex items-end"
          style={{ background: "rgb(0 0 0 / 0.35)" }}
          onClick={() => setPeek(false)}
        >
          <div
            className="w-full p-4 rounded-t-2xl"
            style={{
              background: "rgb(var(--c-panel))",
              boxShadow: "var(--shadow-e3)",
              animation: "mockSheetUp 240ms cubic-bezier(0.22,1,0.36,1)",
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold" style={{ color: "rgb(var(--c-text))" }}>
                Сільпо
              </p>
              <span
                className="text-sm font-black tabular-nums"
                style={{ color: "rgb(var(--c-text))", fontFamily: "var(--font-mono, monospace)" }}
              >
                −480 ₴
              </span>
            </div>
            <p className="text-[11px] mb-3" style={{ color: "rgb(var(--c-muted))" }}>
              Продукти · Сьогодні 14:20 · Картка ···1234
            </p>
            <div className="flex gap-2">
              {["Змінити категорію", "Дублювати", "Видалити"].map((a) => (
                <span
                  key={a}
                  className="text-[10px] font-semibold px-2 py-1 rounded-md"
                  style={{ background: "rgb(var(--c-panel-hi))", color: "rgb(var(--c-text))" }}
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </PhoneFrame>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   #19 — SCROLL-ПАРАЛАКС HERO
   ══════════════════════════════════════════════════════════════════════════ */

function ScrollBody({
  onScroll,
  children,
}: {
  onScroll?: (y: number) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute inset-0 overflow-y-auto"
      onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)}
    >
      {children}
    </div>
  );
}

function heroFiller() {
  return (
    <div className="px-4 space-y-2 pb-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl h-14"
          style={{ background: "rgb(var(--c-panel))", boxShadow: "var(--shadow-e1)" }}
        />
      ))}
    </div>
  );
}

function Parallax19Before() {
  return (
    <PhoneFrame height={360}>
      <ScrollBody>
        <div className="pt-7 px-4">
          <div
            className="rounded-2xl p-4 mb-3"
            style={{ background: "rgb(var(--c-finyk-accent) / 0.14)" }}
          >
            <p className="text-[10px]" style={{ color: "rgb(var(--c-muted))" }}>
              Чистий капітал
            </p>
            <p
              className="text-2xl font-black tabular-nums"
              style={{ color: "rgb(var(--c-text))", fontFamily: "var(--font-mono, monospace)" }}
            >
              128 400 ₴
            </p>
          </div>
        </div>
        {heroFiller()}
        <p className="text-[10px] px-4 pb-4 text-center" style={{ color: "rgb(var(--c-subtle))" }}>
          Скрол ↑ — hero плаский, рухається як звичайний блок
        </p>
      </ScrollBody>
    </PhoneFrame>
  );
}

function Parallax19After() {
  const [y, setY] = useState(0);
  return (
    <PhoneFrame height={360}>
      <ScrollBody onScroll={setY}>
        <div className="pt-7 px-4">
          <div
            className="relative rounded-2xl p-4 mb-3 overflow-hidden"
            style={{ background: "rgb(var(--c-finyk-accent) / 0.14)" }}
          >
            {/* parallax layer — moves slower than scroll */}
            <div
              className="absolute -right-6 -top-6 w-28 h-28 rounded-full"
              style={{
                background: "rgb(var(--c-finyk-accent) / 0.18)",
                transform: `translateY(${y * 0.35}px)`,
              }}
            />
            <div
              style={{
                transform: `translateY(${y * 0.15}px)`,
                opacity: Math.max(0, 1 - y / 120),
              }}
            >
              <p className="text-[10px] relative" style={{ color: "rgb(var(--c-muted))" }}>
                Чистий капітал
              </p>
              <p
                className="text-2xl font-black tabular-nums relative"
                style={{ color: "rgb(var(--c-text))", fontFamily: "var(--font-mono, monospace)" }}
              >
                128 400 ₴
              </p>
            </div>
          </div>
        </div>
        {heroFiller()}
        <p className="text-[10px] px-4 pb-4 text-center" style={{ color: "rgb(var(--c-subtle))" }}>
          Скрол ↑ — шар глибини зсувається повільніше, hero м'яко тане
        </p>
      </ScrollBody>
    </PhoneFrame>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   #20 — МОРФНИЙ ІНДИКАТОР АКТИВНОЇ ВКЛАДКИ BOTTOM-NAV
   ══════════════════════════════════════════════════════════════════════════ */

const NAV = [
  { label: "Дім", d: "M3 11l9-8 9 8M5 10v10h14V10" },
  { label: "Гроші", d: "M3 6h18v12H3zM3 10h18" },
  { label: "Спорт", d: "M6 12h12M8 8v8M16 8v8" },
  { label: "Профіль", d: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0" },
];

function NavIcon({ d, color }: { d: string; color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function Nav20Before() {
  const [active, setActive] = useState(0);
  return (
    <PhoneFrame height={300}>
      <div className="flex items-center justify-center h-full">
        <p className="text-[11px]" style={{ color: "rgb(var(--c-subtle))" }}>
          Тапни вкладку ↓
        </p>
      </div>
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
                boxShadow: on ? "0 0 12px 2px rgb(var(--c-finyk-accent) / 0.5)" : "none",
              }}
            >
              <NavIcon d={n.d} color={on ? "rgb(var(--c-finyk-accent))" : "rgb(var(--c-muted))"} />
              <span className="text-[9px]" style={{ color: on ? "rgb(var(--c-finyk-accent))" : "rgb(var(--c-muted))" }}>
                {n.label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="absolute bottom-16 inset-x-0 text-[10px] px-4 text-center" style={{ color: "rgb(var(--c-subtle))" }}>
        Активний стан — лише glow-тінь іконки, без руху
      </p>
    </PhoneFrame>
  );
}

function Nav20After() {
  const [active, setActive] = useState(0);
  const count = NAV.length;
  return (
    <PhoneFrame height={300}>
      <div className="flex items-center justify-center h-full">
        <p className="text-[11px]" style={{ color: "rgb(var(--c-subtle))" }}>
          Тапни вкладку ↓
        </p>
      </div>
      <div
        className="absolute bottom-0 inset-x-0 h-14"
        style={{
          background: "rgb(var(--c-panel))",
          borderTop: "1px solid rgb(var(--c-line))",
        }}
      >
        {/* morphing sliding pill */}
        <div
          className="absolute top-1.5 h-11 rounded-2xl"
          style={{
            width: `calc(${100 / count}% - 10px)`,
            left: `calc(${(100 / count) * active}% + 5px)`,
            background: "rgb(var(--c-finyk-accent) / 0.16)",
            transition: "left 360ms cubic-bezier(0.22,1,0.36,1)",
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
                <div style={{ transition: "transform 360ms cubic-bezier(0.22,1,0.36,1)", transform: on ? "translateY(-1px)" : "none" }}>
                  <NavIcon d={n.d} color={on ? "rgb(var(--c-finyk-accent))" : "rgb(var(--c-muted))"} />
                </div>
                <span className="text-[9px]" style={{ color: on ? "rgb(var(--c-finyk-accent))" : "rgb(var(--c-muted))" }}>
                  {n.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="absolute bottom-16 inset-x-0 text-[10px] px-4 text-center" style={{ color: "rgb(var(--c-subtle))" }}>
        Pill плавно перетікає між вкладками в акценті модуля
      </p>
    </PhoneFrame>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGE
   ══════════════════════════════════════════════════════════════════════════ */

const KEYFRAMES = `
@keyframes mockSlideIn {
  from { opacity: 0; transform: translateX(var(--mock-dx, 24px)); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes mockSheetUp {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
`;

const SECTIONS: {
  number: string;
  title: string;
  subtitle: string;
  before: React.ReactNode;
  after: React.ReactNode;
  beforeHint?: string;
  afterHint?: string;
}[] = [
  {
    number: "9",
    title: "Blur-to-reveal сум",
    subtitle: "Приватність без порожнього місця та стрибка розкладки.",
    before: <Blur9Before />,
    after: <Blur9After />,
    afterHint: "тапни число",
  },
  {
    number: "11",
    title: "Хореографія переходів вкладок хабу",
    subtitle: "Напрямлений слайд замість миттєвого блимання контенту.",
    before: <Tabs11Before />,
    after: <Tabs11After />,
    beforeHint: "перемкни вкладки",
    afterHint: "перемкни вкладки",
  },
  {
    number: "13",
    title: "Паперові роздільники замість зебри",
    subtitle: "Волосяні лінії + групування за днями замість смугастого фону.",
    before: <Tx13Before />,
    after: <Tx13After />,
  },
  {
    number: "14",
    title: "Перемикач щільності списків",
    subtitle: "Compact / comfortable для довгих списків транзакцій.",
    before: <Density14Before />,
    after: <Density14After />,
    afterHint: "перемкни режим",
  },
  {
    number: "18",
    title: "Long-press peek",
    subtitle: "Утримання показує деталі/дії без повного переходу.",
    before: <Peek18Before />,
    after: <Peek18After />,
    beforeHint: "тапни картку",
    afterHint: "утримай картку",
  },
  {
    number: "19",
    title: "Scroll-паралакс hero",
    subtitle: "Ледь помітна глибина на hero-картці при скролі.",
    before: <Parallax19Before />,
    after: <Parallax19After />,
    beforeHint: "скрол усередині",
    afterHint: "скрол усередині",
  },
  {
    number: "20",
    title: "Морфний індикатор bottom-nav",
    subtitle: "Ковзний pill замість статичної glow-тіні на активній іконці.",
    before: <Nav20Before />,
    after: <Nav20After />,
    beforeHint: "тапни вкладку",
    afterHint: "тапни вкладку",
  },
];

export function UiMockupsPage() {
  return (
    <div className="min-h-dvh" style={{ background: "rgb(var(--c-bg))" }}>
      <style>{KEYFRAMES}</style>

      <header
        className="sticky top-0 z-40 backdrop-blur-md border-b"
        style={{
          background: "rgb(var(--c-panel) / 0.9)",
          borderColor: "rgb(var(--c-line))",
        }}
      >
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center gap-2">
          <h1 className="font-extrabold" style={{ color: "rgb(var(--c-text))" }}>
            UI Mockups
          </h1>
          <span className="text-xs" style={{ color: "rgb(var(--c-muted))" }}>
            зараз / може бути · мобільний PWA · для узгодження
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <p
          className="text-sm leading-relaxed mb-8 rounded-xl p-4"
          style={{
            background: "rgb(var(--c-panel))",
            color: "rgb(var(--c-muted))",
            boxShadow: "var(--shadow-e1)",
          }}
        >
          Інтерактивні прев'ю. Мокапи навмисно спрощені (лише токени дизайн-системи,
          без реальних даних), щоб показати ідею. Дій за підказками справа вгорі
          кожної картки. Це не фінальна імплементація — скажи, які брати в роботу.
        </p>

        <div className="space-y-14">
          {SECTIONS.map((s) => (
            <section key={s.number}>
              <SectionHeader number={s.number} title={s.title} subtitle={s.subtitle} />
              <CompareRow>
                <CompareCard side="before" hint={s.beforeHint}>
                  {s.before}
                </CompareCard>
                <CompareCard side="after" hint={s.afterHint}>
                  {s.after}
                </CompareCard>
              </CompareRow>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export default UiMockupsPage;
