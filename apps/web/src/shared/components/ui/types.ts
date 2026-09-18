/**
 * Sergeant Design System — Shared UI prop types.
 *
 * Several primitives in this folder share identical prop unions
 * (e.g. `Input` and `Select` both accept `default | filled | ghost`
 * and `sm | md | lg`). Defining those unions in one place keeps the
 * surface honest — when we add a new form variant, every consumer
 * picks it up at once instead of drifting per-component.
 *
 * Component-local aliases (e.g. `InputVariant`, `SelectSize`) are kept
 * as type aliases of these shared types so existing call sites and
 * deep imports continue to work.
 */

/**
 * Visual variant shared by form controls (`Input`, `Textarea`, `Select`).
 * `default` is the bordered surface, `filled` removes the border in
 * favour of a tinted panel, `ghost` is transparent until hover/focus.
 */
export type FormVariant = "default" | "filled" | "ghost";

/**
 * Standard small / medium / large sizing scale used across multiple
 * primitives (`Input`, `Select`, `Button`, etc.). Components that
 * need a different scale (e.g. `Avatar`'s `xs..xl`) define their own.
 */
export type SmallMediumLarge = "sm" | "md" | "lg";
