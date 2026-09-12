/**
 * Last validated: 2026-08-18
 * Status: Active
 *
 * «У кошик Сільпо» зі списку покупок — екран підтвердження (Silpo
 * integration трек G, спека
 * `docs/90-work/planning/specs/silpo-mcp-integration.md` §
 * «Cart (MCP write path)»).
 *
 * Стадії: preview (search-only, `cartPreview()` — нічого не пише) →
 * підтвердження (людина відмічає позиції, обирає альтернативу, крутить
 * степер) → apply (`cartApply()` пише РІВНО відмічене) → success
 * (підтвердження + посилання на кошик Сільпо, якщо є). Помилки ніколи не
 * пропускаємо нагору — список покупок і решта сторінки лишаються
 * робочими, навіть якщо Сільпо зараз недоступне.
 */
import { useState } from "react";
import { Sheet } from "@shared/components/ui/Sheet";
import { Button } from "@shared/components/ui/Button";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { Icon } from "@shared/components/ui/Icon";
import { Money } from "@shared/components/ui/Money";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import type { SilpoCartDto, SilpoCartMatchDto } from "@shared/api";
import {
  useSilpoCart,
  type SilpoCartErrorKind,
  type SilpoCartRow as SilpoCartRowData,
} from "../hooks/useSilpoCart";
import type { SilpoCartSourceItem } from "../lib/silpoCartItems";

export interface SilpoCartSheetProps {
  open: boolean;
  onClose: () => void;
  /** Невідмічені позиції списку покупок — вже обчислені викликачем. */
  items: SilpoCartSourceItem[];
}

const COPY = messages.nutrition.silpoCart;

function errorCopy(kind: SilpoCartErrorKind): string | null {
  switch (kind) {
    case "not_connected":
      return COPY.errorNotConnected;
    case "reauth_required":
      return COPY.errorReauthRequired;
    case "unavailable":
      return COPY.errorUnavailable;
    case "unknown":
      return COPY.errorUnknown;
    default:
      return null;
  }
}

function ErrorBanner({
  kind,
  onRetry,
}: {
  kind: SilpoCartErrorKind;
  onRetry: () => void;
}) {
  const text = errorCopy(kind);
  if (!text) return null;
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3"
    >
      <Icon
        name="alert-triangle"
        size={16}
        className="mt-0.5 shrink-0 text-warning"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-style-body text-text">{text}</p>
        {/* not_connected/reauth_required вирішуються в Налаштуваннях, не
            повтором того самого запиту — там "спробувати ще раз" лише
            повторив би той самий 409. */}
        {(kind === "unavailable" || kind === "unknown") && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1.5 touch-target text-style-caption text-nutrition-strong dark:text-nutrition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutrition/60 rounded-lg"
          >
            {COPY.retryCta}
          </button>
        )}
      </div>
    </div>
  );
}

