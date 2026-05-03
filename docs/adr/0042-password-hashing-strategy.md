# ADR-0042: Password hashing strategy — bcrypt 72-byte cap, sha256 pre-hash, Argon2id

- **Status:** proposed
- **Date:** 2026-05-03
- **Last validated:** 2026-05-03 by Devin. **Next review:** 2026-08-03.
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/planning/stack-pulse-2026-05/pr-03-bcrypt-password-limit.md`](../planning/stack-pulse-2026-05/pr-03-bcrypt-password-limit.md) — PR-план C3.
  - [ADR-0017](./0017-better-auth-choice-and-session-model.md) — вибір Better Auth (bcrypt під капотом).
  - [`docs/planning/stack-pulse-2026-05/00-overview.md`](../planning/stack-pulse-2026-05/00-overview.md) — критичні знахідки 2026-05.

---

## TL;DR

Better Auth (наша auth-бібліотека) використовує **bcrypt** для зберігання паролів. У bcrypt є **72-byte hard limit** на password input — все понад це **мовчки** ігнорується. До цього ADR `MAX_PASSWORD_LENGTH` мав дефолт `128`, що створювало false sense of security: пароль `"a".repeat(72) + "X"` і `"a".repeat(72) + "Y"` дають **однаковий** хеш.

**Рішення (Phase 1 — immediate):** clamp `MAX_PASSWORD_LENGTH` до 72 байтів через `.max(72)` у zod-схемі `apps/server/src/env/env.ts` і `Math.min(72, ...)` у legacy `apps/server/src/env.ts`. Це не порушує існуючих юзерів — bcrypt-verify все одно truncate-ив їхній input.

**Рішення (Phase 2 — owner needed):** ADR-0042 фіксує два варіанти переходу від 72-byte cap → довільні паролі:

- **Шлях A (sha256 pre-hash):** `bcrypt.hash(base64(sha256(password)))`. Стандартний bcrypt-pre-hash workaround. Потребує dual-verify period.
- **Шлях B (Argon2id):** Better Auth підтримує через адаптер. Потребує bulk re-hash existing-users (next-login або офлайн-мігратор з тимчасовим dual-format).

Обидва Phase-2 шляхи — окремий PR після призначення owner. До того моменту Phase 1 (cap=72) — це чесний контракт із юзером.

## Context

### Problem

```js
import bcrypt from "bcryptjs";
const a = await bcrypt.hash("x".repeat(73), 10);
await bcrypt.compare("x".repeat(73), a); // true
await bcrypt.compare("x".repeat(72) + "DIFFERENT", a); // also true 😱
```

bcrypt мовчки ігнорує bytes 73+. До PR-03 наша конфігурація:

```ts
// apps/server/src/env.ts (до фіксу)
MAX_PASSWORD_LENGTH: parseIntEnv("MAX_PASSWORD_LENGTH", 128);
```

…дозволяла користувачу ввести 100-символьний пароль, бачити в UI «password strength: very strong», а отримувати реальну ентропію ≤72 байт. Це security theatre.

Дефолт `MIN_PASSWORD_LENGTH=10` (вище за NIST 8) показує, що ми свідомо хочемо сильної політики. Стеля 72 — об’єктивна межа bcrypt; усе понад — омана.

### Why bcrypt має 72-byte limit

bcrypt використовує EksBlowfishSetup з 72-байтним key buffer. Це алгоритмічна особливість, не bug. OWASP Password Storage Cheat Sheet рекомендує два workaround-и: (a) sha256 pre-hash, (b) перехід на Argon2id.

### Чому не зробити одразу sha256/Argon2id

- **Міграція existing-users.** Будь-який перехід вимагає `dual-verify` period (verify пробує старий формат, при success re-hash у новий) або bulk-офлайн міграції з тимчасовим dual-format. Це 3–5 днів роботи + ризик регрес для існуючих 100% юзерів — не приймемо за ту ж сесію, що й C3.
- **Better Auth API.** Перехід на Argon2id потребує custom-адаптера. ADR-0017 (Better Auth choice) фіксує bcrypt як дефолт; зміна — окреме ADR-рішення з validation на Phase 2.
- **Phase 1 фікс надійний.** `MAX_PASSWORD_LENGTH=72` як hard cap не ламає нікого: existing хеші далі verify-яться (input того ж юзера труncate-иться так само); нові юзери не можуть ввести `>72` → отримують осмислену 400 invalid_password.

## Decision

### Phase 1 (PR-03, immediate)

1. `apps/server/src/env/env.ts`: `MAX_PASSWORD_LENGTH: coerceInt.positive().max(72).default(72)`. **Fail-fast** при будь-якому override `>72` через env — startup кидає `Invalid environment variables`.
2. `apps/server/src/env.ts` (legacy duplicate): `Math.min(72, parseIntEnv(...))` як defense-in-depth (на випадок, якщо C1 unify ще не дороблений).
3. `.env.example`: коментар оновлений з 128 → 72 + посилання на ADR-0042.
4. **Не міняємо** `apps/server/src/auth.ts` — `maxPasswordLength: env.MAX_PASSWORD_LENGTH` далі коректно тягне з env (тепер ≤72).
5. Hard-rule `HR-XX`: «`MAX_PASSWORD_LENGTH` локований у env-модулях; не override-ити в app-code» — окремо в registry.

### Phase 2 (after Phase 1, окремий PR + ADR fork)

Phase 1 — **enabling step**, не фінал. Phase 2 уникає 72-byte стелі через один із двох шляхів. Цей ADR фіксує decision-tree, а не вибір.

#### Шлях A — SHA-256 pre-hash + bcrypt

```ts
const prehash = base64(sha256(password));
await bcrypt.hash(prehash, 10);
```

- **Pros:** bcrypt лишається; KDF лишається; зміна — однорядковий wrapper.
- **Cons:** double-hash комплексність; якщо ми колись перейдемо на Argon2id — треба буде ще раз re-hash; sha256 не slow KDF, тому не додає захисту проти GPU brute-force.
- **Migration:** dual-verify period (1–2 тижні): перший verify — старий bcrypt(input); fallback — bcrypt(sha256-base64(input)); при success — re-hash у новий формат і store у `password_hash_v2`.

#### Шлях B — Argon2id

```ts
import argon2 from "argon2";
await argon2.hash(password, { type: argon2.argon2id });
```

- **Pros:** modern KDF, GPU/ASIC-resistant; OWASP-рекомендований дефолт для нових систем; немає 72-byte стелі.
- **Cons:** Better Auth потребує custom адаптер (Phase 1.5 = ADR-fork про адаптер); migration шлях — bulk re-hash на next-login (1–2 місяці), або офлайн-batch з тимчасовим dual-format.
- **Параметри (RFC 9106 baseline):** `m=64MB, t=3, p=4`. Перевірити proof-of-work на cold-start endpoint (target: <250ms p99 на Railway production CPU profile).

#### Decision matrix

| Критерій                 | Шлях A (sha256 pre-hash) | Шлях B (Argon2id) |
| ------------------------ | ------------------------ | ----------------- |
| Зусилля (інженер-дні)    | 3–5                      | 7–10              |
| Risk зламати existing    | Low (dual-verify)        | Medium (re-hash)  |
| Захист vs GPU            | Same as bcrypt           | **Кращий**        |
| Стандартність 2026       | Acceptable               | **Recommended**   |
| Зачіпає Better Auth core | Ні                       | Так (адаптер)     |
| Зворотна сумісність      | Trivial                  | Потребує plan     |
| Operator complexity      | Low                      | Medium            |
| Відповідність ADR-0017   | Без змін                 | Doc update        |

### Recommendation

**Phase 1 ⇒ зараз** (PR-03 цього sprint-у).

**Phase 2 ⇒ Шлях B (Argon2id), коли:**

- буде призначений owner із bandwidth ≥7 інженер-днів;
- є staging environment з реальним production-like load для perf-валідації Argon2id параметрів;
- розписаний rollback-plan (фліп flag → re-verify через bcrypt-fallback таблицю).

Якщо Phase 2 затримується ≥1 квартал — реалізовуємо Шлях A як defense-in-depth (sha256 pre-hash) і ставимо Argon2id як long-term goal у roadmap.

## Consequences

### Positive

- Юзери з паролями `>72` байтів не отримують false sense of security — отримують осмислений 400.
- Operator не може випадково підняти cap через env (`.max(72)` fail-fast).
- ADR фіксує decision-tree для Phase 2 — наступний owner не починає з нуля.

### Negative

- Cap=72 — компроміс. Ідеально мати arbitrary-length пароль як в Argon2id-системах. Phase 2 закриває.
- Documentation overhead: треба оновити `.env.example`, security-runbook (як reagovat коли юзер скаржиться на «password too long»), UI копі (`apps/web` форма sign-up).

### Neutral

- Existing хеші лишаються валідними. Bcrypt-verify input того ж юзера труncate-ить так само як раніше → success ratio не падає.
- `apps/server/src/auth.ts` не змінюється — `maxPasswordLength: env.MAX_PASSWORD_LENGTH` продовжує тягнути з env.

## Compliance

- OWASP Password Storage Cheat Sheet (2024) — recommend Argon2id або pre-hash workaround.
- NIST SP 800-63B — мінімум 8 (ми тримаємо 10), макс не регламентовано → рішення про cap — наше.
- Better Auth docs — підтримує `maxPasswordLength` як explicit param.

## Refs

- [bcrypt 72-byte limit explained](https://security.stackexchange.com/questions/39849/does-bcrypt-have-a-maximum-password-length)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Argon2id RFC 9106](https://datatracker.ietf.org/doc/html/rfc9106)
- [Better Auth — emailAndPassword config](https://www.better-auth.com/docs/concepts/email-and-password)
