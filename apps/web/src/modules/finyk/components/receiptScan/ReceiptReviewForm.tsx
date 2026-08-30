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
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { Input } from "@shared/components/ui/Input";
import { Label } from "@shared/components/ui/FormField";
import { Select } from "@shared/components/ui/Select";
import {
  HARD_MAX_DAY_KEY,
  HARD_MIN_DAY_KEY,
} from "@shared/lib/time/dateBounds";
import type { ReceiptDraft } from "@sergeant/api-client";
import type { CustomCategoryInput } from "@sergeant/finyk-domain";
import {
  CATEGORY_DISPLAY,
  CATEGORY_SLUGS,
  upgradeCategoryAllowingCustom,
  type CategoryDisplay,
} from "../manualExpenseCategories";
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

  const customIds = new Set(
    customCategories
      .filter(
        (c): c is CustomCategoryInput => typeof c?.id === "string" && !!c.id,
      )
      .map((c) => c.id),
  );
  const customDisplay: Readonly<Record<string, CategoryDisplay>> =
    Object.fromEntries(
      customCategories
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
    ...customCategories.map((c) => c.id).filter((id) => !!id),
  ];

  const handleEditItem = (index: number, patch: EditableItemPatch) =>
    setDraft((d) => updateDraftItem(d, index, patch));
  const handleRemoveItem = (index: number) =>
    setDraft((d) => removeDraftItem(d, index));
  const handleAddItem = () => setDraft((d) => addBlankDraftItem(d));

  return (
    <div className="space-y-4">
      {draft.source === "vision" && (
        <Badge
          variant="warning"
          tone="soft"
          size="sm"
          className="inline-flex items-center gap-1.5"
        >
          <Icon name="camera" size={12} aria-hidden />
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
          <Input
            id={dateId}
            type="date"
            min={HARD_MIN_DAY_KEY}
            max={HARD_MAX_DAY_KEY}
            value={draftDateKey(draft)}
            onChange={(e) => {
              if (e.target.value)
                setDraft((d) => updateDraftDate(d, e.target.value));
            }}
            disabled={disabled}
            // `appearance-none min-w-0` — нативний date-інпут iOS має
            // intrinsic-ширину від UA-стилів і не стискається під вузьку
            // grid-колонку, тому візуально налазив на сусіднє поле «Сума»
            // (бета-фідбек №2, 2026-08-18).
            className="appearance-none min-w-0"
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
            // `pointer-coarse:text-base!` мусить бути поруч із важливим
            // `text-style-body!` (≈15px на вузькому екрані), інакше той
            // бʼє неважливий 16px-floor бази і iOS знову зумить екран на
            // фокусі саме цього поля (бета-фідбек №2, 2026-08-18 — «клік
            // по сумі все ще зумить»; той самий патерн, що BulkReviewTable).
            // eslint-disable-next-line sergeant-design/no-raw-type-size -- анти-зум ІНВАРІАНТ контрола вводу (iOS: input <16px → авто-зум), не типографічна шкала.
            className="h-11! w-full text-style-body! pointer-coarse:text-base!"
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
            tone="finyk"
            size="xs"
            onClick={handleAddItem}
            disabled={disabled}
          >
            <Icon name="plus" size={13} aria-hidden />
            Додати позицію
          </Button>
        </div>
        {draft.items.length > 0 ? (
          <ul className="mt-1 rounded-2xl border border-line bg-panelHi/40 px-3">
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
    </div>
  );
}
