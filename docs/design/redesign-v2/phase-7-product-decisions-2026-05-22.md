# Sergeant v2 Phase 7 — Product Decisions (2026-05-22)

> **Author:** @Skords-01 (decisions) + Claude Code (recording)
> **Date:** 2026-05-22
> **Status:** Active — these are locked product calls that unblock Phase 7 implementation
> **Companion docs:** [`execution-plan.md`](./execution-plan.md) Phase 7 deferred bucket · [`retrospective-2026-05-21.md`](./retrospective-2026-05-21.md) · [`backlog.md`](./backlog.md)

## TL;DR

Six strategic blockers held Phase 7 hostage at v2 retrospective close-out (2026-05-21). One product prioritization session (~30 min) cleared them. Implementation can now spawn parallel agents per decision.

| # | Decision | Locked choice |
|---|---|---|
| D1 | AuthPage v2 scope | **Visual refresh only** (no flow change) |
| D2 | PaywallModal trigger | **Feature gates** (touch premium feature → modal) |
| D3 | Pricing tiers | **One paid tier** (Free → Premium €X/mo) |
| D4 | WelcomeScreen v2 | **Preset picker first** (modules selected before Hub) |
| D5 | HubChat route | **Bottom sheet expandable** to full-screen |
| D6 | Phase 8 RN parity | **Deferred indefinitely** — out of Phase 7 scope |

## D1 — AuthPage v2 scope

**Decision:** Visual refresh only.

### What this means

- Keep the existing email-password flow + magic-link if already wired
- No new auth methods (no social login add, no OAuth providers)
- Apply v2 design language: `MeshBackground` shell, `Card prominence="hero"` layouts, `text-style-display` typography, glass tokens
- Update copy and microcopy where it's stale
- Touch targets ≥44 px (Hard Rule), focus-visible states

### Why

- Lowest risk path to visual coherence with rest of v2
- Auth flow is already proven (not a UX problem to solve)
- Frees Phase 7 bandwidth for higher-leverage items (D4 WelcomeScreen redesign)
- Future "Auth UX cycle" can address social login, biometric, etc. separately

### Out of scope

- Email verification flow restructuring
- Magic-link UX refresh beyond styling
- Password reset flow changes
- Account recovery / multi-factor auth

### Implementation hint

Single PR ~M-size. Pattern proven by Phase 2.1 / 2.3 hero migrations: keep behavior identical, swap chrome.

## D2 — PaywallModal trigger model

**Decision:** Feature gates (touch a premium feature → modal appears).

### What this means

- Each premium-locked feature has an explicit gate check at access point
- User taps a locked feature → `<PaywallModal>` opens with context-aware copy ("To unlock multi-currency, upgrade to Premium")
- No usage-threshold triggers (no "you've logged 30 expenses, upgrade!" surprise)

### Why

- More UX-coherent: paywall appears in exact moment user demonstrated interest
- Easier to track conversion attribution (which feature caused the upsell?)
- Avoids "nag fatigue" of threshold-based prompts
- Per-feature gating already aligns with the codebase's existing module-scoped architecture

### Premium feature list (TBD in implementation PR)

Will need a flat list of which features sit behind the gate. Initial candidates from existing surfaces:
- AI macro photo analysis (Nutrition)
- AI categorization (Finyk) beyond first 30/month
- Multi-currency support (Finyk)
- Advanced analytics / export PDF (cross-module)
- Workout AI suggestions (Fizruk)

This list gets locked in the first paywall PR. Initially conservative — only 3-5 gates so the modal isn't annoying.

### Out of scope

- Usage threshold triggers (deferred — could be added later as supplement)
- Time-based triggers (deferred — same)

## D3 — Pricing tiers

**Decision:** One paid tier (Free → Premium €X/mo).

### What this means

- Free tier: limited basic use across all 4 modules (specific limits TBD in pricing PR)
- Premium tier: everything unlocked, one price
- No Plus/Pro split
- No Lifetime / one-time purchase option
- No free trial gate (Free tier always available)

### Why

