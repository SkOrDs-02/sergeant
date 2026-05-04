# M6 — `analyze-photo` / `refine-photo` accept base64 images without magic-byte check

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Closed (2026-05-04)

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Medium                          |
| **Sprint**     | [Sprint 3](./sprint-3.md)       |
| **Owner**      | backend                         |
| **Effort**     | 0.5 person-day                  |
| **Status**     | Closed (2026-05-04)             |
| **Discovered** | 2026-05-03 deep security review |
| **Resolved**   | 2026-05-04                      |

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

## Resolution

**Закрито 2026-05-04** одним server-side PR (без env-vars, без міграцій).

### Що зроблено

- **Новий модуль `apps/server/src/lib/imageMagic.ts`** — pure helper:
  - `MAX_DECODED_BYTES = 5 MB` — hard cap на decoded byte length.
  - `ALLOWED_PHOTO_MIMES = { image/jpeg, image/png, image/webp, image/heic }`
    — GIF свідомо НЕ в allowlist (Anthropic vision не підтримує анімацію
    надійно; legitimate use-cases для photo-meal не потребують GIF).
  - `detectImageMime(bytes)` читає перші 12 байт і повертає canonical MIME або
    `null`. Сигнатури:
    - JPEG: `FF D8 FF`
    - PNG: `89 50 4E 47 0D 0A 1A 0A`
    - WebP: `"RIFF" + 4 bytes + "WEBP"` (offsets 0..11)
    - HEIC: `"ftyp" at offset 4 + heic/hevc/mif1/msf1 brand at offset 8`
    - GIF (recognised, відхиляється): `47 49 46 38 (37|39) 61`
    - SVG (`<svg`/`<?xml`/`<!DOCTYPE`) → `text/xml` (recognised, відхиляється)
  - `validateImageBase64(input, declaredMime?)` — strict base64 decode (regex
    pre-check + buffer round-trip), потім розмір, потім magic-byte узгодження.
- **Wiring у `analyze-photo.ts` + `refine-photo.ts`** — викликається ДО
  `anthropicMessages(...)`. Помилки маппляться:
  - `INVALID_BASE64`, `MAGIC_MISMATCH` → **415 Unsupported Media Type**
  - `TRUNCATED` → **415**
  - `TOO_LARGE` → **413 Payload Too Large**
- **Метрика:** `nutrition_photo_rejected_total{endpoint, reason}`
  - `endpoint`: `analyze-photo` | `refine-photo`
  - `reason`: `INVALID_BASE64` | `TRUNCATED` | `TOO_LARGE` | `MAGIC_MISMATCH`
  - Кардинальність: 2 × 4 = 8, безпечно для Prometheus.

### Що навмисно НЕ зроблено

- Не додано re-encode pipeline (Anthropic сам preprocess-ить — ми просто гарантуємо
  що data це справді JPEG/PNG/WebP/HEIC, і модель не обробляє SVG-polyglots).
- Не торкнуто client-side (PhotoMealCapture.tsx). Client продовжує надсилати
  `image_base64` + `mime_type` як раніше; сервер тепер canonically верифікує.
- Не змінено max-розмір schema-cap (`apps/server/src/http/validate.ts` тримає
  base64 ≤ 7 MB ≈ ≤ 5.25 MB raw — наш decoder-cap 5 MB суворіший і це
  цілеспрямовано).

### Тести

- `src/lib/imageMagic.test.ts` — 20 unit-тестів (детектор + валідатор):
  JPEG/PNG/WebP/HEIC happy-path, GIF / SVG / truncated / oversized / mismatch /
  invalid-base64 — усі rejection-шляхи.
- `src/modules/nutrition/photoMagicByte.test.ts` — 6 integration-тестів через
  обробники analyze-photo / refine-photo + Anthropic mock: PNG-як-JPEG → 415,
  SVG → 415, GIF → 415, valid PNG (без declared mime) → 200 з canonical
  `image/png` що пішов у Anthropic, INVALID_BASE64 → 415, refine-photo JPEG-as-PNG
  → 415, refine-photo happy-path → 200.
