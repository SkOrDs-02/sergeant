# Encryption key rotation — runbook

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** Active

> Закриває action item з [`docs/security/hardening/H4-encryption-key-rotation.md`](../security/hardening/H4-encryption-key-rotation.md).
> Доповнює "Compromised secret" сценарій у [`../security/disaster-recovery.md`](../security/disaster-recovery.md).

## Який ключ ротувати

| Env-var (single)            | Multi-key env-vars                                             | Що шифрує                                                               | Тип ключа             |
| --------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------- |
| `BETTER_AUTH_TOKEN_ENC_KEY` | `BETTER_AUTH_TOKEN_ENC_KEYS` + `*_CURRENT_VERSION`             | OAuth-токени Better Auth (`account.{accessToken,refreshToken,idToken}`) | 32-byte hex (AES-256) |
| `MONO_TOKEN_ENC_KEY`        | `MONO_TOKEN_ENC_KEYS` + `*_CURRENT_VERSION` _(Phase 2 — H4-2)_ | Personal-токени Monobank у `mono_connection.token_*`                    | 32-byte hex (AES-256) |

Phase 1 (цей runbook + PR H4-1) покриває **Better Auth**. Phase 2 (Mono) — окремий
follow-up; до моменту landing-у Phase 2 ротація Mono-ключа все ще вимагає
повного re-encrypt-у через short maintenance window (см. секцію
"Legacy single-key rotation" нижче).

## TL;DR — happy path (Better Auth)

```bash
# 1. Згенерувати новий ключ
openssl rand -hex 32           # → <NEW_HEX>

# 2. Прочитати поточний (звичайно v1)
echo "$BETTER_AUTH_TOKEN_ENC_KEY"   # → <V1_HEX>

# 3. Виставити обидва ключі у Railway → Project → Variables
BETTER_AUTH_TOKEN_ENC_KEYS=v1:<V1_HEX>,v2:<NEW_HEX>
BETTER_AUTH_TOKEN_ENC_KEY_CURRENT_VERSION=v1
# (current=v1 на цьому кроці — нові записи поки що під старим ключем)

# 4. Deploy. Перевірити, що `auth_attempts_total` без сплеску error-ів.

# 5. Бампнути current на v2:
BETTER_AUTH_TOKEN_ENC_KEY_CURRENT_VERSION=v2

# 6. Deploy. Тепер нові ciphertext-и записуються під v2; старі v1
#    залишаються читабельними.

# 7. Спостерігати метрику `auth_token_lazy_reencrypt_total{row_version="1"}`.
#    Чекаємо ~30 днів — за цей час OAuth-сесії природно refresh-аться, і
#    Better Auth update() перепише ціхертекст під v2.

# 8. Коли counter стабілізувався і не росте (≥7 днів):
BETTER_AUTH_TOKEN_ENC_KEYS=v2:<NEW_HEX>
# (видалити v1 з ring-а, лишити тільки v2)

# 9. Видалити сам ключ-секрет v1 з vault. Готово.
```

## Покрокова процедура (Better Auth)

### Крок 0 — preconditions

1. У Railway env-варіаблах присутній **один** із двох:
   - **Legacy:** `BETTER_AUTH_TOKEN_ENC_KEY=<64-hex>`. Це v1.
   - **Multi-key:** `BETTER_AUTH_TOKEN_ENC_KEYS=v1:<hex>,...` +
     `BETTER_AUTH_TOKEN_ENC_KEY_CURRENT_VERSION=v1`.
2. На обох путях `apps/server/src/lib/keyRing.ts:parseKeyRing` побудує
   key-ring; legacy single-key трактується як `{ current: v1 }`.
3. Перевір, що staging повторює production env-shape — rotation у проді
   має йти **після** успішного staging-rotation-dry-run-у.

### Крок 1 — згенерувати v2

```bash
NEW_KEY=$(openssl rand -hex 32)
echo "v2:${NEW_KEY}"
```

