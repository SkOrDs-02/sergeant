import { ComparePair, CompareTile } from "./_Compare";
import { Icon } from "@shared/components/ui";

/**
 * V-5 — Monochrome / themed adaptive icon.
 *
 * The manifest currently declares icon purposes `any` and `any maskable`
 * only. Android 13+ themed icons and some launchers want a `monochrome`
 * variant (a single-colour silhouette on transparent) so the OS can tint the
 * icon to the user's wallpaper palette. Without it, the app icon ignores
 * themed-icon mode.
 *
 * Mock only: the tiles below illustrate the icon purposes, not real assets.
 */

export function MonochromeIconDemo() {
  return (
    <ComparePair
      before={
        <CompareTile dim>
          <div className="flex items-end gap-4">
            <IconChip label="any" bg="bg-accent" fg="text-bg" />
            <IconChip label="maskable" bg="bg-accent" fg="text-bg" masked />
          </div>
          <p className="text-style-caption text-muted">
            Немає monochrome — themed-icon режим показує стандартну плитку
          </p>
        </CompareTile>
      }
      after={
        <CompareTile>
          <div className="flex items-end gap-4">
            <IconChip label="any" bg="bg-accent" fg="text-bg" />
            <IconChip label="maskable" bg="bg-accent" fg="text-bg" masked />
            <div className="flex flex-col items-center gap-1.5">
              <div className="h-14 w-14 rounded-2xl bg-surface-muted border border-dashed border-accent/50 flex items-center justify-center">
                <Icon name="sparkles" size={26} className="text-accent" />
              </div>
              <span className="text-style-caption text-accent font-medium">
                monochrome
              </span>
            </div>
          </div>
          <p className="text-style-caption text-muted">
            Силует тінтиться під палітру системи / шпалери
          </p>
        </CompareTile>
      }
    />
  );
}

function IconChip({
  label,
  bg,
  fg,
  masked = false,
}: {
  label: string;
  bg: string;
  fg: string;
  masked?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={`h-14 w-14 ${masked ? "rounded-full" : "rounded-2xl"} ${bg} flex items-center justify-center`}
      >
        <Icon name="sparkles" size={26} className={fg} />
      </div>
      <span className="text-style-caption text-muted">{label}</span>
    </div>
  );
}
