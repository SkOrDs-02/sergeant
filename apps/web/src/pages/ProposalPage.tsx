/**
 * Proposal Page — інтерактивна візуалізація «До / Після» для 6 запропонованих
 * покращень UI/UX веб-апки Sergeant.
 *
 * Route: /proposal  (внутрішня сторінка для обговорення, не лінкується з навігації)
 *
 * Це ДЕМО. Жоден реальний екран апки тут не змінюється — кожен блок відтворює
 * поточний стан ліворуч і запропонований праворуч, використовуючи ті самі
 * дизайн-токени (`rgb(var(--c-*))`), що й продакшн-екрани.
 */

import { useEffect, useRef, useState } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { EmptyListIllustration } from "@assets/illustrations";

/* ─── дрібні хелпери (той самий патерн, що в UiAuditPage) ─────────────────── */

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
  why,
}: {
  number: string;
  title: string;
  subtitle: string;
  why: string;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-start gap-4">
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
      <div
        className="mt-3 ml-14 text-sm leading-relaxed rounded-xl px-4 py-3"
        style={{
          background: "rgb(var(--c-panel-hi))",
          color: "rgb(var(--c-muted))",
          border: "1px solid rgb(var(--c-line))",
        }}
      >
        <span className="font-semibold" style={{ color: "rgb(var(--c-text))" }}>
          Навіщо:{" "}
        </span>
        {why}
      </div>
    </div>
  );
}

function CompareRow({
  before,
  after,
}: {
  before: React.ReactNode;
  after: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 ml-0 md:ml-14">
      <CompareCard side="before">{before}</CompareCard>
      <CompareCard side="after">{after}</CompareCard>
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
      className="rounded-2xl overflow-hidden"
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
          borderColor: side === "before" ? "rgb(252 165 165)" : "rgb(167 243 208)",
        }}
      >
        <div
          className="w-2 h-2 rounded-full"
          style={{ background: side === "before" ? "rgb(239 68 68)" : "rgb(34 197 94)" }}
        />
        <Badge label={side === "before" ? "Зараз" : "Пропозиція"} variant={side} />
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

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
        width: 230,
        height,
        background: "rgb(var(--c-bg))",
        border: "2.5px solid rgb(var(--c-line))",
        boxShadow: "var(--shadow-e2)",
      }}
    >
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-5 rounded-b-xl z-20"
        style={{ background: "rgb(var(--c-line))" }}
      />
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   1 — Персистенція скролу й активного модуля між вкладками
   ══════════════════════════════════════════════════════════════════════════ */

