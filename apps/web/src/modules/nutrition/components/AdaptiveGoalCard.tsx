import { useState } from "react";

import { useLocale } from "@shared/i18n/useLocale";
import type { AdaptiveGoalState } from "../hooks/useAdaptiveNutritionGoal";
import { MyNormSheet } from "./MyNormSheet";

interface AdaptiveGoalCardProps {
  state: AdaptiveGoalState;
}

/**
 * Скільки днів після перерахунку показуємо підставу зміни цілі.
 *
 * Тут стикаються два правильні рішення, і window їх мирить. Рішення
 * 2026-09-11: «увімкнено й рахує» НЕ потребує картки на кожен день —
 * постійний рядок про те, що все гаразд, це шум, і саме тому `active`
 * рендерив `null`. Вимога спеки: «людина бачить, що ціль змінилась, і
 * чому саме» — без підпису перерахунок читається як свавілля
 * застосунку.
 *
 * Суперечність тут позірна: шумом є ПОСТІЙНА картка, а не пояснення
 * події. Тож показуємо рівно навколо події й замовкаємо. Перерахунок
 * тижневий, тож три дні — менше половини циклу: підпис завжди застає
 * зміну і ніколи не стає меблями.
 */
const EXPLAIN_WINDOW_DAYS = 3;

function withinExplainWindow(lastUpdatedAt: string | null): boolean {
  if (!lastUpdatedAt) return false;
  const ts = Date.parse(lastUpdatedAt);
  if (Number.isNaN(ts)) return false;
  const ageMs = Date.now() - ts;
  // Майбутня дата (перекошений годинник пристрою) — не привід ховати
  // підпис: вікно рахуємо за модулем.
  return Math.abs(ageMs) <= EXPLAIN_WINDOW_DAYS * 86_400_000;
}

/**
 * `−0,4` / `+0,3` — знак несе сенс, тож показуємо його завжди.
 *
 * Кома жорстко, не через `Intl.NumberFormat(locale)`, і це навмисно:
 * `en.ts` не має топ-рівневої групи `nutrition`, а контракт злиття
 * каталогів — shallow по групах (`i18n/index.ts`). Тобто ВЕСЬ цей текст
 * лишається українським за будь-якої локалі, і «0.4» усередині
 * української фрази виглядало б чужорідно.
 *
 * Додаси `nutrition` в `en.ts` — поверни сюди локаль.
 */
function formatDeltaKg(deltaKg: number): string {
  const rounded = Math.round(deltaKg * 10) / 10;
  // `Object.is` відрізняє −0 від 0: без цього «−0,0» лишало б знак мінус
  // там, де зміни немає.
  const safe = Object.is(rounded, -0) ? 0 : rounded;
  const sign = safe > 0 ? "+" : safe < 0 ? "−" : "";
  return `${sign}${Math.abs(safe).toFixed(1).replace(".", ",")}`;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? (values[key] ?? whole) : whole,
  );
}

/**
 * Дашборд показує рядок лише тоді, коли є що сказати: `disabled` мовчить
 * завжди, `active` — лише в вікні після зміни цілі (див. вище).
 * `calibrating` і `profile-needed` лишаються компактним інформаційним
 * рядком (не повною Card), бо це стани, де людині справді може
 * знадобитись дія.
 */
export function AdaptiveGoalCard({ state }: AdaptiveGoalCardProps) {
  const { messages } = useLocale();
  const t = messages.nutrition.adaptiveGoal;
  const [normOpen, setNormOpen] = useState(false);

  if (state.mode === "disabled") return null;

  const reason = state.lastReason;
  const justChanged =
    state.mode === "active" &&
    reason != null &&
    withinExplainWindow(state.lastUpdatedAt);

  if (state.mode === "active" && !justChanged) return null;

  const heading = justChanged ? t.changedHeading : t.heading;

  const text =
    state.mode === "profile-needed"
      ? "Додай вагу, зріст, дату народження, стать і рівень активності."
      : justChanged && reason
        ? fill(t.reason, {
            intake: String(Math.round(reason.averageIntakeKcal)),
            delta: formatDeltaKg(reason.weightDeltaKg),
            tdee: String(Math.round(reason.tdeeKcal)),
          })
        : `Калібрую за журналом: ${state.completeDays}/10 повних днів і ${state.weightPoints}/4 зважувань.`;

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2">
      <div className="min-w-0">
        <div className="text-style-label text-text">{heading}</div>
        <p className="mt-1 text-style-caption text-muted">{text}</p>
        {justChanged && reason && (
          <p className="mt-0.5 text-style-caption text-text">
            {fill(t.goalNow, { kcal: String(Math.round(reason.goalKcal)) })}
          </p>
        )}
      </div>
      {/* Відкриває аркуш «Моя норма» тут-таки в Їжі: /profile для гостя
          веде на вхід, а біометрика локальна і працює без акаунта. */}
      {state.mode === "profile-needed" && (
        <>
          <button
            type="button"
            onClick={() => setNormOpen(true)}
            className="shrink-0 inline-flex items-center pointer-coarse:min-h-[44px] text-style-caption text-nutrition-strong dark:text-nutrition focus:outline-none focus-visible:ring-2 focus-visible:ring-nutrition/60"
          >
            {t.edit}
          </button>
          <MyNormSheet open={normOpen} onClose={() => setNormOpen(false)} />
        </>
      )}
    </div>
  );
}
