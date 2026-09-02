/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { Icon, type IconName } from "@shared/components/ui/Icon";
import { Button } from "@shared/components/ui/Button";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Tooltip } from "@shared/components/ui/Tooltip";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import { NAME_MAX_LEN, NOTE_MAX_LEN } from "@shared/lib/text/limits";
import { formatPantryQty } from "../lib/formatPantryQty";
import { PantryListGuide, PantryParsePreview } from "./PantryParsePanel";
import { PantryAmbiguousQtyPrompt } from "./PantryAmbiguousQtyPrompt";
import type { PantryParsePreview as PantryParsePreviewData } from "../hooks/useNutritionPantries";
import { groupItemsByCategory } from "../lib/foodCategories";
import type { FoodCategory } from "../lib/foodCategories";
import type { PantryItem } from "../lib/pantryTextParser";
import type { PantryItemSource } from "@sergeant/nutrition-domain";
import { isPantryItemLowStock } from "../lib/pantryLowStock";
import type { AmbiguousPantryUnit } from "../lib/pantryAmbiguousUnitMemory";

/**
 * Мінімальний "view-shape" елемента комори для `ItemRow`. Runtime-потік
 * приносить сюди і канонічний `PantryItem`, і сирі результати парсера
 * (`parseLoosePantryText`), у яких `qty`/`unit` можуть бути `null`. Тому
 * поля свідомо optional — шлях до рендеру не повинен падати на відсутніх
 * значеннях, але типізуючий контракт відсікає "тихі" перейменування
 * полів (`name` → `title`), які раніше провалювались у `: any`.
 */
type PantryItemView = Partial<PantryItem> & {
  name?: string;
  /** Місце зберігання позиції. Відсутнє лише на легасі-шляху сирого тексту. */
  pantryId?: string;
};

