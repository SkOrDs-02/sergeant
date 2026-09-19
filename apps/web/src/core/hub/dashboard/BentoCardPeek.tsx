/**
 * Last validated: 2026-09-17
 * Status: Active
 *
 * Аркуш швидких дій, що зʼявляється на long-press картки хабу.
 * Винесено з `BentoCard.tsx` 2026-09-17: додавання пастки фокуса (WF-3)
 * перетнуло `max-lines: 600` (Hard Rule #18), а цей блок — природна
 * межа: самодостатній компонент без спільного стану з карткою.
 */
import { useRef } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { openHubModuleWithAction } from "@shared/lib/modules/hubNav";
import type { ModuleConfig } from "./moduleConfigs";

/* ─── #18 BentoCardPeek sheet ───────────────────────────────────────────── */

/**
 * Compact action sheet that appears on long-press of a BentoCard.
 * Renders as a floating panel anchored below the card's bottom edge with a
 * subtle scale-in animation. Dismissed on backdrop tap, Escape, or after an
 * action is fired.
 */
export function BentoCardPeek({
  config,
  moduleId,
  onDismiss,
}: {
  config: ModuleConfig;
  moduleId: string;
  onDismiss: () => void;
}) {
  const actions = config.quickActions;
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // `aria-modal="true"` — це обіцянка, яку доти не було кому виконувати
  // (аудит шуму 2026-09-16, WF-3). Пастки фокуса не існувало: Tab із
  // аркуша йшов у картки під ним, а Escape висів `onKeyDown`-ом на
  // бекдропі з `aria-hidden` і без `tabIndex` — тобто на елементі, який
  // фокус ніколи не отримує, тож обробник не спрацьовував ЖОДНОГО разу.
  // Пастку вішаємо на зовнішню обгортку, а не на саму панель: обгортка
  // містить і бекдроп, тож `inert` накриває сусідів обгортки й лишає
  // тап-повз-аркуш живим.
  //
  // Хук стоїть ДО раннього виходу нижче: порядок хуків має бути сталим,
  // а `open` вимикаємо прапорцем — панелі без дій пастка не потрібна.
  const hasActions = Boolean(actions && actions.length > 0);
  useDialogFocusTrap(hasActions, dialogRef, {
    onEscape: onDismiss,
    inertBackground: true,
  });

  if (!actions || actions.length === 0) return null;

  return (
    // Outer dialog wrapper provides the required modal semantics.
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Швидкі дії: ${config.label}`}
    >
      {/* Invisible backdrop — tap anywhere outside to dismiss.
          Escape обробляє пастка фокуса вище, не цей вузол. */}
      <div
        role="presentation"
        aria-hidden="true"
        className="fixed inset-0 z-40 cursor-default"
        onClick={onDismiss}
      />

      {/* Peek sheet */}
      <div
        className={cn(
          "absolute bottom-0 inset-x-0 z-50 mx-2 mb-2",
          "rounded-2xl border border-line bg-panel shadow-float",
          "p-2 flex flex-col gap-0.5",
          "motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95",
          "motion-safe:slide-in-from-bottom-2 motion-safe:duration-fast",
        )}
      >
        {/* Drag handle pill for visual affordance */}
        <div
          aria-hidden
          className="mx-auto mb-1 w-8 h-1 rounded-full bg-line"
        />
        <p className="px-2 pb-1 text-style-caption font-semibold text-muted">
          {config.label}
        </p>
        {actions.map((qa) => (
          <button
            key={qa.action}
            type="button"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl",
              "text-style-label font-medium text-text text-left",
              "hover:bg-panelHi active:bg-panelHi/80",
              // Канонічна утиліта замість рукописного кільця: вона тягне
              // ширину/колір/офсет із `--focus-ring-*` (зокрема HC-тему),
              // чого рукописний варіант тут не робив.
              "focus-ring",
              "transition-colors",
            )}
            onClick={() => {
              openHubModuleWithAction(
                moduleId as Parameters<typeof openHubModuleWithAction>[0],
                qa.action,
                "tile_peek",
              );
              onDismiss();
            }}
          >
            {/* F1/F5: гліф без тонованого квадрата — той самий ink, що й
                число тайла; контейнером лишається сам рядок дії. */}
            <span
              className={cn(
                "inline-flex w-5 items-center justify-center shrink-0",
                config.inkClass,
              )}
              aria-hidden
            >
              <Icon name={qa.icon} size="md" strokeWidth={2} />
            </span>
            {qa.label}
          </button>
        ))}
      </div>
    </div>
  );
}
