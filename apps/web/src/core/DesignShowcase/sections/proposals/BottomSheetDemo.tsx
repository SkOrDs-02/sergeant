import { useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Button, Icon } from "@shared/components/ui";
import { PhoneFrame, ProposalCard } from "./_PhoneFrame";

/**
 * UI-7 — Bottom-sheet instead of full-screen modals.
 *
 * Prototype of a drag-to-dismiss sheet: grab the handle and pull down; past
 * ~120px it dismisses, otherwise it springs back. On coarse pointers this
 * feels far more native than the current full-screen takeover for light
 * flows (auth prompt, sync status, quick pickers).
 */
export function BottomSheetDemo() {
  const [open, setOpen] = useState(false);
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    startY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (startY.current === null) return;
    setDragY(Math.max(0, e.clientY - startY.current));
  }
  function onPointerUp() {
    if (dragY > 120) setOpen(false);
    startY.current = null;
    setDragY(0);
  }

  return (
    <ProposalCard
      id="UI-7"
      title="Bottom-sheet замість повноекранних модалок"
      intent="Напівшторка з ручкою та drag-to-dismiss для легких flow. Потягни ручку вниз, щоб закрити."
    >
      <PhoneFrame>
        <div className="relative flex-1 min-h-0 px-4">
          <p className="text-style-caption text-subtle pt-2">Профіль</p>
          <div className="mt-3 space-y-2">
            <div className="h-16 rounded-2xl bg-panel border border-line" />
            <div className="h-16 rounded-2xl bg-panel border border-line" />
          </div>
          <div className="absolute inset-x-4 bottom-4">
            <Button className="w-full" onClick={() => setOpen(true)}>
              Відкрити налаштування
            </Button>
          </div>

          {open ? (
            <>
              <button
                type="button"
                aria-label="Закрити"
                onClick={() => setOpen(false)}
                className="absolute inset-0 bg-text/40 animate-in fade-in"
              />
              <div
                className={cn(
                  "absolute inset-x-0 bottom-0 rounded-t-3xl bg-panel border-t border-line",
                  "shadow-card animate-in slide-in-from-bottom",
                )}
                style={{ transform: `translateY(${dragY}px)` }}
              >
                <div
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  className="pt-3 pb-2 flex justify-center cursor-grab touch-none active:cursor-grabbing"
                >
                  <div className="h-1.5 w-10 rounded-full bg-divider-strong" />
                </div>
                <div className="px-4 pb-6 space-y-1">
                  {[
                    { icon: "sun", label: "Зовнішній вигляд" },
                    { icon: "bell", label: "Сповіщення" },
                    { icon: "lock", label: "Приватність" },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center gap-3 h-12 px-2 rounded-xl"
                    >
                      <Icon
                        name={row.icon}
                        size={18}
                        className="text-muted shrink-0"
                      />
                      <span className="text-style-body text-text">
                        {row.label}
                      </span>
                      <Icon
                        name="chevron-right"
                        size={16}
                        className="text-subtle ml-auto"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </PhoneFrame>
    </ProposalCard>
  );
}
