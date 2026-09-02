/**
 * Last validated: 2026-06-02
 * Status: Active
 *
 * Recipe-generator card — prefs form (goal / servings / minutes /
 * exclusions) + "Запропонувати рецепти" CTA + the generated recipe
 * list + the empty-state / error-raw panel.
 *
 * Extracted in page-audit-08 F7 split (see
 * docs/audits/2026-05-13-page-audit-08-nutrition.md).
 */
import type { Dispatch, SetStateAction } from "react";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { Button } from "@shared/components/ui/Button";
import { cn } from "@shared/lib/ui/cn";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import type { RecipeCacheEntry } from "../lib/recipeCache";
import type { RecipeLike } from "./RecipesCard.helpers";
import { PantryModeSelect } from "./PantryModeSelect";

interface GeneratorProps {
  busy?: boolean | undefined;
  prefs: NutritionPrefs;
  setPrefs: Dispatch<SetStateAction<NutritionPrefs>>;
  recommendRecipes: () => void | Promise<void>;
  recipes: RecipeLike[];
  recipesTried?: boolean | undefined;
  recipesRaw?: string | undefined;
  err?: string | null | undefined;
  fmtMacro: (v: unknown) => string | number;
  recipeCacheEntry?: RecipeCacheEntry<unknown> | null | undefined;
  onSave: (r: RecipeLike) => void;
  onAddToLog: (r: RecipeLike, idKey: string) => void;
}

