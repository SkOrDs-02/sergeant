---
title: Network Mocking Strategy
impact: MEDIUM
impactDescription: Over-mocking hides integration bugs; under-mocking creates flaky tests dependent on external services.
tags: [playwright, msw, network, mocking, api]
---

# Network Mocking in Sergeant E2E Tests

## When to mock

| Scenario | Decision |
|---|---|
| External third-party API (Stripe, Monobank webhook) | Always mock — never hit prod credentials in tests |
| Better Auth session endpoints | Do not mock — use `seedFTUX` to pre-seed state instead |
| Sergeant API (`/api/**`) | Mock for isolated smoke tests; use real preview server for integration tests |
| Static assets / CDN | Do not mock — `vite preview` serves them locally |

## Route interception (Playwright-native)

For tests that stub a specific response without touching MSW:

```typescript
// Correct — intercept and mock a single endpoint
await page.route("**/api/hubs", (route) =>
  route.fulfill({ json: { hubs: [] } })
);
```

**Incorrect — aborting all requests cascades failures:**
```typescript
await page.route("**/*", (route) => route.abort());
```

Abort only specific third-party domains (e.g. analytics) that are irrelevant to the test:

```typescript
await page.route("**/*.{png,jpg,gif,svg}", (route) => route.abort());
```

## MSW handlers

The web app uses MSW for browser-level mocking. Handlers live in `apps/web/src/mocks/`. In Playwright, MSW runs inside the browser context started by the app. To override a handler for a single test:

```typescript
// Add a test-specific override before navigation
await page.addInitScript(() => {
  // access MSW worker through the app's global setup
  window.__msw_override = { path: "/api/hubs", response: { hubs: [] } };
});
```

Check `apps/web/src/mocks/` for the current handler setup before adding test-specific overrides.

## Sergeant-specific note

`apps/server` runs separately from the preview server. Integration tests that exercise the real API need both servers running simultaneously. The smoke suite mocks API responses to avoid this dependency. If you need real API calls in a test, document this in the test file and ensure a local server setup script exists.
