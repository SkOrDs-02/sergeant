# Notes

> **Last validated:** 2026-06-08 by @claude. **Next review:** 2026-09-06.
> **Status:** Active

Exploratory engineering notes that don't fit neatly into ADRs (decisions), playbooks (recipes), or planning (roadmaps). These are short-lived investigations — once the work lands, the spike doc is either archived in place with `Status: Completed & archived` or folded into a permanent home (ADR / planning / tech-debt registry).

## Lifecycle

- **Active** — investigation in progress; outcome not yet decided.
- **Completed & archived** — outcome documented, code path landed; doc is preserved as historical context but no longer drives work.
- **Superseded** — replaced by a canonical doc (link to the replacement in the header).

## Subdirectories

| Path                  | Purpose                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------- |
| [`spikes/`](./spikes) | Time-boxed engineering spikes (technical investigations with a clear yes/no/migrate question) |

## Файли у spikes/

### OpenClaw

| Файл                                                                                                              | Статус   | Опис                                                                       |
| ----------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| [`openclaw-poc.md`](./spikes/openclaw-poc.md)                                                                     | Archived | Spike — OpenClaw Plugin PoC (Phase 0.5)                                    |
| [`openclaw-sdk-5.7-real-api.md`](./spikes/openclaw-sdk-5.7-real-api.md)                                           | Archived | Spike — openclaw 5.7 SDK reality-check (production crash-loop post-mortem) |
| [`openclaw-stage-4b-debugging-handoff-2026-05-12.md`](./spikes/openclaw-stage-4b-debugging-handoff-2026-05-12.md) | Archived | Handoff-документ живого дебагу Stage 4b (2026-05-12)                       |
| [`openclaw-stage-5b-pr-split-2026-05-12.md`](./spikes/openclaw-stage-5b-pr-split-2026-05-12.md)                   | Archived | Recap сесії розбиття PR Stage 5b — strategic-modes                         |
| [`openclaw-session-2026-05-12-recap.md`](./spikes/openclaw-session-2026-05-12-recap.md)                           | Archived | Підсумок сесії 2026-05-12 — Stage 5b PR-4 `/okr` + Stage 5c Council        |

### Bus-factor walkthroughs

| Файл                                                                            | Статус | Опис                                                        |
| ------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------- |
| [`2026-05-walkthrough-finyk.md`](./spikes/2026-05-walkthrough-finyk.md)         | Draft  | Однагодинний walkthrough модуля `finyk` для нового інженера |
| [`2026-05-walkthrough-fizruk.md`](./spikes/2026-05-walkthrough-fizruk.md)       | Draft  | Однагодинний walkthrough модуля `fizruk`                    |
| [`2026-05-walkthrough-hubchat.md`](./spikes/2026-05-walkthrough-hubchat.md)     | Draft  | Однагодинний walkthrough модуля `hubchat`                   |
| [`2026-05-walkthrough-nutrition.md`](./spikes/2026-05-walkthrough-nutrition.md) | Draft  | Однагодинний walkthrough модуля `nutrition`                 |
| [`2026-05-walkthrough-routine.md`](./spikes/2026-05-walkthrough-routine.md)     | Draft  | Однагодинний walkthrough модуля `routine`                   |
| [`2026-05-walkthrough-sync.md`](./spikes/2026-05-walkthrough-sync.md)           | Draft  | Однагодинний walkthrough модуля `sync` (CloudSync)          |

### Інші дослідження

| Файл                                                          | Статус   | Опис                                         |
| ------------------------------------------------------------- | -------- | -------------------------------------------- |
| [`2026-05-api-v1-usage.md`](./spikes/2026-05-api-v1-usage.md) | Done     | Дослідження: чи активний `/api/v1/*` префікс |
| [`routine-sqlite-v2.md`](./spikes/routine-sqlite-v2.md)       | Archived | Spike — модуль Routine на SQLite v2          |

## Adding a new note

1. Pick the right subdirectory (`spikes/` for time-boxed investigations).
2. Use a descriptive filename (`<module>-<topic>.md`) — no date prefix; let `git log` and the `Last validated` header carry temporal context.
3. Include the canonical freshness header (`Last validated: …`, `Status: …`).
4. When the spike completes, update `Status:` to `Completed & archived` and add a one-paragraph follow-up section linking to the canonical home of the work (ADR, planning doc, or tech-debt registry entry).
