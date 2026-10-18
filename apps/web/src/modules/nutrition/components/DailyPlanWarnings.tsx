/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import type { Dispatch, SetStateAction } from "react";
import { Notice } from "@shared/components/ui/Notice";
import {
  ATWATER_KCAL_PER_G,
  type NutritionPrefs,
} from "@sergeant/nutrition-domain";
import {
  calcGoalRangeIssues,
  calcMacroKcalMismatch,
} from "../lib/dailyPlanValidation";

// Дрібна дія в рядку (мова H): контур 1 px, радіус 7, чорнило.
const SMALL_ACTION =
  "inline-flex h-9 items-center rounded-[7px] border border-line px-3 text-style-label font-semibold text-text hover:bg-line/40 focus-ring disabled:opacity-50";

interface MacroKcalWarningProps {
  prefs: NutritionPrefs;
  setPrefs: Dispatch<SetStateAction<NutritionPrefs>>;
  busy?: boolean | undefined;
}

export function MacroKcalWarning({
  prefs,
  setPrefs,
  busy,
}: MacroKcalWarningProps) {
  const mismatch = calcMacroKcalMismatch(prefs);
  if (!mismatch) return null;

  const { kind, target, calc, diff } = mismatch;
  const absDiff = Math.abs(diff);
  const overshoot = kind === "over";

  return (
    <Notice
      tone="ink"
      role="status"
      aria-live="polite"
      className="text-style-caption space-y-2"
      data-testid="macro-kcal-warning"
    >
      <p className="leading-snug">
        {overshoot ? (
          <>
            Сума макро виходить на <strong>{calc} ккал</strong>, це на{" "}
            <strong>{absDiff} ккал</strong> більше за ціль{" "}
            <strong>{target} ккал</strong>. 1 г білка = 4 ккал, 1 г жиру = 9
            ккал, 1 г вуглеводів = 4 ккал.
          </>
        ) : (
          <>
            Сума макро дає лише <strong>{calc} ккал</strong>, це на{" "}
            <strong>{absDiff} ккал</strong> менше за ціль{" "}
            <strong>{target} ккал</strong>.
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => setPrefs((p) => ({ ...p, dailyTargetKcal: calc }))}
          className={SMALL_ACTION}
        >
          Перерахувати ккал → {calc}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            setPrefs((p) => ({
              ...p,
              dailyTargetProtein_g: null,
              dailyTargetFat_g: null,
              dailyTargetCarbs_g: null,
            }))
          }
          className={SMALL_ACTION}
        >
          Скинути макро
        </button>
      </div>
    </Notice>
  );
}

interface MissingMacrosHintProps {
  prefs: NutritionPrefs;
  setPrefs: Dispatch<SetStateAction<NutritionPrefs>>;
  busy?: boolean | undefined;
}

/**
 * Користувач у фідбеку 2026-05 (UX-roast §3.3): «коли вводить ккал
 * воно підставляло середні стартові значення для макросів, а юзер
 * потім редачив». Тут — мʼяка підказка з кнопкою «Підставити середні»,
 * яка зʼявляється тільки коли вже задано ккал, але макросів ще немає.
 * Дефолти: 1.6 г білка / 1 г жиру на кг ваги (типові безпечні старт-
 * рекомендації); вуглеводи добираються залишком ккал. Ваги ми не
 * знаємо в цій картці, тому стартуємо з macro-сплітом 30/25/45 від
 * заданих ккал — це одночасно дає валідні цифри й не претендує на
 * точність (її користувач уточнить вручну).
 */
export function MissingMacrosHint({
  prefs,
  setPrefs,
  busy,
}: MissingMacrosHintProps) {
  const kcal = prefs.dailyTargetKcal ?? 0;
  if (kcal <= 0) return null;
  const hasAnyMacro =
    (prefs.dailyTargetProtein_g ?? 0) > 0 ||
    (prefs.dailyTargetFat_g ?? 0) > 0 ||
    (prefs.dailyTargetCarbs_g ?? 0) > 0;
  if (hasAnyMacro) return null;

  // 30 % білок · 25 % жир · 45 % вуглеводи від цільових ккал → грами.
  // Білок і жир округлюємо вниз, а вуглеводи добираємо залишком,
  // щоб сума макро ніколи не перевищувала цільові ккал.
  const suggestedProtein = Math.floor(
    (kcal * 0.3) / ATWATER_KCAL_PER_G.protein,
  );
  const suggestedFat = Math.floor((kcal * 0.25) / ATWATER_KCAL_PER_G.fat);
  const remainingKcal =
    kcal -
    suggestedProtein * ATWATER_KCAL_PER_G.protein -
    suggestedFat * ATWATER_KCAL_PER_G.fat;
  const suggestedCarbs = Math.max(
    0,
    Math.floor(remainingKcal / ATWATER_KCAL_PER_G.carbs),
  );

  return (
    <Notice
      tone="ink"
      role="status"
      aria-live="polite"
      className="text-style-caption space-y-2"
      data-testid="missing-macros-hint"
    >
      <p className="leading-snug">
        Задано лише <strong>{kcal} ккал</strong>, але без макро AI не зрозуміє
        що тобі важливо: білок, жир чи вуглеводи. Підстав середні стартові
        значення й відредагуй під себе.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            setPrefs((p) => ({
              ...p,
              dailyTargetProtein_g: suggestedProtein,
              dailyTargetFat_g: suggestedFat,
              dailyTargetCarbs_g: suggestedCarbs,
            }))
          }
          className={SMALL_ACTION}
        >
          Підставити середні · Б{suggestedProtein} · Ж{suggestedFat} · В
          {suggestedCarbs}
        </button>
      </div>
    </Notice>
  );
}

export function GoalRangeWarning({ prefs }: { prefs: NutritionPrefs }) {
  const issues = calcGoalRangeIssues(prefs);
  if (issues.length === 0) return null;
  return (
    <Notice
      tone="ink"
      role="status"
      aria-live="polite"
      className="text-style-caption space-y-1"
      data-testid="goal-range-warning"
    >
      <ul className="list-disc space-y-0.5 pl-4 leading-snug">
        {issues.map((issue) => (
          <li key={`${issue.field}-${issue.kind}`}>{issue.message}</li>
        ))}
      </ul>
    </Notice>
  );
}
