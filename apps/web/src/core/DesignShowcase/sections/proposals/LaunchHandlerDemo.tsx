import { ComparePair } from "./_Compare";
import { Icon } from "@shared/components/ui";

/**
 * UX-7 — Manifest `launch_handler: { client_mode: "focus-existing" }`.
 *
 * This is a manifest one-liner, not a screen, so the demo is a small
 * concept diagram rather than a live prototype.
 *
 * Зараз: tapping a shortcut (or the icon) while the PWA is already open can
 * spawn a *second* instance — two windows of the same app, split state.
 *
 * Може бути: `focus-existing` brings the running instance to the front and
 * routes the shortcut into it — one window, one source of truth.
 */

function MiniWindow({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      className={
        "w-28 rounded-xl border border-line bg-panel shadow-card overflow-hidden " +
        className
      }
    >
      <div className="h-5 bg-panelHi border-b border-line flex items-center px-2 gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-line" />
        <span className="h-1.5 w-1.5 rounded-full bg-line" />
      </div>
      <div className="px-2 py-3 flex flex-col items-center gap-1.5">
        <span className="h-6 w-6 rounded-md bg-accent/15 flex items-center justify-center">
          <Icon name="wallet" size={13} className="text-accent" />
        </span>
        <span className="text-2xs text-muted">{label}</span>
      </div>
    </div>
  );
}

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[260px] min-h-[220px] rounded-2xl border border-line bg-bg p-4 flex flex-col items-center justify-center gap-3">
      {children}
    </div>
  );
}

function ShortcutTap() {
  return (
    <div className="flex items-center gap-1.5 text-2xs text-muted">
      <Icon name="plus" size={12} className="text-accent" />
      Тап на shortcut «Додати»
    </div>
  );
}

export function LaunchHandlerDemo() {
  return (
    <ComparePair
      before={
        <Stage>
          <ShortcutTap />
          <div className="relative h-24 w-full flex items-center justify-center">
            <MiniWindow label="Sergeant" className="absolute -translate-x-6 -translate-y-2 rotate-[-4deg] opacity-70" />
            <MiniWindow label="Sergeant" className="absolute translate-x-6 translate-y-2 rotate-[4deg]" />
          </div>
          <span className="inline-flex items-center gap-1 text-2xs text-warning">
            <Icon name="x" size={12} />
            Другий інстанс
          </span>
        </Stage>
      }
      after={
        <Stage>
          <ShortcutTap />
          <div className="relative h-24 w-full flex items-center justify-center">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="h-20 w-20 rounded-full bg-accent/10 blur-md" />
            </div>
            <MiniWindow label="Sergeant" className="relative ring-2 ring-accent/50" />
          </div>
          <span className="inline-flex items-center gap-1 text-2xs text-success">
            <Icon name="check-circle" size={12} />
            Фокус наявного вікна
          </span>
        </Stage>
      }
    />
  );
}
