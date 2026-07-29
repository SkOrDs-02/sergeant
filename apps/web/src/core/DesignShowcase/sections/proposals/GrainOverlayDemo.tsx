import { ComparePair, MiniPhone } from "./_Compare";

// Tiny inline SVG turbulence → data URI. Cheap, static, no runtime cost.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

function Surface({ grain }: { grain: boolean }) {
  return (
    <div className="relative h-full p-4">
      {grain && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 mix-blend-multiply"
          style={{ backgroundImage: GRAIN, opacity: 0.05 }}
        />
      )}
      <div className="relative space-y-3">
        <div className="rounded-2xl bg-panel p-4">
          <p className="text-style-caption uppercase tracking-wide text-muted">
            Картка
          </p>
          <p className="text-lg font-semibold text-fg">Паперова текстура</p>
        </div>
        <div className="h-20 rounded-2xl bg-accent/15" />
      </div>
    </div>
  );
}

/**
 * R2-V-19 — Тонкий grain/noise-overlay на cream-поверхнях.
 * Ліворуч: пласка поверхня (як зараз). Праворуч: 5%-й статичний шум через multiply.
 */
export function GrainOverlayDemo() {
  return (
    <ComparePair
      before={
        <MiniPhone dim>
          <Surface grain={false} />
        </MiniPhone>
      }
      after={
        <MiniPhone>
          <Surface grain />
        </MiniPhone>
      }
    />
  );
}
