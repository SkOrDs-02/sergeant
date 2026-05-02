# Playbook: Add a Feature Flag

> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
> **Status:** Active

**Trigger:** "Put feature X behind a flag" / any new experimental feature that should be toggleable without a redeploy.

---

## Steps

### 1. Register the flag

Add an entry to `FLAG_REGISTRY` in `apps/web/src/core/lib/featureFlags.ts`:

```ts
{
  id: "your_flag_name",
  label: "Human-readable title",
  description: "Why a user would enable this.",
  defaultValue: false,
  experimental: true,
}
```

- `id` — snake*case, prefixed with the module name (e.g. `finyk*`, `fizruk*`, `nutrition*`, `hub\_`).
- `defaultValue: false` for experiments, `true` for graduated features (keep the flag until fully rolled out, then remove it).

### 2. Guard the feature in code

Use the `useFlag` hook in React components:

```tsx
import { useFlag } from "@shared/../core/lib/featureFlags";

function MyComponent() {
  const enabled = useFlag("your_flag_name");
  if (!enabled) return null;
  return <NewFeature />;
}
```

For non-React code, use `getFlag("your_flag_name")`.

### 3. Document the flag

Create or update `docs/feature-flags.md` with:

| Flag             | Owner   | Default | Expires    | Rollout plan                         |
| ---------------- | ------- | ------- | ---------- | ------------------------------------ |
| `your_flag_name` | @author | `false` | YYYY-MM-DD | Enable for beta → monitor → graduate |

### 4. Test both branches

Write or update tests covering **flag on** and **flag off** behavior:

```ts
import { setFlag, resetFlags } from "../core/lib/featureFlags";

afterEach(() => resetFlags());

it("renders new feature when flag is on", () => {
  setFlag("your_flag_name", true);
  // assert feature appears
});

it("hides new feature when flag is off", () => {
  setFlag("your_flag_name", false);
  // assert feature is absent
});
```

### 5. Create the PR

- Branch: `devin/<unix-ts>-feat-<flag-name>` or `<author>/<flag-name>`
- Commit: `feat(<module>): add <flag_name> feature flag`
- PR description must include:
  - Criteria for graduating (`defaultValue → true`): which metric / user feedback
  - What to monitor after rollout (errors, performance, user complaints)

---

## Verification

- [ ] `pnpm lint` — green
- [ ] `pnpm typecheck` — green
- [ ] Tests pass for both flag states
- [ ] Flag visible in Settings → Experimental (if `experimental: true`)
- [ ] No hardcoded React Query keys (use factories from `queryKeys.ts` — AGENTS.md rule #2)

## Notes

- The flag system is client-only (localStorage via `typedStore`). No server-side flags yet.
- Flags sync across browser tabs automatically via the `typedStore` subscription.
- When graduating a flag (removing it), follow the [cleanup-dead-code](cleanup-dead-code.md) playbook for the flag entry and all `useFlag`/`getFlag` call sites.