function TabsDemo({ persist }: { persist: boolean }) {
  const tabs = ["Головна", "Звіти", "Профіль"];
  const [active, setActive] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const saved = useRef<Record<number, number>>({});

  // при зміні вкладки: persist → відновлюємо збережений scrollTop, інакше 0
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = persist ? (saved.current[active] ?? 0) : 0;
  }, [active, persist]);

  const handleScroll = () => {
    if (persist && scrollRef.current) {
      saved.current[active] = scrollRef.current.scrollTop;
    }
  };

  return (
    <PhoneFrame height={360}>
      <div className="flex flex-col h-full pt-6">
        <div className="px-3 py-2 text-xs font-bold" style={{ color: "rgb(var(--c-text))" }}>
          {tabs[active]}
        </div>
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-3 space-y-2 pb-3"
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl px-3 py-2 text-xs flex items-center gap-2"
              style={{
                background: "rgb(var(--c-panel))",
                boxShadow: "var(--shadow-e1)",
                color: "rgb(var(--c-muted))",
              }}
            >
              <span
                className="w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[10px]"
                style={{ background: "rgb(var(--c-panel-hi))", color: "rgb(var(--c-text))" }}
              >
                {i + 1}
              </span>
              Рядок {i + 1}
            </div>
          ))}
        </div>
        <div
          className="flex border-t"
          style={{ borderColor: "rgb(var(--c-line))", background: "rgb(var(--c-panel))" }}
        >
          {tabs.map((t, i) => (
            <button
              key={t}
              type="button"
              onClick={() => setActive(i)}
              className="flex-1 py-2.5 text-[10px] font-semibold transition-colors"
              style={{
                color: active === i ? "rgb(var(--c-text))" : "rgb(var(--c-subtle))",
                borderTop: active === i ? "2px solid rgb(var(--c-text))" : "2px solid transparent",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </PhoneFrame>
  );
}

function Section1() {
  return (
    <section>
      <SectionHeader
        number="1"
        title="Персистенція скролу та активного модуля"
        subtitle="Спробуй: прокрути список, перемкни вкладку і повернись назад."
        why="Трекер відкривають десятки разів на день. Зараз кожне перемикання вкладки скидає скрол угору — доводиться щоразу шукати те місце, де ти був. Збереження позиції прибирає цю мікрофрустрацію і зменшує когнітивне навантаження."
      />
      <CompareRow
        before={
          <div>
            <p className="text-xs mb-3" style={{ color: "rgb(var(--c-muted))" }}>
              Прокрути вниз → «Профіль» → назад: список стрибає на початок.
            </p>
            <TabsDemo persist={false} />
          </div>
        }
        after={
          <div>
            <p className="text-xs mb-3" style={{ color: "rgb(var(--c-muted))" }}>
              Той самий шлях: список повертається туди, де ти зупинився.
            </p>
            <TabsDemo persist />
          </div>
        }
      />
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   2 — Проактивні інсайти в actionable-форму
   ══════════════════════════════════════════════════════════════════════════ */

function InsightCard({ actionable }: { actionable: boolean }) {
  const [done, setDone] = useState<string | null>(null);

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: "rgb(var(--c-panel))", boxShadow: "var(--shadow-e1)" }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgb(240 253 250)", color: "rgb(17 94 89)" }}
        >
          <Icon name="trending-up" size="md" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold mb-1" style={{ color: "rgb(var(--c-text))" }}>
            Витрати на їжу зросли на 22%
          </p>
          <p className="text-xs leading-relaxed" style={{ color: "rgb(var(--c-muted))" }}>
            Цього тижня ти витратив ₴1 240 на кафе й доставку — на ₴280 більше,
            ніж минулого.
          </p>
        </div>
      </div>

      {actionable && (
        <div className="mt-3 flex flex-wrap gap-2">
          {done ? (
            <div
              className="w-full rounded-xl px-3 py-2 text-xs font-semibold flex items-center gap-2"
              style={{ background: "rgb(209 250 229)", color: "rgb(4 120 87)" }}
            >
              <Icon name="check-circle" size="sm" />
              {done}
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setDone("Ліміт ₴1 000/тиждень встановлено")}
                className="px-3 py-2 rounded-xl text-xs font-semibold transition-transform active:scale-95"
                style={{ background: "rgb(var(--c-text))", color: "rgb(var(--c-bg))" }}
              >
                Встановити ліміт
              </button>
              <button
                type="button"
                onClick={() => setDone("Відкриваю чат з асистентом…")}
                className="px-3 py-2 rounded-xl text-xs font-semibold transition-transform active:scale-95"
                style={{
                  background: "rgb(var(--c-panel-hi))",
                  color: "rgb(var(--c-text))",
                  border: "1px solid rgb(var(--c-line))",
                }}
              >
                Запитати AI
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Section2() {
  return (
    <section>
      <SectionHeader
        number="2"
        title="Проактивні інсайти → одна дія"
        subtitle="Той самий інсайт, але з кнопкою дії. Натисни."
        why="Зараз інсайти (дайджест тижня, фокус дня, порада коуча) — це переважно текст, який просто читаєш. Одна пряма дія в кожному інсайті замикає петлю «побачив → зробив» прямо на місці, без ручного пошуку потрібного екрана."
      />
      <CompareRow
        before={
          <div>
            <p className="text-xs mb-3" style={{ color: "rgb(var(--c-muted))" }}>
              Тільки текст — далі шукай, що з цим робити, вручну.
            </p>
            <InsightCard actionable={false} />
          </div>
        }
        after={
          <div>
            <p className="text-xs mb-3" style={{ color: "rgb(var(--c-muted))" }}>
              Дія прямо в картці: ліміт або питання до асистента.
            </p>
            <InsightCard actionable />
          </div>
        }
      />
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   3 — Тактильні мікровзаємодії в межах дизайн-бюджету
   ══════════════════════════════════════════════════════════════════════════ */

function TapCard({ tactile, label }: { tactile: boolean; label: string }) {
  return (
    <button
      type="button"
      className={
        "w-full rounded-2xl p-4 text-left " +
        (tactile
          ? "transition-transform duration-150 ease-out active:scale-[0.97] hover:-translate-y-0.5"
          : "")
      }
      style={{ background: "rgb(var(--c-panel))", boxShadow: "var(--shadow-e1)" }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: "rgb(240 253 250)", color: "rgb(17 94 89)" }}
        >
          <Icon name="credit-card" size="md" />
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: "rgb(var(--c-text))" }}>
            {label}
          </p>
          <p className="text-xs" style={{ color: "rgb(var(--c-muted))" }}>
            Натисни й потримай
          </p>
        </div>
      </div>
    </button>
  );
}

function Section3() {
  const [key, setKey] = useState(0);
  return (
    <section>
      <SectionHeader
        number="3"
        title="Тактильні мікровзаємодії"
        subtitle="Натисни картки праворуч — вони «пружинять». Ліворуч реакції немає."
        why="Дизайн-бюджет дозволяє максимум 2 одночасні анімації на transform/opacity, без bounce. Зараз руху майже немає, тож апка відчувається статичною. Легкий active:scale і плавна поява карток дають нативне «живе» відчуття без порушення правил продуктивності."
      />
      <CompareRow
        before={
          <div className="space-y-2.5">
            <p className="text-xs mb-1" style={{ color: "rgb(var(--c-muted))" }}>
              Без реакції на дотик — плоско.
            </p>
            <TapCard tactile={false} label="Гаманець" />
            <TapCard tactile={false} label="Бюджет" />
          </div>
        }
        after={
          <div className="space-y-2.5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs" style={{ color: "rgb(var(--c-muted))" }}>
                Press-feedback + поява зі стаггером.
              </p>
              <button
                type="button"
                onClick={() => setKey((k) => k + 1)}
                className="text-[11px] font-semibold px-2 py-1 rounded-lg transition-transform active:scale-95"
                style={{ background: "rgb(var(--c-panel-hi))", color: "rgb(var(--c-text))" }}
              >
                ↻ Знову
              </button>
            </div>
            <div key={key} className="space-y-2.5">
              {["Гаманець", "Бюджет"].map((l, i) => (
                <div
                  key={l}
                  style={{
                    animation: `proposalRise 420ms ${i * 90}ms cubic-bezier(0.22,1,0.36,1) both`,
                  }}
                >
                  <TapCard tactile label={l} />
                </div>
              ))}
            </div>
          </div>
        }
      />
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   4 — Змістовний heatmap / градація в звітах
   ══════════════════════════════════════════════════════════════════════════ */

function HabitHeatmap() {
  // 7 стовпців (дні) × 5 рядків (тижні), інтенсивність 0..3
  const data = [
    [3, 2, 3, 1, 3, 0, 2],
    [2, 3, 3, 2, 1, 3, 3],
    [1, 0, 2, 3, 3, 2, 1],
    [3, 3, 1, 2, 0, 3, 2],
    [2, 3, 3, 3, 2, 1, 3],
  ];
  const tint = (v: number) =>
    v === 0
      ? "rgb(var(--c-panel-hi))"
      : `rgba(17,94,89,${0.28 + v * 0.24})`;
  return (
    <div className="flex flex-col gap-1">
      {data.map((week, r) => (
        <div key={r} className="flex gap-1">
          {week.map((v, c) => (
            <div
              key={c}
              className="w-5 h-5 rounded-[5px]"
              style={{ background: tint(v), border: "1px solid rgb(var(--c-line))" }}
              title={`Рівень ${v}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function MacroRing({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = Math.min(1, value / total);
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgb(var(--c-panel-hi))" strokeWidth="7" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform="rotate(-90 32 32)"
        />
        <text x="32" y="36" textAnchor="middle" fontSize="12" fontWeight="700" fill="rgb(var(--c-text))">
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <span className="text-[10px] font-semibold" style={{ color: "rgb(var(--c-muted))" }}>
        {label}
      </span>
    </div>
  );
}

function Section4() {
  return (
    <section>
      <SectionHeader
        number="4"
        title="Звіти: heatmap і кільця замість плоских списків"
        subtitle="Дані, які читаються за секунду, а не рядок за рядком."
        why="Звіти — головна цінність трекера. Плоский список «5/7 виконано» не показує патерн. Календарний heatmap звичок і кільця макронутрієнтів (kcal/білки/жири/вуглеводи вже є в токенах) роблять прогрес миттєво читабельним і мотивуючим."
      />
      <CompareRow
        before={
          <div className="space-y-2">
            <p className="text-xs mb-2 font-semibold" style={{ color: "rgb(var(--c-text))" }}>
              Звички за місяць
            </p>
            {[
              ["Ранкова зарядка", "18/30"],
              ["Читання", "22/30"],
              ["Без цукру", "12/30"],
              ["Вода 2л", "25/30"],
            ].map(([name, val]) => (
              <div
                key={name}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-xs"
                style={{ background: "rgb(var(--c-panel-hi))", color: "rgb(var(--c-muted))" }}
              >
                <span>{name}</span>
                <span className="font-bold" style={{ color: "rgb(var(--c-text))" }}>
                  {val}
                </span>
              </div>
            ))}
          </div>
        }
        after={
          <div className="space-y-4">
            <div>
              <p className="text-xs mb-2 font-semibold" style={{ color: "rgb(var(--c-text))" }}>
                Ранкова зарядка · 5 тижнів
              </p>
              <HabitHeatmap />
            </div>
            <div>
              <p className="text-xs mb-2 font-semibold" style={{ color: "rgb(var(--c-text))" }}>
                Макроси сьогодні
              </p>
              <div className="flex justify-between">
                <MacroRing label="Ккал" value={1650} total={2000} color="rgb(86 124 15)" />
                <MacroRing label="Білки" value={90} total={120} color="rgb(17 94 89)" />
                <MacroRing label="Жири" value={55} total={70} color="rgb(194 58 58)" />
                <MacroRing label="Вугл." value={180} total={250} color="rgb(14 116 144)" />
              </div>
            </div>
          </div>
        }
      />
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   5 — Поліш темної теми «Чорнило»: глибина через glow, не тіні
   ══════════════════════════════════════════════════════════════════════════ */

function DarkStage({ children }: { children: React.ReactNode }) {
  // примусово-темне тло незалежно від теми апки, щоб показати «Чорнило»
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "rgb(10 15 13)", border: "1px solid rgb(28 38 33)" }}
    >
      {children}
    </div>
  );
}

function Section5() {
  return (
    <section>
      <SectionHeader
        number="5"
        title="Темна тема «Чорнило»: глибина через glow"
        subtitle="Обидва блоки — в темному режимі. Праворуч — акцент-бордер і м'який glow."
        why="Специфікація теми прямо описує глибину через tint + accent-border + accent-glow, а не важкі тіні (на темному тлі тіні не видно). Активні/акцентні елементи легко недотиснути до плоскої заливки — glow робить їх фірмово об'ємними."
      />
      <CompareRow
        before={
          <DarkStage>
            <p className="text-xs mb-3" style={{ color: "rgb(148 163 179)" }}>
              Плоска заливка, тінь на темному не читається.
            </p>
            <div className="space-y-3">
              <div
                className="rounded-2xl p-3"
                style={{ background: "rgb(20 28 24)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: "rgb(16 185 129)", color: "#04140f" }}
                  >
                    <Icon name="credit-card" size="sm" />
                  </div>
                  <span className="text-sm font-bold" style={{ color: "rgb(237 242 240)" }}>
                    Баланс
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="w-full py-2.5 rounded-xl text-sm font-bold"
                style={{ background: "rgb(16 185 129)", color: "#04140f" }}
              >
                Додати запис
              </button>
            </div>
          </DarkStage>
        }
        after={
          <DarkStage>
            <p className="text-xs mb-3" style={{ color: "rgb(148 163 179)" }}>
              Tint + accent-border + м'який glow = об'єм на темному.
            </p>
            <div className="space-y-3">
              <div
                className="rounded-2xl p-3"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(45,212,191,0.12), rgba(20,28,24,0.4))",
                  border: "1px solid rgba(45,212,191,0.35)",
                  boxShadow: "0 0 0 1px rgba(45,212,191,0.15), 0 0 24px rgba(45,212,191,0.18)",
                }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{
                      background: "rgba(45,212,191,0.18)",
                      color: "rgb(94 234 212)",
                      boxShadow: "0 0 12px rgba(45,212,191,0.4)",
                    }}
                  >
                    <Icon name="credit-card" size="sm" />
                  </div>
                  <span className="text-sm font-bold" style={{ color: "rgb(237 242 240)" }}>
                    Баланс
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="w-full py-2.5 rounded-xl text-sm font-bold transition-transform active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, rgb(45 212 191), rgb(20 184 166))",
                  color: "#04140f",
                  boxShadow: "0 0 20px rgba(45,212,191,0.35)",
                }}
              >
                Додати запис
              </button>
            </div>
          </DarkStage>
        }
      />
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   6 — Ілюстрації для empty-states і онбордингу
   ══════════════════════════════════════════════════════════════════════════ */

function Section6() {
  return (
    <section>
      <SectionHeader
        number="6"
        title="Ілюстрації для порожніх станів"
        subtitle="Дружній empty-state замість сухого «Немає даних»."
        why="У проєкті вже є набір token-aware ілюстрацій (assets/illustrations), але порожні екрани часто показують лише текст. Тепла ілюстрація на порожньому дашборді, у звітах без даних і в кінці онбордингу задає емоційний тон бренду (як Duolingo/Yazio) значно краще за голий рядок."
      />
      <CompareRow
        before={
          <div
            className="flex flex-col items-center justify-center text-center gap-2 py-10 rounded-xl"
            style={{ background: "rgb(var(--c-panel-hi))" }}
          >
            <p className="text-sm font-semibold" style={{ color: "rgb(var(--c-text))" }}>
              Немає даних
            </p>
            <p className="text-xs" style={{ color: "rgb(var(--c-muted))" }}>
              Список порожній
            </p>
          </div>
        }
        after={
          <div className="flex flex-col items-center justify-center text-center gap-3 py-6">
            <EmptyListIllustration size={150} className="text-finyk" />
            <div>
              <p className="text-sm font-bold mb-1" style={{ color: "rgb(var(--c-text))" }}>
                Поки що порожньо
              </p>
              <p className="text-xs leading-relaxed max-w-[220px]" style={{ color: "rgb(var(--c-muted))" }}>
                Додай першу транзакцію — і тут з'явиться твій аналіз витрат за
                тиждень.
              </p>
            </div>
            <button
              type="button"
              className="px-4 py-2 rounded-xl text-xs font-semibold transition-transform active:scale-95"
              style={{ background: "rgb(var(--c-text))", color: "rgb(var(--c-bg))" }}
            >
              Додати запис
            </button>
          </div>
        }
      />
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGE
   ══════════════════════════════════════════════════════════════════════════ */

export function ProposalPage() {
  return (
    <div className="min-h-screen" style={{ background: "rgb(var(--c-bg))" }}>
      <style>{`
        @keyframes proposalRise {
          from { opacity: 0; transform: translateY(14px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div className="max-w-4xl mx-auto px-4 py-10 sm:px-6">
        <header className="mb-10">
          <p
            className="text-xs font-bold uppercase tracking-widest mb-2"
            style={{ color: "rgb(var(--c-muted))" }}
          >
            UI / UX · до-після
          </p>
          <h1 className="text-3xl font-black mb-2" style={{ color: "rgb(var(--c-text))" }}>
            6 покращень веб-апки
          </h1>
          <p className="text-sm leading-relaxed max-w-2xl" style={{ color: "rgb(var(--c-muted))" }}>
            Інтерактивна візуалізація запропонованих змін. Ліворуч — поточний
            стан, праворуч — пропозиція. Блоки живі: тисни кнопки, гортай списки,
            натискай картки. Реальні екрани апки не змінені — це чернетка для
            обговорення.
          </p>
        </header>

        <div className="space-y-14">
          <Section1 />
          <Section2 />
          <Section3 />
          <Section4 />
          <Section5 />
          <Section6 />
        </div>

        <footer
          className="mt-16 pt-6 text-xs"
          style={{ borderTop: "1px solid rgb(var(--c-line))", color: "rgb(var(--c-subtle))" }}
        >
          Скажи, які з 6 пунктів беремо в роботу — і я реалізую їх на реальних
          екранах.
        </footer>
      </div>
    </div>
  );
}
