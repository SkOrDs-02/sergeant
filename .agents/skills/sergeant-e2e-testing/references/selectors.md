---
title: Selector Hierarchy and Anti-Patterns
impact: HIGH
impactDescription: Wrong selectors are the primary cause of flaky Playwright tests and post-refactor breakage in Sergeant.
tags: [playwright, selectors, locators, e2e]
---

# Selector Hierarchy

Playwright's built-in locators encode semantics and auto-retry. Prefer them over raw CSS.

## Preferred order

1. `page.getByRole("button", { name: "Sign in" })` — ARIA role + accessible name; survives DOM refactors.
2. `page.getByLabel("Email")` — matches `<label>` association; good for form fields.
3. `page.getByText("Continue", { exact: true })` — exact text match; use `exact: true` to avoid false positives.
4. `page.getByTestId("auth-email")` — `data-testid` attribute for elements without a natural ARIA role.
5. `page.locator("css selector")` — last resort; never use `nth-child`, `first-child`, or positional selectors.

## Anti-patterns

**Incorrect — positional selector breaks on design changes:**
```typescript
await page.locator(".auth-form button:nth-child(2)").click();
```

**Correct — role-based locator:**
```typescript
await page.getByRole("button", { name: "Sign in" }).click();
```

**Incorrect — CSS class tied to implementation detail:**
```typescript
await page.locator(".btn-primary").click();
```

**Correct — accessible name:**
```typescript
await page.getByRole("button", { name: "Continue" }).click();
```

## Sergeant-specific note

`packages/design-tokens` Tailwind classes change during token refactors. Always prefer role or label locators over class-based ones. For components that genuinely lack an ARIA role (e.g. custom card grids), add a `data-testid` attribute in the component source rather than writing a fragile CSS path.
