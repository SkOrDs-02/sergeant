import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui";
import { ComparePair, CompareTile } from "./_Compare";

/**
 * R2-V-3 — prefers-contrast: more support.
 *
 * Before: one token ramp for everyone — subtle borders and muted secondary
 * text. After: when the OS requests higher contrast, borders darken/thicken,
 * muted text steps up toward the foreground, and focus/selection states get
 * stronger — without changing layout.
 *
 * Static comparison — both tiles mock the same card, right one at high
 * contrast.
 */

export function ContrastMoreDemo() {
  return <ComparePair before={<Card high={false} />} after={<Card high />} />;
}

function Card({ high }: { high: boolean }) {
  return (
    <CompareTile dim={!high} className="items-stretch justify-start text-left">
      <div
        className={cn(
          "rounded-2xl bg-panel p-3 w-full",
          high ? "border-2 border-text" : "border border-line",
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center",
              high ? "bg-accent text-bg" : "bg-accent/15 text-accent",
            )}
          >
            <Icon name="credit-card" size={16} />
          </span>
          <span className="text-style-label text-text">Витрати</span>
        </div>
        <p
          className={cn(
            "text-style-caption mt-2",
            high ? "text-text font-medium" : "text-muted",
          )}
        >
          Вторинний підпис — {high ? "посилений контраст" : "стандартний тон"}
        </p>
        <button
          type="button"
          className={cn(
            "mt-3 w-full h-8 rounded-lg text-style-caption font-medium",
            high ? "bg-text text-bg" : "bg-panel border border-line text-text",
          )}
        >
          Додати
        </button>
      </div>
      <p className="text-style-caption text-muted mt-2">
        {high ? "prefers-contrast: more" : "Стандарт"}
      </p>
    </CompareTile>
  );
}
