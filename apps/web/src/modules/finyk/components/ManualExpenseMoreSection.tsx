/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Розкривач «Більше: теги, рахунок» для {@link ManualExpenseSheet} (Ф-1 (а),
 * рішення власника OD-26, 2026-11-18). Сума й категорія стоять нагорі
 * аркуша, а теги й рахунок, якими користуються рідше, живуть тут, після дати.
 *
 * **Дані не ховаються мовчки.** Поки людина не чіпала розкривач, він
 * розкритий, якщо всередині є нетиповий вміст (`hasNonDefault`: теги чи
 * рахунок, відмінний від типового). Типова готівка нового запису розкривач
 * не відкриває, але підпис під заголовком показує, що всередині, тож запис
 * у готівку видно і згорнутим. Модель стану та сама, що в «Інша дата»
 * (`ManualExpenseDateSection`): override людини поверх похідного значення,
 * бо аркуш заповнює форму в мікротаску ПІСЛЯ монтування.
 */
import { useState, type ReactNode } from "react";
import { pluralUa } from "@sergeant/shared";
import { MorphChevron } from "@shared/components/ui/MorphChevron";
import { messages } from "@shared/i18n/uk";
import type { TagSummary } from "@sergeant/finyk-domain/domain/tags";
import { TxTagsField } from "./TxTagsField";
import {
  ManualExpenseAccountSection,
  type ManualAccount,
} from "./ManualExpenseAccountSection";

const copy = messages.finyk.manualExpenseSheet;
const cashCopy = messages.finyk.cashOnHand;

export interface ManualExpenseMoreSectionProps {
  /** Чи є в розкривачі поле тегів і поле рахунку. */
  hasTags: boolean;
  hasAccount: boolean;
  tagCount: number;
  /** Обрано «Готівка на руках». */
  cashSelected: boolean;
  /** Всередині нетиповий вміст: розкриваємо, поки людина не вирішила сама. */
  hasNonDefault: boolean;
  children: ReactNode;
}

export function ManualExpenseMoreSection({
  hasTags,
  hasAccount,
  tagCount,
  cashSelected,
  hasNonDefault,
  children,
}: ManualExpenseMoreSectionProps) {
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const open = openOverride ?? hasNonDefault;

  const title =
    hasTags && hasAccount
      ? copy.moreTagsAccount
      : hasTags
        ? copy.moreTags
        : copy.moreAccount;

  const contents: string[] = [];
  if (hasAccount && cashSelected) contents.push(cashCopy.title);
  if (hasTags && tagCount > 0) {
    contents.push(
      `${tagCount} ${pluralUa(tagCount, {
        one: copy.tagCountOne,
        few: copy.tagCountFew,
        many: copy.tagCountMany,
      })}`,
    );
  }

  return (
    <details
      // Рядок ділиться з «Інша дата» (`ManualExpenseDateSection.after`):
      // розкритий займає весь рядок і переносить вміст під обидва.
      className="min-w-0 open:basis-full"
      open={open}
      onToggle={(event) => setOpenOverride(event.currentTarget.open)}
    >
      {/* Тиха текст-кнопка, як «Інша дата»: `<summary>` лишається нативним
          перемикачем `<details>`, тож `aria-expanded` дає сам браузер. */}
      <summary className="-ml-2 flex min-h-[44px] cursor-pointer list-none items-center gap-2 rounded-lg px-2 hover:bg-panel focus-ring [&::-webkit-details-marker]:hidden">
        <MorphChevron open={open} className="text-subtle" />
        <span className="flex min-w-0 flex-col">
          <span className="text-style-body font-semibold text-text">
            {title}
          </span>
          {contents.length > 0 ? (
            <span className="text-style-caption text-subtle">
              {contents.join(" · ")}
            </span>
          ) : null}
        </span>
      </summary>
      <div className="mt-2 space-y-3">{children}</div>
    </details>
  );
}

export interface ManualExpenseMoreFieldsProps {
  isEditing: boolean;
  /** Теги збереженого запису (редагування) і їхній сетер. */
  tags: readonly string[] | undefined;
  onTagsChange: ((tags: readonly string[]) => void) | undefined;
  /** Чернетка тегів нового запису. */
  draftTags: readonly string[];
  onDraftTagsChange: (tags: readonly string[]) => void;
  knownTags: readonly TagSummary[] | undefined;
  /** Поле рахунку є, лише коли хост дав `onCreateCash`. */
  onCreateCash: ((amountMinor: number) => void) | undefined;
  account: ManualAccount;
  onAccountChange: (account: ManualAccount) => void;
  cashExists: boolean;
  cashCreatedAt: number | undefined;
  /** Останній обраний рахунок для нового запису. */
  defaultAccount: ManualAccount;
  /** День запису для підказки про межу готівки; для надходження — `undefined`. */
  date: string | undefined;
  isSubmitting: boolean;
}

/**
 * Теги й рахунок ручного запису під «Більше» (Ф-1 а). Тут же рішення, чи
 * розкривати: теги або рахунок, відмінний від типового (для нового запису
 * типовий — останній обраний, для редагування — «Без рахунку»).
 */
export function ManualExpenseMoreFields(props: ManualExpenseMoreFieldsProps) {
  const { isEditing, knownTags, onCreateCash, account } = props;
  const hasTags = isEditing ? !!props.onTagsChange : !!knownTags;
  const hasAccount = onCreateCash !== undefined;
  if (!hasTags && !hasAccount) return null;
  const tagCount = isEditing
    ? (props.tags?.length ?? 0)
    : props.draftTags.length;
  const typicalAccount: ManualAccount =
    !isEditing && props.cashExists ? props.defaultAccount : null;
  const hasNonDefault =
    (hasTags && tagCount > 0) || (hasAccount && account !== typicalAccount);
  return (
    <ManualExpenseMoreSection
      hasTags={hasTags}
      hasAccount={hasAccount}
      tagCount={tagCount}
      cashSelected={account === "cash"}
      hasNonDefault={hasNonDefault}
    >
      {isEditing && props.onTagsChange && (
        <TxTagsField
          tags={props.tags ?? []}
          known={knownTags ?? []}
          onChange={props.onTagsChange}
          flush
        />
      )}
      {!isEditing && knownTags && (
        <TxTagsField
          tags={props.draftTags}
          known={knownTags}
          onChange={props.onDraftTagsChange}
          flush
        />
      )}
      {onCreateCash && (
        <ManualExpenseAccountSection
          account={account}
          onAccountChange={props.onAccountChange}
          cashExists={props.cashExists}
          date={props.date}
          cashCreatedAt={props.cashCreatedAt}
          onCreateCash={onCreateCash}
          isSubmitting={props.isSubmitting}
        />
      )}
    </ManualExpenseMoreSection>
  );
}
