import type { Dispatch, SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Input } from "@shared/components/ui/Input";
import { Button } from "@shared/components/ui/Button";
import { Sheet } from "@shared/components/ui/Sheet";
import { cn } from "@shared/lib/cn";
import type { Pantry } from "@sergeant/nutrition-domain";

/**
 * Modes a pantry form can be in:
 * - `create`: input is the name of a brand-new склад to add.
 * - `rename`: input is the new name for the active склад.
 *
 * Defined as an explicit union so call-sites and state shapes stay aligned
 * (`PantryManagerSheet`, `useNutritionPantries`, `NutritionOverlays`).
 */
export type PantryFormMode = "create" | "rename";

export interface PantryForm {
  mode: PantryFormMode;
  name: string;
  err: string;
}

interface PantryManagerSheetProps {
  open: boolean;
  onClose: () => void;
  pantries: Pantry[];
  activePantryId: string | null;
  setActivePantryId: (id: string) => void;
  pantryForm: PantryForm;
  setPantryForm: Dispatch<SetStateAction<PantryForm>>;
  busy?: boolean;
  onSavePantryForm: (name: string, mode: PantryFormMode) => void;
  onBeginCreate: () => void;
  onBeginRename: () => void;
  onBeginDelete: () => void;
}

export function PantryManagerSheet({
  open,
  onClose,
  pantries,
  activePantryId,
  setActivePantryId,
  pantryForm,
  setPantryForm,
  busy,
  onSavePantryForm,
  onBeginCreate,
  onBeginRename,
  onBeginDelete,
}: PantryManagerSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Склади продуктів"
      description="Створи окремо для Дім / Робота або по дієті"
      panelClassName="nutrition-sheet"
      zIndex={100}
    >
      <div className="rounded-2xl border border-line bg-bg overflow-hidden mb-4">
        {(Array.isArray(pantries) ? pantries : []).map((p) => {
          const active = p.id === activePantryId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setActivePantryId(p.id)}
              className={cn(
                "w-full text-left px-4 py-3 border-b border-line last:border-0 hover:bg-panelHi transition-colors",
                active && "bg-nutrition/10",
              )}
              aria-pressed={active}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-text truncate">
                  {p.name || "Склад"}
                </div>
                {active ? (
                  <span className="text-2xs px-2 py-0.5 rounded-full bg-nutrition/15 text-nutrition-strong dark:text-nutrition border border-nutrition/25">
                    Активний
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
        <Button
          type="button"
          className="h-12 min-h-[44px] bg-nutrition-strong text-white hover:bg-nutrition-hover"
          onClick={onBeginCreate}
        >
          + Новий склад
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-12 min-h-[44px]"
          onClick={onBeginRename}
        >
          Перейменувати активний
        </Button>
      </div>

      <div className="rounded-2xl border border-line bg-panelHi p-4">
        <SectionHeading as="div" size="xs">
          {pantryForm.mode === "rename" ? "Нова назва" : "Назва складу"}
        </SectionHeading>
        <div className="mt-2">
          <Input
            value={pantryForm.name}
            onChange={(e) =>
              setPantryForm((f) => ({
                ...f,
                name: e.target.value,
                err: "",
              }))
            }
            placeholder="напр. Дім"
            disabled={busy}
            aria-label="Назва складу"
          />
          {pantryForm.err ? (
            <div className="text-xs text-danger mt-2">{pantryForm.err}</div>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button
            type="button"
            className="h-12 min-h-[44px] bg-nutrition-strong text-white hover:bg-nutrition-hover"
            onClick={() => {
              const name = String(pantryForm.name || "").trim();
              if (!name) {
                setPantryForm((f) => ({ ...f, err: "Вкажи назву." }));
                return;
              }
              onSavePantryForm(name, pantryForm.mode);
            }}
          >
            Зберегти
          </Button>
          <Button
            type="button"
            variant="danger"
            className="h-12 min-h-[44px]"
            onClick={onBeginDelete}
          >
            Видалити активний
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