// Назви описують спосіб вводу, а не те, що вводиться: «Продукт»/«Список»
// читалось як два різні типи запису, ще й плуталось із вкладкою «Покупки».
const INPUT_MODES = [
  { id: "single", label: "По одному" },
  { id: "list", label: "Списком" },
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

/**
 * Фактичні покупки, що злились у позицію. Кількості вже в базовій одиниці
 * (інваріант картки продукту), тож `formatReceiptQty` тут просто форматує
 * число з одиницею, а не розбирає фасування.
 */
function VariantList({ sources }: { sources: readonly PantryItemSource[] }) {
  return (
    <ul className="pl-8 pr-2 pb-1 grid gap-0.5">
      {sources.map((s, i) => (
        <li
          key={`${s.name}_${s.addedAt ?? ""}_${i}`}
          className="flex items-baseline justify-between gap-2"
        >
          <span className="min-w-0 text-style-caption text-subtle truncate">
            {s.name}
          </span>
          <span className="shrink-0 text-style-caption text-subtle tabular-nums">
            {/*
              «2 × 250 мл», а не «500 мл»: пляшки 500 мл людина не купувала,
              і побачити її серед своїх покупок означає не впізнати власну
              комору. Розмір фасування деривується, бо `qty` варіанта — це
              вже добуток (`units.ts` § receiptPackCount).
            */}
            {s.packCount && s.packCount > 1
              ? `${s.packCount} × ${formatPantryQty(s.qty / s.packCount, s.unit)}`
              : formatPantryQty(s.qty, s.unit)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ItemRow({
  item,
  idx,
  editItemAt,
  removeItemAtOrByName,
  busy,
}: ItemRowProps) {
  // Сирий `unit` із чека Сільпо буває фасуванням («0,25л»), не одиницею
  // виміру, тож `${qty} ${unit}` давало «2 0,25л».
  const qtyLabel = formatPantryQty(item?.qty, item?.unit);
  const sources = Array.isArray(item?.sources) ? item.sources : [];
  // Контрол розгортання — лише від ДВОХ покупок: на одній розкривати
  // нічого, і зайва стрілка читалась би як обіцянка деталей, яких немає.
  const expandable = sources.length >= 2;
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex items-center gap-2 px-2 rounded-xl group min-h-[44px] hover:bg-panelHi/50 transition-colors">
        {expandable && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={
              open
                ? messages.nutrition.pantrySources.collapseLabel
                : messages.nutrition.pantrySources.expandLabel
            }
            className="shrink-0 text-subtle touch-target flex items-center justify-center rounded-xl hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutrition/60 transition-colors"
          >
            <ChevronIcon open={open} />
          </button>
        )}
        <button
          type="button"
          onClick={() => editItemAt(idx)}
          disabled={busy}
          // `items-center` тримає текст по центру 44px-кнопки, а базову
          // лінію між назвою і кількістю дає внутрішній `items-baseline`.
          // З одним лише `items-baseline` вміст прилипав до верху, і після
          // зняття перемикача місця (який раніше тримав висоту) хрестик
          // видалення поїхав нижче назви.
          className="flex-1 min-w-0 flex items-center gap-1.5 text-left min-h-[44px]"
          aria-label={`Редагувати ${item?.name || "продукт"}`}
        >
          {/*
           * `title` тут не косметика: назви з чека довші за рядок майже
           * завжди («Йогурт Галичина Карпатський чорниця» — 248 px при
           * доступних 202), і без підказки повний текст видно лише в
           * аркуші редагування (браузерний аудит 2026-09-01).
           */}
          <span className="min-w-0 flex items-baseline gap-1.5">
            <span
              className="text-style-label text-text truncate"
              title={item?.name || undefined}
            >
              {item?.name || "—"}
            </span>
            {qtyLabel && (
              <span className="text-style-caption text-subtle shrink-0">
                {qtyLabel}
              </span>
            )}
          </span>
          {isPantryItemLowStock(item) && (
            <span className="inline-flex items-center gap-1 text-style-caption text-warning-strong dark:text-warning shrink-0">
              <Icon name="trending-down" size={12} aria-hidden />
              {messages.nutrition.pantryLowStock.badge}
            </span>
          )}
        </button>
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          onClick={() => removeItemAtOrByName(idx, item?.name)}
          disabled={busy}
          aria-label={`Прибрати ${item?.name || "продукт"}`}
          title="Прибрати"
          className="shrink-0 text-subtle sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:ring-2 sm:focus-visible:ring-focus/45 sm:focus-visible:opacity-100 hover:text-danger hover:bg-danger/10 transition-[color,background-color,opacity]"
        >
          ×
        </Button>
      </div>
      {expandable && open && <VariantList sources={sources} />}
    </div>
  );
}

interface CategorySectionProps {
  cat: Pick<FoodCategory, "id" | "iconName" | "label">;
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
        className="flex items-center justify-between w-full gap-2 px-3 py-2 min-h-[44px]"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 min-w-0">
          <ChevronIcon open={open} />
          <Icon
            name={cat.iconName as IconName}
            size={16}
            className="text-nutrition shrink-0"
            aria-hidden
          />
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
  placeFilter: string | null;
}

function InventoryCard({
  effectiveItems,
  editItemAt,
  removeItemAtOrByName,
  pantryItemsLength,
  busy,
  placeFilter,
}: InventoryCardProps) {
  const userToggledRef = useRef(false);
  const [mainOpen, setMainOpen] = useState(true);

  // Групування рахується по ПОВНОМУ списку, а фільтр звужує вже його.
  // Інакше `idx` усередині категорії перестав би бути глобальною адресою
  // позиції, і редагування правило б чужий продукт.
  const groups = useMemo(() => {
    const all = groupItemsByCategory<PantryItemView>(effectiveItems);
    if (!placeFilter) return all;
    return all
      .map((g) => ({
        ...g,
        items: g.items.filter(({ item }) => item?.pantryId === placeFilter),
      }))
      .filter((g) => g.items.length > 0);
  }, [effectiveItems, placeFilter]);

  const visibleCount = useMemo(
    () => groups.reduce((sum, g) => sum + g.items.length, 0),
    [groups],
  );

  useEffect(() => {
    if (userToggledRef.current) return;
    setMainOpen(true);
  }, [effectiveItems.length]);

  if (effectiveItems.length === 0) {
    return (
      <Card className="p-4">
        <EmptyState
          size="sm"
          module="nutrition"
          icon={<Icon name="package" size={20} />}
          title={messages.nutrition.pantryEmpty.title}
          description={messages.nutrition.pantryEmpty.description}
          examplePreview={
            <div className="grid gap-1 text-style-caption text-subtle">
              <span>курка 500 г</span>
              <span>яйце 10 шт</span>
              <span>огірок 4 шт</span>
            </div>
          }
          hint={messages.nutrition.pantryEmpty.hint}
        />
      </Card>
    );
  }

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
        className="flex items-center justify-between w-full gap-2 min-h-[44px]"
        aria-expanded={mainOpen}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronIcon open={mainOpen} />
          <span className="text-style-label text-text">Моя комора</span>
          <span className="text-style-caption text-subtle">
            (
            {placeFilter
              ? `${visibleCount} з ${pantryItemsLength}`
              : pantryItemsLength}
            )
          </span>
        </div>
      </button>

      {/* `grid-cols-[minmax(0,1fr)]`, а не дефолтний `auto`-трек: `auto`
          росте до min-content найширшої дитини, а min-content рядка комори —
          це повний текст назви під `truncate` (`white-space: nowrap`). Довгі
          назви з чека Сільпо через це розпирали картку за межі екрана. */}
      {mainOpen && (
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2">
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
  parsePreview?: PantryParsePreviewData | null;
  confirmParsePreview?: (items: PantryItem[]) => void;
  dismissParsePreview?: () => void;
  placeFilter: string | null;
  /**
   * UX-4 (аудит 2026-09-01) — позиції з `upsertItem`, чиє хвостове число без
   * одиниці лишилось неоднозначним. Необовʼязкові — сторінки, що ще не
   * прокидають підказку (тести, старі snapshot-и), просто її не бачать.
   */
  ambiguousPantryItems?: PantryItem[];
  resolveAmbiguousPantryItem?: (idx: number, unit: AmbiguousPantryUnit) => void;
  dismissAmbiguousPantryItem?: (idx: number) => void;
  /**
   * Запамʼятовує вибір «шт»/«г» для рядка режиму «Списком» одразу на тапі
   * (`PantryParsePreview`), незалежно від подальшого підтвердження списку.
   */
  rememberAmbiguousChoice?: (name: string, unit: AmbiguousPantryUnit) => void;
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
  parsePreview,
  confirmParsePreview,
  dismissParsePreview,
  placeFilter,
  ambiguousPantryItems,
  resolveAmbiguousPantryItem,
  dismissAmbiguousPantryItem,
  rememberAmbiguousChoice,
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
                  className="w-8 h-8 min-h-[44px] min-w-[44px] rounded-xl bg-nutrition/10 text-nutrition-strong dark:text-nutrition border border-nutrition/30 hover:bg-nutrition/20 transition-colors disabled:opacity-50 flex items-center justify-center"
                  aria-label="Сканувати штрих-код"
                >
                  <Icon name="scanner" size={18} aria-hidden />
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
                    "px-3 py-1.5 min-h-[44px] rounded-xl text-style-caption transition-colors",
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
              maxLength={NAME_MAX_LEN}
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
                // `h-11` = 2.75rem, а на 320px корінний шрифт 15px → 41.25px і провал
                // 44px-флору; px-флор під coarse pointer, як у `Button`/`Input`.
                "text-style-label px-4 h-11 pointer-coarse:min-h-[44px] rounded-2xl shrink-0",
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
              maxLength={NOTE_MAX_LEN}
              disabled={busy}
            />
            <button
              type="button"
              onClick={parsePantry}
              disabled={busy || !pantryText.trim()}
              className={cn(
                // Той самий 44px-флор, що й у «Додати» вище: `h-11` дає
                // 41.25px на 320px, а це вже дві кнопки того самого блоку
                // з тим самим дефектом (ревʼю CodeRabbit 2026-08-26).
                "text-style-label shrink-0 px-4 h-11 pointer-coarse:min-h-[44px] rounded-2xl mt-0.5",
                "bg-nutrition-strong text-white hover:bg-nutrition-hover disabled:opacity-50 transition-colors",
              )}
            >
              Розібрати
            </button>
          </div>
        )}

        {mode === "list" && <PantryListGuide />}

        {ambiguousPantryItems &&
          ambiguousPantryItems.length > 0 &&
          resolveAmbiguousPantryItem &&
          dismissAmbiguousPantryItem && (
            <PantryAmbiguousQtyPrompt
              items={ambiguousPantryItems}
              onResolve={resolveAmbiguousPantryItem}
              onDismiss={dismissAmbiguousPantryItem}
              busy={busy}
            />
          )}

        {parsePreview && confirmParsePreview && dismissParsePreview && (
          <PantryParsePreview
            preview={parsePreview}
            onConfirm={confirmParsePreview}
            onDismiss={dismissParsePreview}
            busy={busy}
            onResolveAmbiguousUnit={(item, unit) =>
              rememberAmbiguousChoice?.(item.name, unit)
            }
          />
        )}
      </Card>

      <InventoryCard
        effectiveItems={effectiveItems}
        editItemAt={editItemAt}
        removeItemAtOrByName={removeItemAtOrByName}
        pantryItemsLength={pantryItemsLength}
        busy={busy}
        placeFilter={placeFilter}
      />
    </>
  );
}
