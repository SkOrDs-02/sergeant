# ADR-0046: Storybook visual regression scope

- **Status:** accepted
- **Date:** 2026-05-05
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [ADR-0034](./0034-visual-regression-testing.md) — visual regression via Argos + Playwright on hub surfaces.
  - [`docs/initiatives/0007-design-system-tooling.md`](../initiatives/0007-design-system-tooling.md) — Design-system tooling initiative (Phases 1–5).
  - [`apps/web/.storybook/main.ts`](../../apps/web/.storybook/main.ts) — Storybook 10 config (Vite 8, framework `@storybook/react-vite`).
  - [`.github/workflows/storybook-deploy.yml`](../../.github/workflows/storybook-deploy.yml) — Storybook GitHub Pages deploy.
  - [`packages/eslint-plugin-sergeant-design/index.js`](../../packages/eslint-plugin-sergeant-design/index.js) § `require-stories-for-ui-components`.
  - [`docs/design/storybook.md`](../design/storybook.md) — contributor guide.

---

## 0. TL;DR

Storybook stories in `apps/web/src/**/*.stories.tsx` are NOT wired into the Argos visual-regression baseline. Storybook serves a **single role** in our pipeline: a **deterministic developer playground** for UI primitives + module surfaces, deployed to GitHub Pages on every `main` merge. The 56-screenshot Argos baseline established in [ADR-0034](./0034-visual-regression-testing.md) (real hub surfaces in `ds-visual-qa.spec.ts`) remains the **only authoritative source of visual regression diffs**. ESLint rule `sergeant-design/require-stories-for-ui-components` (severity `error` after initiative 0007 round-10) enforces story coverage as a documentation contract, not a regression-detection contract.

---

## 1. Context and Problem Statement

Initiative 0007 (Design-system tooling) closes Storybook setup + story coverage for `apps/web/src/shared/components/ui/` (Phase 1–2) and module-level `*Card` components (Phase 3). The original initiative draft listed visual regression integration (Phase 4) as a goal — "Build storybook → dist/storybook → Run Playwright with `expect(page).toHaveScreenshot()` per story."

After we landed [ADR-0034](./0034-visual-regression-testing.md) (Argos + Playwright over real hub surfaces), the design tradeoffs around **Storybook-as-VRT** changed:

1. **Story isolation does not match production rendering.** Stories render components in isolation (no `<AppShell>`, no real router state, no React Query cache). VRT diffs that only appear on isolated stories are usually false positives — the same pixel drift in production is hidden by surrounding chrome.
2. **Argos free tier has a 5000 screenshot/month budget.** ADR-0034 commits ≈1700/month (56 × ≈30 PRs). Adding ≈70 stories × 3 viewports = 210 screenshots/PR would 4×-blow our budget within one PR-flood week.
3. **Story coverage is documentation, not regression contract.** Round-10 (initiative 0007) lifts shared/ui story coverage to 100% non-allowlisted (37/37 components — see `eslint.config.js` § `require-stories-for-ui-components`). A reviewer skimming Storybook gets a "what does this look like" answer in 2 seconds; that's the value, independent of pixel-level baseline.
4. **Storybook deploy needs zero infra.** GitHub Pages on `main` push is free, runs in 5 minutes, and gives reviewers a public URL. No external service dependency.

The problem statement boils down to: **we need to commit to one, and only one, source of pixel-level visual regression truth, while still letting Storybook serve as a documentation playground.**

---

## 2. Considered Options

1. **Argos for Storybook stories, on top of the existing hub-surface baseline** — duplicates the Argos pipeline against `?id=…&viewMode=story` URLs after `pnpm build-storybook`. Maximalist coverage, but quadruples the screenshot budget and amplifies false-positive rate (motion, font subpixel, animation first-frame on isolated components).
2. **Chromatic for Storybook stories alongside Argos for hub surfaces** — Chromatic is purpose-built for Storybook; UI for diff approval is excellent. Costs $$$ on private repos and means we operate **two** visual-regression services with two approval surfaces — cognitive overhead for a solo maintainer.
3. **Storybook = playground only, Argos = single VRT source (chosen).** Storybook coverage enforced by ESLint as a documentation contract. Storybook deploys to GitHub Pages so reviewers + designers always have a canonical playground. Argos keeps its 56-screenshot baseline; if a regression bypasses both ESLint static rules and the hub-surface baseline, the next initiative explicitly opts a single component family into Argos via a dedicated "story snapshot" spec — incremental, not big-bang.
4. **Skip Storybook deploy, run only the build step in CI.** Cheapest, but loses the "share a URL with the designer" workflow that initiative 0007 explicitly listed in Phase 5.

---

## 3. Decision

**Option 3 — Storybook = playground only; Argos = single VRT source.**

Concretely:

