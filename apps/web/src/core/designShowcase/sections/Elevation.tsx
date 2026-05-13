import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Sec, Group } from "../_shared";

/**
 * Elevation showcase — renders all six `shadow-eN` levels in two
 * panes (light + forced-dark) so contributors can scan how a level
 * reads across themes without toggling the global app theme.
 *
 * Each tile labels:
 *   - the Tailwind utility (`shadow-eN`)
 *   - the role this level represents
 *   - the paired `z-*` tier (per `zTier` in design tokens) so the
 *     coupling between elevation and stacking is visible.
 *
 * Authoring rule lives in design-system.md § 4 and the canonical
 * recipe in `packages/design-tokens/tokens.js` → `elevation`.
 *
 * Note on the dark pane: we wrap it in a local `.dark` class so the
 * CSS variables in `apps/web/src/styles/theme.css` (`--shadow-eN`,
 * `--c-panel`, `--c-line`, `--c-text`, …) resolve from the dark
 * branch — that lets us reuse the same semantic utilities
 * (`bg-surface`, `border-border`, `text-fg`, `text-fg-subtle`) on
 * both panes without ever reaching for raw hex (Hard Rule #11) or
 * `dark:` overrides (Hard Rule #13).
 */

type Step = {
  level: "e0" | "e1" | "e2" | "e3" | "e4" | "e5";
  role: string;
  zTier: string;
  zNumeric: string;
  shadowClass: string;
};

const STEPS: readonly Step[] = [
  {
    level: "e0",
    role: "Flat — фон, секції, інпути",
    zTier: "z-base",
    zNumeric: "0",
    shadowClass: "shadow-e0",
  },
  {
    level: "e1",
    role: "Raised — Card, рядки списку",
    zTier: "z-base",
    zNumeric: "0",
    shadowClass: "shadow-e1",
  },
  {
    level: "e2",
    role: "Interactive — hover Card / Button",
    zTier: "z-base",
    zNumeric: "0",
    shadowClass: "shadow-e2",
  },
  {
    level: "e3",
    role: "Overlay — Popover, Menu, Tooltip",
    zTier: "z-dropdown",
    zNumeric: "50",
    shadowClass: "shadow-e3",
  },
  {
    level: "e4",
    role: "Modal — Modal, Sheet, Drawer",
    zTier: "z-modal",
    zNumeric: "200",
    shadowClass: "shadow-e4",
  },
  {
    level: "e5",
    role: "Toast — Toast, Snackbar",
    zTier: "z-toast",
    zNumeric: "300",
    shadowClass: "shadow-e5",
  },
];

function ElevationTile({ step }: { step: Step }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "h-24 rounded-2xl border border-border bg-surface flex flex-col items-center justify-center gap-1 px-3 text-center",
          step.shadowClass,
        )}
      >
        <span className="text-xs font-extrabold font-mono text-fg">
          shadow-{step.level}
        </span>
        <span className="text-2xs font-mono text-fg-subtle">
          {step.zTier} · {step.zNumeric}
        </span>
      </div>
      <span className="text-2xs text-fg-subtle leading-tight">{step.role}</span>
    </div>
  );
}

export function ElevationSection() {
  // Local toggle for the inline recipe debug panel. Independent of
  // theme — both panes always render so contributors can compare
  // light vs dark side by side without flipping the global theme.
  const [showInline, setShowInline] = useState(false);

  return (
    <Sec id="elevation" title="Елевація та шари">
      <p className="text-sm text-fg-muted leading-relaxed -mt-2 max-w-prose">
        Семантична шкала <code className="font-mono">shadow-e0..shadow-e5</code>{" "}
        — єдине джерело правди для глибини. Рівень елевації завжди йде в парі з{" "}
        <code className="font-mono">z-*</code> тіром (Card на сторінці —{" "}
        <code className="font-mono">z-base</code>, попап —{" "}
        <code className="font-mono">z-dropdown</code>, Modal/Sheet —{" "}
        <code className="font-mono">z-modal</code>, Toast —{" "}
        <code className="font-mono">z-toast</code>). Темна тема перемикається
        автоматично через CSS-змінні — не пиши{" "}
        <code className="font-mono">dark:shadow-*</code> (Hard Rule #13).
      </p>

      <Group label="Light">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-bg p-5 rounded-2xl border border-border">
          {STEPS.map((step) => (
            <ElevationTile key={step.level} step={step} />
          ))}
        </div>
      </Group>

      <Group label="Dark">
        {/* `.dark` rebinds --shadow-e* + --c-* tokens to the dark
            recipe, so the children below reuse the same semantic
            utilities as the light pane without any raw-palette
            forks (Hard Rule #13). */}
        <div className="dark grid grid-cols-2 sm:grid-cols-3 gap-4 bg-bg p-5 rounded-2xl border border-border">
          {STEPS.map((step) => (
            <ElevationTile key={step.level} step={step} />
          ))}
        </div>
      </Group>

      <Group label="Legacy aliases (back-compat)">
        <p className="text-xs text-fg-muted mb-3 max-w-prose">
          Існуючі утиліти{" "}
          <code className="font-mono">shadow-soft / card / float</code>{" "}
          продовжують працювати — внутрішньо вони мапляться на{" "}
          <code className="font-mono">e4 / e1 / e3</code>. Новий код має
          використовувати <code className="font-mono">shadow-eN</code>.
        </p>
        <div className="flex flex-wrap gap-4">
          <div className="shadow-card bg-surface rounded-2xl border border-border px-4 py-3 text-xs text-fg-muted font-mono">
            shadow-card → e1
          </div>
          <div className="shadow-float bg-surface rounded-2xl border border-border px-4 py-3 text-xs text-fg-muted font-mono">
            shadow-float → e3
          </div>
          <div className="shadow-soft bg-surface rounded-2xl border border-border px-4 py-3 text-xs text-fg-muted font-mono">
            shadow-soft → e4
          </div>
        </div>
      </Group>

      <Group label="Debug">
        <button
          type="button"
          onClick={() => setShowInline((v) => !v)}
          className={cn(
            "px-3 py-1.5 rounded-xl text-xs font-semibold border border-border bg-surface text-fg-muted",
            "hover:bg-surface-muted",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
            "transition-colors",
          )}
          aria-expanded={showInline}
        >
          {showInline
            ? "Сховати посилання на recipes"
            : "Показати посилання на recipes"}
        </button>
        {showInline && (
          <ul className="mt-3 space-y-1 text-2xs text-fg-subtle font-mono leading-relaxed">
            {STEPS.map((step) => (
              <li key={step.level}>
                <span className="text-fg">--shadow-{step.level}</span>: див.{" "}
                <code>
                  packages/design-tokens/tokens.js → elevation.{step.level}
                </code>
              </li>
            ))}
          </ul>
        )}
      </Group>
    </Sec>
  );
}
