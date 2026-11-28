/**
 * Last validated: 2026-11-26
 * Status: Active
 *
 * «Поповнити комору з покупок Сільпо» — екран підтвердження (Silpo
 * integration трек C, спека
 * `docs/work/specs/silpo-mcp-integration.md` §
 * «Комора — через готовий ledger»).
 *
 * Флоу: список останніх чеків (дефолт — найсвіжіший) → позиції обраного
 * чека з чекбоксами (їстівне — увімкнено, побутова хімія/аптека —
 * вимкнено; `mapReceiptItemToCategory`, `@sergeant/finyk-domain`) →
 * підтвердження одним тапом пише `replenish`-події через ІСНУЮЧИЙ
 * `pantry.upsertItem` (нічого не пишеться мовчки — див.
 * `useSilpoPantryReplenish.ts`).
 *
 * З `offers` той самий аркуш показує нові чеки з картки в огляді (спека
 * `docs/work/specs/silpo-pantry-confirm.md`): кожен чек секцією з датою і
 * «Вже не актуальний», старий чек згорнутий і без галочок.
 */
import { useId, useState } from "react";
import { Sheet } from "@shared/components/ui/Sheet";
import { Button } from "@shared/components/ui/Button";
import { ChoiceCheckbox, ChoiceGroup } from "@shared/components/ui/Choice";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Money } from "@shared/components/ui/Money";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { messages } from "@shared/i18n/uk";
import { failedCopy } from "@shared/i18n/failedCopy";
import { useToast } from "@shared/hooks/useToast";
import { cn } from "@shared/lib/ui/cn";
import { formatReceiptQty } from "@shared/lib/format/receiptQty";
import { formatDateNumeric, KYIV_TIME_ZONE } from "@shared/lib/time/formatDate";
import { MorphChevron } from "@shared/components/ui/MorphChevron";
import { pluralUa } from "@sergeant/shared";
import { useSilpoSyncState } from "@finyk/hooks/useSilpoSyncState";
import {
  useSilpoPantryReplenish,
  type SilpoReplenishSection,
} from "../hooks/useSilpoPantryReplenish";
import type { SilpoPantryOffer } from "../hooks/useSilpoPantryOffers";
import type { SilpoReplenishRow } from "../lib/silpoReplenish";
import type { PantryItem } from "../lib/pantryTextParser";

export interface SilpoPantryReplenishSheetProps {
  open: boolean;
  onClose: () => void;
  pantryItems: readonly Pick<PantryItem, "name">[];
  upsertItem: (items: PantryItem[]) => void;
  busy: boolean;
  /** Режим нових чеків з картки в огляді замість вибору одного чека. */
  offers?: readonly SilpoPantryOffer[] | undefined;
}

const COPY = messages.nutrition.pantryReplenish;

function receiptDate(purchasedAt: string): string {
  // Фінансовий запис → Kyiv-час (domain invariants): день чека не має
  // плавати за TZ пристрою.
  return formatDateNumeric(new Date(purchasedAt), { timeZone: KYIV_TIME_ZONE });
}

/**
 * Рядок згортання: під якою назвою позиція ляже в комору і як це скасувати.
 *
 * Показується ЛИШЕ коли згортання щось змінює — інакше він був би шумом на
 * кожному рядку чека. Кнопка живе поза `ChoiceCheckbox`: вкладений
 * інтерактив перехоплював би тап, призначений перемиканню самої позиції.
 */
function CollapseHint({
  row,
  onToggleKeepFull,
}: {
  row: SilpoReplenishRow;
  onToggleKeepFull: (itemId: number) => void;
}) {
  if (!row.genericName) return null;
  return (
    // Відступ тримає підказку під назвою позиції: позначка `ChoiceCheckbox`
    // = `px-3` (12) + 20 + `gap-3` (12) = 44px.
    <div className="flex items-center gap-2 pl-11 pr-1 pb-1">
      <span className="min-w-0 text-style-caption text-subtle truncate">
        {row.keepFull ? (
          COPY.keepFullActive
        ) : (
          <>
            {COPY.collapsedTo}{" "}
            <span className="text-text">{row.genericName}</span>
          </>
        )}
      </span>
      <Button
        type="button"
        variant="text"
        onClick={() => onToggleKeepFull(row.item.id)}
        className="shrink-0"
      >
        {row.keepFull ? COPY.shortenCta : COPY.keepFullCta}
      </Button>
    </div>
  );
}

