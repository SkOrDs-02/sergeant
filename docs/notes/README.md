# Notes

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

Exploratory engineering notes that don't fit neatly into ADRs (decisions), playbooks (recipes), or planning (roadmaps). These are short-lived investigations — once the work lands, the spike doc is either archived in place with `Status: Completed & archived` or folded into a permanent home (ADR / planning / tech-debt registry).

## Lifecycle

- **Active** — investigation in progress; outcome not yet decided.
- **Completed & archived** — outcome documented, code path landed; doc is preserved as historical context but no longer drives work.
- **Superseded** — replaced by a canonical doc (link to the replacement in the header).

## Subdirectories

| Path                   | Purpose                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| [`spikes/`](./spikes/) | Time-boxed engineering spikes (technical investigations with a clear yes/no/migrate question) |

## Adding a new note

1. Pick the right subdirectory (`spikes/` for time-boxed investigations).
2. Use a descriptive filename (`<module>-<topic>.md`) — no date prefix; let `git log` and the `Last validated` header carry temporal context.
3. Include the canonical freshness header (`Last validated: …`, `Status: …`).
4. When the spike completes, update `Status:` to `Completed & archived` and add a one-paragraph follow-up section linking to the canonical home of the work (ADR, planning doc, or tech-debt registry entry).
