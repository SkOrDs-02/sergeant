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
import type { SavedRecipe } from "../lib/recipeBook";
import { ChevronIcon } from "./RecipesCard.ChevronIcon";

interface SavedSectionProps {
  saved: SavedRecipe[];
  savedBusy: boolean;
  savedOpen: boolean;
  setSavedOpen: Dispatch<SetStateAction<boolean>>;
  openSavedId: string | null;
  setOpenSavedId: Dispatch<SetStateAction<string | null>>;
  portionById: Record<string, string>;
  setPortionById: Dispatch<SetStateAction<Record<string, string>>>;
  onAddToLog: (r: SavedRecipe, key: string) => void;
  onDeleteClick: (r: SavedRecipe) => void;
  fmtMacro: (v: unknown) => string | number;
}

export function SavedSection({
  saved,
  savedBusy,
  savedOpen,
  setSavedOpen,
  openSavedId,
  setOpenSavedId,
  portionById,
  setPortionById,
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
                          variant="secondary"
                          size="sm"
                          onClick={() => onAddToLog(r, key)}
                        >
                          + У журнал
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="text-danger-strong dark:text-danger"
                          onClick={() => onDeleteClick(r)}
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
  );
}
