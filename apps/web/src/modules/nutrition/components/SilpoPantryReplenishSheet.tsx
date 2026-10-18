/**
 * Last validated: 2026-08-18
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
 */
import { useState } from "react";
import { Sheet } from "@shared/components/ui/Sheet";
import { Button } from "@shared/components/ui/Button";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Money } from "@shared/components/ui/Money";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { messages } from "@shared/i18n/uk";
import { failedCopy } from "@shared/i18n/failedCopy";
import { useToast } from "@shared/hooks/useToast";
import { cn } from "@shared/lib/ui/cn";
import { formatReceiptQty } from "@shared/lib/format/receiptQty";
import { formatDateNumeric, KYIV_TIME_ZONE } from "@shared/lib/time/formatDate";
import { useSilpoSyncState } from "@finyk/hooks/useSilpoSyncState";
import { useSilpoPantryReplenish } from "../hooks/useSilpoPantryReplenish";
import type { SilpoReplenishRow } from "../lib/silpoReplenish";
import type { PantryItem } from "../lib/pantryTextParser";

export interface SilpoPantryReplenishSheetProps {
  open: boolean;
  onClose: () => void;
  pantryItems: readonly Pick<PantryItem, "name">[];
  upsertItem: (items: PantryItem[]) => void;
  busy: boolean;
}

const COPY = messages.nutrition.pantryReplenish;

/**
 * Рядок згортання: під якою назвою позиція ляже в комору і як це скасувати.
 *
 * Показується ЛИШЕ коли згортання щось змінює — інакше він був би шумом на
 * кожному рядку чека. Кнопка живе поза `<label>` чекбокса: вкладений
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
    // Відступ тримає підказку під назвою позиції, а не під чекбоксом, тож
    // він СУМУЄ провідні елементи рядка: чекбокс `w-5` (20) + `gap-2.5` (10)
    // = 30px. Міняєш склад або розміри провідних елементів у
    // `ReceiptItemRow` — перерахуй тут; звʼязок структурний, але
    // виражений числом, і мовчить, коли розходиться.
    <div className="flex items-center gap-2 pl-[30px] pr-1 pb-1">
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
      <button
        type="button"
        onClick={() => onToggleKeepFull(row.item.id)}
        aria-pressed={row.keepFull}
        className="shrink-0 text-style-caption text-subtle underline underline-offset-2 touch-target px-2 rounded-lg hover:text-text focus-ring transition-colors"
      >
        {row.keepFull ? COPY.collapseCta : COPY.keepFullCta}
      </button>
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
      {/* Native label+checkbox — той самий touch-target-патерн, що вже
          несе `PantryParsePreview` (input min 20px усередині 44px label). */}
      <label
        className={cn(
          "flex items-center gap-2.5 touch-target transition-colors",
          row.locked ? "cursor-default" : "hover:bg-line/40 cursor-pointer",
        )}
      >
        <input
          type="checkbox"
          checked={row.checked}
          disabled={row.locked}
          onChange={() => onToggle(row.item.id)}
          className="shrink-0 w-5 h-5 accent-text"
        />
        {/* `min-w-0` потрібен і на СОБІ, і на кожній дитині: у grid трек
            за замовчуванням `min-width: auto`, тож дитина не стискається
            менше за свій текст і `truncate` мовчки не спрацьовує — рядок
            розпирає лист. З рукописними назвами комори це непомітно, а
            назви з чеків Сільпо («Молоко Яготинське 2,6% 900г») довгі. */}
        <span className="min-w-0 flex-1 grid">
          <span
            className={cn(
              "min-w-0 text-style-body font-semibold text-text truncate",
              !row.checked && "opacity-50",
            )}
          >
            {row.item.name}
          </span>
          <span className="min-w-0 text-style-caption text-muted truncate">
            {/* «Вже в коморі» переважає над «Уже є»/«Нова позиція», поки
                взятий із чека продукт лежить у коморі (`row.locked`). */}
            {row.locked
              ? COPY.alreadyInPantry
              : row.matchedName
                ? `${COPY.matchedPrefix} ${row.matchedName}`
                : COPY.newPosition}
          </span>
        </span>
        {qtyLabel && (
          <span className="text-style-body font-medium text-text tabular-nums shrink-0">
            {qtyLabel}
          </span>
        )}
      </label>
      <CollapseHint row={row} onToggleKeepFull={onToggleKeepFull} />
    </li>
  );
}

export function SilpoPantryReplenishSheet({
  open,
  onClose,
  pantryItems,
  upsertItem,
  busy,
}: SilpoPantryReplenishSheetProps) {
  const toast = useToast();
  const {
    receipts,
    receiptsLoading,
    selectedReceiptId,
    selectReceipt,
    detailLoading,
    rows,
    checkedCount,
    toggleItem,
    toggleKeepFull,
    confirm,
    confirmPending,
    reset,
  } = useSilpoPantryReplenish({ enabled: open, pantryItems, upsertItem });
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
      title={COPY.sheetTitle}
      description={COPY.sheetDescription}
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
            <div className="divide-y divide-line border-y border-line">
              {receipts.map((r) => {
                const active = r.receiptId === selectedReceiptId;
                return (
                  <button
                    key={r.receiptId}
                    type="button"
                    onClick={() => selectReceipt(r.receiptId)}
                    className={cn(
                      "w-full flex items-center justify-between gap-3 touch-target py-2.5 hover:bg-line/40 focus-ring transition-colors text-left",
                      active && "bg-line/60",
                    )}
                    aria-pressed={active}
                  >
                    <span className="min-w-0 flex items-center gap-2">
                      {/* Фінансовий запис → Kyiv-час (domain invariants):
                          день чека не має плавати за TZ пристрою. */}
                      <span className="min-w-0 text-style-body font-semibold text-text truncate">
                        {formatDateNumeric(new Date(r.purchasedAt), {
                          timeZone: KYIV_TIME_ZONE,
                        })}
                      </span>
                      {r.pantryClaimedCount > 0 && (
                        <span className="shrink-0 text-style-caption text-muted">
                          {COPY.inPantryChip}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums text-style-body font-medium text-text">
                      <Money amount={r.totalKop / 100} kopecks />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {selectedReceiptId && (
          <section>
            <SectionHeading as="h3" size="md" className="mb-2">
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
              <ul className="divide-y divide-line">
                {rows.map((row) => (
                  <ReceiptItemRow
                    key={row.item.id}
                    row={row}
                    onToggle={toggleItem}
                    onToggleKeepFull={toggleKeepFull}
                  />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </Sheet>
  );
}
