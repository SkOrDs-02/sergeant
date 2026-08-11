/**
 * Last validated: 2026-07-20
 * Status: Active
 *
 * Inline category override picker for TxRow. Extracted for Hard Rule #18.
 */
import { useState } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { Input } from "@shared/components/ui/Input";
import { cn } from "@shared/lib/ui/cn";
import { MCC_CATEGORIES, INCOME_CATEGORIES } from "../constants";
import {
  ANALYTICS_EVENTS,
  trackEvent,
} from "../../../core/observability/analytics";
import { readSignalContext } from "../../../core/observability/valueSignalAttribution";
import { catChipVars } from "../lib/categoryChip";
import { stripLeadingEmoji } from "./txRowHelpers";

interface CategoryOption {
  id: string;
  label: string;
}

/**
 * Id вбудованих категорій. Кастомні — усе, чого тут немає
 * (`mergeExpenseCategoryDefinitions` домішує їх до MCC-списку).
 */
const BUILTIN_CATEGORY_IDS: ReadonlySet<string> = new Set([
  ...MCC_CATEGORIES.map((c) => c.id),
  ...INCOME_CATEGORIES.map((c) => c.id),
]);

/**
 * Подія «дію зроблено» для finyk (Хвиля 2, `finyk_tx_categorized`).
 *
 * У payload — ЛИШЕ enum-ознака категорії, а не `categoryId` і не назва:
 * id кастомної категорії створює користувач, тож і high-cardinality
 * property в PostHog, і potential PII (Hard Rule #21 — `scrubPII` чистить
 * за іменами ключів і значення всередині `category_kind` не врятував би).
 *
 * `expense_added` / `income_added` / `budget_set` НЕ дублюються сюди —
 * вони вже емітяться зі своїх write-шляхів; категоризація була єдиною
 * відсутньою дією модуля.
 */
function trackTxCategorized(nextCatId: string | null): void {
  trackEvent(ANALYTICS_EVENTS.FINYK_TX_CATEGORIZED, {
    action: nextCatId === null ? "cleared" : "set",
    category_kind:
      nextCatId === null
        ? null
        : BUILTIN_CATEGORY_IDS.has(nextCatId)
          ? "builtin"
          : "custom",
    ...readSignalContext("finyk"),
  });
}

interface TxRowCategoryPickerProps {
  categories: readonly CategoryOption[];
  currentCatId: string;
  overrideCatId?: string | null | undefined;
  txId: string;
  onCatChange?: ((id: string, catId: string | null) => void) | null | undefined;
  /** User's own free-text annotation for this transaction. */
  note?: string | undefined;
  onNoteChange?: ((id: string, note: string | null) => void) | null | undefined;
  onClose: () => void;
}

const NOTE_MAX_LENGTH = 200;

export function TxRowCategoryPicker({
  categories,
  currentCatId,
  overrideCatId,
  txId,
  onCatChange,
  note,
  onNoteChange,
  onClose,
}: TxRowCategoryPickerProps) {
  const [draftNote, setDraftNote] = useState(note ?? "");
  const commitNote = () => {
    if (draftNote.trim() === (note ?? "").trim()) return;
    onNoteChange?.(txId, draftNote);
  };

  return (
    <div className="pb-3 px-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {categories.map((c, idx) => (
          <button
            key={c.id}
            style={catChipVars(c.id, idx)}
            onClick={() => {
              const nextCatId =
                c.id === currentCatId && overrideCatId ? null : c.id;
              // Повторний тап по ВЖЕ ЗАСТОСОВАНОМУ override — це NO-OP, і подію
              // слати не можна: `finyk_tx_categorized` — чисельник петлі
              // цінності, тож зайвий емiт занижує конверсію назавжди (переписати
              // історію подій не можна). Той самий guard, що `outcome.changed`
              // у `useRoutineAppState`.
              //
              // Умова навмисно вужча за `nextCatId === (overrideCatId ??
              // currentCatId)`: коли override-у ще НЕМА, тап по авто-категорії
              // закріплює її явно — це реальна дія користувача, і вона мусить
              // лишитись у знаменнику.
              if (overrideCatId && nextCatId === overrideCatId) {
                onClose();
                return;
              }
              onCatChange?.(txId, nextCatId);
              trackTxCategorized(nextCatId);
              onClose();
            }}
            className={cn(
              "text-style-caption px-3 py-2 rounded-xl border transition-colors min-h-[34px]",
              "inline-flex items-center gap-1.5",
              // Обрана категорія — заливка ВЛАСНИМ кольором категорії.
              // Спершу тут стояла інверсія чорнила (`bg-text text-bg`) —
              // чорна плашка, яка нічого не каже про те, ЩО обрано; потім
              // акцент модуля — уже краще, але однаковий для всіх 16
              // категорій, тобто підказував лише «обрано», не «що саме».
              // Тепер обрана категорія тримає свій відтінок, і той самий
              // відтінок людина потім бачить у строці транзакції.
              c.id === currentCatId
                ? "cat-chip shadow-sm"
                : "border-line text-subtle hover:border-muted hover:text-text",
            )}
          >
            {/* Необраний чип отримує лише 6px крапку: колір читається,
                але 16 залитих плашок поспіль перетворили б пікер на
                вітраж. Крапка декоративна — назва поруч несе сенс. */}
            <span
              aria-hidden="true"
              className={cn(
                "cat-dot shrink-0 rounded-full w-1.5 h-1.5",
                c.id === currentCatId && "hidden",
              )}
            />
            {stripLeadingEmoji(c.label)}
          </button>
        ))}
        {overrideCatId && (
          <button
            onClick={() => {
              onCatChange?.(txId, null);
              trackTxCategorized(null);
              onClose();
            }}
            className="text-style-caption px-3 py-2 rounded-xl border border-dashed border-danger/40 text-danger-strong dark:text-danger hover:text-danger transition-colors"
          >
            <Icon name="close" size={13} aria-hidden /> Скинути
          </button>
        )}
      </div>
      {onNoteChange && (
        <Input
          size="sm"
          placeholder="Нотатка…"
          value={draftNote}
          maxLength={NOTE_MAX_LENGTH}
          onChange={(e) => setDraftNote(e.target.value)}
          onBlur={commitNote}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            commitNote();
            e.currentTarget.blur();
          }}
          aria-label="Нотатка до транзакції"
        />
      )}
    </div>
  );
}
