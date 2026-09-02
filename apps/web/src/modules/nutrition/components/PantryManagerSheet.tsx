/**
 * Востаннє перевірено: 2026-09-01
 * Статус: Активний
 */
import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Input } from "@shared/components/ui/Input";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { Sheet } from "@shared/components/ui/Sheet";
import { cn } from "@shared/lib/ui/cn";
import {
  isKnownStoragePlace,
  type Pantry,
  type RedistributeMove,
} from "@sergeant/nutrition-domain";

/**
 * Modes a place form can be in:
 * - `idle`: форма схована, аркуш показує тільки список місць і дії.
 * - `create`: інпут — назва нового власного місця.
 * - `rename`: інпут — нова назва місця з `targetId`.
 *
 * UX-roast 2026-05 §3.4: без `idle` кнопка «+ Нове місце» не давала
 * видимої реакції — форма вже й так стояла в режимі створення.
 */
export type PantryFormMode = "idle" | "create" | "rename";

export interface PantryForm {
  mode: PantryFormMode;
  name: string;
  err: string;
  /** Місце, яке перейменовують. `null` для створення. */
  targetId: string | null;
}

interface PantryManagerSheetProps {
  open: boolean;
  onClose: () => void;
  pantries: Pantry[];
  pantryForm: PantryForm;
  setPantryForm: Dispatch<SetStateAction<PantryForm>>;
  busy?: boolean | undefined;
  onSavePantryForm: (
    name: string,
    mode: Exclude<PantryFormMode, "idle">,
    targetId?: string | null,
  ) => void;
  onBeginCreate: () => void;
  onBeginRename: (id: string) => void;
  onBeginDelete: (id: string) => void;
  redistributePlan: readonly RedistributeMove[];
  onRedistribute: () => void;
}

function placeName(pantries: readonly Pantry[], id: string): string {
  return pantries.find((p) => p.id === id)?.name?.trim() || "Комора";
}

