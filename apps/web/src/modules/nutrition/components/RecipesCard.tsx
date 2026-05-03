import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { toLocalISODate } from "@sergeant/shared";
import type {
  Meal,
  MealTypeId,
  NutritionPrefs,
  Pantry,
} from "@sergeant/nutrition-domain";
import type { NullableMacros } from "@sergeant/shared";
import {
  deleteSavedRecipe,
  listSavedRecipes,
  saveRecipeToBook,
  scaleMacros,
  type SavedRecipe,
} from "../lib/recipeBook";
import type { RecipeCacheEntry as StoredRecipeCacheEntry } from "../lib/recipeCache";
import { MEAL_TYPES } from "../lib/mealTypes";

interface RecipeLike {
  id?: string;
  title?: string;
  timeMinutes?: number | null;
  servings?: number | null;
  ingredients?: string[];
  steps?: string[];
  tips?: string[];
  macros?: NullableMacros | null;
  [key: string]: unknown;
}

interface RecipesCardProps {
  busy?: boolean;
  activePantry?: Pantry | null;
  prefs: NutritionPrefs;
  setPrefs: Dispatch<SetStateAction<NutritionPrefs>>;
  recommendRecipes: () => void | Promise<void>;
  recipes: RecipeLike[];
  recipesTried?: boolean;
  recipesRaw?: string;
  err?: string | null;
  fmtMacro: (v: unknown) => string | number;
  recipeCacheEntry?: StoredRecipeCacheEntry<unknown> | null;
  addMealToLog?: (meal: Meal) => void | Promise<void>;
  selectedDate?: string;
}

function guessMealTypeIdNow(): MealTypeId {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 16) return "lunch";
  if (h >= 16 && h < 22) return "dinner";
  return "snack";
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <Icon
      name="chevron-right"
      size={16}
      strokeWidth={2.5}
      className={cn(
        "shrink-0 text-subtle transition-transform duration-200",
        open && "rotate-90",
      )}
    />
  );
}

