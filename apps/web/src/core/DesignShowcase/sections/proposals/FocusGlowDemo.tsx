import { ComparePair, CompareTile } from "./_Compare";

/**
 * V-20 — Module-tinted focus ring.
 *
 * `:focus-visible` today paints a neutral `ring-focus` regardless of context.
 * The proposal tints the focus ring with the active module's accent
 * (`--module-accent-rgb`, which already exists for borders/carets), so keyboard
 * focus stays coherent with the surrounding module surface. Contrast/size of
 * the ring are unchanged — only the hue.
 *
 * Mock only — tab into or tap the inputs to see the ring colour.
 */

export function FocusGlowDemo() {
  return (
    <ComparePair
      before={
        <CompareTile dim>
          <input
            type="text"
            placeholder="Neutral focus"
            defaultValue="Сума"
            className="w-40 rounded-xl border border-line bg-panel px-3 py-2 text-style-body text-text outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
          />
          <p className="text-style-caption text-muted">
            Нейтральний ring — однаковий скрізь
          </p>
        </CompareTile>
      }
      after={
        <CompareTile>
          <div className="flex flex-col gap-2 w-40">
            <input
              type="text"
              defaultValue="Фінік"
              aria-label="Finyk field"
              className="rounded-xl border border-line bg-panel px-3 py-2 text-style-body text-text outline-none focus-visible:ring-2"
              style={{
                ["--tw-ring-color" as string]: "rgb(var(--c-chart-finyk))",
              }}
            />
            <input
              type="text"
              defaultValue="Фізрук"
              aria-label="Fizruk field"
              className="rounded-xl border border-line bg-panel px-3 py-2 text-style-body text-text outline-none focus-visible:ring-2"
              style={{
                ["--tw-ring-color" as string]: "rgb(var(--c-chart-fizruk))",
              }}
            />
          </div>
          <p className="text-style-caption text-muted">
            Ring тінтиться під акцент модуля
          </p>
        </CompareTile>
      }
    />
  );
}
