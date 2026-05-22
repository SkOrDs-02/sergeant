# Shared mockup components

Pure JS / JSX helpers used by multiple mockup HTML files. No build step —
include via `<script>` tags with paths relative to the consumer.

| File                  | Type             | Purpose                                       |
| --------------------- | ---------------- | --------------------------------------------- |
| `deck-stage.js`       | Web Component    | Slide-deck shell · scaling · keyboard nav     |
| `design-canvas.jsx`   | React component  | Pan/zoom canvas for presenting design options |
| `tweaks-panel.jsx`    | React component  | In-design tweak controls                      |
| `motion-variants.jsx` | React components | 5 motion-variant scenes for `concepts.html`   |

## Loading

From a mockup nested **2 levels deep** (e.g. `mockups/pitch/deck-v1.html`):

```html
<script src="../_shared/components/deck-stage.js"></script>
<script type="text/babel" src="../_shared/components/tweaks-panel.jsx"></script>
<script
  type="text/babel"
  src="../_shared/components/design-canvas.jsx"
></script>
```

From a mockup nested **3 levels deep** (e.g. `mockups/product/splash/index.html`):

```html
<script
  type="text/babel"
  src="../../_shared/components/design-canvas.jsx"
></script>
```

## Who uses what

| Component             | Used by                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deck-stage.js`       | `pitch/deck-v1.html`                                                                                                                                      |
| `tweaks-panel.jsx`    | `pitch/deck-v1.html`                                                                                                                                      |
| `design-canvas.jsx`   | `pitch/ph-launch-storyboard.html`, `motion/concepts.html`, `marketing/wrapped-2026.html`, `marketing/app-store-screens.html`, `product/splash/index.html` |
| `motion-variants.jsx` | `motion/concepts.html`                                                                                                                                    |

## Rules

- Do **not** copy these files next to each consumer — single source of truth.
- Do **not** run `prettier` on these files — inline styles in long lines.
- Do **not** rename this folder — all HTML paths are hardcoded to `_shared/components/`.
