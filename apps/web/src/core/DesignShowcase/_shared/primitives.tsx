/* eslint-disable sergeant-design/no-eyebrow-drift -- showcase primitives
   intentionally render the eyebrow / maturity / DoDont chrome that the
   styleguide is about; replacing them with <SectionHeading> would defeat
   the purpose of demonstrating the raw eyebrow shape. */
import type { ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";
import { SectionHeading } from "@shared/components/ui";
import { NAV_SECTIONS } from "./nav";

/**
 * Building blocks shared by every section file:
 *
 *  - `Sec`           — `<section>` shell with heading + maturity badge,
 *                       picks the maturity from `NAV_SECTIONS` so it stays
 *                       in sync with the sidebar.
 *  - `Group`         — labelled sub-block inside a section.
 *  - `Swatch`        — small token preview tile.
 *  - `CodeBlock`     — copy-pasteable snippet rendered with token styles.
 *  - `DoDont`        — Do / Don't pair table for a primitive.
 *  - `RuleBadges`    — Hard Rule + ESLint rule badge list per section.
 *  - `MaturityBadge` — Stable / Beta / Experimental pill (used in Sec
 *                       and the docs maturity matrix).
 */

const MATURITY_LABEL: Record<
  "stable" | "beta" | "experimental",
  { label: string; tone: string }
> = {
  stable: {
    label: "stable",
    tone: "bg-success-soft text-success border-success/40",
  },
  beta: {
    label: "beta",
    tone: "bg-warning-soft text-warning border-warning/40",
  },
  experimental: {
    label: "experimental",
    tone: "bg-info-soft text-info border-info/40",
  },
};

export function MaturityBadge({
  level,
}: {
  level: "stable" | "beta" | "experimental";
}) {
  const m = MATURITY_LABEL[level];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-mono uppercase tracking-wide border",
        m.tone,
      )}
    >
      {m.label}
    </span>
  );
}

export function Sec({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  const nav = NAV_SECTIONS.find((s) => s.id === id);
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24"
      data-showcase-section={id}
    >
      <header className="mb-6 pb-3 border-b border-line flex items-center gap-3 flex-wrap">
        <h2 id={`${id}-title`} className="text-style-hero text-text">
          {title}
        </h2>
        {nav ? <MaturityBadge level={nav.maturity} /> : null}
      </header>
      {intro ? (
        <p className="text-sm text-muted leading-relaxed mb-6 max-w-3xl">
          {intro}
        </p>
      ) : null}
      <div className="space-y-10">{children}</div>
    </section>
  );
}

export function Group({
  label,
  description,
  children,
  row = false,
}: {
  label: string;
  description?: ReactNode;
  children: ReactNode;
  row?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div>
        <SectionHeading size="xs" variant="subtle">
          {label}
        </SectionHeading>
        {description ? (
          <p className="text-xs text-muted mt-1 max-w-2xl">{description}</p>
        ) : null}
      </div>
      <div className={row ? "flex flex-wrap items-center gap-3" : ""}>
        {children}
      </div>
    </div>
  );
}

export function Swatch({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={cn(
          "w-14 h-14 rounded-2xl border border-line shadow-card",
          className,
        )}
      />
      <span className="text-2xs text-subtle text-center font-mono">
        {label}
      </span>
    </div>
  );
}

export function CodeBlock({ children }: { children: string }) {
  return (
    <pre
      className={cn(
        "text-2xs leading-relaxed font-mono",
        "bg-panelHi text-text border border-line rounded-xl",
        "px-3 py-2 overflow-x-auto",
      )}
    >
      <code>{children}</code>
    </pre>
  );
}

export interface DoDontRow {
  label: string;
  good: ReactNode;
  bad: ReactNode;
}

export function DoDont({ rows }: { rows: readonly DoDontRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full text-xs">
        <thead className="bg-panelHi">
          <tr>
            <th
              scope="col"
              className="text-left text-2xs uppercase tracking-wide text-subtle px-3 py-2 w-32"
            >
              Primitive
            </th>
            <th
              scope="col"
              className="text-left text-2xs uppercase tracking-wide text-success px-3 py-2"
            >
              Do
            </th>
            <th
              scope="col"
              className="text-left text-2xs uppercase tracking-wide text-danger px-3 py-2"
            >
              Don&apos;t
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.label} className="bg-panel align-top">
              <th
                scope="row"
                className="px-3 py-2 text-text font-semibold text-left"
              >
                {row.label}
              </th>
              <td className="px-3 py-2 text-text">{row.good}</td>
              <td className="px-3 py-2 text-muted line-through decoration-danger/60">
                {row.bad}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface RuleEntry {
  /** Display id, e.g. `HR #11` or `ESLint: no-hex-in-classname`. */
  label: string;
  /** Optional helper string rendered as the title attribute. */
  hint?: string;
}

export function RuleBadges({
  hardRules,
  lintRules,
}: {
  hardRules: readonly RuleEntry[];
  lintRules: readonly RuleEntry[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs uppercase tracking-wide text-subtle w-20 shrink-0">
          Hard rules
        </span>
        {hardRules.length === 0 ? (
          <span className="text-2xs text-subtle italic">none direct</span>
        ) : null}
        {hardRules.map((r) => (
          <span
            key={r.label}
            title={r.hint}
            className="px-2 py-0.5 rounded-md text-2xs font-mono border border-accent/40 bg-accent/10 text-accent"
          >
            {r.label}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs uppercase tracking-wide text-subtle w-20 shrink-0">
          ESLint
        </span>
        {lintRules.length === 0 ? (
          <span className="text-2xs text-subtle italic">convention-only</span>
        ) : null}
        {lintRules.map((r) => (
          <span
            key={r.label}
            title={r.hint}
            className="px-2 py-0.5 rounded-md text-2xs font-mono border border-info/40 bg-info/10 text-info"
          >
            {r.label}
          </span>
        ))}
      </div>
    </div>
  );
}
