# M4 — `GROQ_TRANSCRIBE_MODEL` is env-injectable without an allowlist

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Severity**   | Medium                                        |
| **Sprint**     | [Sprint 3](./sprint-3.md)                     |
| **Owner**      | backend                                       |
| **Effort**     | 0.1 person-day                                |
| **Status**     | Open                                          |
| **Discovered** | 2026-05-03 deep security review               |

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
const ALLOWED_MODELS = new Set([
  "whisper-large-v3-turbo",
  "whisper-large-v3",
]);
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

## Cross-references

- [`./H9-transcribe-usd-cap.md`](./H9-transcribe-usd-cap.md)
- [`./M5-audio-mime-normalize.md`](./M5-audio-mime-normalize.md)