export function RecipesCard({
  busy,
  activePantry,
  prefs,
  setPrefs,
  recommendRecipes,
  recipes,
  recipesTried,
  recipesRaw,
  err,
  fmtMacro,
  recipeCacheEntry,
  addMealToLog,
  selectedDate,
}: RecipesCardProps) {
  const toast = useToast();
  const [saved, setSaved] = useState<SavedRecipe[]>([]);
  const [savedBusy, setSavedBusy] = useState(false);
  const [portionById, setPortionById] = useState<Record<string, string>>({});
  const [deleteRecipeConfirm, setDeleteRecipeConfirm] =
    useState<SavedRecipe | null>(null);
  const [openSavedId, setOpenSavedId] = useState<string | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const prevSavedLen = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setSavedBusy(true);
    (async () => {
      const list = await listSavedRecipes(200);
      if (!cancelled) setSaved(list);
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSavedBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-open when first recipe is saved during this session
  useEffect(() => {
    if (saved.length > prevSavedLen.current && prevSavedLen.current === 0) {
      setSavedOpen(true);
    }
    prevSavedLen.current = saved.length;
  }, [saved.length]);

  async function refreshSaved() {
    setSavedBusy(true);
    try {
      setSaved(await listSavedRecipes(200));
    } finally {
      setSavedBusy(false);
    }
  }

  async function saveOne(r: RecipeLike) {
    const res = await saveRecipeToBook(r);
    if (res.ok) await refreshSaved();
  }

  async function addRecipeAsMeal(
    r: RecipeLike | SavedRecipe,
    idKey: string,
  ): Promise<void> {
    if (typeof addMealToLog !== "function") return;
    const key = String(idKey || r?.id || r?.title || "");
    const factorRaw = portionById[key];
    const factor =
      factorRaw == null || factorRaw === ""
        ? 1
        : Number(String(factorRaw).replace(",", "."));
    const macros = scaleMacros(
      r?.macros,
      Number.isFinite(factor) && factor > 0 ? factor : 1,
    );
    const mealType = guessMealTypeIdNow();
    const label =
      MEAL_TYPES.find((x) => x.id === mealType)?.label || "Прийом їжі";
    // Не пишемо поточний час, якщо журнал відкритий не на сьогодні —
    // інакше "вчора 09:30" виглядає як артефакт. Див. H5 з аудиту.
    const now = new Date();
    const isToday = !selectedDate || selectedDate === toLocalISODate(now);
    const time = isToday
      ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
      : "";
    await addMealToLog({
      id: `meal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      time,
      mealType,
      label,
      name: r?.title || "Рецепт",
      macros: {
        kcal: macros.kcal ?? null,
        protein_g: macros.protein_g ?? null,
        fat_g: macros.fat_g ?? null,
        carbs_g: macros.carbs_g ?? null,
      },
      source: "manual",
      macroSource: "recipeAI",
      foodId: null,
      amount_g: null,
    });
  }

  return (
    <>
      {/* ── Мої рецепти — окремий згорнутий блок ── */}
      <Card className="p-4">
        <button
          type="button"
          onClick={() => setSavedOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2"
          aria-expanded={savedOpen}
        >
          <div className="flex items-center gap-2">
            <span className="text-style-label text-text">Мої рецепти</span>
            {!savedBusy && saved.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-nutrition/15 text-nutrition-strong dark:text-nutrition">
                {saved.length}
              </span>
            )}
            {savedBusy && <span className="text-xs text-subtle">…</span>}
          </div>
          <ChevronIcon open={savedOpen} />
        </button>

        {savedOpen && (
          <div className="mt-3">
            {saved.length === 0 ? (
              <div className="text-xs text-subtle">
                Тут з&apos;являться збережені рецепти. Згенеруй рецепти нижче й
                натисни &quot;Зберегти&quot;.
              </div>
            ) : (
              <div className="grid gap-2">
                {saved.slice(0, 8).map((r) => {
                  const key = r.id;
                  const factor = portionById[key] ?? "1";
                  const isOpen = openSavedId === r.id;
                  return (
                    <div
                      key={r.id}
                      className="rounded-2xl border border-line bg-bg/40 p-3 overflow-hidden"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenSavedId((id) => (id === r.id ? null : r.id))
                          }
                          className="min-w-0 flex-1 basis-full sm:basis-auto text-left flex items-start gap-2"
                          aria-expanded={isOpen}
                        >
                          <ChevronIcon open={isOpen} />
                          <span className="min-w-0">
                            <span className="text-style-label block text-text wrap-break-word">
                              {r.title}
                            </span>
                            <span className="block text-xs text-subtle mt-0.5">
                              {r.timeMinutes ? `${r.timeMinutes} хв` : "—"} ·{" "}
                              {r.servings ? `${r.servings} порц.` : "—"}
                              {r.macros?.kcal != null
                                ? ` · ≈ ${fmtMacro(r.macros.kcal)} ккал`
                                : ""}
                            </span>
                          </span>
                        </button>
                        <div className="flex gap-2 shrink-0 flex-wrap">
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-9 text-xs"
                            onClick={() => void addRecipeAsMeal(r, key)}
                          >
                            + У журнал
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-9 text-xs text-danger"
                            onClick={() => setDeleteRecipeConfirm(r)}
                          >
                            Видалити
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-subtle">
                          Порції (множник):
                        </span>
                        <Input
                          value={String(factor)}
                          onChange={(e) =>
                            setPortionById((m) => ({
                              ...m,
                              [key]: e.target.value,
                            }))
                          }
                          inputMode="decimal"
                          className="w-20"
                        />
                        <span className="text-xs text-subtle">
                          × макроси рецепту
                        </span>
                      </div>

                      {isOpen && (
                        <div className="mt-3 pt-3 border-t border-line/40 space-y-3">
                          {Array.isArray(r.ingredients) &&
                            r.ingredients.length > 0 && (
                              <div className="text-sm text-text wrap-break-word">
                                <div className="text-xs text-subtle mb-1">
                                  Інгредієнти
                                </div>
                                {r.ingredients.join(", ")}
                              </div>
                            )}
                          {Array.isArray(r.steps) && r.steps.length > 0 && (
                            <div className="text-sm text-text">
                              <div className="text-xs text-subtle mb-1">
                                Кроки
                              </div>
                              <ol className="list-decimal pl-5 space-y-1">
                                {r.steps.map((s, i) => (
                                  <li key={i}>{s}</li>
                                ))}
                              </ol>
                            </div>
                          )}
                          {Array.isArray(r.tips) && r.tips.length > 0 && (
                            <div className="text-sm text-text">
                              <div className="text-xs text-subtle mb-1">
                                Поради
                              </div>
                              <ul className="list-disc pl-5 space-y-1">
                                {r.tips.map((t, i) => (
                                  <li key={i}>{t}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {r.macros &&
                            (r.macros.protein_g != null ||
                              r.macros.fat_g != null ||
                              r.macros.carbs_g != null) && (
                              <div className="text-xs text-subtle">
                                Б: {fmtMacro(r.macros.protein_g)} г · Ж:{" "}
                                {fmtMacro(r.macros.fat_g)} г · В:{" "}
                                {fmtMacro(r.macros.carbs_g)} г
                              </div>
                            )}
                          {!Array.isArray(r.ingredients) &&
                            !Array.isArray(r.steps) && (
                              <div className="text-xs text-subtle">
                                Деталі цього рецепту не збережені.
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {saved.length > 8 && (
                  <div className="text-xs text-subtle">
                    Показано 8 з {saved.length}.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── Генератор рецептів ── */}
      <Card className="p-4">
        <div className="text-style-label text-text">
          Рецепти ({activePantry?.name || "Склад"})
        </div>
        <div className="text-xs text-subtle mt-0.5">
          Рекомендації на базі продуктів зі складу. Можна вказати час, порції та
          &quot;не хочу&quot;.
          {(recipeCacheEntry?.recipes?.length ?? 0) > 0 && (
            <span className="ml-1 text-nutrition-strong dark:text-nutrition">
              (є кеш сеансу — натисни «Запропонувати» для оновлення)
            </span>
          )}
        </div>

        <div className="mt-3 grid gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-subtle mb-1">Ціль</div>
              <select
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
                <div className="text-xs text-subtle mb-1">Порції</div>
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
                <div className="text-xs text-subtle mb-1">Хвилин</div>
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
            <div className="text-xs text-subtle mb-1">
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
                      <div className="text-xs text-subtle mt-1">
                        {r.timeMinutes ? `${r.timeMinutes} хв` : "—"} ·{" "}
                        {r.servings ? `${r.servings} порц.` : "—"}
                      </div>
                    </div>
                    {r.macros?.kcal != null && (
                      <div className="shrink-0 rounded-xl border border-line bg-bg px-3 py-2 text-xs text-subtle">
                        <div className="text-2xs text-subtle">≈ ккал</div>
                        <div className="text-style-label text-text">
                          {fmtMacro(r.macros.kcal)}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap basis-full sm:basis-auto">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-9 text-xs"
                        onClick={() => void saveOne(r)}
                        disabled={busy}
                      >
                        Зберегти
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-9 text-xs"
                        onClick={() =>
                          void addRecipeAsMeal(
                            r,
                            r.id || r.title || String(idx),
                          )
                        }
                        disabled={busy}
                      >
                        + У журнал
                      </Button>
                    </div>
                  </div>

                  {Array.isArray(r.ingredients) && r.ingredients.length > 0 && (
                    <div className="mt-3 text-sm text-text wrap-break-word">
                      <div className="text-xs text-subtle mb-1">
                        Інгредієнти
                      </div>
                      {r.ingredients.join(", ")}
                    </div>
                  )}

                  {Array.isArray(r.steps) && r.steps.length > 0 && (
                    <div className="mt-3 text-sm text-text">
                      <div className="text-xs text-subtle mb-1">Кроки</div>
                      <ol className="list-decimal pl-5 space-y-1">
                        {r.steps.slice(0, 10).map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {Array.isArray(r.tips) && r.tips.length > 0 && (
                    <div className="mt-3 text-sm text-text">
                      <div className="text-xs text-subtle mb-1">Поради</div>
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
            <div className="rounded-2xl border border-line bg-panel p-4 text-sm text-subtle">
              Рецептів не повернулося. Спробуй натиснути &quot;Розібрати&quot;
              або додати 2–3 базові продукти (яйця/крупа/овочі).
              {recipesRaw && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-muted hover:text-text">
                    Показати діагностику (raw відповідь AI)
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap text-xs leading-snug text-subtle bg-bg border border-line rounded-xl p-3 max-h-64 overflow-auto">
                    {recipesRaw}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={!!deleteRecipeConfirm}
        title="Видалити рецепт?"
        description={`Видалити збережений рецепт «${deleteRecipeConfirm?.title || ""}»?`}
        confirmLabel="Видалити"
        danger
        onConfirm={async () => {
          const removed = deleteRecipeConfirm;
          if (removed?.id) {
            await deleteSavedRecipe(removed.id);
            await refreshSaved();
            showUndoToast(toast, {
              msg: `Видалено рецепт «${removed.title}»`,
              onUndo: () => {
                void (async () => {
                  await saveRecipeToBook(removed);
                  await refreshSaved();
                })();
              },
            });
          }
          setDeleteRecipeConfirm(null);
        }}
        onCancel={() => setDeleteRecipeConfirm(null)}
      />
    </>
  );
}
