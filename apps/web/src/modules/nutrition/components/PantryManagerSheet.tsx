import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Input } from "@shared/components/ui/Input";
import { Button } from "@shared/components/ui/Button";
import { Sheet } from "@shared/components/ui/Sheet";
import { cn } from "@shared/lib/ui/cn";
import type { Pantry } from "@sergeant/nutrition-domain";

/**
 * Modes a pantry form can be in:
 * - `idle`: form is hidden, sheet шows тільки список + кнопки дій.
 * - `create`: input is the name of a brand-new склад to add.
 * - `rename`: input is the new name for the active склад.
 *
 * Defined as an explicit union so call-sites and state shapes stay aligned
 * (`PantryManagerSheet`, `useNutritionPantries`, `NutritionOverlays`).
 *
 * UX-roast 2026-05 §3.4: Раніше форма за замовчуванням стояла у `create`
 * mode і інпут «Назва складу» одразу був видимий. Користувач натискав
 * «+ Новий склад» — нічого візуально не змінювалось, бо форма вже й
 * так в стані створення. Тепер додаємо `idle`, у який фолбекаємось
 * між діями: натиск кнопки «+ Новий склад» гарантовано показує форму
 * і фокусує інпут (бо ми переходимо з `idle` → `create`).
 */
export type PantryFormMode = "idle" | "create" | "rename";

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
  onSavePantryForm: (
    name: string,
    mode: Exclude<PantryFormMode, "idle">,
  ) => void;
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
  const safePantries = Array.isArray(pantries) ? pantries : [];
  const activePantry =
    safePantries.find((p) => p.id === activePantryId) ?? null;
  const activeName = activePantry?.name?.trim() || "Склад";
  // Гарантуємо хоча б один склад: останній не показуємо в розділі
  // «Інше → Видалити», бо `onConfirmDeletePantry` для нього no-op
  // (щоб не залишити користувача зовсім без сховища).
  const canDeleteActive = safePantries.length > 1 && activePantry !== null;

  // UX-roast 2026-05 §3.4: «Видалити активний» — небезпечна дія, що
  // майже ніколи не потрібна. Сховали її за роздільником «Інше», який
  // користувач має явно розкрити, щоб уникнути випадкового тапу
  // одразу після створення/перейменування. Стан розкриття — local UI,
  // не персистимо.
  const [moreOpen, setMoreOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const isFormVisible =
    pantryForm.mode === "create" || pantryForm.mode === "rename";

  // Коли форма відкрилась (mode != idle) — фокусуємось у інпут одразу,
  // щоб користувач міг почати друкувати без додаткового тапу. Це і є
  // те видиме «щось сталося», якого бракувало раніше.
  useEffect(() => {
    if (!open) return;
    if (!isFormVisible) return;
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => window.clearTimeout(id);
  }, [open, isFormVisible, pantryForm.mode]);

  // При закритті sheet — повертаємо форму в `idle`, щоб наступне
  // відкриття було без застряглого минулого стану.
  useEffect(() => {
    if (open) return;
    setMoreOpen(false);
    setPantryForm((f) =>
      f.mode === "idle" ? f : { mode: "idle", name: "", err: "" },
    );
  }, [open, setPantryForm]);

  const formTitle =
    pantryForm.mode === "rename"
      ? `Перейменувати «${activeName}»`
      : "Новий склад";
  const formHint =
    pantryForm.mode === "rename"
      ? "Введи нову назву та збережи."
      : "Введи назву нового складу та натисни «Створити».";

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
              onClick={() => {
                if (active) {
                  onBeginRename();
                } else {
                  setActivePantryId(p.id);
                }
              }}
              className={cn(
                "w-full text-left px-4 py-3 border-b border-line last:border-0 hover:bg-panelHi transition-colors",
                active && "bg-nutrition/10",
              )}
              aria-pressed={active}
            >
              <div className="flex items-center justify-between gap-3">
                <div
                  className={cn(
                    "text-style-label text-text truncate",
                    active &&
                      "underline decoration-nutrition/30 underline-offset-2",
                  )}
                >
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

      <div className="mb-4">
        <Button
          type="button"
          aria-pressed={pantryForm.mode === "create"}
          className={cn(
            "w-full h-12 min-h-[44px] bg-nutrition-strong text-white hover:bg-nutrition-hover",
            pantryForm.mode === "create" && "ring-2 ring-nutrition/60",
          )}
          onClick={onBeginCreate}
        >
          + Новий склад
        </Button>
      </div>

      {isFormVisible && (
        <div className="rounded-2xl border border-nutrition/40 bg-panelHi p-4">
          <SectionHeading as="div" size="xs">
            {formTitle}
          </SectionHeading>
          <p className="text-xs text-subtle leading-relaxed mt-1">{formHint}</p>
          <div className="mt-3">
            <Input
              ref={inputRef}
              value={pantryForm.name}
              onChange={(e) =>
                setPantryForm((f) => ({
                  ...f,
                  name: e.target.value,
                  err: "",
                }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const name = String(pantryForm.name || "").trim();
                  if (!name) {
                    setPantryForm((f) => ({ ...f, err: "Вкажи назву." }));
                    return;
                  }
                  if (pantryForm.mode === "idle") return;
                  onSavePantryForm(name, pantryForm.mode);
                }
              }}
              placeholder={
                pantryForm.mode === "rename"
                  ? "Нова назва"
                  : "напр. Дім, Робота, Дача"
              }
              disabled={busy}
              aria-label={
                pantryForm.mode === "rename" ? "Нова назва" : "Назва складу"
              }
            />
            {pantryForm.err ? (
              <div className="text-xs text-danger mt-2">{pantryForm.err}</div>
            ) : null}
          </div>
          {/*
           * PR-37 ux-roast 2026-Q3 / §3.2 + 2026-05 / §3.4: пара
           * «Зберегти / Скасувати». «Скасувати» згортає форму назад в
           * `idle`-стан замість закриття всього sheet, щоб користувач
           * міг одразу натиснути іншу дію (наприклад, перейменувати).
           */}
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
                if (pantryForm.mode === "idle") return;
                onSavePantryForm(name, pantryForm.mode);
              }}
            >
              {pantryForm.mode === "rename" ? "Зберегти" : "Створити"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-12 min-h-[44px]"
              onClick={() => setPantryForm({ mode: "idle", name: "", err: "" })}
              disabled={busy}
            >
              Скасувати
            </Button>
          </div>
        </div>
      )}

      {canDeleteActive && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className={cn(
              "w-full flex items-center justify-between gap-2",
              "text-xs text-subtle hover:text-text transition-colors",
              "py-2 border-t border-line/60",
            )}
            aria-expanded={moreOpen}
            aria-controls="pantry-more-actions"
          >
            <span>Інше</span>
            <span aria-hidden>{moreOpen ? "▴" : "▾"}</span>
          </button>
          {moreOpen && (
            <div
              id="pantry-more-actions"
              className="rounded-2xl border border-line/60 bg-bg/40 p-4 mt-2"
            >
              <SectionHeading as="div" size="xs">
                Небезпечна зона
              </SectionHeading>
              <p className="text-xs text-subtle leading-relaxed mt-1">
                Видалить активний склад «{activeName}» разом з усіма продуктами
                в ньому. Дію не можна відмінити.
              </p>
              <button
                type="button"
                onClick={onBeginDelete}
                disabled={busy}
                className={cn(
                  "mt-3 inline-flex items-center gap-1.5 text-xs font-semibold",
                  "text-danger hover:text-danger/80 disabled:opacity-50",
                  "transition-colors",
                )}
              >
                🗑 Видалити активний склад
              </button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
