import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/ui/cn";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { BOTTOM_NAV_INSET_VAR } from "../../hooks/useBottomInsetVar";
import { useKeyboardAwareOverlay } from "../../hooks/useKeyboardAwareOverlay";
import { useDialogFocusTrap } from "../../hooks/useDialogFocusTrap";
import { useHistoryDismiss } from "../../hooks/useHistoryDismiss";
import { useSwipeToDismiss } from "../../hooks/useSwipeToDismiss";
import { useAnnounce } from "./ScreenReaderAnnouncer";
import { Icon } from "./Icon";
import { useVisualKeyboardInset } from "@sergeant/shared";

/**
 * Sergeant Design System — Sheet (bottom sheet / modal)
 *
 * Canonical bottom-sheet shell used across Фінік / Фізрук / Рутина /
 * Харчування. Replaces ≥ 6 hand-rolled sheet shells that drifted on:
 *   - overlay opacity/blur
 *   - close button size (32×32 in Finyk vs 44×44 in Fizruk — a11y bug)
 *   - focus-trap wiring
 *   - keyboard inset handling
 *   - header markup & labelling
 *
 * What this enforces for every caller:
 *   - role="dialog" + aria-modal + aria-labelledby auto-wired
 *   - 44×44 close button (WCAG tap target) with <Button variant="ghost" iconOnly>
 *   - focus trap + Escape via useDialogFocusTrap
 *   - overlay-click dismiss
 *   - animated slide-up with safe-area + bottom-nav margin so the
 *     panel always clears the module bottom tab bar (see ModuleShell's
 *     `--bottom-nav-height` CSS variable) and the iOS home indicator
 *   - keyboard-inset-aware margin through the shared platform adapter
 *
 * Callers are still responsible for their own form state, validation,
 * and action footer — Sheet only owns the shell.
 */

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Dialog title — rendered in the header and used for aria-labelledby. */
  title: ReactNode;
  /** Optional subtitle rendered under the title. */
  description?: ReactNode | undefined;
  /** Main sheet body. */
  children?: ReactNode | undefined;
  /** Sticky footer (e.g. action buttons). Rendered inside the panel, outside the scroll area. */
  footer?: ReactNode | undefined;
  /** Slot rendered in the header row to the left of the close button (e.g. extra action). */
  headerRight?: ReactNode | undefined;
  /** Hide the drag-handle pill. */
  hideHandle?: boolean | undefined;
  /**
   * Hide the built-in title + close-button row.
   *
   * Used by surfaces whose body already owns a header (e.g. HubChat's
   * `<HubChatHeader>` ships with its own title popover + close pill —
   * stacking the Sheet's header on top would render two close buttons
   * and break the visual hierarchy). The drag-handle pill stays
   * available as the swipe-to-dismiss target, and `title` is still
   * wired to `aria-labelledby` for screen readers via a visually-hidden
   * node so the dialog remains labelled.
   */
  hideHeader?: boolean | undefined;
  /**
   * Розтягнути панель на весь екран замість плаваючого аркуша над
   * нижньою навігацією.
   *
   * Звичайний Sheet навмисно піднімається над навбаром (`marginBottom` =
   * `--sgt-bottom-nav-inset`) і обмежений `90dvh`: це форма для коротких
   * форм модулів. Для поверхонь, які є повноцінним екраном (HubChat), та
   * сама геометрія давала дві вади одразу (звіт власника 2026-09-03):
   * панель висіла над низом екрана, крізь скло просвічував навбар, а
   * зверху лишалась смужка сторінки в кілька пікселів — не аркуш і не
   * екран. У цьому режимі панель займає `100dvh`, сама несе safe-area
   * зверху й знизу (композер лягає над home-індикатором), а закруглення
   * й нижній відступ зникають. Клавіатурна геометрія лишається спільною.
   */
  fullScreen?: boolean | undefined;
  /** Optional keyboard inset override. Normally Sheet detects it centrally. */
  kbInsetPx?: number | undefined;
  /** Sheet z-index. Defaults to 50 — raise for nested sheets. */
  zIndex?: number | undefined;
  /** Accessible label for the close button. */
  closeLabel?: string | undefined;
  /** Optional className on the panel (for per-module accents). */
  panelClassName?: string | undefined;
  /** Optional className on the scroll region. */
  bodyClassName?: string | undefined;
  /**
   * Sergeant v2 — surface prominence. `default` keeps the legacy
   * opaque `bg-panel` + `shadow-e4` shell; `glass` opts into the v2
   * translucent floating-glass shell (alpha-baked `bg-surface-glass`
   * + `backdrop-blur-md` + `shadow-nav` + `rounded-t-2xl`) so the
   * mesh / hero gradient underneath reads through. Choose `glass`
   * for any v2 sheet that sits above a `MeshBackground` shell.
   * Default stays `default` so existing call-sites are unchanged.
   */
  variant?: "default" | "glass";
}

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  headerRight,
  hideHandle = false,
  hideHeader = false,
  fullScreen = false,
  kbInsetPx,
  zIndex = 50,
  closeLabel = "Закрити",
  panelClassName,
  bodyClassName,
  variant = "default",
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const detectedKbInsetPx = useVisualKeyboardInset(open);
  const resolvedKbInsetPx = kbInsetPx ?? detectedKbInsetPx;
  useDialogFocusTrap(open, panelRef, {
    onEscape: onClose,
    inertBackground: true,
  });

  // Swipe-to-dismiss — drag the panel down ≥ 80 px to close. Mirrors
  // the iOS Maps / Apple Pay sheet feel; the drag handle pill at the
  // top now actually does something. We disable the gesture once the
  // sheet starts closing so the panel doesn't snap back mid-exit.
  const swipe = useSwipeToDismiss({
    enabled: open,
    onDismiss: onClose,
  });

  // Lock body scroll while sheet is open — iOS-safe (position: fixed),
  // not just `overflow: hidden` (round-2 UI audit X2).
  useBodyScrollLock(open);

  // Browser / Android Back closes the sheet instead of leaving the module.
  useHistoryDismiss(open, onClose);

  // iOS панує visual viewport, щоб підняти сфокусоване поле над
  // клавіатурою; `position: fixed` привʼязаний до layout viewport, тож
  // разом із паном їде весь оверлей — аркуш зависає ВИЩЕ клавіатури, а
  // шапка ховається під статус-бар («підскакує вгору занадто», звіт
  // тестера 2026-08-16). Хук компенсує пан трансформом і синхронно
  // підтягує щойно сфокусоване поле у видиму зону, коли клавіатура вже
  // відкрита. Деталі й межі — у шапці `useKeyboardAwareOverlay`.
  useKeyboardAwareOverlay(open, overlayRef);

  // Announce the sheet title to assistive tech when it opens. The
  // `aria-labelledby` wiring already exposes the title to screen
  // readers, but only if the AT user pulls focus into the dialog —
  // many SR users on iOS / Android receive a polite live-region
  // announcement faster.
  const { announce } = useAnnounce();
  useEffect(() => {
    if (!open) return;
    if (typeof title !== "string") return;
    if (!title.trim()) return;
    announce(title);
  }, [open, title, announce]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  // Lift the panel above the bottom nav plus the iOS home-indicator inset.
  // Джерело — `--sgt-bottom-nav-inset` на `<html>` (`useBottomInsetVar`,
  // виміряна смуга реальної навігації разом із її safe-area). Аркуш
  // портується в `<body>`, тож `--bottom-nav-height`, що ставиться на
  // корінь модуля всередині дерева, до нього не доходить і завжди давав
  // `0px`: футер «Готово» аркуша готовності ховався під навбар (звіт
  // 2026-09-03). Старий calc лишається fallback-ом для навігацій, які ще
  // не публікують змінну. The resolved keyboard inset overrides the offset
  // when the soft keyboard is visible — we want the sheet to hug the
  // keyboard, not float above where the nav would be.
  const baseStyle: CSSProperties =
    resolvedKbInsetPx > 0
      ? {
          marginBottom: resolvedKbInsetPx,
          // The keyboard occupies part of the layout viewport. Lifting a
          // 90dvh sheet without shrinking it pushes its header and focused
          // field above the screen; cap it to the actually visible area so
          // only the sheet body scrolls.
          maxHeight: fullScreen
            ? `calc(100dvh - ${resolvedKbInsetPx}px)`
            : `calc(100dvh - ${resolvedKbInsetPx}px - max(env(safe-area-inset-top, 0px), 8px))`,
          // Під клавіатурою home-індикатора не видно, тож нижній
          // safe-area у fullScreen-режимі стає зайвим порожнім рядком.
          ...(fullScreen
            ? { paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: 0 }
            : {}),
        }
      : fullScreen
        ? {
            marginBottom: 0,
            // Inline `maxHeight` перекриває класовий `max-h-[90dvh]`, а
            // `height` тримає панель повною навіть у порожньому чаті.
            height: "100dvh",
            maxHeight: "100dvh",
            paddingTop: "env(safe-area-inset-top, 0px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }
        : {
            marginBottom: `max(var(${BOTTOM_NAV_INSET_VAR}, 0px), calc(var(--bottom-nav-height, 0px) + env(safe-area-inset-bottom, 0px)))`,
          };
  // Запас прокрутки під останніми полями, поки клавіатура відкрита
  // (бета-фідбек №5, 2026-08-18: «внизу екрану не видно»). Скрол уміє
  // рівно стільки, скільки дозволяє `scrollHeight`: для поля в кінці
  // списку контенту під ним майже нема, тож підняти його над
  // клавіатурою нічим — центрування, яке рятує середину списку, для
  // останніх рядків недосяжне в принципі. Резервуємо саме висоту
  // клавіатури: це найгірший випадок того, наскільки поле може виявитись
  // під нею. Порожнє місце живе рівно доки відкрита клавіатура.
  const bodyStyle: CSSProperties | undefined =
    resolvedKbInsetPx > 0
      ? { paddingBottom: `calc(1rem + ${resolvedKbInsetPx}px)` }
      : undefined;
  const panelStyle: CSSProperties = swipe.dragging
    ? {
        ...baseStyle,
        transform: `translate3d(0, ${swipe.dragOffset}px, 0)`,
        transition: "none",
        touchAction: "none",
      }
    : {
        ...baseStyle,
        transform: "translate3d(0, 0, 0)",
        transition: "transform 200ms cubic-bezier(0.32, 0.72, 0, 1)",
      };

  // Portal the sheet to <body> so it escapes every ancestor stacking /
  // containing-block context. Several hub routes wrap their root in a
  // `.page-enter` element whose entry animation keeps
  // `transform: translateY(0)` via `animation-fill-mode: both`. Per the
  // CSS spec, any non-`none` `transform` on an ancestor establishes a
  // new containing block — which means our `position: fixed` overlay is
  // anchored to that ancestor's box instead of the viewport, and the
  // sheet renders clipped above or below the visible area. Mirrors the
  // identical fix applied to `Modal` (see its inline comment for the
  // full root-cause writeup).
  const sheet = (
    <div
      ref={overlayRef}
      // `animate-fade-in` — суто opacity-кейфрейми (`fadeIn` у
      // tailwind-preset), тож інлайновий `transform` від
      // `useKeyboardAwareOverlay` з анімацією не конфліктує.
      className="fixed inset-0 flex items-end justify-center motion-safe:animate-fade-in"
      style={{ zIndex }}
    >
      {/* Scrim. A real <button> makes the dismiss discoverable to AT. */}
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={panelStyle}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          // Elevation e4 — same modal tier as <Modal>. Sheets are the
          // mobile/coarse-pointer counterpart of Modal; they share the
          // same z-modal stacking tier so a Sheet over a popover
          // always reads as the higher surface.
          // `dvh` (not `vh`) so the panel is capped at the *visible* viewport
          // on iOS — with `vh` the sheet grows behind Safari's dynamic toolbar,
          // pushing the composer off-screen and making the inner scroll feel
          // stuck (mobile-audit A2).
          "relative w-full max-w-lg flex flex-col max-h-[90dvh] motion-safe:animate-slide-up",
          variant === "glass"
            ? "bg-surface-glass motion-safe:backdrop-blur-md border-t border-surface-line rounded-t-2xl shadow-nav"
            : "bg-panel border-t border-line rounded-t-3xl shadow-e4",
          // Повноекранна панель стоїть на краях вʼюпорта: закруглення й
          // верхня лінія на межі зі статус-баром читаються як артефакт.
          fullScreen && "rounded-none border-t-0",
          panelClassName,
        )}
      >
        {/*
          Swipe-to-dismiss handle. We bind the gesture to the handle
          row + header (not the full panel) so vertical scrolling
          inside the body and text input drags don't get hijacked. The
          handle is the iOS-conventional grab target and now actually
          functional.
        */}
        {!hideHandle && (
          <div
            className="flex justify-center pt-3 pb-1 shrink-0 cursor-grab active:cursor-grabbing touch-none"
            {...swipe.bind}
            role="presentation"
          >
            <div
              className="w-12 h-sheet-handle bg-line/70 rounded-full"
              aria-hidden
            />
          </div>
        )}
        {hideHeader ? (
          // Body owns its own header — render only a visually-hidden
          // label so `aria-labelledby` stays valid. The drag-handle row
          // above remains the swipe-to-dismiss target.
          <span id={titleId} className="sr-only">
            {title}
          </span>
        ) : (
          <div
            className="flex items-start justify-between gap-3 px-5 pt-1 pb-3 shrink-0 touch-pan-y"
            {...swipe.bind}
          >
            <div className="min-w-0 flex-1">
              <div
                id={titleId}
                className="text-style-title font-extrabold text-text leading-tight"
              >
                {title}
              </div>
              {description && (
                <div className="text-style-caption text-subtle mt-1">
                  {description}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {headerRight}
              <button
                type="button"
                onClick={onClose}
                aria-label={closeLabel}
                className={cn(
                  "flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] rounded-full",
                  "bg-panelHi text-muted hover:text-text transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
                )}
              >
                <Icon name="close" size={16} aria-hidden />
              </button>
            </div>
          </div>
        )}
        <div
          style={bodyStyle}
          className={cn(
            // `overscroll-none` (not `-contain`) — `contain` still lets the
            // browser paint its own rubber-band/glow effect at this
            // element's own scroll boundary; `none` suppresses that too
            // (round-2 UI audit X2: this was the light border/frame seen
            // on overscroll). Chaining to the page behind the sheet is
            // additionally blocked by `useBodyScrollLock` above.
            "flex-1 min-h-0 overflow-y-auto overscroll-none px-5 pb-4",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer && (
          <div className="shrink-0 px-5 pt-3 pb-4 border-t border-line bg-panel">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
