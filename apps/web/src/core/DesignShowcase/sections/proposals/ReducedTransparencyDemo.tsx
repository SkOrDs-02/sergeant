import { cn } from "@shared/lib/ui/cn";
import { ComparePair, CompareTile } from "./_Compare";

/**
 * R2-V-4 — prefers-reduced-transparency support.
 *
 * Before: mesh gradient + translucent blurred panels everywhere. After: when
 * the OS requests reduced transparency, glass layers become solid, the mesh
 * is replaced with a flat surface, and blur is dropped — improving legibility
 * for users who find translucency distracting or low-contrast.
 *
 * Static comparison — same overlay card over a busy background.
 */

export function ReducedTransparencyDemo() {
  return (
    <ComparePair
      before={<Scene reduced={false} />}
      after={<Scene reduced />}
    />
  );
}

function Scene({ reduced }: { reduced: boolean }) {
  return (
    <CompareTile dim={!reduced} className="justify-start p-0 overflow-hidden">
      <div className="relative w-full h-[180px]">
        {/* busy background */}
        <div className="absolute inset-0">
          {reduced ? (
            <div className="absolute inset-0 bg-surface-muted" />
          ) : (
            <>
              <div className="absolute -top-6 -left-6 h-24 w-24 rounded-full bg-accent/40 blur-2xl" />
              <div className="absolute bottom-0 right-0 h-24 w-24 rounded-full bg-[rgb(var(--c-chart-nutrition))]/40 blur-2xl" />
              <div className="absolute top-8 right-8 h-16 w-16 rounded-full bg-[rgb(var(--c-chart-finyk))]/40 blur-xl" />
            </>
          )}
        </div>
        {/* overlay panel */}
        <div className="absolute inset-x-4 top-1/2 -translate-y-1/2">
          <div
            className={cn(
              "rounded-2xl border p-3",
              reduced ? "bg-panelHi border-line" : "bg-panelHi/60 border-white/40 backdrop-blur-md",
            )}
          >
            <p className="text-style-caption text-text">Підсумок дня</p>
            <p className="text-2xs text-muted mt-1">
              {reduced ? "Суцільна панель, без blur" : "Скляна панель поверх mesh"}
            </p>
          </div>
        </div>
      </div>
      <p className="text-2xs text-muted p-2">{reduced ? "prefers-reduced-transparency" : "Стандарт (glass + mesh)"}</p>
    </CompareTile>
  );
}
