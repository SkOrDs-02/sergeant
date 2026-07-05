---
name: sergeant-verify-before-done
description: Use before claiming any task done/green/fixed in Sergeant — run the proving command fresh and quote its output, never a scoped-filter or assumed pass; UA: перед «готово/зелено/пофіксив».
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers whose attention bias toward English persists in tool-routing even when chat is bilingual. The bilingual trigger lives in `description:` so UA-only routing still resolves.
---

# Verify before you say done (Sergeant)

A completion claim is a factual assertion. In Sergeant the only evidence that backs it is fresh command output **in the current message** — not a previous run, not a scoped subset, not a subagent's report, not "should pass".

**Core rule:** if you have not run the proving command in this message, you cannot claim it passes. Write the claim only after you have read its exit code and failure count.

## The gate

Before "done" / "green" / "fixed" / "working":

1. **Identify** the command that actually proves the claim (see table).
2. **Run it fresh** — full scope, not a `--filter` subset you already had green.
3. **Read** exit code + failure/error count in the output, not the vibe.
4. **Claim** only what the output shows, and quote the decisive line.

| Claim | Proving evidence (required) | NOT sufficient |
| --- | --- | --- |
| Tests pass | `pnpm check:typecheck-and-test` (or whole-package `pnpm --filter @sergeant/<pkg> test`) showing 0 failures | a `--filter <one-file>` run, a prior run, "should pass" |
| Lint clean | full `pnpm lint` (or full web eslint) output showing 0 errors | scoped lint, "eslint reported 0" without seeing it |
| Types OK | `pnpm check:typecheck-and-test` exit 0 | lint passing alone |
| Build OK | `pnpm build` exit 0 | typecheck passing alone |
| Bug fixed | the original symptom re-run and now passing | code changed, symptom never re-triggered |
| Regression covered | red→green: test fails before fix, passes after | single green without reverting the fix |
| PR ready | `pnpm check` green on the actual merge state | any single stage green |

## Sergeant-specific traps (these are why this SKILL exists)

- **Scoped-green ≠ package-green.** A `pnpm --filter` single-spec pass hides integration specs one level up that assert side-effects (e.g. storage-key writes). Run the whole package before you push.
- **"eslint 0" from a subagent is often false.** react-hooks compiler rules emit false state; agents report "0 errors" without a full run. Run the full web eslint yourself and read it.
- **Read-only fan-out misses gate breakage.** An audit that never runs `pnpm check` on clean main misses gate-level red. Gate-run is step 0, not an afterthought.
- **Stale base fakes a pass.** `origin/main` moves under a long session; a green built on a stale base can be red on the real merge result. `git fetch` + verify on the merge state.

## Red-flag words = stop and run the command

If you are about to write "should", "probably", "seems", "Perfect!", "Done!", "I'm confident", "the subagent says it passes" — that is the trigger to run the proving command **now** and replace the adjective with the quoted output line.

## Verification

- [ ] The proving command was run in this message (not recalled).
- [ ] Full scope, not a `--filter` subset, unless the claim itself is scoped.
- [ ] Exit code / failure count read and quoted.
- [ ] For a bugfix: original symptom re-triggered and shown resolved.

## See also

- [`docs/00-start/agents/agent-skills-catalog.md`](../../../docs/00-start/agents/agent-skills-catalog.md) — Active Skills catalog.
- `.agents/skills/sergeant-review-and-merge/SKILL.md` — Verification gate at PR boundary.
- `.agents/skills/sergeant-bugfix-and-regression/SKILL.md` — RED-GREEN discipline for the bugfix row above.