- Simplest mental model for user ("Free vs Premium, done")
- Removes paradox-of-choice friction at decision moment
- Cleaner A/B testing surface — only price varies, not feature mix
- Avoids synthetic feature gating that 2-tier requires for a solo-user product
- Plus/Pro would require natural team-line (which Sergeant doesn't have currently)

### Future evolution path

- **Through 2-3 months post-launch:** observe Free → Premium conversion rate
- **If conversion stays low:** consider switching to (c) free trial 14-day model
- **If family/couple features ship in Phase 9+:** revisit (b) Plus/Pro split with clear solo vs family team-line

### Out of scope

- Specific price points (€X/mo, $X/mo per region)
- Free tier limits (X expenses/month, Y workouts, etc.)
- Regional pricing adjustments
- Annual pricing discount

These will be locked in dedicated pricing PR with market research input.

## D4 — WelcomeScreen v2

**Decision:** Preset picker first — modules selected before Hub.

### What this means

- New user lands on WelcomeScreen
- Sees 4 module cards (Finyk / Fizruk / Routine / Nutrition) with brief value props
- Picks which modules they want to use (1-4 modules)
- Hub then renders with only those modules visible
- Other modules accessible later via settings but hidden by default

### Why

- Closer to actual usage than generic product tour
- Reduces empty-state burden on Hub (only show modules user picked)
- Faster time-to-first-value — user immediately sees their relevant modules
- Acts as soft segmentation signal (data on which modules dominate)

### Implementation hint

- Reuse `mockups/product/quick-add/` interaction pattern for module-selector grid
- Existing `useModuleFirstRun` hook tracks per-module first-entry state — extend to track "user opted-in to module" vs "user opted-out"
- Setting page exposes "Add module" / "Hide module" toggle for later changes
- First entry into picked module = existing first-run handoff (`firstRunFinyk`, etc.)

### Out of scope

- Product tour slides (defer — preset picker is the tour)
- Animated illustrations beyond what we have
- Email collection at WelcomeScreen (lives in AuthPage)

## D5 — HubChat route mode

**Decision:** Bottom sheet expandable to full-screen.

### What this means

- HubChat opens as bottom sheet (initial height ~60% viewport) overlaid on current route
- User can pull sheet up to expand to full-screen for longer chat threads
- User can dismiss with swipe down or backdrop tap
- Chat state persists across opens

### Why

- Hybrid of full-screen (immersive) and modal (preserves context where you were)
- Bottom sheet pattern already exists in codebase (`AddMealSheet`, `ManualExpenseSheet`)
- Matches mobile-first expectations
- Allows in-context chat ("ask AI about this expense") without losing scroll position

### Implementation hint

- Use existing `<Sheet variant="glass">` primitive (shipped Phase 0 T3)
- Lazy-load chat content (already heavy)
- Snap points: 60% / 100% / dismissed
- Preserve URL — chat opens via overlay state, not route change

### Out of scope

- Full-screen route `/chat` (deprecated as primary entry; can stay as deep link)
- Multi-thread chat history (separate cycle)

## D6 — Phase 8 RN mobile parity

**Decision:** Deferred indefinitely.

### What this means

- `apps/mobile` lags web `apps/web` substantially after v2
- No work on bringing mobile to v2 parity in Phase 7
- Mobile remains functional on previous design system

### Why

- Mobile parity is 2-3 month strategic cycle, not a Phase 7 tactical item
- Web product-market fit and pricing model (D1-D5) needs to land first
- RN bridge cost (NativeWind quirks, navigation patches) is non-trivial
- Better resource allocation: ship web Phase 7 fully, measure, then decide if RN catch-up justified

### Future revisit trigger

- Sustained web user growth that hits mobile-only use cases
- Native iOS / Android-specific feature pull (Live Activities, Widgets, HealthKit deep integration)
- Sergeant Mobile becomes meaningful revenue surface (currently negligible)

### Out of scope

- All RN component refresh work
- iOS / Android native module updates beyond what auth or storage requires
- Apple App Store / Google Play store presence updates

## Tactical follow-ups unblocked by these decisions

| Tactical item | Unblocked by |
|---|---|
| Premium feature gate inventory PR | D2 |
| Pricing page copy + tiers UI | D3 |
| WelcomeScreen preset picker component | D4 |
| HubChat bottom-sheet refactor | D5 |
| AuthPage v2 visual refresh PR | D1 |

These will be addressed as separate PRs through Phase 7 cycle. Order TBD by user.

## Next steps

1. This doc lands as PR (record-keeping).
2. Tactical D7-D12 cleanup batch runs in parallel (worktree cleanup, ESLint flips, AIPill voice, SW tests, magic numbers, stale PR triage).
3. Phase 7 implementation PRs spawn one by one against these decisions — each cites this doc in its body.