function ReceiptItemRow({
  row,
  onToggle,
  onToggleKeepFull,
}: {
  row: SilpoReplenishRow;
  onToggle: (itemId: number) => void;
  onToggleKeepFull: (itemId: number) => void;
}) {
  const qtyLabel = formatReceiptQty(row.item.qty, row.item.unit);
  return (
    <li>
      <ChoiceCheckbox
        checked={row.checked}
        disabled={row.locked}
        onChange={() => onToggle(row.item.id)}
        label={
          <span className="flex items-center gap-2.5">
            {/* `min-w-0` і на собі, і на дітях: назви з чеків Сільпо
                («Молоко Яготинське 2,6% 900г») довгі, без нього `truncate`
                мовчить і рядок розпирає лист. */}
            <span className="grid min-w-0 flex-1">
              <span
                className={cn(
                  "min-w-0 truncate text-style-body font-semibold text-text",
                  !row.checked && "opacity-50",
                )}
              >
                {row.item.name}
              </span>
              <span className="min-w-0 truncate text-style-caption text-muted">
                {/* «Вже в коморі» переважає над «Уже є»/«Нова позиція», поки
                    взятий із чека продукт лежить у коморі (`row.locked`);
                    «Зазвичай не додаєш» пояснює зняту за замовчуванням
                    галочку. */}
                {row.locked
                  ? COPY.alreadyInPantry
                  : row.usuallySkipped && !row.checked
                    ? COPY.usuallySkipped
                    : row.matchedName
                      ? `${COPY.matchedPrefix} ${row.matchedName}`
                      : COPY.newPosition}
              </span>
            </span>
            {qtyLabel && (
              <span className="shrink-0 text-style-body font-medium tabular-nums text-text">
                {qtyLabel}
              </span>
            )}
          </span>
        }
      />
      <CollapseHint row={row} onToggleKeepFull={onToggleKeepFull} />
    </li>
  );
}

function ReceiptRows({
  rows,
  labelledBy,
  onToggle,
  onToggleKeepFull,
}: {
  rows: readonly SilpoReplenishRow[];
  labelledBy: string;
  onToggle: (itemId: number) => void;
  onToggleKeepFull: (itemId: number) => void;
}) {
  return (
    <ul
      role="group"
      aria-labelledby={labelledBy}
      className="divide-y divide-line"
    >
      {rows.map((row) => (
        <ReceiptItemRow
          key={row.item.id}
          row={row}
          onToggle={onToggle}
          onToggleKeepFull={onToggleKeepFull}
        />
      ))}
    </ul>
  );
}

/** Один новий чек у режимі `offers`: шапка з датою і рядки позицій. */
function OfferSection({
  section,
  onToggle,
  onToggleKeepFull,
  onToggleExpanded,
  onDecline,
}: {
  section: SilpoReplenishSection;
  onToggle: (itemId: number) => void;
  onToggleKeepFull: (itemId: number) => void;
  onToggleExpanded: (receiptId: string) => void;
  onDecline: (receiptId: string) => void;
}) {
  const headingId = useId();
  const date = section.purchasedAt ? receiptDate(section.purchasedAt) : "";
  return (
    <section className="min-w-0">
      <div className="flex min-w-0 items-center justify-between gap-2">
        {section.stale ? (
          <button
            type="button"
            className="inline-flex min-h-[44px] min-w-0 items-center gap-1.5 rounded-lg text-style-body font-semibold text-text focus-ring"
            aria-expanded={!section.collapsed}
            onClick={() => onToggleExpanded(section.receiptId)}
          >
            <span id={headingId} className="min-w-0 truncate">
              {date}
            </span>
            <MorphChevron open={!section.collapsed} className="text-subtle" />
          </button>
        ) : (
          <SectionHeading as="h3" size="md" id={headingId}>
            {date}
          </SectionHeading>
        )}
        <Button
          type="button"
          variant="text"
          className="shrink-0"
          onClick={() => onDecline(section.receiptId)}
        >
          {COPY.declineReceiptCta}
        </Button>
      </div>
      {section.stale && (
        <p className="mb-2 text-style-caption text-subtle">
          {COPY.staleReceiptHint.replace(
            "{age}",
            `${section.ageDays} ${pluralUa(section.ageDays, { one: "день", few: "дні", many: "днів" })}`,
          )}
        </p>
      )}
      {!section.collapsed && (
        <ReceiptRows
          rows={section.rows}
          labelledBy={headingId}
          onToggle={onToggle}
          onToggleKeepFull={onToggleKeepFull}
        />
      )}
    </section>
  );
}

