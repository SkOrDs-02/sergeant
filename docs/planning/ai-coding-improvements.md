# Roadmap покращень AI-coding

> **Last validated:** 2026-05-19 by Codex (додано перший виконуваний skill-trigger eval harness). **Next review:** 2026-08-17.
> **Status:** Active

Roadmap для агентської інфраструктури Sergeant. Це не продуктовий roadmap; це план, як зробити AI-assisted development швидшим, безпечнішим і дисциплінованішим.

## Уже зроблено

| Блок                                 | Статус | Нотатки                                                                                           |
| ------------------------------------ | ------ | ------------------------------------------------------------------------------------------------- |
| Repo-level контракт і hard rules     | done   | `AGENTS.md` + registry + matrix + CI sync gates                                                   |
| Перша хвиля playbook-ів              | done   | початкові execution recipes у `docs/00-start/playbooks/`                                          |
| AI-маркери й enforcement             | done   | lifecycle / generation markers під CI                                                             |
| Preview / test інфраструктура        | done   | Playwright, visual regression, CI coverage                                                        |
| Оновлення repo-owned skills          | done   | вузька Sergeant-specific skill surface без generic-дублювання                                     |
| Консолідація entrypoint-ів           | done   | `README`, `CONTRIBUTING`, `AGENTS`, `CLAUDE`, `DEVIN` вирівняні за ролями                         |
| Оновлення playbook-ів                | done   | taxonomy, catalog, priority playbooks, routing clarity                                            |
| Cleanup governance source-of-truth   | done   | ownership split між `AGENTS.md`, `hard-rules.json`, generated matrix, review docs                 |
| PR / review hardening                | done   | PR template, review checklist, CODEOWNERS alignment                                               |
| Хвиля операційної зрілості           | done   | service catalog, release policy, incident system, feature flag registry, DR, engineering metrics  |
| Operating system для security access | done   | privileged access policy, access matrix, secret ownership register, compromise-response playbooks |

## Наступні блоки

| Блок                               | Статус | Нотатки                                                                                                                                        |
| ---------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Eval harness для skill trigger-ів  | active | `docs/00-start/agents/skill-trigger-evals.json` + `pnpm eval:skills`: 2 trigger + 1 anti-trigger + 1 workflow-compliance prompt на кожен skill |
| Eval harness для playbook routing  | next   | один очевидний playbook match для priority-сценаріїв                                                                                           |
| Discoverability tests              | next   | new contributor / new agent знаходить потрібний route менш ніж за два кліки                                                                    |
| Sampling відповідності PR template | next   | dry-run quality gate для PR descriptions                                                                                                       |
| Автоматизація operator dashboards  | next   | saved searches / issue views для lead time, stale flags, postmortem actions                                                                    |
| Privacy and data-rights operations | next   | перетворити launch/privacy draft на канонічні retention, consent, export, delete surface-и                                                     |

## План оцінювання

1. Skills: trigger, anti-trigger, routing і guardrail prompts.
2. Playbooks: obvious-match tests для API, migrations, HubChat, mobile, ops.
3. Docs: link integrity, freshness coverage, playbook schema, generated index freshness.
4. Governance: registry sync, CODEOWNERS coverage, dangling source refs.
