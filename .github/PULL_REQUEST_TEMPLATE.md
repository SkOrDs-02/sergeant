## Summary

<!-- What changed in one tight paragraph or a short flat list. -->

## Governing Skill

- Primary skill:
- Secondary skill (if truly needed):

## Playbook

- Primary playbook:
- Why this playbook:
- If no playbook matched, why:

## Verification

<!-- Paste the exact commands you ran and the key result. -->

```bash
pnpm lint
pnpm typecheck
```

Additional checks:

- [ ] Local smoke / manual validation completed
- [ ] Surface-specific checks completed

## Docs and Governance

- [ ] I updated docs that changed with the behavior, contract, workflow, or rollout.
- [ ] I checked whether `AGENTS.md` needed an update.
- [ ] I checked whether a playbook or skill needed an update.
- [ ] I checked whether governance docs or review docs needed an update.

Updated docs:

- n/a

## Risk and Rollout

- User-visible risk:
- Rollout / deploy order:
- Backout plan:

## Hard Rule #15

- [ ] I read `AGENTS.md` before coding.
- [ ] Internal docs I touched are in Ukrainian.
- [ ] I did not use `--no-verify`.

## Audit-freeze (until 2026-06-02)

<!-- Per `docs/governance/audit-freeze-2026-05-05.md`. New files under
docs/audits/, docs/initiatives/, docs/playbooks/, docs/adr/ trigger a
non-blocking CI warning. If this PR adds such a file, add `[skip-freeze]`
or `[freeze-exception]` to the PR title and explain below. Otherwise leave
this section as-is or remove. -->

- [ ] This PR does not add new top-level audit/initiative/playbook/ADR files (or override is justified below).

## Reviewer Notes

<!-- Flag migrations, env changes, HubChat tools, auth, or anything else that deserves extra reviewer attention. -->
