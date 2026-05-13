# PR-03: password length policy — scrypt premise correction

> **Last validated:** 2026-05-13 by Codex. **Next review:** 2026-08-11.
> **Status:** Closed — merged [#1550](https://github.com/Skords-01/Sergeant/pull/1550)

|              |                                                               |
| ------------ | ------------------------------------------------------------- |
| **Severity** | Critical (C3)                                                 |
| **Owner**    | TBD                                                           |
| **Effort**   | 1–2 дні (option A) / 3–5 днів (option B з міграцією)          |
| **Risk**     | High (зачіпає всі існуючі паролі)                             |
| **Touches**  | `apps/server/src/env*`, `apps/server/src/auth.ts`, migrations |

## Контекст

> **Update 2026-05-06:** початкова знахідка була сформульована як bcrypt 72-byte cap, але реалізаційна перевірка показала, що Better Auth у цьому стеку використовує scrypt. Закриття у [#1550](https://github.com/Skords-01/Sergeant/pull/1550) і подальший запис у `pr-plan-2026-05.md` фіксують це як premise correction: `MAX_PASSWORD_LENGTH` піднято до 256 як operational DoS-cap, а ADR-0042 переписано під scrypt. Нижче лишається історичний контекст первинної знахідки; не цитувати його як поточну криптографічну модель.

Better Auth використовує bcrypt під капотом. **bcrypt має 72-byte hard limit** на password input — все понад це **мовчки** ігнорується. Юзер з 100-символьним паролем має ентропію <72 байт.

```ts
// apps/server/src/env.ts:53
MAX_PASSWORD_LENGTH: parseIntEnv("MAX_PASSWORD_LENGTH", 128);
```

Чому критично:

- Користувач думає: «у мене дуже довгий пароль, я в безпеці». Реальність: passwords `abc...×72 + щасливий-фінал` і `abc...×72 + катастрофа` дають **однаковий** хеш → автентифікують одне одного.
- Це особливо болюче, бо дефолт `MIN_PASSWORD_LENGTH=10` вище за рекомендований NIST 8 — тобто ви свідомо хочете сильної політики, але стеля захисту = 72.

Доказ:

```js
import bcrypt from "bcryptjs";
const a = await bcrypt.hash("x".repeat(73), 10);
await bcrypt.compare("x".repeat(73), a); // true
await bcrypt.compare("x".repeat(72) + "DIFFERENT", a); // also true 😱
```

## Two options

### Option A — Quick fix: `MAX_PASSWORD_LENGTH=72`

- **Effort:** 1 день
- **UX impact:** користувачі з паролями >72 байтів отримають 400 при наступному sign-in (вони і так були не сильніші — explicit cap відображає реальність).
- **Migration:** не потрібна — старі хеші лишаються валідними (bcrypt verify працює з тим самим input).

### Option B — Proper fix: SHA-256 pre-hash + bcrypt OR Argon2id

- **Effort:** 3–5 днів (включно з міграцією існуючих хешів)
- **Шлях 1 (sha256 pre-hash):** `bcrypt.hash(base64(sha256(password)), 10)`. Безпечно, стандартний bcrypt-pre-hash workaround. **Required:** dual-verify period — перший verify пробує старий формат, fallback на новий, при success re-hash і зберігаємо у `password_hash_v2`.
- **Шлях 2 (Argon2id):** Better Auth підтримує через адаптер. Потребує міграції existing-users (next-login re-hash, або bulk re-hash офлайн з тимчасовим dual-format).

## Scope (Recommended: Option A зараз, ADR на Option B)

- `MAX_PASSWORD_LENGTH=72` за замовчуванням у обох env-modul-ях.
- `MIN_PASSWORD_LENGTH=10` лишити (вище за NIST baseline, OK).
- ADR `docs/adr/0042-password-hashing-strategy.md` з аналізом bcrypt vs Argon2id, ризики Option B, цільова дата.
- Hard rule reg: «Password length policy is locked in `env/index.ts` only; do not duplicate in app-code».
- Unit-тест-кейс що ловить regress.

## Out of scope

- Argon2id міграція (це Option B, окремий PR після ADR-0042).
- Зміна `MIN_PASSWORD_LENGTH` (це окремий security policy review).

## Acceptance criteria (DoD)

- [ ] `MAX_PASSWORD_LENGTH=72` у `env/index.ts` (PR-01 unify).
- [ ] Better Auth schema (`apps/server/src/auth.ts`) приймає `passwordMaxLength: 72` явно (без читання env у multiple місцях).
- [ ] Unit-тест: `password.length === 73` → API повертає `400 invalid_password`.
- [ ] Unit-тест (regression): `bcrypt.hash("x".repeat(73))` і `bcrypt.hash("x".repeat(72)+"y")` мають дати **різні** результати при `verify` — тобто доводимо, що cap працює, а не покладаємося на bcrypt мовчки.
- [ ] ADR-0042 створений зі статусом `Proposed`.

## Тести

- `apps/server/src/auth/__tests__/password-length.test.ts`:
  - max-len exactly 72 → 200 sign-up
  - max-len 73 → 400
  - existing user з 72-char паролем → sign-in success (не ламаємо існуючих)
- E2E `apps/web/tests/e2e/auth.spec.ts`: спроба sign-up з 200-char паролем → field-validation error.

## Rollout

- Immediate. Зміна — explicit cap, що відображає bcrypt реальність. Існуючі паролі не зачіпаються.
- Якщо у системі є users з `password_hash` зробленим з input >72 — їхній теперішній sign-in продовжить працювати (bcrypt-verify все одно truncate-ить input).

## Risks & mitigations

| Risk                                                      | Mitigation                                                                    |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Користувач з 80-char паролем побачить «password too long» | Помилка чітка; explain у settings: «we now enforce 72-byte cap, see ADR-0042» |
| Після Argon2id-міграції доведеться force-rehash на login  | Dual-verify period (PR-3b, після ADR-0042)                                    |

## Touchpoints (file:line)

- `apps/server/src/env.ts:53`
- `apps/server/src/env/env.ts:57`
- `.env.example:177`
- `apps/server/src/auth.ts:1–319`
- `docs/adr/0042-password-hashing-strategy.md` — новий ADR

## Refs

- [bcrypt 72-byte limit explained](https://security.stackexchange.com/questions/39849/does-bcrypt-have-a-maximum-password-length)
- [OWASP password storage cheatsheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Argon2id RFC 9106](https://datatracker.ietf.org/doc/html/rfc9106)
