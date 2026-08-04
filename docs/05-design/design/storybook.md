# Storybook (apps/web)

> **Last validated:** 2026-08-04 by @claude. **Next review:** 2026-09-07.
> **Status:** Active

Sergeant ships a Storybook 10 (`@storybook/react-vite`) playground for the web design-system. It serves as:

1. The canonical, deployed "what does this component look like" reference for design partners + contributors.
2. The coverage convention surface: every public UI component in `apps/web/src/shared/components/ui/` either has a sibling `.stories.tsx` or a documented rationale for why it is not a visual component. This is a design convention enforced in review — the former ESLint rule `sergeant-design/require-stories-for-ui-components` was retired by [ADR-0081](../../04-governance/adr/0081-repository-simplification.md).

Storybook is **not** a visual-regression source. See [ADR-0046](../../04-governance/adr/0046-storybook-vrt-scope.md) for the scope decision and [ADR-0034](../../04-governance/adr/0034-visual-regression-testing.md) for the actual VRT pipeline (Argos + Playwright over real hub surfaces).

---

## Where things live

| Path                                     | What                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `apps/web/.storybook/main.ts`            | Storybook config (framework, stories glob, vite-plugin-pwa stripper) |
| `apps/web/.storybook/preview.tsx`        | Global decorators (Tailwind CSS entry, ToastProvider)                |
| `apps/web/src/**/*.stories.tsx`          | Co-located story files                                               |
| `.github/workflows/storybook-deploy.yml` | GitHub Pages deploy (PR build + `main` deploy)                       |

Stories live **next to the component**, not in a separate folder:

```
apps/web/src/shared/components/ui/
├── Button.tsx
├── Button.stories.tsx       ← here
└── …
```

The same pattern applies to `apps/web/src/modules/<module>/components/` and `apps/web/src/core/`. The Storybook stories glob (`../src/**/*.stories.@(ts|tsx)`) catches all of them.

---

## Local development

```bash
# Dev server — hot reload, opens on :6006
pnpm --filter @sergeant/web storybook

# Static build — same output that ships to GitHub Pages
pnpm --filter @sergeant/web build-storybook -- --output-dir storybook-static
```

The dev server reuses `apps/web/vite.config.js`. PWA / service-worker plugins are stripped in `viteFinal` (workbox precache breaks on the Storybook manager bundle ≥3 MiB). Production env vars are not loaded — stories must NOT depend on `import.meta.env.*` runtime values.

---

## Writing a story

Minimum viable story for a public UI component:

```tsx
// Foo.stories.tsx — sibling of Foo.tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Foo } from "./Foo";

/**
 * `Foo` — one-paragraph description: what it is, when to reach for it,
 * which surface uses it. This block becomes the autodocs intro.
 */
const meta: Meta<typeof Foo> = {
  title: "Shared / Foo",
  component: Foo,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768, 1280] },
  },
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Foo>;

export const Default: Story = {
  args: { label: "Default" },
};
```

### Conventions

- **`title`:** `"<Surface> / <ComponentName>"` — `Surface` is one of `Shared`, `Finyk`, `Fizruk`, `Nutrition`, `Routine`, `Insights`, or a sub-folder name. Keeps the Storybook sidebar tidy.
- **`tags: ["autodocs"]`:** generates the docs page for free.
- **`parameters.layout`:** `"padded"` (default), `"centered"` (small primitives), or `"fullscreen"` (overlays / page-level).
- **`parameters.chromatic.viewports: [375, 768, 1280]`:** mobile / tablet / desktop breakpoints. Chromatic is not wired up today (see ADR-0046), but the metadata is forward-compatible if we opt in later.
- **One story per meaningful state.** Default, hover-equivalent (`:focus-visible` rings render on screenshot), disabled, loading, error, accent variants. Don't combine disjoint states behind a single `args` toggle — one story, one visual outcome.
- **Render-only.** Don't reach into React Query, MSW, or `apps/server` mocks. If a component requires data, pass it via `args`. If a component requires a context provider that isn't already in `preview.tsx`, wrap it in a story-local `decorators` array.
- **Storage keys must be unique per story** when a component persists state to `localStorage` (`<CollapsibleSection>`, `<AccentColorPicker>`, …). Re-using a key across stories causes flicker between renders.

### Module-level stories

