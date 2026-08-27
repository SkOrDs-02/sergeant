/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Одне гривневе поле для review-екрана чек-скану — той самий
 * `useDecimalDraft` контракт, що `TxRowSplitEditor.tsx::SplitAmountInput`
 * (кома не зникає під пальцями, порожнє поле ≠ 0). Тут — окремий файл,
 * бо поле спільне для `ReceiptReviewForm` (сума чека) і
 * `ReceiptReviewItemRow` (ціна/сума позиції).
 *
 * Clear-to-0 round-trip (CodeRabbit round 5, PR #818): очищення поля
 * комітить `onCommitKopiykas(0)` (порожнє → `hryvnia ?? 0` → `0`), батько
 * пише `kopiykas=0` назад у стан, і БЕЗ фіксу нижче цей зовнішній `0`
 * повертається сюди як `committed=0` — а `useDecimalDraft` бачить
 * "зовнішнє 0 ≠ чернетка-null" і форсовано переписує щойно очищене поле
 * на "0" (`useDecimalDraft.ts` докстрінг: "порожнє — це НЕ 0"). Фікс:
 * `kopiykas === 0` мапиться на `null` ще ДО того, як зайде в
 * `useDecimalDraft`, — тоді зовнішнє "порожньо" і чернетка-null
 * збігаються, і синхронізація мовчить. `onCommitKopiykas` як і раніше
 * отримує справжній `0` для порожнього поля — контракт назовні
 * не міняється, лише вхід у хук.
 */
import { useDecimalDraft } from "@shared/hooks/useDecimalDraft";
import { MAX_AMOUNT_HRYVNIA } from "@shared/lib/format/amount";
import { cn } from "@shared/lib/ui/cn";

export interface ReceiptMoneyInputProps {
  /** Значення в копійках (домен-інваріант) — конвертується в гривні лише
   * для показу/редагування тут. */
  kopiykas: number;
  onCommitKopiykas: (kopiykas: number) => void;
  ariaLabel: string;
  /** Привʼязка до `<Label htmlFor>` — опційна: не кожен виклик має власний
   * лейбл (напр. `ReceiptReviewItemRow` покладається лише на `ariaLabel`). */
  id?: string | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

export function ReceiptMoneyInput({
  kopiykas,
  onCommitKopiykas,
  ariaLabel,
  id,
  disabled,
  className,
}: ReceiptMoneyInputProps) {
  const draft = useDecimalDraft(
    kopiykas === 0 ? null : kopiykas / 100,
    MAX_AMOUNT_HRYVNIA,
    (hryvnia) => {
      onCommitKopiykas(Math.round((hryvnia ?? 0) * 100));
    },
    { group: true },
  );
  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      value={draft.value}
      onChange={draft.onChange}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder="0"
      className={cn(
        // `pointer-coarse:text-base` — 16px floor на тачі: менший шрифт у
        // полі вводу змушує iOS Safari авто-зумити екран при фокусі
        // (бета-фідбек 2026-08-18 «клік на суму збільшує екран»). На
        // fine-pointer лишається caption — там зум-поведінки немає.
        // Семантичні ролі тут не рятують: навіть text-style-body на
        // вузькому екрані ~15px (<16) і все одно зумить.
        // `pointer-coarse:min-h-11` — 44px touch-target floor (WCAG 2.5.5)
        // на тачі; на десктопі лишається компактний h-9.
        // eslint-disable-next-line sergeant-design/no-raw-type-size -- анти-зум ІНВАРІАНТ контрола вводу (iOS: input <16px → авто-зум), не типографічна шкала.
        "input-focus-finyk h-9 min-w-0 rounded-xl border border-line bg-panelHi px-2 text-right text-style-caption text-text tabular-nums pointer-coarse:min-h-11 pointer-coarse:text-base",
        className,
      )}
    />
  );
}
