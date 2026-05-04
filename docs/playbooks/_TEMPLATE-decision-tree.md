# Playbook: <Title>

> **Last validated:** YYYY-MM-DD by @<owner>. **Next review:** YYYY-MM-DD.
> **Status:** Active

**Trigger:** <When to use this playbook — symptoms, alerts, or requests that activate it. Keep ≤ 240 chars; long detail goes in the body.>

## Owner surface

- Primary surface: `<path/to/primary>`
- Coupled surface: `<path/to/coupled>` (optional — drop if not applicable)
- Governing skill: `<sergeant-skill-name>`

---

## Decision Tree

> Follow this tree from Q1 downward. Each leaf node (→ **ACTION**) links to the detailed steps below.

**Q1: <First diagnostic question>**

- <Condition A> → <action or next question>
- <Condition B> → <action or next question>
- <Condition C> → **STOP** → <escalation / alternative playbook>

**Q2: <Second diagnostic question>**

- <Condition A> → [§N <step title>](#n-step-anchor)
- <Condition B> → [§M <step title>](#m-step-anchor)
- Unclear → gather more data ([§1](#1-first-step)) → retry Q2

<!-- Add more Qn as needed. Keep each question to 2-4 branches max. -->

```mermaid
flowchart TD
    Q1{"Q1: <question>"}
    Q1 -- "Condition A" --> Q2
    Q1 -- "Condition B" --> ACTION_B["<leaf action>"]
    Q1 -- "Condition C" --> STOP["STOP\n→ escalate"]

    Q2{"Q2: <question>"}
    Q2 -- "Condition A" --> FIX_A["§N <step>"]
    Q2 -- "Condition B" --> FIX_B["§M <step>"]
    Q2 -- "Unclear" --> GATHER["§1 Gather data"] --> Q2

    FIX_A --> VERIFY["Verification"]
    FIX_B --> VERIFY
```

---

## Background (Original Steps)

<!-- Move the original detailed steps here. Preserve all h3 anchors. -->

### 1. <First step>

<Detailed instructions, commands, code snippets.>

### 2. <Second step>

<Detailed instructions.>

<!-- Continue numbering as needed. -->

---

## Verification

- [ ] <Checkpoint 1>
- [ ] <Checkpoint 2>
- [ ] <Checkpoint 3>

## Notes

- <Important caveats, gotchas, cross-references to AGENTS.md rules.>

## See also

- [AGENTS.md](../../AGENTS.md) — hard rules
- [<related-playbook>.md](<related-playbook>.md) — <when to use instead>
