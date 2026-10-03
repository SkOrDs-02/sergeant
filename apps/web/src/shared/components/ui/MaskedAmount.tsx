/**
 * Sergeant Design System — MaskedAmount (#9 blur-to-reveal)
 *
 * Privacy affordance for monetary values. Replaces the old "hide behind
 * `••••`" pattern: instead of erasing the number (which leaves an empty,
 * uninformative slot), the real value stays in place but is blurred, and a
 * tap peeks it for a couple of seconds before it re-hides itself.
 *
 * Two modes:
 *   - interactive (default) — renders a <button>; tap toggles a temporary
 *     reveal (auto re-hides after REVEAL_MS). Use where the value is NOT
 *     already inside another interactive element (e.g. the amount column of
 *     a transaction row).
 *   - static (`interactive={false}`) — renders a blurred <span> with an
 *     sr-only label and no tap handler. Use inside an existing button/link
 *     (e.g. the day-group header, which is itself a collapse toggle) to
 *     avoid nesting interactive elements.
 *
 * When `masked` is false the component is transparent — it renders the
 * formatted string exactly as a plain <span>, so callers can always wrap
 * their amounts unconditionally.
 *
 * Motion: the blur→sharp transition is gated behind `motion-safe`, so users
 * with `prefers-reduced-motion: reduce` get an instant swap with no easing.
 */
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { cn } from "@shared/lib/ui/cn";
import { useHaptic } from "@shared/hooks/useHaptic";
import { messages } from "@shared/i18n/uk";

/** How long a tap-peek stays revealed before auto-hiding again. */
const REVEAL_MS = 2500;
/** Blur radius applied to a masked value, in px. */
const BLUR_PX = 5;

export interface MaskedAmountProps {
  /**
   * Сума до показу — або готовий рядок, або вузол (`Money`, який набирає
   * знак, копійки й символ окремими тирами, анти-слоп П4).
   *
   * AI-CONTEXT: тип був `string`, і в стратегії це записали як блокер для
   * П4 на `TxRow` — мовляв, із рядка будується й маскування, й `aria-label`.
   * Насправді доступна назва приходить із пропа `label` («Прихована сума»),
   * а `children` лише рендериться всередині `aria-hidden`-обгортки. Тобто
   * розширення типу нічого не ламає: блюр накладається на весь вузол
   * фільтром, а не на текст, і тирам усередині байдуже.
   */
  children: ReactNode;
  /** When true, hide the value behind a blur until revealed. */
  masked: boolean;
  /**
   * Allow tap-to-reveal. Set `false` when the amount lives inside another
   * interactive element (nesting buttons is invalid) — renders a static
   * blurred span instead.
   */
  interactive?: boolean;
  /** Accessible noun for the value. Default "сума". */
  label?: string;
  className?: string;
}

function MaskedAmountImpl(props: MaskedAmountProps) {
  if (!props.masked) {
    return (
      <span className={cn("tabular-nums", props.className)}>
        {props.children}
      </span>
    );
  }

  return <MaskedValue {...props} />;
}

function MaskedValue({
  children,
  interactive = true,
  label = "сума",
  className,
}: MaskedAmountProps) {
  const [revealed, setRevealed] = useState(false);
  const haptic = useHaptic();
  const timerRef = useRef<number | null>(null);

  // Auto re-hide a tap-peek after REVEAL_MS.
  useEffect(() => {
    if (!revealed) return undefined;
    timerRef.current = window.setTimeout(() => setRevealed(false), REVEAL_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [revealed]);

  const toggle = useCallback(
    (e: MouseEvent) => {
      // The amount often sits inside a clickable row — don't trigger the
      // row's onClick when the user only wants to peek the value.
      e.stopPropagation();
      haptic.tap();
      setRevealed((v) => !v);
    },
    [haptic],
  );

  const blurred = !revealed;
  const blurStyle = { filter: blurred ? `blur(${BLUR_PX}px)` : undefined };

  // Static variant — blurred span, no interactivity (safe inside a button).
  if (!interactive) {
    return (
      <span
        className={cn(
          "tabular-nums motion-safe:transition motion-safe:duration-base",
          blurred && "select-none",
          className,
        )}
        style={blurStyle}
      >
        <span aria-hidden={blurred}>{children}</span>
        {blurred && (
          <span className="sr-only">
            {messages.status.hiddenValuePrefix} {label}
          </span>
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      // Той самий `hiddenValuePrefix`, що й у sr-only-гілці вище: два
      // написання «Прихована» в одному компоненті розійшлися б при першій
      // же правці тексту.
      aria-label={
        revealed
          ? `${label} показана, натисни, щоб приховати`
          : `${messages.status.hiddenValuePrefix} ${label}, натисни, щоб показати`
      }
      className={cn(
        "tabular-nums cursor-pointer border-0 bg-transparent p-0 font-inherit text-inherit",
        "rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
        "motion-safe:transition motion-safe:duration-base",
        blurred && "select-none",
        className,
      )}
      style={blurStyle}
    >
      <span aria-hidden={blurred}>{children}</span>
    </button>
  );
}

export const MaskedAmount = memo(MaskedAmountImpl);
