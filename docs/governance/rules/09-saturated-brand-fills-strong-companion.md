# Rule 9 — Saturated brand fills behind `text-white` must use the `-strong` companion

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last validated:** 2026-05-09 by @Skords-01
> **Next review:** 2026-08-07
> **Status:** Active

> Per-rule canonical body for Hard Rule #9. Compact summary lives in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `apps/web/src/**`

## Enforced by

- **eslint-rule** — sergeant-design/no-low-contrast-text-on-fill (error)
- **doc** — docs/design/brandbook.md § WCAG-AA -strong Tier

## Why / What is enforced

Every saturated brand colour (`brand`, `accent`, `success`, `warning`, `danger`, `info`, `finyk`, `fizruk`, `routine`, `nutrition`) ships with a `-strong` companion (typically the `-700` step; `nutrition` uses `-800`) that clears WCAG 2.1 AA 4.5 : 1 against `text-white`. The saturated `-500` shades regress to ~2.4–2.8 : 1 against white — see `docs/design/brandbook.md` → "WCAG-AA `-strong` Tier" for the full per-family contrast table and `docs/design/brand-palette-wcag-aa-proposal.md` for the migration history (PRs [#854](https://github.com/Skords-01/Sergeant/pull/854) / [#855](https://github.com/Skords-01/Sergeant/pull/855) / [#857](https://github.com/Skords-01/Sergeant/pull/857)).

```tsx
// ❌ BAD — saturated brand fill behind white text fails WCAG AA at body sizes.
<button className="bg-brand text-white">…</button>
<button className="bg-brand-500 text-white">…</button>
<span className="bg-fizruk text-white">…</span>

// ✅ GOOD — strong companion clears AA (5.2 – 6.6 : 1).
<button className="bg-brand-strong text-white">…</button>
<span className="bg-fizruk-strong text-white">…</span>
```

The rule deliberately does **not** fire on:

- `bg-{family}-strong text-white` — the canonical fix.
- `bg-{family}-{700,800,900}` — explicit dark steps already clear AA.
- `bg-{family}/N` — opacity-tinted soft washes; the foreground is `text-{family}-strong`, not white.
- `bg-[#hex] text-white` — arbitrary hex values, now separately forbidden by rule #11 (`sergeant-design/no-hex-in-classname`).
- `dark:bg-{family} text-white` — on dark surfaces emerald-500 vs. white passes ~5.4 : 1; the strong tier would actually regress contrast.
- `hover:bg-{family} text-white` — hover-only saturated bg if the base state is fine.

Enforced by `sergeant-design/no-low-contrast-text-on-fill` (`error`). The four saturated `*-500` brand-identity tokens in `packages/design-tokens/tokens.js` remain unchanged — they're still the canonical brand colours for logos, marketing assets, and dark-mode bento surfaces. The strong tier is purely additive and only required for text/fill-behind-text contexts.

## Related

- **pr** — #854
- **pr** — #855
- **pr** — #857
- **agents** — #9
