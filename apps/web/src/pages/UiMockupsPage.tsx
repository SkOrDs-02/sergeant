/* eslint-disable sergeant-design/no-cyrillic-jsx-literal -- Developer-only comparison mockups keep review copy beside each visual variant. */
/**
 * UI Mockups Page — раунд 3.
 *
 *   #13 — роздільники списку транзакцій. Групування по днях УЖЕ реалізовано
 *         (sticky `TransactionDayHeader`: chevron + лічильник + денний підсумок,
 *         усе в одній зовнішній картці з зеброю). Псує саме зебра + пласка
 *         подача. Тут — «Зараз» (реалістично) + 2 гібриди між «день-картка» (A)
 *         і «рядок-картка» (C), які ПОКРАЩУЮТЬ наявний групувальник.
 *   #20 — індикатор активної вкладки bottom-nav. Обрано ВАРІАНТ C
 *         (pill навколо іконки активної вкладки + лейбл лише в активної).
 *
 * Route: /ui-mockups  (dev/internal only, не лінкується з основної навігації).
 * Лише дизайн-токени (`rgb(var(--c-*))`), без нових залежностей. Це прев'ю для
 * узгодження, а не фінальна імплементація у відповідних компонентах.
 */

import { NavNowGlow, NavVarIconPill } from "./UiMockupsNav";

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
          className="text-style-title leading-tight mb-1"
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
 *  обраний (зелена рамка). */
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
            className="ml-auto text-style-caption"
            style={{ color: "rgb(var(--c-muted))" }}
          >
            {hint}
          </span>
        ) : null}
      </div>
      <div className="p-5">{children}</div>
      {note ? (
        <p
          className="px-5 pb-4 -mt-2 text-xs leading-relaxed"
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
  height = 380,
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
        className="text-style-eyebrow"
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
const DAY_COUNT: Record<string, number> = { Сьогодні: 2, Вчора: 3 };

/** семантичний колір-токен на категорію (тонкий акцент у гібридах) */
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

/** Реалістичний sticky-заголовок дня (як наявний TransactionDayHeader). */
function DayHeaderRow({ day, filled }: { day: string; filled?: boolean }) {
  const positive = (DAY_TOTAL[day] ?? "").startsWith("+");
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1.5"
      style={{
        background: filled ? "rgb(var(--c-panel-hi))" : "transparent",
        borderBottom: filled ? "none" : "1px solid rgb(var(--c-line))",
      }}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        style={{ color: "rgb(var(--c-muted))" }}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
      <span
        className="text-style-eyebrow"
        style={{ color: "rgb(var(--c-text))" }}
      >
        {day}
      </span>
      <span
        className="text-xs font-semibold tabular-nums"
        style={{ color: "rgb(var(--c-muted))" }}
      >
        · {DAY_COUNT[day]}
      </span>
      <span
        className="ml-auto text-xs font-bold tabular-nums"
        style={{
          color: positive ? "rgb(var(--c-success))" : "rgb(var(--c-text))",
          fontFamily: "var(--font-mono, monospace)",
        }}
      >
        {DAY_TOTAL[day]}
      </span>
    </div>
  );
}

/* ── #13 · Зараз: одна картка + sticky-заголовки днів + зебра ────────────── */
function TxNowZebra() {
  return (
    <PhoneFrame>
      <FakeHeader title="Транзакції" />
      <div className="px-3">
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgb(var(--c-line) / 0.4)" }}
        >
          {DAYS.map((day) => {
            const rows = TX.filter((t) => t.day === day);
            return (
              <div key={day}>
                <DayHeaderRow day={day} />
                {rows.map((tx, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 py-2 px-2.5"
                    style={{
                      // зебра — те, що псує вигляд
                      background:
                        i % 2 === 1
                          ? "rgb(var(--c-panel-hi) / 0.5)"
                          : "transparent",
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-xl shrink-0"
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
                        className="text-xs"
                        style={{ color: "rgb(var(--c-subtle))" }}
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
      </div>
    </PhoneFrame>
  );
}

/* ── #13 · Гібрид 1: день-панель + inset-hairlines + акцент категорії ────── */
/*    Ближче до A: кожен день — заповнена м'яка панель-картка. Наявний
 *    заголовок лишається всередині панелі. Рядки розділені відступленими
 *    (inset) волосяними лініями, тонкий кольоровий акцент категорії. */
function TxHybridInset() {
  return (
    <PhoneFrame>
      <FakeHeader title="Транзакції" />
      <div className="px-3 space-y-2.5">
        {DAYS.map((day) => {
          const rows = TX.filter((t) => t.day === day);
          return (
            <div
              key={day}
              className="rounded-2xl overflow-hidden"
              style={{
                background: "rgb(var(--c-panel))",
                border: "1px solid rgb(var(--c-line) / 0.7)",
                boxShadow: "var(--shadow-e1)",
              }}
            >
              <DayHeaderRow day={day} filled />
              <div className="px-1">
                {rows.map((tx, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 py-2 pl-1.5 pr-2"
                    style={{
                      // inset-лінія: починається після іконки, не «на всю»
                      borderTop:
                        i === 0
                          ? "none"
                          : "1px solid rgb(var(--c-line) / 0.55)",
                      marginLeft: i === 0 ? 0 : 38,
                      paddingLeft: 0,
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-xl shrink-0 flex items-center justify-center"
                      style={{
                        background: `rgb(${catColor(tx.c)} / 0.14)`,
                        marginLeft: i === 0 ? 0 : -38,
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
                        className="text-style-caption"
                        style={{ color: `rgb(${catColor(tx.c)})` }}
                      >
                        {tx.c}
                      </p>
                    </div>
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

/* ── #13 · Гібрид 2: день-панель + рядки-таблетки ───────────────────────── */
/*    Ближче до C: та сама день-панель із заголовком, але рядки — окремі
 *    м'які «таблетки» з невеликими проміжками всередині панелі. Тактильність
 *    C без повного відриву в окремі картки; групування дня збережене. */
function TxHybridPills() {
  return (
    <PhoneFrame>
      <FakeHeader title="Транзакції" />
      <div className="px-3 space-y-2.5">
        {DAYS.map((day) => {
          const rows = TX.filter((t) => t.day === day);
          return (
            <div
              key={day}
              className="rounded-2xl overflow-hidden"
              style={{
                background: "rgb(var(--c-panel-hi) / 0.45)",
                border: "1px solid rgb(var(--c-line) / 0.7)",
                boxShadow: "var(--shadow-e1)",
              }}
            >
              <DayHeaderRow day={day} filled />
              <div className="p-1.5 flex flex-col gap-1.5">
                {rows.map((tx, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 py-1.5 px-2 rounded-xl"
                    style={{
                      background: "rgb(var(--c-panel))",
                      border: "1px solid rgb(var(--c-line) / 0.4)",
                    }}
                  >
                    <div
                      className="w-6 h-6 rounded-xl shrink-0 flex items-center justify-center"
                      style={{ background: `rgb(${catColor(tx.c)} / 0.14)` }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: `rgb(${catColor(tx.c)})` }}
                      />
                    </div>
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
          <h1
            className="font-extrabold"
            style={{ color: "rgb(var(--c-text))" }}
          >
            UI Mockups · раунд 3
          </h1>
          <span className="text-xs" style={{ color: "rgb(var(--c-muted))" }}>
            #13 гібриди · #20 обраний варіант · мобільний PWA
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
          #13 — уточнення: групування по днях{" "}
          <strong style={{ color: "rgb(var(--c-text))" }}>уже є</strong>{" "}
          (sticky-заголовок з лічильником і денним підсумком). Псує саме зебра +
          все в одній пласкій картці. Нижче — «Зараз» реалістично + 2 гібриди
          між «день-картка» (A) і «рядок-картка» (C). #20 — обрано варіант C.
        </p>

        {/* ── #13 ─────────────────────────────────────────────────────── */}
        <section className="mb-14">
          <SectionHeader
            number="13"
            title="Роздільники списку транзакцій"
            subtitle="Покращуємо наявний групувальник по днях. Гібрид між A і C."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <VariantCard
              tone="now"
              label="Зараз · одна картка + зебра"
              note="Групування по днях уже є (заголовок з лічильником + підсумок). Але зебра-фон шумить, а всі дні злиті в одну пласку картку без повітря."
            >
              <TxNowZebra />
            </VariantCard>
            <VariantCard
              tone="option"
              label="Гібрид 1 · день-панель + inset-лінії"
              note="Ближче до A: кожен день — заповнена м'яка панель із наявним заголовком. Рядки розділені відступленими волосяними лініями + тонкий кольоровий акцент категорії. Повітря між днями."
            >
              <TxHybridInset />
            </VariantCard>
            <VariantCard
              tone="option"
              label="Гібрид 2 · день-панель + рядки-таблетки"
              note="Ближче до C: та сама день-панель, але рядки — окремі м'які таблетки з проміжками. Тактильність C без повного відриву; групування дня збережене."
            >
              <TxHybridPills />
            </VariantCard>
          </div>
        </section>

        {/* ── #20 ─────────────────────────────────────────────────────── */}
        <section>
          <SectionHeader
            number="20"
            title="Індикатор активної вкладки bottom-nav"
            subtitle="Обрано варіант C. Тапай вкладки, щоб побачити рух pill + лейбла."
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
              tone="pick"
              label="Варіант C · ОБРАНО"
              hint="тапни вкладку"
              note="Pill обгортає іконку активної вкладки, лейбл показується лише в неї (неактивні — самі іконки). Ощадливо за місцем, чіткий фокус, сучасний iOS-стиль."
            >
              <NavVarIconPill />
            </VariantCard>
          </div>
        </section>
      </div>
    </div>
  );
}
