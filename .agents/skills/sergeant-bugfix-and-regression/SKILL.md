---
name: sergeant-bugfix-and-regression
description: Use when fixing a Sergeant bug, regression, flaky test, broken deploy behavior, or production issue where the correct fix depends on reproducing the failure first.
---

# Sergeant Bugfix and Regression

Do not blind-patch Sergeant bugs. Reproduce, isolate, add a failing check, then land the smallest fix that prevents recurrence.

## Required Sequence

1. Capture the failing behavior: test, log, screenshot, curl call, or exact reproduction path.
2. Identify the owning surface and load its Sergeant skill.
3. Add a failing test or reproducible verification step before changing behavior.
4. Implement the minimal fix.
5. Re-run the original failure and one nearby regression check.

## Acceptable Reproduction Artifacts

- Vitest/Jest test
- contract test for API shape
- migration command output
- `curl` reproduction for server or HubChat flows
- browser/mobile reproduction notes when automated coverage is not yet available

## Red Flags

- "The bug is obvious, I'll patch it quickly"
- "I'll add tests after the fix"
- "I can't reproduce it, but I know the likely line"

If you hear those thoughts, stop and reproduce first.

## Common Routes

- flaky or broken UI state -> `sergeant-web-ui`
- serializer or route regression -> `sergeant-server-api`
- schema / deploy crash -> `sergeant-data-and-migrations`
- mobile-only behavior -> `sergeant-mobile-expo`
- chat tool failure -> `sergeant-hubchat`

## Playbooks

- `docs/playbooks/hotfix-prod-regression.md` — production regression triage and fix.
- `docs/playbooks/declare-incident.md` — when the bug rises to incident severity.
- `docs/playbooks/write-postmortem.md` — after-the-fact postmortem.
- Catalog: `docs/agents/agent-skills-catalog.md`.