export function SilpoPantryReplenishSheet({
  open,
  onClose,
  pantryItems,
  upsertItem,
  busy,
  offers,
}: SilpoPantryReplenishSheetProps) {
  const toast = useToast();
  const itemsHeadingId = useId();
  const {
    receipts,
    receiptsLoading,
    selectedReceiptId,
    selectReceipt,
    detailLoading,
    sections,
    rows,
    checkedCount,
    toggleItem,
    toggleKeepFull,
    toggleExpanded,
    declineReceipt,
    confirm,
    confirmPending,
    reset,
  } = useSilpoPantryReplenish({
    enabled: open,
    pantryItems,
    upsertItem,
    offers,
  });
  // Підказка про тумблер - лише поки він вимкнений (спека § Рішення
  // дизайну, «Тумблер»). `enabled: open` - той самий гейт, що й решта
  // запитів цього аркуша, кеш спільний із `PantrySourceTabs`.
  const { data: syncState } = useSilpoSyncState({ enabled: open });

  // Sheet закрився → локальний вибір скидається, наступне відкриття
  // стартує з чистого стану (той самий render-phase-reset idiom, що
  // `PantryManagerSheet.tsx`).
  const [prevOpen, setPrevOpen] = useState(open);
  if (!open && prevOpen) {
    setPrevOpen(false);
    reset();
  } else if (open && !prevOpen) {
    setPrevOpen(true);
  }

  async function handleDecline(receiptId: string) {
    try {
      await declineReceipt(receiptId);
    } catch {
      toast.error(failedCopy("прибрати чек"), undefined, {
        label: "Повторити",
        onClick: () => void handleDecline(receiptId),
      });
    }
  }

  async function handleConfirm() {
    // Бронювання йде на сервер до запису в комору: без мережі воно падає, і
    // без тосту аркуш просто мовчав би.
    try {
      const added = await confirm();
      if (added > 0) onClose();
    } catch {
      toast.error(failedCopy("додати продукти з чека"), undefined, {
        label: "Повторити",
        onClick: () => void handleConfirm(),
      });
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={offers ? COPY.offersSheetTitle : COPY.sheetTitle}
      description={offers ? COPY.offersSheetDescription : COPY.sheetDescription}
      panelClassName="nutrition-sheet"
      zIndex={100}
      footer={
        <div className="flex gap-2 p-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-12"
            onClick={onClose}
            disabled={busy || confirmPending}
          >
            {COPY.cancelCta}
          </Button>
          <Button
            type="button"
            variant="solid"
            className="flex-1 h-12"
            disabled={busy || confirmPending || checkedCount === 0}
            onClick={() => void handleConfirm()}
          >
            {COPY.confirmCta}
            {checkedCount > 0 ? ` (${checkedCount})` : ""}
          </Button>
        </div>
      }
    >
      {offers ? (
        <div className="grid min-w-0 gap-5">
          <p className="text-style-body text-subtle">{COPY.privacyReminder}</p>
          {sections.length === 0 ? (
            <p className="text-style-caption text-subtle">{COPY.offersEmpty}</p>
          ) : (
            sections.map((section) => (
              <OfferSection
                key={section.receiptId}
                section={section}
                onToggle={toggleItem}
                onToggleKeepFull={toggleKeepFull}
                onToggleExpanded={toggleExpanded}
                onDecline={(id) => void handleDecline(id)}
              />
            ))
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {syncState?.pantryAutoImportSince == null && (
            <p className="text-style-caption text-subtle">
              {COPY.autoImportOffHint}
            </p>
          )}
          <section>
            <SectionHeading as="h3" size="md" className="mb-2">
              {COPY.receiptsHeading}
            </SectionHeading>
            {receiptsLoading ? (
              <p className="text-style-caption text-subtle">{COPY.loading}</p>
            ) : receipts.length === 0 ? (
              <EmptyState compact title={COPY.receiptsEmptyTitle} />
            ) : (
              <ChoiceGroup
                variant="rows"
                ariaLabel={COPY.receiptsHeading}
                className="border-y border-line"
                value={selectedReceiptId}
                onChange={selectReceipt}
                items={receipts.map((r) => ({
                  value: r.receiptId,
                  label: (
                    <span className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate text-style-body font-semibold">
                          {receiptDate(r.purchasedAt)}
                        </span>
                        {r.pantryClaimedCount > 0 && (
                          <span className="shrink-0 text-style-caption">
                            {COPY.inPantryChip}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums text-style-body font-medium">
                        <Money amount={r.totalKop / 100} kopecks />
                      </span>
                    </span>
                  ),
                }))}
              />
            )}
          </section>

          {selectedReceiptId && (
            <section>
              <SectionHeading
                as="h3"
                size="md"
                id={itemsHeadingId}
                className="mb-2"
              >
                {COPY.itemsHeading}
              </SectionHeading>
              {/* Нагадування приватності перед поповненням комори — повний
                текст обіцянки живе на картці Сільпо в Налаштуваннях
                (`SilpoPrivacyPromise`). */}
              <p className="text-style-body text-subtle mb-2">
                {COPY.privacyReminder}
              </p>
              {detailLoading ? (
                <p className="text-style-caption text-subtle">{COPY.loading}</p>
              ) : rows.length === 0 ? (
                <p className="text-style-caption text-subtle">
                  {COPY.itemsEmpty}
                </p>
              ) : (
                <ReceiptRows
                  rows={rows}
                  labelledBy={itemsHeadingId}
                  onToggle={toggleItem}
                  onToggleKeepFull={toggleKeepFull}
                />
              )}
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}
