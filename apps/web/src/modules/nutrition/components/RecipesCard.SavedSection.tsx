/**
 * Last validated: 2026-06-02
 * Status: Active
 *
 * "Мої рецепти" — the collapsible saved-recipes panel rendered above
 * the generator in RecipesCard. Owns the open/expand state for each
 * recipe row, the portion-multiplier inputs, and the delete confirmation
 * trigger.
 *
 * Extracted in page-audit-08 F7 split (see
 * docs/audits/2026-05-13-page-audit-08-nutrition.md).
 */
import type { Dispatch, SetStateAction } from "react";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { Button } from "@shared/components/ui/Button";
import { scaleMacros, type SavedRecipe } from "../lib/recipeBook";
import {
  buildRecipeLogEntry,
  defaultServingGrams,
  parseGramsInput,
  supportsGramsLogging,
  type RecipeLogMode,
} from "../lib/recipeLogging";
import { ChevronIcon } from "./RecipesCard.ChevronIcon";
import { parsePortionFactor } from "./RecipesCard.helpers";

/** «2» → «2», «1.5» → «1,5»: десяткова кома, як усюди в інтерфейсі. */
function formatFactor(factor: number): string {
  return String(factor).replace(".", ",");
}

interface SavedSectionProps {
  saved: SavedRecipe[];
  savedBusy: boolean;
  savedError?: boolean;
  onRetry?: () => void;
  savedOpen: boolean;
  setSavedOpen: Dispatch<SetStateAction<boolean>>;
  openSavedId: string | null;
  setOpenSavedId: Dispatch<SetStateAction<string | null>>;
  portionById: Record<string, string>;
  setPortionById: Dispatch<SetStateAction<Record<string, string>>>;
  logModeById: Record<string, RecipeLogMode>;
  setLogModeById: Dispatch<SetStateAction<Record<string, RecipeLogMode>>>;
  gramsById: Record<string, string>;
  setGramsById: Dispatch<SetStateAction<Record<string, string>>>;
  onNewDish: () => void;
  onEdit: (r: SavedRecipe) => void;
  onAddToLog: (r: SavedRecipe, key: string) => void;
  onDeleteClick: (r: SavedRecipe) => void;
  fmtMacro: (v: unknown) => string | number;
}

