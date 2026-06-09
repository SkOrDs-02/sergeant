# M4 — `GROQ_TRANSCRIBE_MODEL` is env-injectable without an allowlist

> **Last validated:** 2026-06-09 by @claude. **Next review:** 2026-09-07.
> **Status:** Closed (2026-05-04)

| Field          | Value                                                  |
| -------------- | ------------------------------------------------------ |
| **Severity**   | Medium                                                 |
| **Sprint**     | [Sprint 3](./sprint-3.md)                              |
| **Owner**      | backend                                                |
| **Effort**     | 0.1 person-day                                         |
| **Status**     | Closed (2026-05-04, batched with M5 + M13)             |
| **Discovered** | 2026-05-03 deep security review                        |
| **Closed**     | 2026-05-04 — code-side allowlist + boot-time fail-fast |

## Summary

```ts
// apps/server/src/modules/transcribe/transcribe.ts:93
const model = process.env.GROQ_TRANSCRIBE_MODEL ?? "whisper-large-v3-turbo";
```

Whoever has env-var write access (founder, Railway, leaked Railway token) can
silently downgrade quality (cheaper model) or upgrade cost (experimental
model) without leaving an audit trail.

## Recommendation

Allowlist in code, not in env:

```ts
const ALLOWED_MODELS = new Set(["whisper-large-v3-turbo", "whisper-large-v3"]);
const requested = process.env.GROQ_TRANSCRIBE_MODEL ?? "whisper-large-v3-turbo";
if (!ALLOWED_MODELS.has(requested)) {
  throw new Error(`Unsupported GROQ_TRANSCRIBE_MODEL: ${requested}`);
}
```

## Correction points

- `apps/server/src/modules/transcribe/transcribe.ts` — add the allowlist
  guard during module initialisation (fail-fast on boot).
- `apps/server/src/modules/transcribe/transcribe.test.ts` — table-driven test
  asserting unknown values throw at module-load time.

## Verification

- **Unit:** boot the server with `GROQ_TRANSCRIBE_MODEL=evil-model`; expect a
  process exit with a structured log entry.

## Resolution (2026-05-04)

Delivered as part of the Sprint 3 M4 + M5 + M13 hardening batch.

- `apps/server/src/modules/transcribe/transcribe.ts` —
  `ALLOWED_GROQ_MODELS = new Set(["whisper-large-v3-turbo", "whisper-large-v3"])`
  resolved + validated at module load, not per request, so a tampered
  Railway env-var fails the boot rather than every call.
- `apps/server/src/env/env.ts` — schema upgraded from `z.string()` to
  `z.enum(["whisper-large-v3-turbo", "whisper-large-v3"])` for defence in
  depth, so any future consumer reading `env.GROQ_TRANSCRIBE_MODEL` is
  forced to the same allowlist as the runtime guard.
- `apps/server/src/modules/transcribe/transcribe.test.ts` — table-driven
  tests for default-when-unset, allowlisted alternative, empty string,
  and a hard rejection for `whisper-evil-experimental`.

## Update (2026-06-02, HR-2 — env single-source consolidation)

The duplicated code-side `ALLOWED_GROQ_MODELS` Set + `process.env` read in
`transcribe.ts` is removed. Enforcement now lives **only** at the env SSOT:

- `apps/server/src/env/env.ts` — `GROQ_TRANSCRIBE_MODEL` is
  `z.preprocess("" → undefined, z.enum([...]).default("whisper-large-v3-turbo"))`.
  Empty-string env still maps to the default; an unknown model fails the enum
  → **boot fail-fast at env parse** (before the HTTP server starts).
- `apps/server/src/modules/transcribe/transcribe.ts` — `resolveGroqModel()`
  now just returns the validated `env.GROQ_TRANSCRIBE_MODEL` (last Groq
  `process.env[…]` read dropped; env-single-source budget 89 → 88).
- Allowlist semantics (default / empty / valid / hard-reject) moved to
  `apps/server/src/env/groqTranscribeModel.test.ts`; `transcribe.test.ts`
  keeps a routing smoke. The M4 security property (code-reviewed allowlist,
  boot fail-fast) is preserved — the allowlist is still source-controlled,
  just at the single `z.enum` definition instead of two places.

## Cross-references

- [`./H9-transcribe-usd-cap.md`](./H9-transcribe-usd-cap.md)
- [`./M5-audio-mime-normalize.md`](./M5-audio-mime-normalize.md)
