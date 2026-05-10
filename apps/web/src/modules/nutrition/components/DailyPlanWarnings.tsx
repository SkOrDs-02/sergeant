import type { Dispatch, SetStateAction } from "react";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import { cn } from "@shared/lib/ui/cn";
import {
  calcGoalRangeIssues,
  calcMacroKcalMismatch,
} from "../lib/dailyPlanValidation";

interface MacroKcalWarningProps {
  prefs: NutritionPrefs;
  setPrefs: Dispatch<SetStateAction<NutritionPrefs>>;
  busy?: boolean;
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

  const tone = overshoot
    ? "border-danger/40 bg-danger/10"
    : "border-warn/40 bg-warn/10";
  const iconTone = overshoot ? "text-danger" : "text-warn";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mt-3 rounded-xl border px-3 py-2.5 text-xs space-y-2",
        tone,
      )}
      data-testid="macro-kcal-warning"
    >
      <div className="flex items-start gap-2">
        <span className={cn("shrink-0 font-bold", iconTone)} aria-hidden>
          {overshoot ? "⚠" : "ℹ"}
        </span>
        <p className="text-text leading-snug">
          {overshoot ? (
            <>
              Сума макро виходить на <strong>{calc} ккал</strong> — це на{" "}
              <strong>{absDiff} ккал</strong> більше за ціль{" "}
              <strong>{target} ккал</strong>. 1 г білка = 4 ккал, 1 г жиру = 9
              ккал, 1 г вуглеводів = 4 ккал.
            </>
          ) : (
            <>
              Сума макро дає лише <strong>{calc} ккал</strong> — це на{" "}
              <strong>{absDiff} ккал</strong> менше за ціль{" "}
              <strong>{target} ккал</strong>.
            </>
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 pl-5">
        <button
          type="button"
          disabled={busy}
          onClick={() => setPrefs((p) => ({ ...p, dailyTargetKcal: calc }))}
          className={cn(
            "inline-flex items-center gap-1 rounded-xl border px-2 py-1",
            "border-line/60 bg-bg/60 text-text hover:bg-panelHi",
            "disabled:opacity-50 transition-colors",
          )}
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
          className={cn(
            "inline-flex items-center gap-1 rounded-xl border px-2 py-1",
            "border-line/60 bg-bg/40 text-subtle hover:text-text hover:bg-panelHi",
            "disabled:opacity-50 transition-colors",
          )}
        >
          Скинути макро
        </button>
      </div>
    </div>
  );
}

interface MissingMacrosHintProps {
  prefs: NutritionPrefs;
  setPrefs: Dispatch<SetStateAction<NutritionPrefs>>;
  busy?: boolean;
}

/**
 * Користувач у фідбеку 2026-05 (UX-roast §3.3): «коли вводить ккал
 * воно підставляло середні стартові значення для макросів, а юзер
 * потім редачив». Тут — м'яка підказка з кнопкою «Підставити середні»,
 * яка з'являється тільки коли вже задано ккал, але макросів ще немає.
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
  const suggestedProtein = Math.floor((kcal * 0.3) / 4);
  const suggestedFat = Math.floor((kcal * 0.25) / 9);
  const remainingKcal = kcal - suggestedProtein * 4 - suggestedFat * 9;
  const suggestedCarbs = Math.max(0, Math.floor(remainingKcal / 4));

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mt-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2.5",
        "text-xs space-y-2",
      )}
      data-testid="missing-macros-hint"
    >
      <div className="flex items-start gap-2">
        <span className="shrink-0 font-bold text-warn" aria-hidden>
          ℹ
        </span>
        <p className="text-text leading-snug">
          Задано лише <strong>{kcal} ккал</strong>, але без макро AI не зрозуміє
          що тобі важливо — білок, жир чи вуглеводи. Підстав середні стартові
          значення й відредагуй під себе.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 pl-5">
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
          className={cn(
            "inline-flex items-center gap-1 rounded-xl border px-2 py-1",
            "border-line/60 bg-bg/60 text-text hover:bg-panelHi",
            "disabled:opacity-50 transition-colors",
          )}
        >
          Підставити середні · Б{suggestedProtein} · Ж{suggestedFat} · В
          {suggestedCarbs}
        </button>
      </div>
    </div>
  );
}

export function GoalRangeWarning({ prefs }: { prefs: NutritionPrefs }) {
  const issues = calcGoalRangeIssues(prefs);
  if (issues.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mt-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2.5",
        "text-xs space-y-1",
      )}
      data-testid="goal-range-warning"
    >
      <div className="flex items-start gap-2">
        <span className="shrink-0 font-bold text-warn" aria-hidden>
          ⚠
        </span>
        <ul className="text-text leading-snug space-y-0.5 list-disc pl-4">
          {issues.map((issue) => (
            <li key={`${issue.field}-${issue.kind}`}>{issue.message}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
