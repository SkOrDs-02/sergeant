# M5 — Audio MIME aliases (`audio/wav`, `audio/x-wav`, `audio/wave`) without normalization

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Medium                          |
| **Sprint**     | [Sprint 3](./sprint-3.md)       |
| **Owner**      | backend                         |
| **Effort**     | 0.1 person-day                  |
| **Status**     | Open                            |
| **Discovered** | 2026-05-03 deep security review |

## Summary

`apps/server/src/modules/transcribe/transcribe.ts:9–20` accepts three legacy
aliases for the same WAV format. Groq Whisper accepts only the canonical
`audio/wav`, so any alias either drives an upstream parse bug or is silently
rejected. The duplicate surface also widens the attack envelope for
ffmpeg-side parser bugs in any future transformation pipeline.

## Recommendation

- Normalise aliases to the canonical `audio/wav` in `pickMimeType()`.
- Trim the whitelist to one entry per real format; assert the assumption with
  a unit test.

## Correction points

- `apps/server/src/modules/transcribe/transcribe.ts:9–20` — replace
  alias list with `audio/wav` only and add a normaliser:

```ts
const MIME_ALIASES: Record<string, string> = {
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
};
function normaliseMime(m: string) {
  return MIME_ALIASES[m] ?? m;
}
```

## Verification

- **Unit:** `pickMimeType("audio/wave")` returns `"audio/wav"`.
- **Unit:** request with `Content-Type: audio/wave` succeeds end-to-end.

## Cross-references

- [`./H9-transcribe-usd-cap.md`](./H9-transcribe-usd-cap.md)
- [`./M4-groq-model-allowlist.md`](./M4-groq-model-allowlist.md)
