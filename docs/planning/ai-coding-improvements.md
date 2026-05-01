# AI-coding improvements roadmap

> **Last validated:** 2026-05-01 by @dmytro.s.stakhov. **Next review:** 2026-07-30.
> **Status:** Active

Roadmap для agent infrastructure у Sergeant. Це не продуктова roadmap, а план того, як зробити AI-assisted розробку швидшою, стабільнішою і дисциплінованішою.

## Уже зроблено

| Block                            | Status | Notes                                                         |
| -------------------------------- | ------ | ------------------------------------------------------------- |
| Repo-level contract і hard rules | done   | `AGENTS.md` + registry + matrix + CI sync gates               |
| First-wave playbooks             | done   | початкові execution recipes у `docs/playbooks/`               |
| AI markers і enforcement         | done   | lifecycle/generation markers під CI                           |
| Preview/test infra               | done   | Playwright, visual regression, CI coverage                    |
| Repo-owned skills overhaul       | done   | narrow Sergeant-specific skill surface без generic дублювання |

## Поточна хвиля

| Block                              | Status | Notes                                                                        |
| ---------------------------------- | ------ | ---------------------------------------------------------------------------- |
| Entrypoint consolidation           | done   | `README`, `CONTRIBUTING`, `AGENTS`, `CLAUDE`, `DEVIN` розведені за ролями    |
| Playbook overhaul                  | done   | taxonomy, catalog, priority playbooks, routing clarity                       |
| Governance source-of-truth cleanup | done   | ownership між `AGENTS.md`, `hard-rules.json`, generated matrix і review docs |
| PR / review hardening              | done   | PR template + review checklist + CODEOWNERS alignment                        |

## Наступні блоки

| Block                           | Status | Notes                                                              |
| ------------------------------- | ------ | ------------------------------------------------------------------ |
| Skill trigger eval harness      | next   | 2 trigger + 1 anti-trigger + 1 workflow compliance prompt на skill |
| Playbook routing eval harness   | next   | однозначний playbook match для priority scenarios                  |
| Discoverability tests           | next   | new contributor / new agent має знайти route за <2 кліки           |
| PR template compliance sampling | next   | dry-run quality gate для PR descriptions                           |

## Evaluation plan

1. Skills: trigger, anti-trigger, routing and guardrail prompts.
2. Playbooks: obvious-match tests для API, migrations, HubChat, mobile, ops.
3. Docs: link integrity, freshness coverage, playbook schema, generated index freshness.
4. Governance: registry sync, codeowners coverage, dangling source refs.
