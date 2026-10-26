import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useVisualKeyboardInset } from "@sergeant/shared";
import { cn } from "../../lib/ui/cn";
import { hapticTap } from "../../lib/adapters/haptic";
import {
  FAB_INSET_VAR,
  FAB_WIDTH_VAR,
  SHEET_FOOTER_INSET_VAR,
  useBottomInsetVar,
} from "@shared/hooks/useBottomInsetVar";
import { messages } from "@shared/i18n/uk";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

/**
 * Головна дія модуля (мова H, redesign v3, поправка власника 2026-10-10):
 * чорна кнопка в правому куті над tab bar, 16 px від краю колонки і 14 px
 * від навігації. Замінила смугу `AddActionBar` на всю ширину.
 *
 * Тінь дозволена, бо кнопка плаває над контентом, як аркуш. Смугу, яку
 * займає, публікує в `--sgt-fab-inset`, тож `page-tabbar-pad` дає
 * контенту запас і останній рядок не ховається під кнопкою. Ширину
 * публікує в `--sgt-fab-width`: утиліта `fab-clear-row` дає останнім двом
 * рядкам списку в кінці сторінки правий відступ на неї. Під відкритою
 * клавіатурою кнопка зникає, як і нав.
 */
export interface CornerActionProps {
  label: string;
  onClick: () => void;
  /** Іконка «+» перед підписом: лише для «Додати». */
  plus?: boolean;
  className?: string;
}

/** Бічне поле колонки кнопки: збігається з `px-4` контейнера нижче. */
const FAB_EDGE_GAP_PX = 16;
/** Зазор між правою межею тексту рядка й кнопкою (довільний, оптичний). */
const FAB_ROW_GAP_PX = 12;

export function CornerAction({
  label,
  onClick,
  plus = false,
  className,
}: CornerActionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const kbOpen = useVisualKeyboardInset(true) > 0;
  const buttonRef = useRef<HTMLButtonElement>(null);
  useBottomInsetVar(ref, FAB_INSET_VAR, !kbOpen);
  // Ширину міряємо, а не рахуємо: підпис змінний («Додати», «Запланувати»).
  // Під клавіатурою кнопки нема, тож і змінну знімаємо.
  useLayoutEffect(() => {
    const el = buttonRef.current;
    if (kbOpen || !el) return;
    const root = document.documentElement;
    const publish = () => {
      const w =
        Math.ceil(el.getBoundingClientRect().width) +
        FAB_EDGE_GAP_PX +
        FAB_ROW_GAP_PX;
      root.style.setProperty(FAB_WIDTH_VAR, `${w}px`);
    };
    publish();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(publish);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(FAB_WIDTH_VAR);
    };
  }, [kbOpen, label, plus]);
  if (kbOpen) return null;

  return (
    <div
      ref={ref}
      data-testid="corner-action"
      className={cn(
        "pointer-events-none fixed inset-x-0 z-40 mx-auto flex max-w-lg justify-end px-4 pb-3.5",
        "bottom-[max(var(--sgt-bottom-nav-inset,0px),var(--sgt-consent-banner-inset,0px))]",
        className,
      )}
    >
      {/* Свій `<button>`, а не `Button`: плаваюча кнопка має тінь і 16 / 600
          підпис, яких шкала `Button` не дає. */}
      <button
        ref={buttonRef}
        type="button"
        className="pointer-events-auto inline-flex h-11 items-center gap-1.5 rounded-lg bg-text px-4 text-style-body font-semibold text-bg shadow-[0_2px_8px_rgba(0,0,0,0.18)] hover:bg-text/90 active:bg-text/80 focus-ring motion-safe:transition-colors"
        onClick={() => {
          hapticTap();
          onClick();
        }}
      >
        {plus && <Icon name="plus" size="lg" aria-hidden />}
        {label}
      </button>
    </div>
  );
}

export interface AddSource {
  id: string;
  label: string;
  hint: string;
  onSelect: () => void;
}

/**
 * «+ Додати» в куті і аркуш «Додати» зі списком джерел. Рядки текстові,
 * без іконок: назва 16 / 600 і підпис 14 другим сірим. Аркуш
 * закривається до виклику джерела, щоб наступний аркуш відкривався вже
 * без нього.
 */
export function AddAction({ sources }: { sources: readonly AddSource[] }) {
  const [open, setOpen] = useState(false);
  const sourcesDialogRef = useRef<HTMLElement | null>(null);
  const attachSources = useCallback((node: HTMLUListElement | null) => {
    sourcesDialogRef.current =
      node?.closest<HTMLElement>('[role="dialog"]') ?? null;
  }, []);
  // Тут усе тіло — список дій, а не звичайний контент аркуша. Тост має
  // стояти над джерелами навіть без footer, щоб не перекривати вибір.
  useBottomInsetVar(sourcesDialogRef, SHEET_FOOTER_INSET_VAR, open);
  const title = messages.actions.add;

  return (
    <>
      <CornerAction label={title} plus onClick={() => setOpen(true)} />
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <ul
          ref={attachSources}
          data-testid="add-sources"
          className="divide-y divide-line border-y border-line"
        >
          {sources.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="flex min-h-14 w-full flex-col justify-center py-2 text-left focus-ring"
                onClick={() => {
                  setOpen(false);
                  s.onSelect();
                }}
              >
                <span className="text-style-label-lg font-semibold text-text">
                  {s.label}
                </span>
                <span className="mt-0.5 text-style-label text-muted">
                  {s.hint}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
