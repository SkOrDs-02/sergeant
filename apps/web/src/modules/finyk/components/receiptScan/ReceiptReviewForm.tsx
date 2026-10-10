/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Review-екран чек-скану v1 (спека § Web UI / § Флоу v1): редаговані
 * магазин/дата/сума/позиції + категорія-дропдаун (founder D3,
 * 2026-07-24: категорії — дропдаун, не чипи) + бейдж "з фото" для
 * vision-джерела. Save/Cancel живуть у `Sheet.footer` викликача
 * (`ReceiptScanSheet`) — цей компонент лише редагує поля.
 */
import { useId } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Badge } from "@shared/components/ui/Badge";
import { Card } from "@shared/components/ui/Card";
import { Button } from "@shared/components/ui/Button";

import { DateField } from "@shared/components/ui/DateField";
import { Input } from "@shared/components/ui/Input";
import { Label } from "@shared/components/ui/FormField";
import { Select } from "@shared/components/ui/Select";
import type { ReceiptDraft } from "@sergeant/api-client";
import type { CustomCategoryInput } from "@sergeant/finyk-domain";
import {
  CATEGORY_DISPLAY,
  CATEGORY_SLUGS,
  upgradeCategoryAllowingCustom,
  type CategoryDisplay,
} from "../manualExpenseCategories";
import { expenseCustomCategories } from "../manualIncomeCategories";
import {
  addBlankDraftItem,
  draftDateKey,
  removeDraftItem,
  updateDraftDate,
  updateDraftItem,
  updateDraftStore,
  updateDraftTotalKopiykas,
} from "../receiptDraftEdit";
import { ReceiptMoneyInput } from "./receiptMoneyInput";
import {
  ReceiptReviewItemRow,
  type EditableItemPatch,
} from "./ReceiptReviewItemRow";

export interface ReceiptReviewFormProps {
  draft: ReceiptDraft;
  setDraft: Dispatch<SetStateAction<ReceiptDraft>>;
  category: string;
  setCategory: (category: string) => void;
  customCategories?: readonly CustomCategoryInput[] | undefined;
  /** Locks every field while a save is in flight. */
  disabled?: boolean;
}

export function ReceiptReviewForm({
  draft,
  setDraft,
  category,
  setCategory,
  customCategories = [],
  disabled = false,
}: ReceiptReviewFormProps) {
  // Unique per mounted form instance (React.useId) — a hardcoded literal id
  // ("receipt-store" etc.) collides if this form is ever mounted twice at
  // once, silently breaking `<Label htmlFor>` pairing for one of the two
  // (CodeRabbit round 5, PR #818).
  const formId = useId();
  const storeId = `${formId}-store`;
  const dateId = `${formId}-date`;
  const totalId = `${formId}-total`;
  const categoryId = `${formId}-category`;

  const expenseCategories = expenseCustomCategories(customCategories);
  const customIds = new Set(expenseCategories.map((c) => c.id));
  const customDisplay: Readonly<Record<string, CategoryDisplay>> =
    Object.fromEntries(
      expenseCategories
        .filter((c) => c?.id && c.label)
        .map((c) => [c.id, { iconName: "tag" as const, label: c.label ?? "" }]),
    );
  const categoryDisplay: Readonly<Record<string, CategoryDisplay>> = {
    ...CATEGORY_DISPLAY,
    ...customDisplay,
  };
  const categorySlug = upgradeCategoryAllowingCustom(category, customIds);
  const categorySlugs: string[] = [
    ...CATEGORY_SLUGS,
    ...expenseCategories.map((c) => c.id),
  ];

  const handleEditItem = (index: number, patch: EditableItemPatch) =>
    setDraft((d) => updateDraftItem(d, index, patch));
  const handleRemoveItem = (index: number) =>
    setDraft((d) => removeDraftItem(d, index));
  const handleAddItem = () => setDraft((d) => addBlankDraftItem(d));

  return (
    <Card prominence="receipt" className="space-y-4">
      {draft.source === "vision" && (
        <Badge
          variant="warning"
          tone="soft"
          size="sm"
          className="inline-flex items-center gap-1.5"
        >
          розпізнано з фото, перевір суми
        </Badge>
      )}

      <div>
        <Label htmlFor={storeId}>Магазин</Label>
        <Input
          id={storeId}
          value={draft.store}
          onChange={(e) =>
            setDraft((d) => updateDraftStore(d, e.target.value.slice(0, 300)))
          }
          disabled={disabled}
          placeholder="Назва магазину"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <Label htmlFor={dateId}>Дата</Label>
          {/* Спільний примітив замість сирого `Input type="date"` з
              саморобними `appearance-none min-w-0`. Нативний date-інпут iOS
              має intrinsic-ширину від UA-стилів і не стискається під вузьку
              grid-колонку — він налазив на сусіднє поле «Сума» (бета-фідбек
              №2, 2026-08-18). `DateField` несе той самий контракт повністю
              (`min-w-0` + `max-w-full` + явний `inline-size: 100%`), тож
              локальна копія більше не розходитиметься з оригіналом.
              Рецепт: docs/start/instructions/fix-mobile-horizontal-overflow.md */}
          <DateField
            id={dateId}
            // Мітка секції — окремий `<Label>`, а `DateField` інакше назвав
            // би поле службовим «Обери дату» (він завжди ставить собі
            // доступне імʼя).
            aria-label="Дата"
            value={draftDateKey(draft)}
            onChange={(e) => {
              if (e.target.value)
                setDraft((d) => updateDraftDate(d, e.target.value));
            }}
            disabled={disabled}
          />
        </div>
        <div className="min-w-0">
          <Label htmlFor={totalId}>Сума</Label>
          <ReceiptMoneyInput
            id={totalId}
            kopiykas={draft.totalKopiykas}
            onCommitKopiykas={(k) =>
              setDraft((d) => updateDraftTotalKopiykas(d, k))
            }
            ariaLabel="Сума чека"
            disabled={disabled}
            // `pointer-coarse:text-style-body!` мусить бути поруч із важливим
            // `text-style-body!` (≈15px на вузькому екрані), інакше той
            // бʼє неважливий 16px-floor бази і iOS знову зумить екран на
            // фокусі саме цього поля (бета-фідбек №2, 2026-08-18 — «клік
            // по сумі все ще зумить»; той самий патерн, що BulkReviewTable).

            className="h-11! w-full text-style-body! pointer-coarse:text-style-body!"
          />
        </div>
      </div>

      <div>
        <Label htmlFor={categoryId}>Категорія</Label>
        <Select
          id={categoryId}
          value={categorySlug}
          disabled={disabled}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="" disabled>
            Обери категорію
          </option>
          {categorySlugs.map((slug) => (
            <option key={slug} value={slug}>
              {categoryDisplay[slug]?.label ?? slug}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="text-style-label text-text">
            Позиції ({draft.items.length})
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={handleAddItem}
            disabled={disabled}
          >
            Додати позицію
          </Button>
        </div>
        {draft.items.length > 0 ? (
          <ul className="mt-1 rounded-xl border border-line bg-panel px-3">
            {draft.items.map((item, index) => (
              <ReceiptReviewItemRow
                key={`${item.position}-${index}`}
                item={item}
                index={index}
                disabled={disabled}
                onEditItem={handleEditItem}
                onRemove={handleRemoveItem}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-style-caption text-muted">
            Позиції не розпізнано, лише сума й магазин.
          </p>
        )}
      </div>
    </Card>
  );
}
