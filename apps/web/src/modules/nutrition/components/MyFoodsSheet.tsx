/**
 * MyFoodsSheet — «Мої продукти»: список продуктів, які людина створила
 * сама, з редагуванням і видаленням.
 *
 * AI-CONTEXT: аркуш один, входів два (сторінка «Меню» і вкладка «Своє»
 * аркуша запису). Вбудовані продукти сюди не потрапляють (`listUserFoods`).
 * Правка й видалення НЕ чіпають записів щоденника: макроси в них знімок
 * (рішення власника 2026-10-08, див. `nutrition.md` § Журнал рішень).
 *
 * Status: Active
 * Last validated: 2026-10-08
 */
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@shared/components/ui/Button";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { Sheet } from "@shared/components/ui/Sheet";
import { messages } from "@shared/i18n/uk";
import { nutritionKeys } from "@shared/lib/api/queryKeys";
import {
  deleteFood,
  listUserFoods,
  upsertFood,
  type FoodProduct,
} from "../lib/foodDb/foodDb";
import { FoodFields } from "./meal-sheet/FoodFields";
import {
  portionsToDrafts,
  validateFoodDraft,
  type FoodDraft,
} from "./meal-sheet/foodDraft";

interface MyFoodsSheetProps {
  open: boolean;
  onClose: () => void;
  zIndex?: number | undefined;
}

function toDraft(food: FoodProduct): FoodDraft {
  return {
    name: food.name,
    kcal: String(food.per100.kcal),
    protein_g: String(food.per100.protein_g),
    fat_g: String(food.per100.fat_g),
    carbs_g: String(food.per100.carbs_g),
    portions: portionsToDrafts(food.portions),
  };
}

export function MyFoodsSheet({ open, onClose, zIndex }: MyFoodsSheetProps) {
  const t = messages.nutrition.myFoods;
  const queryClient = useQueryClient();
  const [foods, setFoods] = useState<FoodProduct[] | null>(null);
  const [editing, setEditing] = useState<FoodProduct | null>(null);
  const [draft, setDraft] = useState<FoodDraft | null>(null);
  const [err, setErr] = useState("");
  const [portionErrors, setPortionErrors] = useState<Record<string, string>>(
    {},
  );
  const [deleting, setDeleting] = useState<FoodProduct | null>(null);

  const reload = useCallback(() => {
    void listUserFoods().then(setFoods);
    void queryClient.invalidateQueries({ queryKey: nutritionKeys.foodSearch });
  }, [queryClient]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listUserFoods().then((list) => {
      if (!cancelled) {
        setFoods(list);
        setEditing(null);
        setDraft(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function startEdit(food: FoodProduct) {
    setEditing(food);
    setDraft(toDraft(food));
    setErr("");
    setPortionErrors({});
  }

  async function handleSave() {
    if (!editing || !draft) return;
    const result = validateFoodDraft(draft);
    if (!result.ok) {
      setErr(result.error);
      setPortionErrors(result.portionErrors);
      return;
    }
    const saved = await upsertFood({
      ...editing,
      name: result.name,
      per100: result.per100,
      portions: result.portions,
      origin: "user",
    });
    if (!saved.ok) {
      setErr(saved.error);
      return;
    }
    setEditing(null);
    setDraft(null);
    reload();
  }

  async function handleDelete() {
    const target = deleting;
    setDeleting(null);
    if (!target) return;
    await deleteFood(target.id);
    reload();
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={editing ? t.editTitle : t.title}
        panelClassName="nutrition-sheet"
        zIndex={zIndex ?? 120}
      >
        {editing && draft ? (
          <div className="space-y-3">
            <FoodFields
              idPrefix="my-food"
              draft={draft}
              portionErrors={portionErrors}
              onChange={(next) => {
                setDraft(next);
                setErr("");
                setPortionErrors({});
              }}
            />
            <p className="text-style-caption text-subtle">
              {t.existingUnchanged}
            </p>
            {err && (
              <div className="text-style-caption text-danger-strong dark:text-danger">
                {err}
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="solid"
                tone="nutrition"
                className="min-h-[44px]"
                onClick={() => void handleSave()}
              >
                {t.save}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => {
                  setEditing(null);
                  setDraft(null);
                }}
              >
                {t.cancel}
              </Button>
            </div>
          </div>
        ) : foods === null ? null : foods.length === 0 ? (
          <p className="text-style-body text-muted">{t.emptyBody}</p>
        ) : (
          <ul className="divide-y divide-line/20">
            {foods.map((food) => (
              <li key={food.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-style-label text-text">
                    {food.name}
                  </div>
                  <div className="text-style-caption text-subtle">
                    {Math.round(food.per100.kcal)} {t.kcalPer100}
                    {food.portions.length > 0 &&
                      ` · ${t.portionsCount.replace("{n}", String(food.portions.length))}`}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px] shrink-0"
                  aria-label={t.editAria.replace("{name}", food.name)}
                  onClick={() => startEdit(food)}
                >
                  {t.editAction}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-[44px] shrink-0"
                  aria-label={t.deleteAria.replace("{name}", food.name)}
                  onClick={() => setDeleting(food)}
                >
                  {t.deleteAction}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
      <ConfirmDialog
        open={deleting !== null}
        title={
          deleting
            ? t.deleteTitle.replace("{name}", deleting.name)
            : t.deleteTitleFallback
        }
        description={t.deleteBody}
        confirmLabel={t.deleteAction}
        cancelLabel={t.deleteKeep}
        danger
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