export function PantryManagerSheet({
  open,
  onClose,
  pantries,
  pantryForm,
  setPantryForm,
  busy,
  onSavePantryForm,
  onBeginCreate,
  onBeginRename,
  onBeginDelete,
  redistributePlan,
  onRedistribute,
}: PantryManagerSheetProps) {
  const safePantries = Array.isArray(pantries) ? pantries : [];

  const inputRef = useRef<HTMLInputElement | null>(null);
  const isFormVisible =
    pantryForm.mode === "create" || pantryForm.mode === "rename";

  // Коли форма відкрилась (mode != idle) — фокусуємось у інпут одразу,
  // щоб користувач міг почати друкувати без додаткового тапу.
  useEffect(() => {
    if (!open) return;
    if (!isFormVisible) return;
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => window.clearTimeout(id);
  }, [open, isFormVisible, pantryForm.mode]);

  // AI-DANGER: скидання живе в ОБРОБНИКУ закриття, не в тілі рендера і
  // не в ефекті. `setPantryForm` належить батьку (`NutritionApp`): виклик
  // із рендера дитини давав у консоль «Cannot update a component while
  // rendering a different component» (браузерний аудит 2026-09-01), а
  // виклик з ефекту ловить `react-hooks/set-state-in-effect`.
  const handleClose = () => {
    setPantryForm((f) =>
      f.mode === "idle"
        ? f
        : { mode: "idle", name: "", err: "", targetId: null },
    );
    onClose();
  };

  const submit = () => {
    const name = String(pantryForm.name || "").trim();
    if (!name) {
      setPantryForm((f) => ({ ...f, err: "Вкажи назву." }));
      return;
    }
    if (pantryForm.mode === "idle") return;
    onSavePantryForm(name, pantryForm.mode, pantryForm.targetId);
  };

  const formTitle =
    pantryForm.mode === "rename"
      ? `Перейменувати «${placeName(safePantries, pantryForm.targetId ?? "")}»`
      : "Нове місце";
  const formHint =
    pantryForm.mode === "rename"
      ? "Введи нову назву та збережи."
      : "Балкон, погріб, друга морозилка: усе, що є вдома.";

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title="Місця зберігання"
      description="Холодильник, морозилка, комора, і власні, якщо їх більше"
      panelClassName="nutrition-sheet"
      zIndex={100}
    >
      <div className="rounded-2xl border border-line bg-bg overflow-hidden mb-4">
        {safePantries.map((p) => {
          const known = isKnownStoragePlace(p.id);
          const count = Array.isArray(p.items) ? p.items.length : 0;
          return (
            <div
              key={p.id}
              className="flex items-center gap-2 px-2 border-b border-line last:border-0"
            >
              <button
                type="button"
                onClick={() => onBeginRename(p.id)}
                disabled={busy}
                className="flex-1 min-w-0 text-left px-2 py-3 min-h-[44px] rounded-xl hover:bg-panelHi transition-colors"
                aria-label={`Перейменувати «${p.name || "Комора"}»`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-style-label text-text truncate">
                    {p.name || "Комора"}
                  </span>
                  <span className="text-style-caption text-subtle shrink-0">
                    {count}
                  </span>
                </div>
              </button>
              {/*
                Відомі місця не видаляються: це адреси, куди автовизначення
                кладе результат. Без морозилки пельмені їхали б у неіснуючий
                id, і вгадування мовчки перестало б працювати.
              */}
              {!known && (
                <Button
                  variant="ghost"
                  size="xs"
                  iconOnly
                  onClick={() => onBeginDelete(p.id)}
                  disabled={busy}
                  aria-label={`Видалити місце «${p.name || "Комора"}»`}
                  title="Видалити"
                  className="shrink-0 text-subtle hover:text-danger hover:bg-danger/10 transition-colors"
                >
                  <Icon name="trash" size={16} aria-hidden />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mb-4">
        <Button
          type="button"
          variant="nutrition"
          aria-pressed={pantryForm.mode === "create"}
          className={cn(
            // `variant="nutrition"` ships its own lime glow shadow —
            // suppressed here so this sheet's nutrition buttons read as one
            // visual language instead of one glowing and one not.
            "w-full h-12 min-h-[44px] shadow-none hover:shadow-none dark:shadow-none",
            pantryForm.mode === "create" && "ring-2 ring-nutrition/60",
          )}
          onClick={onBeginCreate}
        >
          + Нове місце
        </Button>
      </div>

      {isFormVisible && (
        <div className="rounded-2xl border border-nutrition/40 bg-panelHi p-4">
          <SectionHeading as="div" size="xs" variant="nutrition">
            {formTitle}
          </SectionHeading>
          <p className="text-style-caption text-subtle leading-relaxed mt-1">
            {formHint}
          </p>
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
                  submit();
                }
              }}
              placeholder={
                pantryForm.mode === "rename" ? "Нова назва" : "напр. Балкон"
              }
              disabled={busy}
              aria-label={
                pantryForm.mode === "rename" ? "Нова назва" : "Назва місця"
              }
            />
            {pantryForm.err ? (
              <div className="text-style-caption text-danger-strong dark:text-danger mt-2">
                {pantryForm.err}
              </div>
            ) : null}
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              type="button"
              variant="nutrition"
              className="h-12 min-h-[44px] shadow-none hover:shadow-none dark:shadow-none"
              onClick={submit}
            >
              {pantryForm.mode === "rename" ? "Зберегти" : "Створити"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-12 min-h-[44px]"
              onClick={() =>
                setPantryForm({
                  mode: "idle",
                  name: "",
                  err: "",
                  targetId: null,
                })
              }
              disabled={busy}
            >
              Скасувати
            </Button>
          </div>
        </div>
      )}

      {/*
        Розкладання показує СПИСОК до дії, а не після. Комора — append-only
        журнал (ADR-0077), тож масовий переїзд це подія історії, і людина
        має побачити її, поки ще може передумати.
      */}
      {redistributePlan.length > 0 && (
        <div className="mt-4 rounded-2xl border border-line/60 bg-bg/40 p-4">
          <SectionHeading as="div" size="xs" variant="nutrition">
            Розкласти по місцях
          </SectionHeading>
          <p className="text-style-body text-subtle leading-relaxed mt-1">
            {redistributePlan.length} позицій лежать не там, де їх очікує
            автовизначення. Нічого не переїде, поки не натиснеш.
          </p>
          <ul className="mt-3 grid gap-1">
            {redistributePlan.slice(0, 12).map((move, i) => (
              <li
                key={`${move.name}_${i}`}
                className="flex items-baseline justify-between gap-2 text-style-caption"
              >
                <span className="min-w-0 truncate text-text">{move.name}</span>
                <span className="shrink-0 text-subtle">
                  {placeName(safePantries, move.fromId)} →{" "}
                  {placeName(safePantries, move.toId)}
                </span>
              </li>
            ))}
            {redistributePlan.length > 12 && (
              <li className="text-style-caption text-subtle">
                …і ще {redistributePlan.length - 12}
              </li>
            )}
          </ul>
          <Button
            type="button"
            variant="secondary"
            className="mt-3 w-full h-12 min-h-[44px]"
            onClick={onRedistribute}
            disabled={busy}
          >
            Розкласти по місцях
          </Button>
        </div>
      )}
    </Sheet>
  );
}
