import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { Icon } from "@shared/components/ui/Icon";
import { Tooltip } from "@shared/components/ui/Tooltip";
import { cn } from "@shared/lib/ui/cn";
import { groupItemsByCategory } from "../lib/foodCategories";
import type { FoodCategory } from "../lib/foodCategories";
import type { PantryItem } from "../lib/pantryTextParser";

/**
 * Мінімальний "view-shape" елемента комори для `ItemRow`. Runtime-потік
 * приносить сюди і канонічний `PantryItem`, і сирі результати парсера
 * (`parseLoosePantryText`), у яких `qty`/`unit` можуть бути `null`. Тому
 * поля свідомо optional — шлях до рендеру не повинен падати на відсутніх
 * значеннях, але типізуючий контракт відсікає "тихі" перейменування
 * полів (`name` → `title`), які раніше провалювались у `: any`.
 */
type PantryItemView = Partial<PantryItem> & { name?: string };

const INPUT_MODES = [
  { id: "single", label: "Продукт" },
  { id: "list", label: "Список" },
];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <Icon
      name="chevron-right"
      size={14}
      className={cn("transition-transform shrink-0", open && "rotate-90")}
    />
  );
}

interface ItemRowProps {
  item: PantryItemView;
  idx: number;
  editItemAt: (idx: number) => void;
  removeItemAtOrByName: (idx: number, name?: string) => void;
  busy: boolean;
}

