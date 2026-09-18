import { ComparePair, CompareTile } from "./_Compare";
import { Icon } from "@shared/components/ui";

/**
 * V-12 — Empty-state idle motion.
 *
 * `EmptyStateIllustrations` render as static SVG today. The proposal adds a
 * very subtle idle animation (slow float + fade) so empty screens feel alive
 * rather than "broken/loading". Decorative only — fully suppressed under
 * `prefers-reduced-motion`.
 *
 * Mock only — the right-hand illustration floats gently.
 */

export function EmptyStateIdleDemo() {
  return (
    <ComparePair
      before={
        <CompareTile dim>
          <div className="h-14 w-14 rounded-2xl bg-surface-muted flex items-center justify-center">
            <Icon name="wallet" size={26} className="text-muted" />
          </div>
          <p className="text-style-label text-text">Ще немає витрат</p>
          <p className="text-style-caption text-muted">Статична ілюстрація</p>
        </CompareTile>
      }
      after={
        <CompareTile>
          <div className="es-float h-14 w-14 rounded-2xl bg-finyk-soft flex items-center justify-center">
            <Icon name="wallet" size={26} className="text-finyk" />
          </div>
          <p className="text-style-label text-text">Ще немає витрат</p>
          <p className="text-style-caption text-muted">
            Легкий idle-рух привертає увагу
          </p>
          <style>{`
            @keyframes esFloat {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-6px); }
            }
            .es-float { animation: esFloat 3.2s var(--motion-ease-standard) infinite; }
            @media (prefers-reduced-motion: reduce) {
              .es-float { animation: none; }
            }
          `}</style>
        </CompareTile>
      }
    />
  );
}