Зберегти `NEW_KEY` у password-manager-і (1Password vault `infra-prod-keys`
або еквівалент). Підпис `key-rotation-YYYY-MM-DD`.

### Крок 2 — додати v2 у Railway variables, current ще = v1

Railway → Project → Variables:

```
BETTER_AUTH_TOKEN_ENC_KEYS=v1:<existing-hex>,v2:<NEW_KEY>
BETTER_AUTH_TOKEN_ENC_KEY_CURRENT_VERSION=v1
```

> Якщо досі стояв legacy single-key `BETTER_AUTH_TOKEN_ENC_KEY` — лишити
> його **до моменту, коли v2 стане current**. `parseKeyRing` дає
> пріоритет `_KEYS` над legacy, але мати legacy як safety-net на крок-1
> допомагає швидко відкатитися.

Deploy. Очікуваний ефект: `assertStartupEnv` логує
`{ event: "env_warning", detail: "..." }` без помилок; новий boot
успішний.

### Крок 3 — verify ring on staging

На staging (або через `apps/server/scripts/dev/eval-env.ts`, якщо є)
викликати:

```ts
import { parseKeyRing } from "../src/lib/keyRing.js";
const ring = parseKeyRing({
  keysCsv: process.env.BETTER_AUTH_TOKEN_ENC_KEYS,
  currentVersion: process.env.BETTER_AUTH_TOKEN_ENC_KEY_CURRENT_VERSION,
  legacyKey: process.env.BETTER_AUTH_TOKEN_ENC_KEY,
  envName: "BETTER_AUTH_TOKEN_ENC_KEY",
});
console.log({ versions: ring?.versions, current: ring?.current.version });
// → { versions: [1, 2], current: 1 }
```

### Крок 4 — bump current до v2

Railway:

```
BETTER_AUTH_TOKEN_ENC_KEY_CURRENT_VERSION=v2
```

Deploy. Після цього **нові** OAuth-token-записи (sign-in, token-refresh)
автоматично йдуть під v2 prefix `enc:v2:k2:...`.

Старі рядки під v1 залишаються читабельними — `decryptString` обирає ключ
з ring-а на основі префіксу.

### Крок 5 — спостерігати lazy re-encrypt counter

Метрика: `auth_token_lazy_reencrypt_total{row_version="1"}`.

```promql
sum(rate(auth_token_lazy_reencrypt_total{row_version="1"}[5m])) by (field)
```

Інкрементується **на кожному read**, де знайшли row під старою версією.
Лог `auth.token.stale_key_version` (Pino warn) дублює це для on-call.

> Це **не** тригер на DB-update; Better Auth перепише row під v2
> автоматично на наступному `update()` (тобто на token-refresh-і).
> Counter — це лід-індикатор того, скільки сесій ще не повернулося до
> OAuth-провайдера за свіжим токеном.

### Крок 6 — дочекатися retention window

Дефолт OAuth-refresh у Google/Microsoft/Apple — від кількох годин до
30 днів. Чекаємо **щонайменше 30 днів**, поки counter не вийде на
плато і не почне спадати (старі рядки гасяться, або з re-encrypt, або з
revoke / user delete).

Прогнати `pnpm db:psql` (або `railway connect postgres`):

```sql
SELECT
  CASE
    WHEN "accessToken" LIKE 'enc:v1:%' THEN 1
    WHEN "accessToken" LIKE 'enc:v2:k1:%' THEN 1
    WHEN "accessToken" LIKE 'enc:v2:k2:%' THEN 2
    ELSE NULL
  END AS key_version,
  COUNT(*) AS rows
FROM "account"
WHERE "accessToken" IS NOT NULL
GROUP BY 1
ORDER BY 1;
```

Чекаємо `key_version=1 → 0`. Якщо лишилися застарілі рядки після
30 днів — зазвичай це expired refresh-токени; user наступним sign-in-ом
заведе свіжий запис під v2.

