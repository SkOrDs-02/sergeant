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

<!-- Paste the exact commands you ran and the key result.
     Before claiming "Done" — Iron Law gate: NO COMPLETION CLAIMS WITHOUT
     FRESH VERIFICATION EVIDENCE. See `sergeant-review-and-merge` SKILL.md
     § "Verification gate" (.agents/skills/sergeant-review-and-merge/SKILL.md). -->

```bash
pnpm lint
pnpm typecheck
```

Additional checks:

- [ ] Local smoke / manual validation completed
- [ ] Surface-specific checks completed

## AI-Generation Signals

If this PR was authored or substantially co-authored by an AI agent
(Claude Code, Kilo Code, Codex, Cursor, Devin, or similar), tick all that apply.
A guard workflow (`.github/workflows/ai-pr-checklist.yml`) auto-detects these
signals via `Co-authored-by:` trailers / `Generated with` markers and enforces
this section — see [`docs/04-governance/governance/ai-pr-checklist.md`](../docs/04-governance/governance/ai-pr-checklist.md).

- [ ] No unnecessary abstraction was added — new code follows existing patterns in this surface
- [ ] No defensive `try/catch` around internal-only calls (Hard Rule "no error handling for impossible scenarios")
- [ ] No duplicate helpers — searched for similar functions in `@shared/*`, `@finyk/*`, etc.
- [ ] Documentation referenced in code (`AGENTS.md`, skills, hard rules) is up to date with this change
- [ ] AI markers (`AI-NOTE` / `AI-CONTEXT` / `AI-DANGER`) are placed where future agents need hints
- [ ] No new `AI-LEGACY` marker added (or, if added, expiry date is ≤ 90 days from today and tracked in the PR description)

If this PR is human-only and has no AI involvement, write exactly:
`N/A — human-authored`
The guard workflow bypasses checklist enforcement in that case.

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

## Reviewer Notes

<!-- Flag migrations, env changes, HubChat tools, auth, or anything else that deserves extra reviewer attention. -->