function QtyStepper({
  qty,
  onChange,
  disabled,
}: {
  qty: number;
  onChange: (qty: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        aria-label={COPY.decreaseQty}
        disabled={disabled || qty <= 1}
        onClick={() => onChange(qty - 1)}
        className="w-9 h-9 min-h-[44px] min-w-[44px] rounded-xl border border-line flex items-center justify-center text-text hover:bg-panelHi disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutrition/60"
      >
        <Icon name="minus" size={14} aria-hidden />
      </button>
      <span className="w-6 text-center text-style-label tabular-nums text-text">
        {qty}
      </span>
      <button
        type="button"
        aria-label={COPY.increaseQty}
        disabled={disabled}
        onClick={() => onChange(qty + 1)}
        className="w-9 h-9 min-h-[44px] min-w-[44px] rounded-xl border border-line flex items-center justify-center text-text hover:bg-panelHi disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutrition/60"
      >
        <Icon name="plus" size={14} aria-hidden />
      </button>
    </div>
  );
}

function MatchPicker({
  matches,
  selectedLagerId,
  onSelect,
  disabled,
}: {
  matches: SilpoCartMatchDto[];
  selectedLagerId: string | null;
  onSelect: (lagerId: string) => void;
  disabled: boolean;
}) {
  if (matches.length < 2) return null;
  return (
    <label className="text-style-caption text-subtle flex items-center gap-1.5">
      <span className="sr-only">{COPY.altPickerLabel}</span>
      <select
        value={selectedLagerId ?? ""}
        disabled={disabled}
        onChange={(e) => onSelect(e.target.value)}
        className="min-h-[44px] rounded-lg border border-line bg-bg px-2 text-style-caption text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutrition/60 disabled:opacity-50"
      >
        {matches.map((m) => (
          <option key={m.lagerId} value={m.lagerId}>
            {m.name} — {(m.priceKop / 100).toFixed(2)} ₴
          </option>
        ))}
      </select>
    </label>
  );
}

function CartRow({
  row,
  index,
  disabled,
  onToggle,
  onQty,
  onSelectMatch,
}: {
  row: SilpoCartRowData;
  index: number;
  disabled: boolean;
  onToggle: (index: number) => void;
  onQty: (index: number, qty: number) => void;
  onSelectMatch: (index: number, lagerId: string) => void;
}) {
  if (row.unmatched) {
    return (
      <li className="flex items-start gap-2.5 px-1 py-2 rounded-xl">
        <Icon
          name="alert-triangle"
          size={16}
          className="mt-0.5 shrink-0 text-subtle"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="text-style-label text-text truncate">{row.query}</div>
          <div className="text-style-caption text-subtle">{COPY.unmatched}</div>
        </div>
      </li>
    );
  }

  const selected = row.matches.find((m) => m.lagerId === row.selectedLagerId);

  return (
    <li className="grid gap-2 px-1 py-2 rounded-xl hover:bg-panelHi/50 transition-colors">
      <div className="flex items-center gap-2.5">
        <label className="flex items-center gap-2.5 min-w-0 flex-1 touch-target cursor-pointer">
          <input
            type="checkbox"
            checked={row.checked}
            disabled={disabled}
            onChange={() => onToggle(index)}
            className="shrink-0 w-5 h-5 accent-nutrition"
          />
          {/* `min-w-0` на кожній дитині grid — трек інакше має
              `min-width: auto` і `truncate` не спрацьовує (та сама пастка,
              що лагоджена в `SilpoPantryReplenishSheet`). */}
          <span className="min-w-0 flex-1 grid">
            <span
              className={cn(
                "min-w-0 text-style-label text-text truncate",
                !row.checked && "opacity-50",
              )}
            >
              {selected?.name ?? row.query}
            </span>
            {selected && (
              <span className="min-w-0 text-style-caption text-subtle truncate">
                <Money amount={selected.priceKop / 100} kopecks />
                {/* Стара ціна поруч, а не замість: сам по собі значок
                    «-14%» не каже, скільки це в гривнях, а перекреслена
                    сума робить вигоду видимою без арифметики. Сервер уже
                    гарантує, що вона строго більша (`normalizeCartMatch`). */}
                {selected.oldPriceKop != null && (
                  <>
                    {" "}
                    <s className="opacity-60">
                      <Money amount={selected.oldPriceKop / 100} kopecks />
                    </s>{" "}
                    <span className="text-success font-semibold">
                      −
                      {Math.round(
                        (1 - selected.priceKop / selected.oldPriceKop) * 100,
                      )}
                      %
                    </span>
                  </>
                )}
                {" / "}
                {selected.displayRatio ?? selected.unit}
                {!selected.available && (
                  <span className="ml-1 text-warning font-semibold">
                    {COPY.outOfStock}
                  </span>
                )}
              </span>
            )}
          </span>
        </label>
        <QtyStepper
          qty={row.qty}
          disabled={disabled || !row.checked}
          onChange={(qty) => onQty(index, qty)}
        />
      </div>
      <div className="pl-[30px]">
        <MatchPicker
          matches={row.matches}
          selectedLagerId={row.selectedLagerId}
          disabled={disabled || !row.checked}
          onSelect={(lagerId) => onSelectMatch(index, lagerId)}
        />
      </div>
    </li>
  );
}

function SuccessView({
  cart,
  onClose,
  onClear,
  clearPending,
  cleared,
  clearErrorKind,
}: {
  cart: SilpoCartDto;
  onClose: () => void;
  onClear: () => void;
  clearPending: boolean;
  cleared: boolean;
  clearErrorKind: SilpoCartErrorKind;
}) {
  return (
    <div role="status" aria-live="polite" className="grid gap-4">
      <div className="flex items-center gap-2.5">
        <Icon
          name="check-circle"
          size={20}
          className="text-success shrink-0"
          aria-hidden
        />
        <p className="text-style-label text-text">{COPY.successTitle}</p>
      </div>
      <ul className="grid gap-1 rounded-2xl border border-line bg-bg p-3">
        {cart.items.map((item) => (
          <li
            key={item.name}
            className="flex items-center justify-between gap-3 text-style-caption text-text"
          >
            <span className="min-w-0 truncate">
              {item.name} × {item.quantity}
            </span>
            <Money
              amount={item.subtotalKop / 100}
              kopecks
              className="shrink-0"
            />
          </li>
        ))}
      </ul>
      {cart.totalKop != null && (
        <div className="flex items-center justify-between text-style-label text-text">
          <span>{COPY.totalLabel}</span>
          <Money amount={cart.totalKop / 100} kopecks />
        </div>
      )}
      {cart.cartUrl && (
        <a
          href={cart.cartUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[44px] rounded-xl border border-nutrition/40 text-nutrition-strong dark:text-nutrition flex items-center justify-center gap-1.5 text-style-label hover:bg-nutrition/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutrition/60"
        >
          <Icon name="link" size={15} aria-hidden />
          {COPY.successCartLink}
        </a>
      )}
      <Button
        type="button"
        variant="nutrition"
        className="h-12 shadow-none hover:shadow-none dark:shadow-none"
        onClick={onClose}
      >
        {COPY.closeCta}
      </Button>
      {/* Помилився списком — прибрати все одним тапом дешевше, ніж знімати
          позиції по одній у чужому застосунку. Після очищення кнопка
          зникає: чистити порожній кошик нема сенсу. */}
      {/* Збій очищення мусить бути видимим: без банера спінер просто гас,
          кнопка поверталась у вихідний стан, і людина читала це як «нічого
          не сталось», хоча кошик у Сільпо лишався повним. */}
      <ErrorBanner kind={clearErrorKind} onRetry={onClear} />
      {cleared ? (
        <p className="text-style-caption text-subtle text-center">
          {COPY.cleared}
        </p>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-[44px] text-danger-strong dark:text-danger"
          onClick={onClear}
          disabled={clearPending}
          loading={clearPending}
        >
          {clearPending ? COPY.clearing : COPY.clearCta}
        </Button>
      )}
    </div>
  );
}

export function SilpoCartSheet({ open, onClose, items }: SilpoCartSheetProps) {
  const {
    isLoading,
    previewErrorKind,
    refetchPreview,
    rows,
    checkedCount,
    totalKop,
    toggleRow,
    setQty,
    selectMatch,
    apply,
    applyResult,
    applyPending,
    applyErrorKind,
    clear,
    clearResult,
    clearPending,
    clearErrorKind,
    reset,
  } = useSilpoCart({ enabled: open, items });

  const [confirmClear, setConfirmClear] = useState(false);

  // Sheet закрився → локальний вибір скидається (той самий render-phase-
  // reset idiom, що `SilpoPantryReplenishSheet.tsx`).
  const [prevOpen, setPrevOpen] = useState(open);
  if (!open && prevOpen) {
    setPrevOpen(false);
    setConfirmClear(false);
    reset();
  } else if (open && !prevOpen) {
    setPrevOpen(true);
  }

  const busy = applyPending;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={COPY.sheetTitle}
      description={applyResult ? undefined : COPY.sheetDescription}
      panelClassName="nutrition-sheet"
      zIndex={100}
      footer={
        applyResult ? undefined : (
          <div className="flex gap-2 p-4">
            <Button
              type="button"
              variant="secondary"
              className="flex-1 h-12"
              onClick={onClose}
              disabled={busy}
            >
              {COPY.cancelCta}
            </Button>
            <Button
              type="button"
              variant="nutrition"
              className="flex-1 h-12 shadow-none hover:shadow-none dark:shadow-none"
              disabled={busy || checkedCount === 0}
              loading={busy}
              onClick={apply}
            >
              {busy ? COPY.applying : `${COPY.applyCta} (${checkedCount})`}
            </Button>
          </div>
        )
      }
    >
      {applyResult ? (
        <>
          <SuccessView
            cart={clearResult ?? applyResult}
            onClose={onClose}
            onClear={() => setConfirmClear(true)}
            clearPending={clearPending}
            cleared={clearResult != null}
            clearErrorKind={clearErrorKind}
          />
          <ConfirmDialog
            open={confirmClear}
            title={COPY.clearConfirmTitle}
            description={COPY.clearConfirmBody}
            confirmLabel={COPY.clearConfirmCta}
            cancelLabel={COPY.cancelCta}
            danger
            onConfirm={() => {
              setConfirmClear(false);
              clear();
            }}
            onCancel={() => setConfirmClear(false)}
          />
        </>
      ) : (
        <div className="grid gap-4">
          {isLoading && (
            <p className="text-style-caption text-subtle">{COPY.loading}</p>
          )}
          {previewErrorKind && (
            <ErrorBanner kind={previewErrorKind} onRetry={refetchPreview} />
          )}
          {!isLoading && !previewErrorKind && rows.length === 0 && (
            <p className="text-style-caption text-subtle">{COPY.emptyList}</p>
          )}
          {!isLoading && !previewErrorKind && rows.length > 0 && (
            <>
              <ul className="grid gap-0.5">
                {rows.map((row, i) => (
                  <CartRow
                    key={`${i}:${row.query}`}
                    row={row}
                    index={i}
                    disabled={busy}
                    onToggle={toggleRow}
                    onQty={setQty}
                    onSelectMatch={selectMatch}
                  />
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-line pt-3 text-style-label text-text">
                <span>{COPY.totalLabel}</span>
                <Money amount={totalKop / 100} kopecks />
              </div>
              {/* Нагадування приватності перед записом у зовнішній кошик —
                  повний текст обіцянки живе на картці Сільпо в
                  Налаштуваннях (`SilpoPrivacyPromise`). */}
              <p className="text-style-body text-subtle">
                {COPY.privacyReminder}
              </p>
              {applyErrorKind && (
                <ErrorBanner kind={applyErrorKind} onRetry={apply} />
              )}
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
