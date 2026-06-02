# Code references for mockup work

Verified against codebase on 2026-05-17. Update when files move.

---

## Existing screens (for «0-now» state)

| Screen           | Actual path                                                 | Note                                                                                                  |
| ---------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Finyk overview   | `apps/web/src/modules/finyk/pages/Overview.tsx`             |                                                                                                       |
| Fizruk dashboard | `apps/web/src/modules/fizruk/pages/Dashboard.tsx`           |                                                                                                       |
| Routine today    | `apps/web/src/modules/routine/RoutineApp.tsx`               | No `pages/` dir; `RoutineApp` is the today view. Also see `RoutineHeader.tsx`, `RoutineTimeline.tsx`. |
| Nutrition today  | `apps/web/src/modules/nutrition/pages/NutritionLogPage.tsx` | Log page = today view. Also: `NutritionMenuPage`, `NutritionPantryPage`.                              |
| Hub chat         | `apps/web/src/core/hub/chat/` (directory)                   |                                                                                                       |
| Hub dashboard    | `apps/web/src/core/hub/dashboard/` (directory)              |                                                                                                       |

## Navigation primitives

| Component          | Actual path                                             |
| ------------------ | ------------------------------------------------------- |
| `HubBottomNav`     | `apps/web/src/core/app/HubBottomNav.tsx`                |
| `ModuleBottomNav`  | `apps/web/src/shared/components/ui/ModuleBottomNav.tsx` |
| `HeroValueLine`    | **NOT FOUND** — pending-implementation                  |
| `CategoryIconPill` | **NOT FOUND** — pending-implementation                  |

## UI primitives (glass, cards, overlays)

| Component               | Actual path                                                  |
| ----------------------- | ------------------------------------------------------------ |
| `InsightCard`           | `apps/web/src/shared/components/ui/InsightCard.tsx`          |
| `AIPill`                | `apps/web/src/shared/components/ui/AIPill.tsx`               |
| `Sheet` (glass variant) | `apps/web/src/shared/components/ui/Sheet.tsx`                |
| `Card`                  | `apps/web/src/shared/components/ui/Card.tsx`                 |
| `EmptyState`            | `apps/web/src/shared/components/ui/EmptyState.tsx`           |
| `FloatingActionButton`  | `apps/web/src/shared/components/ui/FloatingActionButton.tsx` |
| `ModulePageLoader`      | `apps/web/src/shared/components/ui/ModulePageLoader.tsx`     |
| `QuickActionsMenu`      | `apps/web/src/shared/components/ui/QuickActionsMenu.tsx`     |
| `CelebrationModal`      | `apps/web/src/shared/components/ui/CelebrationModal.tsx`     |

## Theme / primitives (for glass, radius, motion)

| What                             | Actual path                               | Note                                                                          |
| -------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| Global theme (CSS vars)          | `apps/web/src/styles/theme.css`           | NOT `theme/tokens.css` — design-system.md had wrong path                      |
| Module surface accents           | `apps/web/src/styles/module-surfaces.css` | NOT `theme/module-accents.css`                                                |
| Animations                       | `apps/web/src/styles/animations.css`      |                                                                               |
| Background patterns              | `apps/web/src/styles/background.css`      |                                                                               |
| Base reset                       | `apps/web/src/styles/base.css`            |                                                                               |
| Component classes                | `apps/web/src/styles/components.css`      |                                                                               |
| Mobile breakpoints               | `apps/web/src/styles/mobile.css`          |                                                                               |
| Utilities                        | `apps/web/src/styles/utilities.css`       |                                                                               |
| DesignShowcase (live styleguide) | `apps/web/src/core/DesignShowcase/`       | Sections: Colors, Typography, Spacing, Elevation, ModuleAccents, Motion, etc. |

## Plans (for «after-plan» + new screens)

| Topic               | Plan doc                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| FTUX onboarding     | `docs/launch/product-os/ftux-master-tracker.md` · `docs/launch/product-os/ftux-sprint-plan.md`             |
| Paywall             | `docs/launch/product-os/paywall-implementation-plan.md` · `docs/launch/product-os/paywall-ux-placement.md` |
| Empty states        | `docs/design/empty-states.md`                                                                              |
| Telegram UX         | `docs/launch/tech/telegram-improvements-roadmap.md`                                                        |
| Push schema         | Search `apps/` for push notification schema — not found in docs as of 2026-05-17                           |
| Cross-module nudges | `docs/design/cross-module-prompts.md`                                                                      |
| Undo pattern        | `docs/design/undo-pattern.md`                                                                              |
| Unified bottom-nav  | `docs/design/unified-bottom-nav.md`                                                                        |

## Mockup shared CSS

| File                            | Purpose                                                           |
| ------------------------------- | ----------------------------------------------------------------- |
| `mockups/_shared/tokens.css`    | CSS vars mirroring design-system.md (colors, type, radii, motion) |
| `mockups/_shared/marketing.css` | Cream/paper layouts for landing & marketing mockups               |
| `mockups/_shared/product.css`   | Dark `#1a1614` + glass v2 for product handoff mockups             |
