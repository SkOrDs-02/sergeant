import { type ElementType, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/ui/cn";

/**
 * Sergeant Design System — Prose
 *
 * Styles arbitrary rich-text children (h1..h4, p, ul, ol, li, blockquote,
 * code, pre, hr, a, table) using the semantic `.text-style-*` fluid type
 * scale defined in `packages/design-tokens/tailwind-preset.js`. Honors the
 * 12px floor (Hard Rule #16) and caps measure at `--max-line-length`
 * (~70ch by default) for comfortable reading on wide viewports.
 *
 * Variants:
 *   - `default` (relaxed reading rhythm, generous block spacing)
 *   - `compact` (tighter rhythm for sheets, sidebars, dense docs)
 *
 * The component renders a single block element (default `<div>`) whose
 * descendant tags are styled via flat selectors so consumers can pass
 * any combination of native HTML, `react-markdown` output, or rendered
 * Notion-style blocks without per-element wrapper drift. Block spacing
 * uses the "lobotomized owl" (`> * + *`) pattern so first / last
 * children sit flush with the surrounding layout.
 *
 * Colours: inherits `color: text` from the surrounding layer; `a`,
 * `code`, `blockquote`, `hr`, `th` border use semantic tokens so dark
 * mode "just works" through the existing CSS variable layer.
 */

export type ProseVariant = "default" | "compact";

export interface ProseProps extends HTMLAttributes<HTMLElement> {
  /**
   * Render variant. `compact` shrinks block spacing by ~33% and uses
   * `body-sm` as the base; `default` uses `body` and a generous rhythm.
   * Defaults to `default`.
   */
  variant?: ProseVariant;
  /**
   * Override the wrapping element. Useful when Prose is nested inside
   * a semantic landmark (e.g. `<article>` or `<section>`). Defaults to
   * `<div>` so the component composes anywhere without changing the
   * document outline.
   */
  as?: ElementType;
  children?: ReactNode;
}

// ── Base styles ──────────────────────────────────────────────────────────
// `--max-line-length` caps measure at ~70ch (CSS `ch` unit ≈ width of "0"
// in the current font). Consumers can override per-instance via the
// `style` prop (e.g. tighter pull-quote sidebars). The selectors below
// scope every typographic decision to descendants so the Prose wrapper
// itself stays a transparent block container.
const PROSE_BASE = cn(
  "text-fg",
  // Measure cap — overridable via `--max-line-length` CSS var.
  "max-w-[var(--max-line-length,70ch)]",
  // Heading hierarchy (fluid via `.text-style-*`).
  "[&_h1]:text-style-display [&_h1]:text-fg [&_h1]:mt-0",
  "[&_h2]:text-style-headline [&_h2]:text-fg",
  "[&_h3]:text-style-title-lg [&_h3]:text-fg",
  "[&_h4]:text-style-title [&_h4]:text-fg",
  // Body copy and links.
  "[&_p]:text-style-body [&_p]:text-fg",
  "[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-accent/50",
  "[&_a:hover]:decoration-accent",
  "[&_a]:focus-visible:outline-hidden [&_a]:focus-visible:ring-2 [&_a]:focus-visible:ring-accent/45 [&_a]:focus-visible:rounded-md",
  // Lists.
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-style-body [&_ul]:text-fg",
  "[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:text-style-body [&_ol]:text-fg",
  "[&_li]:marker:text-fg-muted",
  "[&_li]:[&_p]:my-0",
  // Blockquote.
  "[&_blockquote]:border-l-4 [&_blockquote]:border-accent/40",
  "[&_blockquote]:pl-4 [&_blockquote]:text-fg-muted [&_blockquote]:italic",
  // Inline + block code.
  "[&_code]:text-style-code [&_code]:px-1.5 [&_code]:py-0.5",
  "[&_code]:rounded-md [&_code]:bg-surface-muted [&_code]:text-fg",
  "[&_pre]:rounded-2xl [&_pre]:bg-surface-muted [&_pre]:p-4 [&_pre]:overflow-x-auto",
  "[&_pre]:border [&_pre]:border-border",
  // Reset inside `<pre>` so we don't double-style the inner `<code>`.
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:rounded-none",
  // Rule.
  "[&_hr]:my-8 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-border",
  // Tables (full-width, scroll-on-overflow handled by `pre` parent if any).
  "[&_table]:w-full [&_table]:text-style-body [&_table]:border-collapse",
  "[&_thead]:text-style-overline [&_thead]:text-fg-muted",
  "[&_thead_th]:text-left [&_thead_th]:py-2 [&_thead_th]:px-3",
  "[&_thead_th]:border-b [&_thead_th]:border-border",
  "[&_tbody_td]:py-2 [&_tbody_td]:px-3 [&_tbody_td]:border-b [&_tbody_td]:border-border",
  // Images — keep responsive, never overflow the measure cap.
  "[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-2xl",
  // Strong/em — preserve emphasis without redefining colour.
  "[&_strong]:font-semibold [&_em]:italic",
);

// Block rhythm — "lobotomized owl" so first/last children sit flush with
// the surrounding layout and only adjacent siblings get the spacing.
const RHYTHM_DEFAULT = cn(
  "[&>*+*]:mt-5",
  "[&_h1+*]:mt-4 [&_h2+*]:mt-4 [&_h3+*]:mt-3 [&_h4+*]:mt-2",
  "[&_*+h2]:mt-10 [&_*+h3]:mt-8 [&_*+h4]:mt-6",
  "[&_li+li]:mt-1.5",
);

const RHYTHM_COMPACT = cn(
  "[&>*+*]:mt-3",
  "[&_h1+*]:mt-3 [&_h2+*]:mt-2 [&_h3+*]:mt-2 [&_h4+*]:mt-1",
  "[&_*+h2]:mt-6 [&_*+h3]:mt-5 [&_*+h4]:mt-4",
  "[&_li+li]:mt-1",
  // Step the base body down to body-sm in compact mode so embedded
  // copy reads as supporting prose rather than primary content.
  "[&_p]:text-style-body-sm [&_ul]:text-style-body-sm [&_ol]:text-style-body-sm",
);

export function Prose({
  variant = "default",
  as,
  className,
  children,
  ...rest
}: ProseProps) {
  const Tag: ElementType = as ?? "div";
  return (
    <Tag
      className={cn(
        PROSE_BASE,
        variant === "compact" ? RHYTHM_COMPACT : RHYTHM_DEFAULT,
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