For domain components (`apps/web/src/modules/<module>/components/`), stories should focus on the top 2–5 head components per module — `*Card`, `*Tile`, `*Header`, `*Form`. Module accents (`data-accent="finyk|fizruk|nutrition|routine|insights"`) are inherited from the component itself, not set via story decorator. Stories ≤ 200 LOC each.

### Animations + transient overlays

Components that auto-dismiss or rely on `IntersectionObserver` (`<AnimatedNumber>`, `<AnimatedList>`, `<StreakFlame>`) MUST expose a render-only escape hatch:

- `immediate: true` (skip count-up animation)
- `triggerOnView: false` (skip IO trigger)
- `show: true` (force overlay open)

Use the escape hatch in stories. Don't rely on real animation timing — Storybook's autodocs takes screenshots at unpredictable frames.

---

## Coverage contract

Story coverage for `apps/web/src/shared/components/ui/**/*.tsx` is a **design convention enforced in review only** — the former ESLint rule `sergeant-design/require-stories-for-ui-components` (severity `error` since initiative 0007 round-10, 2026-05-05) was retired by [ADR-0081](../../04-governance/adr/0081-repository-simplification.md) together with the other visual AST rules. No lint gate fires today; PR review holds the line.

When adding a new public UI component:

1. **First option:** add the sibling `<Name>.stories.tsx` (`dirname(file)/<basename>.stories.tsx`).
2. **Second option:** if the file is genuinely not a visual component (helper / illustration / sub-module / gesture-обгортка / transient overlay), say so in the PR description with a one-line rationale. PR review rejects skipped stories without rationale.

Historically exempt buckets (still useful as review guidance):

- **Sub-module / barrel** — `index.tsx`, `Icon.paths.*.tsx`, `EmptyStateIllustrations.tsx`.
- **Utility / wrapper / a11y** — `PageTransition`, `ScreenReaderAnnouncer`, `SkipLink`, `SectionErrorBoundary`, `SuspenseWithMinDelay`, `ModulePageLoader`.
- **Gesture / transient overlay** — `KeyboardAccessory`, `PullToRefresh{,Indicator}`, `OptimizedImage`, `SwipeToAction`, `QuickActionsMenu`, `CelebrationModal`, `KeyboardShortcutsModal`, `VoiceMicButton`.

If a future component lands in one of those buckets, reuse the same pattern — name the bucket + rationale in the PR.

---

## Deploy

`.github/workflows/storybook-deploy.yml`:

- **PR builds:** `pnpm build-storybook` runs on every PR that touches `apps/web/**`, `packages/design-tokens/**`, or the workflow itself. Static bundle is uploaded as a workflow artifact (`storybook-static-<pr-number>`, 7-day retention) so reviewers can download + open locally.
- **`main` deploy:** after merge, the bundle is published to GitHub Pages at `https://skords-01.github.io/Sergeant/`. The first run requires GitHub Pages to be enabled (Settings → Pages → Source = "GitHub Actions").

Failed deploy → previous Pages build stays live. Investigate via the workflow logs.

---

## What stories are NOT

- **Not a visual regression baseline.** ADR-0034 (Argos + Playwright over hub surfaces) is the only authorised pixel-diff source. Stories MUST NOT call `argosScreenshot()` or `expect.toHaveScreenshot()`. See [ADR-0046](../../04-governance/adr/0046-storybook-vrt-scope.md) for the rationale.
- **Not a unit-test substitute.** Vitest + RTL covers behaviour; stories cover _appearance_. Don't move test assertions into Storybook play functions.
- **Not a dependency-free entry point.** Stories run inside the same Vite pipeline as the app — Tailwind + design-tokens + accent CSS variables flow through `preview.tsx`. If a global is missing, fix `preview.tsx`, don't work around it per-story.

---

## Links

- [ADR-0046 — Storybook visual regression scope](../../04-governance/adr/0046-storybook-vrt-scope.md)
- [ADR-0034 — Visual regression testing via Argos + Playwright](../../04-governance/adr/0034-visual-regression-testing.md)
- [Initiative 0007 — Design-system tooling](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/_0007-design-system-tooling.md)
- [`apps/web/.storybook/main.ts`](../../../apps/web/.storybook/main.ts)
- [`packages/eslint-plugin-sergeant-design/`](../../../packages/eslint-plugin-sergeant-design)
- [Storybook 10 docs](https://storybook.js.org/docs)