- **Storybook coverage contract:** ESLint rule `sergeant-design/require-stories-for-ui-components` is `error`-level (was `warn` until round-10) on `apps/web/src/shared/components/ui/**/*.tsx`. New components MUST ship with a sibling `.stories.tsx`, or be added to the allowlist in `packages/eslint-plugin-sergeant-design/index.js` with a per-file rationale comment. The allowlist groups files into three buckets: barrel/sub-module (`index.tsx`, `Icon.paths.*.tsx`, `EmptyStateIllustrations.tsx`), utility/wrapper (`PageTransition`, `ScreenReaderAnnouncer`, `SkipLink`, `SectionErrorBoundary`, `SuspenseWithMinDelay`, `ModulePageLoader`, `SpotlightQueue`, `StreakProtection`), and gesture/transient overlay (`KeyboardAccessory`, `PullToRefresh{,Indicator}`, `OptimizedImage`, `SwipeToAction`, `QuickActionsMenu`, `CelebrationModal`, `FeatureSpotlight`, `KeyboardShortcutsModal`, `VoiceMicButton`).
- **Storybook deploy:** `.github/workflows/storybook-deploy.yml` builds on every PR (artifact only) and pushes to GitHub Pages on `main` merge. URL: `https://skords-01.github.io/Sergeant/` (provisioned on first run).
- **Visual regression:** untouched. ADR-0034 stays in force — `apps/web/playwright.visual.config.ts` + `apps/web/tests/a11y/ds-visual-qa.spec.ts` + `.github/workflows/visual-regression.yml`. Stories MUST NOT call `argosScreenshot()` or `expect.toHaveScreenshot()`. The visual-regression workflow only watches the 7 hub surfaces × 4 viewports × 2 themes baseline.
- **Future opt-in:** if a specific component family needs stricter pixel-level coverage (e.g. `<DataState>` ladder during the next foundation rollout), it gets a **dedicated** `tests/a11y/ds-component-<name>.spec.ts` that boots Storybook static + Argos-screenshots a curated subset. Not a Storybook-wide hook. Each opt-in PR reviews the screenshot budget impact in the description.

---

## 4. Rationale

**Why one VRT source, not two:**

Visual regression is only useful if reviewers actually approve diffs. Two independent pixel baselines (Argos hub + Argos/Chromatic stories) means two approval surfaces, two false-positive workflows, two drift mitigations. A solo maintainer's review-velocity tax is too high; the marginal regression catch from story-level diffs (already covered by 11 ESLint design rules + the hub-surface baseline) does not justify it.

**Why GitHub Pages over Vercel preview:**

Vercel preview-per-PR is great for the production app (already in use on `apps/web`). For Storybook we want a **stable canonical URL**, not per-PR ephemeral previews — designers link the URL into Figma comments and expect it to stay live. GitHub Pages delivers stable + free; the per-PR artifact upload covers the "I want to see what this PR looks like" use case.

**Why ESLint enforcement for coverage:**

Round-10 raised shared/ui story coverage from 35% to 100% non-allowlisted. Without the `error`-level ESLint rule, that coverage will erode as new components land. Severity = `error` is the cheapest enforcement: pre-commit Husky hook fails the commit, CI fails the PR, contributor adds the story or allowlist entry in the same change. No human-loop required.

**Why stories MUST NOT call `argosScreenshot()`:**

Argos counts every screenshot toward the monthly quota and computes a diff for every screenshot. A drive-by `argosScreenshot(page, "story-xyz")` inside a story dev-dependency would silently quadruple our quota and fragment the baseline ownership. ADR-0034 §6 already pinned `ds-visual-qa.spec.ts` as the only authorised caller; this ADR re-states the constraint explicitly so future Storybook contributors don't try to "wire it up."

---

## 5. Consequences

### Positive

- **One pixel-level regression source of truth.** No reviewer confusion about which diff to approve.
- **Storybook coverage = enforced documentation.** Every public UI component lands with a discoverable, decorator-rendered playground, but visual flake-rate stays bounded by the hub-surface baseline.
- **Free deploy.** GitHub Pages on `main` push, no Vercel/Chromatic line item.
- **Allowlist with rationale comment** documents _why_ a component skips story-coverage, so the next round of contributors don't redebate the decision.

### Negative

- **No automated diff for component-isolated regressions.** A button color change that only manifests on isolated `<Button variant="primary" />` (and not on hub) won't be caught. Mitigation: 11 ESLint design rules (`no-foreign-module-accent`, `no-low-contrast-text-on-fill`, `valid-tailwind-opacity`, `no-raw-dark-palette`, etc.) catch most palette/spacing drifts statically; reviewer skims Storybook URL during PR review for visual sanity.
- **Storybook coverage is enforced even on rapidly-changing internal helpers.** If a contributor wants to ship a quick experimental component, they must either add a story or update the allowlist. Mitigation: allowlist entry with `// TODO(2026-XX-XX): promote to .stories.tsx` is a 30-second action that unblocks merge while keeping the contract honest.

### Neutral

- ESLint rule `require-stories-for-ui-components` lives in `packages/eslint-plugin-sergeant-design/`. No changes to its API; only the severity flips to `error` and the allowlist grows.
- ADR-0034 stays unchanged. Visual regression CI workflow (`visual-regression.yml`) is untouched.

---

## 6. Compliance

- **Stories scope:** every public `apps/web/src/shared/components/ui/<Name>.tsx` MUST have a sibling `<Name>.stories.tsx` OR be in the allowlist. CI enforces via `pnpm lint` (severity `error`).
- **Storybook deploy:** `.github/workflows/storybook-deploy.yml` runs on every PR (build only) and on `main` push (build + deploy). Failed deploy → GitHub Pages serves the previous build; investigate via the workflow logs, not the live URL.
- **VRT isolation:** Stories MUST NOT import `@argos-ci/playwright` or call `expect.toHaveScreenshot()`. There is no automated lint rule for this — reviewer responsibility, with this ADR as the policy reference.
- **Allowlist hygiene:** every entry in `DEFAULT_REQUIRE_STORIES_ALLOWLIST` has a per-file rationale comment in the same source block. PR review rejects allowlist additions without rationale.

## 7. Links

- Initiative: [`docs/initiatives/0007-design-system-tooling.md`](../initiatives/0007-design-system-tooling.md).
- Sister ADR (hub-surface VRT): [ADR-0034](./0034-visual-regression-testing.md).
- Storybook contributor guide: [`docs/design/storybook.md`](../design/storybook.md).
- Storybook deploy workflow: [`.github/workflows/storybook-deploy.yml`](../../.github/workflows/storybook-deploy.yml).
