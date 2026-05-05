# ADR-0042: Password hashing strategy — scrypt (Better Auth default), `MAX_PASSWORD_LENGTH=256`

- **Status:** accepted
- **Date:** 2026-05-03 (initial), 2026-05-04 (revised — scrypt correction)
- **Last validated:** 2026-05-04 by Devin. **Next review:** 2026-08-04.
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/planning/stack-pulse-2026-05/pr-03-bcrypt-password-limit.md`](../planning/stack-pulse-2026-05/pr-03-bcrypt-password-limit.md) — original PR-план (premised on bcrypt; superseded by this ADR).
  - [ADR-0017](./0017-better-auth-choice-and-session-model.md) — вибір Better Auth.
  - [`docs/integrations/env-vars.md`](../integrations/env-vars.md) — `MIN_/MAX_PASSWORD_LENGTH` опис.

---

## TL;DR

Better Auth (наша auth-бібліотека, версія `1.6.x` у репо) хешить паролі через **scrypt**, **не bcrypt**. Доказ — `node_modules/@better-auth/utils/dist/password.mjs`:

```js
import { scryptAsync } from "@noble/hashes/scrypt.js";
const config = { N: 16384, r: 16, p: 1, dkLen: 64 };
async function generateKey(password, salt) {
  return scryptAsync(password.normalize("NFKC"), salt, {
    N,
    r,
    p,
    dkLen,
    maxmem: 128 * N * r * 2,
  });
}
```

scrypt **не має** 72-byte input-ліміту bcrypt. arbitrary-length input унікально впливає на derived key, тому пара `"a".repeat(72) + "X"` / `"a".repeat(72) + "Y"` дає **різні** хеші — silent-truncation, описаний у первинній версії цього ADR, тут **не існує**.

**Рішення:**

- `MAX_PASSWORD_LENGTH=256` (default + hard-cap у zod-схемі та legacy-env). Cap — **операційний** (DoS-захист: обмежує CPU/memory одного scrypt-виклику), не криптографічний.
- 72-byte cap із попередньої версії ADR — **усунено**: воно базувалося на хибному припущенні «Better Auth під капотом — bcrypt», що не відповідає коду `1.6.x`. Cap=72 не ламав security (сам по собі він безпечний), але штучно обмежував UX без причини.
- Phase 2 (sha256 pre-hash / Argon2id migration), описана у первинній версії як «закриття 72-byte ліміту», — **знімається з roadmap**: scrypt вже без 72-byte ліміту, Argon2id-перехід має самостійні pros/cons, але **не пов'язаний** із цим класом проблеми. Якщо колись буде окремий Argon2id-driver — окреме ADR-форк.

## Context

### Що ми думали — і чому помилялися (історія)

Початкова версія ADR-0042 (2026-05-03) припускала, що Better Auth використовує bcrypt під капотом — звідси:

- 72-byte cap у `MAX_PASSWORD_LENGTH` (zod `.max(72)` + legacy `Math.min(72, ...)`)
- Phase 1/Phase 2 plan із sha256-prehash або Argon2id
- ADR-0017 згадка «Better Auth = bcrypt»

Помилка джерела: припущення без перевірки `node_modules/@better-auth/utils/dist/password.mjs`. Реальна імплементація — scrypt:

```js
// @better-auth/utils/dist/password.mjs
import { scryptAsync } from "@noble/hashes/scrypt.js";
const config = { N: 16384, r: 16, p: 1, dkLen: 64 };
```

Цей файл імпортується через `node_modules/better-auth/dist/crypto/password.mjs`, який пробрасує `hashPassword` / `verifyPassword` у emailAndPassword-flow `auth.ts`. У репо нема ні `bcryptjs`, ні `bcrypt`, ні `argon2` (`apps/server/package.json` — порожній на ці залежності).

### scrypt: коротко про властивості

scrypt — memory-hard KDF (RFC 7914). Параметри Better Auth (`N=16384, r=16, p=1, dkLen=64`) дають ~64 MB peak memory (`128 * N * r = 128 * 16384 * 16 ≈ 32 MB` per block-mix \* 2 буфери) і виконуються ~50–80 ms на сучасному CPU. Це менш «modern» ніж Argon2id, але:

- **Без 72-byte ліміту** — input-довжина не обмежена алгоритмом (тільки операційно — CPU/memory одного виклику).
- **GPU-resistance** — приблизно еквівалентний bcrypt(work=10), гірший за Argon2id, але прийнятний для 2026 року для застосунків нашого scale (≤10k users).
- **NFKC-нормалізація** input — Better Auth робить `password.normalize("NFKC")` перед scrypt, що захищає від Unicode-pitfall у passphrase з різних input-method-ів.

### Чому всеж потрібен `MAX_PASSWORD_LENGTH` cap

scrypt — лінійний по довжині input на pre-block-mix фазі (HMAC-SHA-256 над всім input-байт-масивом). Без cap-у зловмисник може надіслати 100 MB-string на `/api/auth/sign-up` і змусити сервер виконати multi-second scrypt на одне з'єднання → cheap DoS. Cap=256 chars (= 256–1024 bytes для UTF-8) — комфортний UX (passphrase Diceware = ~64 символи; «correct horse battery staple» = 28; навіть 5-word passphrase з 24-літерних слів влізе) і одночасно гарантований bound на per-request scrypt-роботу.

256 — добре округле число, не вимагає окремих flag-ів і покриває realistic upper-bound. Тренд passphrase-managers (Bitwarden, 1Password) генерувати 6–10-слівні passphrase-и (60–120 chars) повністю покривається, із запасом.

### Що було зроблено реально у Phase 1 (2026-05-03)

Стара версія ADR-0042 призвела до закладеного у репо коду:

- `apps/server/src/env/env.ts:132` — `MAX_PASSWORD_LENGTH: coerceInt.positive().max(72).default(72)`
- `apps/server/src/env.ts:60` — `Math.min(72, parseIntEnv("MAX_PASSWORD_LENGTH", 72))`
- `apps/server/src/auth.ts:151` — коментар «maxPasswordLength захищає від DoS через надто довгі bcrypt-пейлоади»
- `docs/integrations/env-vars.md` — згадка про bcrypt 72-byte limit

Це не призводило до жодної реальної security-issue (cap=72 безпечний, просто надмірно жорсткий по UX), але створювало misleading документацію та обмежувало realistic passphrase-юзерів.

## Decision

### 1. `MAX_PASSWORD_LENGTH=256` як новий default + hard-cap

- `apps/server/src/env/env.ts`: `MAX_PASSWORD_LENGTH: coerceInt.positive().max(256).default(256)`. Operator може **знизити** через env (наприклад `MAX_PASSWORD_LENGTH=128`), але **не може підняти вище за 256** — fail-fast `Invalid environment variables` при startup-і.
- `apps/server/src/env.ts` (legacy duplicate): `Math.min(256, parseIntEnv("MAX_PASSWORD_LENGTH", 256))` — defence-in-depth.
- `apps/server/src/auth.ts`: `maxPasswordLength: env.MAX_PASSWORD_LENGTH` (без змін у API-call, тільки коментар оновлено — bcrypt → scrypt).

### 2. Документація

- `docs/integrations/env-vars.md`: розділ `MIN_/MAX_PASSWORD_LENGTH` оновлено з `72 (bcrypt limit)` → `256 (DoS cap, scrypt-based)`. Лінк на цей ADR.
- ADR-0017 (Better Auth choice) — окремим slot-ом потребує однорядкового patch-у «hash-algo: scrypt (`@better-auth/utils`) / N=16384, r=16, p=1». **Не міняємо** у цьому PR — це окреме ADR-style-touch, не блокує даний фікс.

### 3. Регресивний тест

`apps/server/src/auth/passwordHash.test.ts` — фіксує:

- scrypt дає **різні** хеші для `"a".repeat(72) + "X"` і `"a".repeat(72) + "Y"` (доказ що 72-byte truncation відсутній).
- 200-char password успішно hash + verify (smoke test для довгих passphrase-ів).
- Wrong password не verify-ається (sanity).

Тест імпортує `hashPassword` / `verifyPassword` напряму з `better-auth/crypto`, тому захищає від регресу при оновленні Better Auth (якщо колись upstream поверне bcrypt — тест почне падати миттєво).

## Consequences

### Positive

- Документація відповідає коду (Better Auth = scrypt). Майбутній агент / розробник не починає з bcrypt-припущення.
- UX: користувачі з 80–256-char passphrase (1Password, Bitwarden, Diceware) можуть зареєструватися без обходу.
- Регресивний тест блокує silent regression якщо Better Auth колись швидко перейде на bcrypt (або інший алгоритм без NFKC-нормалізації).
- Hard-cap=256 далі зберігає DoS-захист.

### Negative

- ADR-0017 та `01-session-log-2026-05-03.md` згадують «bcrypt під капотом» — потребують correction-patch (окремий PR-doc-fix, не блокує цей).
- Прийдеться комунікувати команді/майбутнім агентам, що перша версія ADR-0042 базувалась на хибному припущенні. Це коштує trust, але виправити правильно — обов'язково.

### Neutral

- Existing scrypt-хеші (всі, що були створені) лишаються валідними — формат `salt:hex` не змінився, `verifyPassword` продовжує працювати.
- Phase 2 з первинної ADR (sha256-prehash / Argon2id migration) — **знімається**. Якщо колись буде Argon2id-перехід — окреме ADR із самостійним обґрунтуванням (modern KDF preference, GPU-resistance), без зв'язку з 72-byte issue.

## Compliance

- OWASP Password Storage Cheat Sheet (2024) — допускає scrypt (`N≥16384, r=8` мінімум; ми тримаємо `r=16` — більше memory-cost, краще). Argon2id рекомендований як «best», scrypt — «acceptable».
- NIST SP 800-63B — мін. 8 (тримаємо 10), макс не регламентовано. Cap 256 — наше operational рішення (DoS-budget).
- Better Auth docs — `maxPasswordLength` — explicit param, no default upper-bound у бібліотеці; cap у зоні відповідальності операторa.

## Refs

- [`@better-auth/utils` source — `password.mjs`](https://github.com/better-auth/better-auth/blob/main/packages/utils/src/password/index.ts) — реальна імплементація (scrypt).
- [scrypt — RFC 7914](https://datatracker.ietf.org/doc/html/rfc7914)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Better Auth — emailAndPassword config](https://www.better-auth.com/docs/concepts/email-and-password)