export function SavedSection({
  saved,
  savedBusy,
  savedError = false,
  onRetry,
  savedOpen,
  setSavedOpen,
  openSavedId,
  setOpenSavedId,
  portionById,
  setPortionById,
  logModeById,
  setLogModeById,
  gramsById,
  setGramsById,
  onNewDish,
  onEdit,
  onAddToLog,
  onDeleteClick,
  fmtMacro,
}: SavedSectionProps) {
  return (
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
            <span className="px-2 py-0.5 rounded-full text-style-caption bg-nutrition/15 text-nutrition-strong dark:text-nutrition">
              {saved.length}
            </span>
          )}
          {savedBusy && (
            <span className="text-style-caption text-muted">…</span>
          )}
        </div>
        <ChevronIcon open={savedOpen} />
      </button>

      {savedOpen && (
        <div className="mt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mb-3"
            onClick={onNewDish}
          >
            Нова страва
          </Button>
          {saved.length === 0 && savedError ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-style-body text-danger-strong" role="alert">
                Не вдалося прочитати збережені рецепти.
              </p>
              <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
                Спробувати ще раз
              </Button>
            </div>
          ) : saved.length === 0 ? (
            <div className="text-style-body text-muted">
              Тут зʼявляться збережені рецепти. Склади страву з продуктів
              кнопкою «Нова страва» або згенеруй рецепти нижче й натисни
              &quot;Зберегти&quot;.
            </div>
          ) : (
            <div className="grid gap-2">
              {saved.slice(0, 8).map((r) => {
                const key = r.id;
                const factorRaw = portionById[key] ?? "1";
                // `r.macros` — КБЖВ на ОДНУ порцію (рішення власника
                // 2026-10-01), тож підрядок і «На порцію» показують їх як є,
                // а множник — це скільки порцій зʼїдено: підсумок
                // рахується тим самим множником, що піде в журнал
                // (`addRecipeAsMeal` бере той самий `parsePortionFactor`).
                const factor = parsePortionFactor(factorRaw);
                const scaled = scaleMacros(r.macros, factor);
                const canGrams = supportsGramsLogging(r);
                const gramsMode = canGrams && logModeById[key] === "grams";
                const gramsRaw =
                  gramsById[key] ?? String(defaultServingGrams(r));
                const gramsEntry = gramsMode
                  ? buildRecipeLogEntry(
                      r,
                      "grams",
                      factor,
                      parseGramsInput(gramsRaw),
                    )
                  : null;
                const isOpen = openSavedId === r.id;
                return (
                  <div
                    key={r.id}
                    className="rounded-2xl border border-line bg-panel p-3 overflow-hidden"
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
                          <span className="block text-style-caption text-muted mt-0.5">
                            {r.timeMinutes ? `${r.timeMinutes} хв` : "—"} ·{" "}
                            {r.servings ? `${r.servings} порц.` : "—"}
                            {r.macros?.kcal != null
                              ? ` · ≈ ${fmtMacro(r.macros.kcal)} ккал / порція`
                              : ""}
                          </span>
                        </span>
                      </button>
                      <div className="flex gap-2 shrink-0 flex-wrap">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            gramsMode && parseGramsInput(gramsRaw) == null
                          }
                          onClick={() => onAddToLog(r, key)}
                        >
                          + У журнал
                          {!gramsMode &&
                            factor !== 1 &&
                            ` ×${formatFactor(factor)}`}
                        </Button>
                        {r.components && r.components.length > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onEdit(r)}
                          >
                            Редагувати
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="soft"
                          tone="danger"
                          size="sm"
                          onClick={() => onDeleteClick(r)}
                        >
                          Видалити
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {canGrams && (
                        <div
                          role="group"
                          aria-label={`Як додати: ${r.title}`}
                          className="flex gap-1"
                        >
                          {(["portions", "grams"] as const).map((m) => (
                            <Button
                              key={m}
                              type="button"
                              size="sm"
                              variant={
                                (gramsMode ? "grams" : "portions") === m
                                  ? "soft"
                                  : "outline"
                              }
                              aria-pressed={
                                (gramsMode ? "grams" : "portions") === m
                              }
                              onClick={() =>
                                setLogModeById((s) => ({ ...s, [key]: m }))
                              }
                            >
                              {m === "portions" ? "Порції" : "Грами"}
                            </Button>
                          ))}
                        </div>
                      )}
                      {gramsMode ? (
                        <>
                          <span className="text-style-caption text-muted">
                            Скільки грамів:
                          </span>
                          <Input
                            value={gramsRaw}
                            onChange={(e) =>
                              setGramsById((s) => ({
                                ...s,
                                [key]: e.target.value,
                              }))
                            }
                            inputMode="numeric"
                            aria-label={`Скільки грамів: ${r.title}`}
                            className="w-24"
                          />
                          {gramsEntry?.macros.kcal != null && (
                            <span className="text-style-caption text-muted">
                              → ≈ {fmtMacro(gramsEntry.macros.kcal)} ккал
                            </span>
                          )}
                          {parseGramsInput(gramsRaw) == null && (
                            <span
                              className="text-style-caption text-danger-strong"
                              role="alert"
                            >
                              Впиши ціле число грамів, наприклад 150.
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="text-style-caption text-muted">
                            Скільки порцій:
                          </span>
                          <Input
                            value={factorRaw}
                            onChange={(e) =>
                              setPortionById((m) => ({
                                ...m,
                                [key]: e.target.value,
                              }))
                            }
                            inputMode="decimal"
                            aria-label={`Скільки порцій: ${r.title}`}
                            className="w-20"
                          />
                          {r.macros?.kcal != null && factor !== 1 && (
                            <span className="text-style-caption text-muted">
                              → усього ≈ {fmtMacro(scaled.kcal)} ккал
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {isOpen && (
                      <div className="mt-3 pt-3 border-t border-line/40 space-y-3">
                        {Array.isArray(r.ingredients) &&
                          r.ingredients.length > 0 && (
                            <div className="text-style-body text-text wrap-break-word">
                              <div className="text-style-caption text-muted mb-1">
                                Інгредієнти
                              </div>
                              {r.ingredients.join(", ")}
                            </div>
                          )}
                        {Array.isArray(r.steps) && r.steps.length > 0 && (
                          <div className="text-style-body text-text">
                            <div className="text-style-caption text-muted mb-1">
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
                          <div className="text-style-body text-text">
                            <div className="text-style-caption text-muted mb-1">
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
                            <div className="text-style-caption text-muted space-y-0.5">
                              <div>
                                На порцію: Б: {fmtMacro(r.macros.protein_g)} г ·
                                Ж: {fmtMacro(r.macros.fat_g)} г · В:{" "}
                                {fmtMacro(r.macros.carbs_g)} г
                              </div>
                              {factor !== 1 && (
                                <div>
                                  Разом ×{formatFactor(factor)}: Б:{" "}
                                  {fmtMacro(scaled.protein_g)} г · Ж:{" "}
                                  {fmtMacro(scaled.fat_g)} г · В:{" "}
                                  {fmtMacro(scaled.carbs_g)} г
                                </div>
                              )}
                            </div>
                          )}
                        {!Array.isArray(r.ingredients) &&
                          !Array.isArray(r.steps) && (
                            <div className="text-style-caption text-muted">
                              Деталі цього рецепту не збережені.
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}
              {saved.length > 8 && (
                <div className="text-style-caption text-muted">
                  Показано 8 з {saved.length}.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