### Крок 7 — retire v1

Railway:

```
BETTER_AUTH_TOKEN_ENC_KEYS=v2:<NEW_KEY>
```

(видалити `v1:...` з CSV-у). `BETTER_AUTH_TOKEN_ENC_KEY_CURRENT_VERSION`
лишається `v2`.

Deploy. Тепер read-у row-а під v1 буде throw-ити з `keyRing` —
`auth_token_decrypt_failed` Sentry alert. Якщо Step 6 виконано
правильно, таких row-ів немає; інакше — повернути v1 у `_KEYS` і
дочекатися ще 7 днів.

### Крок 8 — видалити сам v1-секрет

З 1Password:

- Архівувати запис `MONO_TOKEN_ENC_KEY (v1)` (не видаляти — для
  audit-логу).
- Підписати: "retired YYYY-MM-DD, replaced by v2".

## Rollback

На будь-якому кроці 1–6 можна відкатитися без data loss:

| Step | Rollback                                                                                           |
| ---- | -------------------------------------------------------------------------------------------------- |
| 1–3  | Видалити `_KEYS` і `_CURRENT_VERSION`, лишити legacy `BETTER_AUTH_TOKEN_ENC_KEY`. Redeploy.        |
| 4    | Поставити `*_CURRENT_VERSION=v1` назад. Нові записи знов будуть під v1; старі v2 ще читаються.     |
| 5–6  | Те саме що (4).                                                                                    |
| 7    | Повернути `v1:` назад у `_KEYS`. Деякі старі row-и можуть бути миттєво нечитабельні до redeploy-у. |
| 8    | Відновити v1-ключ із 1Password archive — restore у `_KEYS`. Вимагає reverse-rotation Step 7.       |

## Legacy single-key rotation (Mono — до Phase 2)

Поки `apps/server/src/modules/mono/crypto.ts` не переведено на key-ring,
ротація `MONO_TOKEN_ENC_KEY` потребує **повний re-encrypt** усіх
`mono_connection.token_*` рядків:

1. Згенерувати новий ключ (`openssl rand -hex 32`).
2. Запустити one-shot скрипт `apps/server/scripts/dev/reencrypt-mono.ts`
   (Phase 2 додасть; зараз — manual `pnpm tsx ...` на staging dump).
3. Деплой нового ключа у `MONO_TOKEN_ENC_KEY`.
4. Видалити старий ключ із vault.

Цей шлях має downtime ~1–2 хв (write-lock на `mono_connection`). Phase 2
переведе Mono на key-ring і ця секція стане застарілою.

## Verification — після rotation

- [ ] `auth_token_lazy_reencrypt_total{row_version="1"}` стабільно ≈ 0
      протягом 7 днів.
- [ ] SQL-запит з кроку 6 показує `key_version=2` для всіх non-null
      OAuth-токенів.
- [ ] Sentry без `auth_token_decrypt_failed` за вікно ротації.
- [ ] [`docs/security/secret-ownership-register.md`](../security/secret-ownership-register.md) оновлено: запис rotation-event-у з датою.

## Cross-references

- [`../security/hardening/H4-encryption-key-rotation.md`](../security/hardening/H4-encryption-key-rotation.md) — origin card.
- [`../security/disaster-recovery.md`](../security/disaster-recovery.md) — DR покриває "compromised key" поверх цього runbook-у.
- [`../security/secret-ownership-register.md`](../security/secret-ownership-register.md) — owner-list для всіх AES-256-GCM ключів.
- [`apps/server/src/lib/keyRing.ts`](../../apps/server/src/lib/keyRing.ts) — реалізація.
- [`apps/server/src/auth/tokenCrypto.ts`](../../apps/server/src/auth/tokenCrypto.ts) — формат `enc:v2:k<N>:iv:tag:ct`.
