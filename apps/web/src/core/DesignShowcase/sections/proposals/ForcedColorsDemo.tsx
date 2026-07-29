import { Icon } from "@shared/components/ui";
import { ComparePair, CompareTile } from "./_Compare";

/**
 * R2-V-5 — forced-colors / Windows High Contrast support.
 *
 * Before: in forced-colors mode, decorative backgrounds get stripped by the
 * OS and custom-colored elements can lose their boundaries (icon-only buttons
 * become invisible). After: components declare forced-color-adjust behaviour
 * and add borders / system-color fallbacks so every control stays visible and
 * distinguishable against the system palette.
 *
 * Static comparison — right tile mocks the system-forced palette.
 */

export function ForcedColorsDemo() {
  return (
    <ComparePair before={<Card forced={false} />} after={<Card forced />} />
  );
}

function Card({ forced }: { forced: boolean }) {
  // Emulate a forced (black/white) system palette on the right.
  const wrap = forced ? { backgroundColor: "#000", color: "#fff" } : undefined;
  return (
    <CompareTile
      dim={!forced}
      className="justify-start items-stretch text-left"
    >
      <div
        className="rounded-2xl p-3 w-full border"
        style={forced ? { ...wrap, borderColor: "#fff" } : undefined}
      >
        <div className="flex items-center justify-between">
          <span
            className="text-style-label"
            style={forced ? { color: "#fff" } : undefined}
          >
            Рутина
          </span>
          <span
            className="h-7 w-7 rounded-lg flex items-center justify-center border"
            style={
              forced
                ? { borderColor: "#fff", color: "#fff" }
                : {
                    borderColor: "transparent",
                    background: "rgb(var(--c-chart-routine) / 0.15)",
                    color: "rgb(var(--c-chart-routine))",
                  }
            }
          >
            <Icon name="check-circle" size={15} />
          </span>
        </div>
        <div className="mt-2 space-y-1.5">
          {["Вода", "Читання"].map((t) => (
            <div
              key={t}
              className="h-8 rounded-lg flex items-center px-2 text-2xs border"
              style={
                forced
                  ? { borderColor: "#fff", color: "#fff" }
                  : {
                      borderColor: "rgb(var(--c-line))",
                      color: "rgb(var(--c-text))",
                    }
              }
            >
              {t}
            </div>
          ))}
        </div>
      </div>
      <p
        className="text-2xs mt-2"
        style={forced ? { color: "#fff" } : { color: "rgb(var(--c-muted))" }}
      >
        {forced ? "forced-colors: борди зберігають межі" : "Стандарт"}
      </p>
    </CompareTile>
  );
}
