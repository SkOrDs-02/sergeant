# AI-coding improvements roadmap

> **Last validated:** 2026-05-02 by @claude. **Next review:** 2026-07-31.
> **Status:** Active

Roadmap for the agent infrastructure in Sergeant. This is not the product roadmap; it is the plan for making AI-assisted development faster, safer, and more disciplined.

## Already done

| Block                              | Status | Notes                                                                                             |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| Repo-level contract and hard rules | done   | `AGENTS.md` + registry + matrix + CI sync gates                                                   |
| First-wave playbooks               | done   | initial execution recipes in `docs/playbooks/`                                                    |
| AI markers and enforcement         | done   | lifecycle/generation markers under CI                                                             |
| Preview/test infra                 | done   | Playwright, visual regression, CI coverage                                                        |
| Repo-owned skills overhaul         | done   | narrow Sergeant-specific skill surface without generic duplication                                |
| Entrypoint consolidation           | done   | `README`, `CONTRIBUTING`, `AGENTS`, `CLAUDE`, `DEVIN` aligned by role                             |
| Playbook overhaul                  | done   | taxonomy, catalog, priority playbooks, routing clarity                                            |
| Governance source-of-truth cleanup | done   | ownership split across `AGENTS.md`, `hard-rules.json`, generated matrix, review docs              |
| PR / review hardening              | done   | PR template, review checklist, CODEOWNERS alignment                                               |
| Operating maturity wave            | done   | service catalog, release policy, incident system, feature flag registry, DR, engineering metrics  |
| Security access operating system   | done   | privileged access policy, access matrix, secret ownership register, compromise-response playbooks |

## Next blocks

| Block                              | Status | Notes                                                                                |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| Skill trigger eval harness         | next   | 2 trigger + 1 anti-trigger + 1 workflow compliance prompt per skill                  |
| Playbook routing eval harness      | next   | one obvious playbook match for priority scenarios                                    |
| Discoverability tests              | next   | new contributor / new agent can find the route in under two clicks                   |
| PR template compliance sampling    | next   | dry-run quality gate for PR descriptions                                             |
| Operator dashboards automation     | next   | saved searches / issue views for lead time, stale flags, postmortem actions          |
| Privacy and data-rights operations | next   | turn launch/privacy draft into canonical retention, consent, export, delete surfaces |

## Evaluation plan

1. Skills: trigger, anti-trigger, routing, and guardrail prompts.
2. Playbooks: obvious-match tests for API, migrations, HubChat, mobile, ops.
3. Docs: link integrity, freshness coverage, playbook schema, generated index freshness.
4. Governance: registry sync, CODEOWNERS coverage, dangling source refs.
