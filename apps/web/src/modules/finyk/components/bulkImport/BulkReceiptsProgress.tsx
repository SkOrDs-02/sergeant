/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * "Чеки пачкою" — прогрес по файлах + компактний review (магазин/сума/
 * категорія на рядок) + «Зберегти вибрані» (спека § Фаза 2а).
 * Деталізоване редагування позицій НЕ тут: «Редагувати» (`onEditItem`)
 * відкриває повний `ReceiptReviewForm` того чека у викликачі
 * (`ReceiptScanSheet`, стадія batch-edit) — бета-фідбек №3, 2026-08-18.
 * Порожній драфт («схоже, не чек») позначається бейджем і приходить
 * авто-виключеним (`useBulkReceiptsImport.startFiles`).
 */
import { AnimatedCheckbox } from "@shared/components/ui/AnimatedCheckbox";
import { Badge } from "@shared/components/ui/Badge";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { Select } from "@shared/components/ui/Select";
import { Spinner } from "@shared/components/ui/Spinner";
import { Money } from "@shared/components/ui/Money";
import type { CustomCategoryInput } from "@sergeant/finyk-domain";
import { CATEGORY_DISPLAY, CATEGORY_SLUGS } from "../manualExpenseCategories";
import { draftLooksUnrecognized } from "../receiptDraftEdit";
import type {
  BatchReceiptItem,
  BatchReceiptStatus,
} from "../../hooks/useBulkReceiptsImport";

export interface BulkReceiptsProgressProps {
  items: BatchReceiptItem[];
  isProcessing: boolean;
  isSaving: boolean;
  onSetCategory: (id: string, category: string) => void;
  onToggleIncluded: (id: string) => void;
  /** Відкрити повний review-екран чека (бета-фідбек №3) — опційний, бо
   * компонент сам по собі про список, а глибина живе у викликачі. */
  onEditItem?: ((id: string) => void) | undefined;
  onSaveAll: () => void;
  customCategories?: readonly CustomCategoryInput[] | undefined;
}

function statusLabel(status: BatchReceiptStatus): string {
  switch (status) {
    case "pending":
      return "У черзі…";
    case "fetching":
      return "Розпізнаю…";
    case "saving":
      return "Зберігаю…";
    case "saved":
      return "Збережено";
    case "already-exists":
      return "Уже було збережено";
    case "fetch-error":
      return "Не розпізнано";
    case "save-error":
      return "Не збережено";
    default:
      return "";
  }
}

function ItemRow({
  item,
  onSetCategory,
  onToggleIncluded,
  onEditItem,
  disabled,
}: {
  item: BatchReceiptItem;
  onSetCategory: (id: string, category: string) => void;
  onToggleIncluded: (id: string) => void;
  onEditItem?: ((id: string) => void) | undefined;
  disabled: boolean;
}) {
  const canEdit = item.status === "drafted";
  const unrecognized =
    canEdit && item.draft ? draftLooksUnrecognized(item.draft) : false;
  const isDone = item.status === "saved" || item.status === "already-exists";
  const isError = item.status === "fetch-error" || item.status === "save-error";

  return (
    <li className="p-2.5">
      <div className="flex items-start gap-2">
        {canEdit ? (
          <button
            type="button"
            onClick={() => onToggleIncluded(item.id)}
            disabled={disabled}
            aria-label={item.included ? "Виключити чек" : "Включити чек"}
            className="touch-target mt-0.5 shrink-0"
          >
            <AnimatedCheckbox
              checked={item.included}
              variant="finyk"
              size="sm"
              decorative
            />
          </button>
        ) : (
          <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center">
            {item.status === "fetching" || item.status === "saving" ? (
              <Spinner size="xs" />
            ) : isDone ? (
              <Icon
                name="check-circle"
                size={16}
                className="text-success-strong dark:text-success"
                aria-hidden
              />
            ) : isError ? (
              <Icon
                name="x-circle"
                size={16}
                className="text-danger-strong dark:text-danger"
                aria-hidden
              />
            ) : null}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-style-label text-text">
            {item.draft?.store || item.fileName}
          </p>
          {canEdit && item.draft ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-style-caption tabular-nums text-muted">
                <Money amount={item.draft.totalKopiykas / 100} kopecks />
              </span>
              <Select
                size="sm"
                aria-label={`Категорія: ${item.draft.store || item.fileName}`}
                value={item.category}
                disabled={disabled}
                onChange={(e) => onSetCategory(item.id, e.target.value)}
                className="max-w-[10rem]"
              >
                {CATEGORY_SLUGS.map((slug) => (
                  <option key={slug} value={slug}>
                    {CATEGORY_DISPLAY[slug]?.label ?? slug}
                  </option>
                ))}
              </Select>
              {unrecognized ? (
                <Badge variant="warning" tone="soft" size="xs">
                  схоже, не чек
                </Badge>
              ) : (
                item.draft.source === "vision" && (
                  <Badge variant="warning" tone="soft" size="xs">
                    з фото
                  </Badge>
                )
              )}
              {onEditItem && (
                <Button
                  type="button"
                  variant="ghost"
                  tone="finyk"
                  size="xs"
                  disabled={disabled}
                  onClick={() => onEditItem(item.id)}
                >
                  Редагувати
                </Button>
              )}
            </div>
          ) : (
            <p
              className={
                isError
                  ? "text-style-caption text-danger-strong dark:text-danger"
                  : "text-style-caption text-muted"
              }
            >
              {item.error ?? statusLabel(item.status)}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export function BulkReceiptsProgress({
  items,
  isProcessing,
  isSaving,
  onSetCategory,
  onToggleIncluded,
  onEditItem,
  onSaveAll,
}: BulkReceiptsProgressProps) {
  const readyCount = items.filter(
    (i) => i.status === "drafted" && i.included,
  ).length;
  const doneCount = items.filter(
    (i) => i.status === "saved" || i.status === "already-exists",
  ).length;
  const allSettled =
    !isProcessing &&
    items.every((i) =>
      ["fetch-error", "saved", "already-exists", "save-error"].includes(
        i.status,
      ),
    );

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line rounded-2xl border border-line">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            onSetCategory={onSetCategory}
            onToggleIncluded={onToggleIncluded}
            onEditItem={onEditItem}
            disabled={isProcessing || isSaving}
          />
        ))}
      </ul>

      {!allSettled ? (
        <Button
          className="w-full"
          module="finyk"
          loading={isSaving}
          disabled={isProcessing || readyCount === 0}
          onClick={onSaveAll}
        >
          {isProcessing
            ? "Розпізнаю чеки…"
            : `Зберегти вибрані (${readyCount})`}
        </Button>
      ) : (
        <p className="text-center text-style-caption text-muted">
          Збережено {doneCount} з {items.length}.
        </p>
      )}
    </div>
  );
}
