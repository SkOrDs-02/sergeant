# Feature Flags Registry

> **Last validated:** 2026-05-02 by @claude. **Next review:** 2026-07-31.
> **Status:** Active

Operational registry for release toggles, experiments, and kill switches in Sergeant. Code remains the executable source of truth; this file is the human-readable operating registry for rollout and cleanup.

## Registry contract

Every production flag must have:

- owner
- default value
- rollout plan
- kill-switch semantics
- created date
- expected removal date
- touched surfaces
- linked issue or PR

## Active flags

| Flag                 | Owner        | Default | Rollout plan                                                                                             | Kill switch                                                  | Created    | Expected removal | Touched surfaces                                   | Linked issue / PR             |
| -------------------- | ------------ | ------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------- | ---------------- | -------------------------------------------------- | ----------------------------- |
| `example_replace_me` | `@Skords-01` | `false` | start with internal validation, enable for narrow cohort, monitor errors and UX, then graduate or remove | disable in flag registry or client settings without redeploy | 2026-05-02 | 2026-06-30       | web, mobile, API notes if mirrored behavior exists | replace with real issue or PR |

Replace placeholder rows with real flags as part of the first flag-touching PR after this document lands.

## Rules

- Prefer one flag per rollout decision, not one flag per component.
- Default to `false` for experiments and `true` only for graduated-but-not-yet-removed behavior.
- Every flag needs an expiry date. Expired flags should be removed, not extended by default.
- If a flag is the primary rollback lever for a release, note that in the release PR and release playbook.
- A removed flag should also be deleted from this registry in the same PR.

## Related docs

- [add-feature-flag.md](./playbooks/add-feature-flag.md)
- [retire-feature-flag.md](./playbooks/retire-feature-flag.md)
- [release-policy.md](./governance/release-policy.md)
