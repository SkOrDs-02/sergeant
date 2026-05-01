---
name: sergeant-monorepo-boundaries
description: Use when a Sergeant change could live in more than one app or package, when extracting shared logic, when porting web features to mobile, or when import boundaries and ownership are unclear.
---

# Sergeant Monorepo Boundaries

Most bad Sergeant edits start with code landing in the wrong layer. Decide the owning boundary before writing files.

## Boundary Rules

- App-specific UI stays in the owning app.
- Cross-platform business logic goes to the matching domain package.
- Shared schemas, wire types, and cross-app utilities belong in `packages/shared` or `packages/api-client`, not duplicated in apps.
- `apps/mobile-shell` is packaging glue, not a feature surface.
- If a helper is only used inside one module, keep it co-located until reuse is proven.

## Fast Decisions

| If the change is... | Put it in... |
| --- | --- |
| React screen, sheet, page, or shell behavior for web | `apps/web/**` |
| Express route or server-side domain logic | `apps/server/**` |
| Shared API client or response typing | `packages/api-client/**` |
| Shared domain math, selectors, normalization | `packages/*-domain/**` |
| Generic schema or utility reused by many apps | `packages/shared/**` |
| Expo-only UI or navigation | `apps/mobile/**` |
| Capacitor packaging or native shell config | `apps/mobile-shell/**` |

## Common Mistakes

- Putting reusable domain logic directly into `apps/web`
- Porting browser APIs into `apps/mobile`
- Adding a shared package for code that is only used once
