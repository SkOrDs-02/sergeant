# M6 — `analyze-photo` / `refine-photo` accept base64 images without magic-byte check

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Medium                          |
| **Sprint**     | [Sprint 3](./sprint-3.md)       |
| **Owner**      | backend                         |
| **Effort**     | 0.5 person-day                  |
| **Status**     | Open                            |
| **Discovered** | 2026-05-03 deep security review |

## Summary

`apps/server/src/modules/nutrition/refine-photo.ts:44–48` and
`analyze-photo.ts` forward `image_base64` to `Anthropic.messages.create({
source: { type: "base64", media_type, data } })` with the **client-supplied**
`media_type`. Without server-side magic-byte verification, a malicious client
can:

- Mark a polyglot SVG as `image/jpeg` and rely on Anthropic's preprocessing
  to dispatch it as SVG.
- Inflate a 50 MB PNG that decodes into hundreds of MB once parsed.
- Send arbitrary bytes that exhaust Anthropic's parser budget.

## Recommendation

Decode the base64 server-side and validate the first 12 bytes against the
declared `media_type`. Reject mismatches with `415 Unsupported Media Type`.

```ts
const MAGIC: Record<string, RegExp> = {
  "image/jpeg": /^\xff\xd8\xff/,
  "image/png": /^\x89PNG\r\n\x1a\n/,
  "image/webp": /^RIFF.{4}WEBP/s,
};
```

Pair with a hard upper bound on decoded size (e.g. 5 MB) to defend against
inflation.

## Correction points

- `apps/server/src/modules/nutrition/refine-photo.ts` — add `validateImage`
  helper called before forwarding to Anthropic.
- `apps/server/src/modules/nutrition/analyze-photo.ts` — same.
- `apps/server/src/lib/imageMagic.ts` (new) — shared validator.
- Unit tests for each MIME / magic combination, including mismatch rejection.

## Verification

- **Unit:** PNG bytes declared as `image/jpeg` → 415.
- **Unit:** truncated 8-byte payload → 415, no Anthropic call.
- **Integration:** a known-good 1 MB JPEG round-trips without regression.

## Cross-references

- [`./H9-transcribe-usd-cap.md`](./H9-transcribe-usd-cap.md)
- [`./M8-prompt-injection-tool-output.md`](./M8-prompt-injection-tool-output.md)