function ItemRow({
  item,
  idx,
  editItemAt,
  removeItemAtOrByName,
  busy,
}: ItemRowProps) {
  return (
    <div className="flex items-center gap-2 py-2 first:pt-1 group">
      <button
        type="button"
        onClick={() => editItemAt(idx)}
        disabled={busy}
        className="flex-1 min-w-0 flex items-baseline gap-1.5 text-left"
        aria-label={`Редагувати ${item?.name || "продукт"}`}
      >
        <span className="text-style-label text-text truncate">
          {item?.name || "—"}
        </span>
        {(item?.qty != null || item?.unit) && (
          <span className="text-xs text-subtle shrink-0">
            {item?.qty != null && item?.unit
              ? `${item.qty} ${item.unit}`
              : item?.qty != null
                ? `${item.qty}`
                : item?.unit || ""}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => removeItemAtOrByName(idx, item?.name)}
        disabled={busy}
        className="w-6 h-6 rounded-xl flex items-center justify-center text-subtle/60 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 hover:text-danger hover:bg-danger/10 transition-[color,background-color,opacity] text-sm leading-none shrink-0"
        aria-label={`Прибрати ${item?.name || "продукт"}`}
        title="Прибрати"
      >
        ×
      </button>
    </div>
  );
}

interface CategorySectionProps {
  cat: Pick<FoodCategory, "id" | "emoji" | "label">;
  items: Array<{ item: PantryItemView; idx: number }>;
  editItemAt: (idx: number) => void;
  removeItemAtOrByName: (idx: number, name?: string) => void;
  busy: boolean;
  defaultOpen: boolean;
}

function CategorySection({
  cat,
  items,
  editItemAt,
  removeItemAtOrByName,
  busy,
  defaultOpen,
}: CategorySectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-line/40 bg-bg/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full gap-2 px-3 py-2"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 min-w-0">
          <ChevronIcon open={open} />
          <span className="text-sm" aria-hidden>
            {cat.emoji}
          </span>
          <span className="text-style-label text-text truncate">
            {cat.label}
          </span>
        </span>
        <span className="text-style-caption text-subtle shrink-0">
          {items.length}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-1 divide-y divide-line/40">
          {items.map(({ item, idx }) => (
            <ItemRow
              key={`${String(item?.name || idx)}_${idx}`}
              item={item}
              idx={idx}
              editItemAt={editItemAt}
              removeItemAtOrByName={removeItemAtOrByName}
              busy={busy}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface InventoryCardProps {
  effectiveItems: PantryItemView[];
  editItemAt: (idx: number) => void;
  removeItemAtOrByName: (idx: number, name?: string) => void;
  pantryItemsLength: number;
  busy: boolean;
}

function InventoryCard({
  effectiveItems,
  editItemAt,
  removeItemAtOrByName,
  pantryItemsLength,
  busy,
}: InventoryCardProps) {
  const userToggledRef = useRef(false);
  const [mainOpen, setMainOpen] = useState(true);

  const groups = useMemo(
    () => groupItemsByCategory<PantryItemView>(effectiveItems),
    [effectiveItems],
  );

  useEffect(() => {
    if (userToggledRef.current) return;
    setMainOpen(true);
  }, [effectiveItems.length]);

  if (effectiveItems.length === 0) return null;

  // Якщо позицій небагато — одразу розкриваємо категорії всередині.
  const openByDefault = effectiveItems.length <= 12;

  return (
    <Card className="p-4">
      <button
        type="button"
        onClick={() => {
          userToggledRef.current = true;
          setMainOpen((v) => !v);
        }}
        className="flex items-center justify-between w-full gap-2"
        aria-expanded={mainOpen}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronIcon open={mainOpen} />
          <span className="text-style-label text-text">Мій склад</span>
          <span className="text-style-caption text-subtle">
            ({pantryItemsLength})
          </span>
        </div>
      </button>

      {mainOpen && (
        <div className="mt-3 grid gap-2">
          {groups.map((g) => (
            <CategorySection
              key={g.cat.id}
              cat={g.cat}
              items={g.items}
              editItemAt={editItemAt}
              removeItemAtOrByName={removeItemAtOrByName}
              busy={busy}
              defaultOpen={openByDefault}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

interface PantryCardProps {
  busy: boolean;
  parsePantry: () => void;
  newItemName: string;
  setNewItemName: (v: string) => void;
  upsertItem: (raw: string | PantryItem | PantryItem[]) => void;
  pantryText: string;
  setPantryText: (v: string) => void;
  effectiveItems: PantryItemView[];
  editItemAt: (idx: number) => void;
  removeItemAtOrByName: (idx: number, name?: string) => void;
  pantryItemsLength: number;
  /**
   * Опційний agregated-summary комори (total, warnings). Shape-free —
   * не рендериться всередині цього файлу, лише пробрасується вгору.
   */
  pantrySummary?: unknown;
  onScanBarcode?: () => void;
}

export function PantryCard({
  busy,
  parsePantry,
  newItemName,
  setNewItemName,
  upsertItem,
  pantryText,
  setPantryText,
  effectiveItems,
  editItemAt,
  removeItemAtOrByName,
  pantryItemsLength,
  onScanBarcode,
}: PantryCardProps) {
  const [mode, setMode] = useState("single");

  return (
    <>
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="text-style-label text-text">Додати продукти</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {typeof onScanBarcode === "function" && (
              <Tooltip content="Сканувати штрих-код" placement="bottom-center">
                <button
                  type="button"
                  onClick={onScanBarcode}
                  disabled={busy}
                  className="w-8 h-8 rounded-xl bg-nutrition/10 text-nutrition-strong dark:text-nutrition border border-nutrition/30 hover:bg-nutrition/20 transition-colors disabled:opacity-50 flex items-center justify-center text-base"
                  aria-label="Сканувати штрих-код"
                >
                  📷
                </button>
              </Tooltip>
            )}
            <div className="flex rounded-xl bg-panelHi border border-line p-0.5">
              {INPUT_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors",
                    mode === m.id
                      ? "bg-nutrition-strong text-white shadow-sm"
                      : "text-subtle hover:text-text",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {mode === "single" ? (
          <div className="flex gap-2 items-center">
            <Input
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newItemName.trim()) {
                  upsertItem(newItemName);
                  setNewItemName("");
                }
              }}
              placeholder="напр. лосось 300г"
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => {
                upsertItem(newItemName);
                setNewItemName("");
              }}
              disabled={busy || !newItemName.trim()}
              className={cn(
                "text-style-label px-4 h-11 rounded-2xl shrink-0",
                "bg-nutrition-strong text-white hover:bg-nutrition-hover disabled:opacity-50 transition-colors",
              )}
            >
              Додати
            </button>
          </div>
        ) : (
          <div className="flex gap-2 items-start">
            <textarea
              value={pantryText}
              onChange={(e) => setPantryText(e.target.value)}
              placeholder={'напр. "2 яйця, курка 500г, рис, огірки, сир"'}
              className="input-focus-nutrition flex-1 min-h-[96px] rounded-2xl bg-panel border border-line px-4 py-3 text-sm text-text placeholder:text-subtle"
              disabled={busy}
            />
            <button
              type="button"
              onClick={parsePantry}
              disabled={busy || !pantryText.trim()}
              className={cn(
                "text-style-label shrink-0 px-4 h-11 rounded-2xl mt-0.5",
                "bg-nutrition-strong text-white hover:bg-nutrition-hover disabled:opacity-50 transition-colors",
              )}
            >
              Розібрати
            </button>
          </div>
        )}
      </Card>

      <InventoryCard
        effectiveItems={effectiveItems}
        editItemAt={editItemAt}
        removeItemAtOrByName={removeItemAtOrByName}
        pantryItemsLength={pantryItemsLength}
        busy={busy}
      />
    </>
  );
}