export function GeneratorCard({
  busy,
  prefs,
  setPrefs,
  recommendRecipes,
  recipes,
  recipesTried,
  recipesRaw,
  err,
  fmtMacro,
  recipeCacheEntry,
  onSave,
  onAddToLog,
}: GeneratorProps) {
  return (
    <Card className="p-4">
      <div className="text-style-label text-text">Рецепти</div>
      <div className="text-style-caption text-muted mt-0.5">
        Рекомендації на базі продуктів з комори. Можна вказати час, порції та
        &quot;не хочу&quot;.
        {(recipeCacheEntry?.recipes?.length ?? 0) > 0 && (
          <span className="ml-1 text-nutrition-strong dark:text-nutrition">
            (є кеш сеансу, натисни «Запропонувати» для оновлення)
          </span>
        )}
      </div>

      <div className="mt-3 grid gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="text-style-caption text-muted mb-1">Ціль</div>
            <select
              aria-label="Ціль"
              value={prefs.goal}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, goal: e.target.value }))
              }
              className="input-focus-nutrition w-full h-11 rounded-2xl bg-panel border border-line px-4 text-sm text-text"
              disabled={busy}
            >
              <option value="balanced">Збалансовано</option>
              <option value="high_protein">Більше білка</option>
              <option value="low_cal">Менше калорій</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-style-caption text-muted mb-1">Порції</div>
              <Input
                value={String(prefs.servings)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setPrefs((p) => ({
                    ...p,
                    servings: Number.isFinite(n) && n > 0 ? n : 1,
                  }));
                }}
                inputMode="numeric"
                disabled={busy}
              />
            </div>
            <div>
              <div className="text-style-caption text-muted mb-1">Хвилин</div>
              <Input
                value={String(prefs.timeMinutes)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setPrefs((p) => ({
                    ...p,
                    timeMinutes: Number.isFinite(n) && n >= 0 ? n : 0,
                  }));
                }}
                inputMode="numeric"
                disabled={busy}
              />
            </div>
          </div>
        </div>

        <div>
          <div className="text-style-caption text-muted mb-1">
            Не використовувати / алергени
          </div>
          <Input
            value={prefs.exclude}
            onChange={(e) =>
              setPrefs((p) => ({ ...p, exclude: e.target.value }))
            }
            placeholder="напр. арахіс, гриби"
            disabled={busy}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-style-caption text-muted mb-1">
              Прийом їжі
            </span>
            <select
              aria-label="Прийом їжі"
              value={prefs.recipeMealType}
              onChange={(e) =>
                setPrefs((p) => ({
                  ...p,
                  recipeMealType: e.target
                    .value as NutritionPrefs["recipeMealType"],
                }))
              }
              className="input-focus-nutrition w-full h-11 rounded-2xl bg-panel border border-line px-4 text-sm text-text"
              disabled={busy}
            >
              <option value="any">Будь-який</option>
              <option value="breakfast">Сніданок</option>
              <option value="lunch">Обід</option>
              <option value="dinner">Вечеря</option>
              <option value="snack">Перекус</option>
            </select>
          </label>
          <PantryModeSelect prefs={prefs} setPrefs={setPrefs} disabled={busy} />
        </div>

        <button
          type="button"
          onClick={recommendRecipes}
          disabled={busy}
          className={cn(
            "text-style-label w-full h-11 rounded-2xl",
            "bg-nutrition-strong text-white hover:bg-nutrition-hover disabled:opacity-50",
          )}
        >
          Запропонувати рецепти
        </button>

        {recipes.length > 0 && (
          <div className="grid gap-3">
            {recipes.map((r, idx) => (
              <div
                key={r.id || idx}
                className="rounded-2xl border border-line bg-panel p-4 overflow-hidden"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <div className="text-style-label text-text wrap-break-word">
                      {r.title || `Рецепт ${idx + 1}`}
                    </div>
                    <div className="text-style-caption text-muted mt-1">
                      {r.timeMinutes ? `${r.timeMinutes} хв` : "—"} ·{" "}
                      {r.servings ? `${r.servings} порц.` : "—"}
                    </div>
                  </div>
                  {r.macros?.kcal != null && (
                    <div className="shrink-0 rounded-xl border border-line bg-bg px-3 py-2 text-style-caption text-muted">
                      <div className="text-style-caption text-muted">
                        ≈ ккал
                      </div>
                      <div className="text-style-label text-text">
                        {fmtMacro(r.macros.kcal)}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap basis-full sm:basis-auto">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => onSave(r)}
                      disabled={busy}
                    >
                      Зберегти
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        onAddToLog(r, r.id || r.title || String(idx))
                      }
                      disabled={busy}
                    >
                      + У журнал
                    </Button>
                  </div>
                </div>

                {Array.isArray(r.ingredients) && r.ingredients.length > 0 && (
                  <div className="mt-3 text-style-body text-text wrap-break-word">
                    <div className="text-style-caption text-muted mb-1">
                      Інгредієнти
                    </div>
                    {r.ingredients.join(", ")}
                  </div>
                )}

                {Array.isArray(r.steps) && r.steps.length > 0 && (
                  <div className="mt-3 text-style-body text-text">
                    <div className="text-style-caption text-muted mb-1">
                      Кроки
                    </div>
                    <ol className="list-decimal pl-5 space-y-1">
                      {r.steps.slice(0, 10).map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {Array.isArray(r.tips) && r.tips.length > 0 && (
                  <div className="mt-3 text-style-body text-text">
                    <div className="text-style-caption text-muted mb-1">
                      Поради
                    </div>
                    <ul className="list-disc pl-5 space-y-1">
                      {r.tips.slice(0, 6).map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {recipesTried && !busy && recipes.length === 0 && !err && (
          <div className="rounded-2xl border border-line bg-panel p-4 text-style-label text-muted">
            Рецептів не повернулося. Спробуй натиснути &quot;Розібрати&quot; або
            додати 2–3 базові продукти (яйця/крупа/овочі).
            {recipesRaw && (
              <details className="mt-3">
                <summary className="cursor-pointer text-style-caption text-muted hover:text-text">
                  Показати діагностику (raw відповідь AI)
                </summary>
                <pre className="mt-2 whitespace-pre-wrap text-style-caption leading-snug text-muted bg-bg border border-line rounded-xl p-3 max-h-64 overflow-auto">
                  {recipesRaw}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
