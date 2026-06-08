# Encryption key rotation — runbook

> **Last validated:** 2026-06-08 by @claude. **Next review:** 2026-09-06.
> **Status:** Active

> Закриває action item з [`docs/security/hardening/H4-encryption-key-rotation.md`](../../security/hardening/H4-encryption-key-rotation.md).
> Доповнює "Compromised secret" сценарій у [`../security/disaster-recovery.md`](../../security/disaster-recovery.md).

## Який ключ ротувати

| Env-var (single)            | Multi-key env-vars                                 | Що шифрує                                                               | Тип ключа             |
| --------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------- | --------------------- |
| `BETTER_AUTH_TOKEN_ENC_KEY` | `BETTER_AUTH_TOKEN_ENC_KEYS` + `*_CURRENT_VERSION` | OAuth-токени Better Auth (`account.{accessToken,refreshToken,idToken}`) | 32-byte hex (AES-256) |
| `MONO_TOKEN_ENC_KEY`        | `MONO_TOKEN_ENC_KEYS` + `*_CURRENT_VERSION`        | Personal-токени Monobank у `mono_connection.token_*`                    | 32-byte hex (AES-256) |

**Обидва шляхи тепер на одному versioned KeyRing-у** (H4 Phase 1 + Phase 2,
closed 2026-06-01). Ротація **без downtime** для обох:

- **Better Auth** — версія ключа зашита у TEXT-ciphertext (`enc:v2:k<N>:…`);
  re-encrypt природно стається на наступному OAuth-refresh-і.
- **Mono** — версія ключа лежить у стовпці `mono_connection.token_key_version`
  (`NULL` = legacy unversioned ciphertext, читається як v1). Legacy-рядки
  розшифровуються прозоро і **lazy re-encrypt**-аться під `current` версію на
  наступному успішному read-і (connect/disconnect/backfill/rotate-secret).
  Метрика `mono_token_lazy_reencrypt_total{row_version,outcome}` показує
  прогрес — `сума → 0` означає, що старий ключ можна прибрати з
  `MONO_TOKEN_ENC_KEYS`. Lazy re-encrypt — best-effort: фейл запису НЕ ламає
  запит (рядок лишається під старим, ще валідним, ключем).

Кроки ротації Mono ідентичні Better Auth happy-path нижче — підстав
`MONO_TOKEN_ENC_KEY[S]` замість `BETTER_AUTH_TOKEN_ENC_KEY[S]`.

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

На staging викликати вручну (наприклад, через `tsx` у shell-и сервісу або
локальний `pnpm tsx`):

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

## Mono key rotation (zero-downtime, H4 Phase 2)

> Замінює стару "Legacy single-key + downtime" процедуру. Phase 2
> (closed 2026-06-01) перевела Mono на той самий versioned KeyRing, що й
> Better Auth — **downtime більше не потрібен**.

Кроки ідентичні Better Auth happy-path (вгорі), з підстановкою env-var-ів:

1. `openssl rand -hex 32` → `<NEW_HEX>`.
2. У Railway виставити `MONO_TOKEN_ENC_KEYS=v1:<OLD_HEX>,v2:<NEW_HEX>` (якщо
   досі single-key `MONO_TOKEN_ENC_KEY=<OLD_HEX>` — старий стає `v1`).
3. Деплой — новий код читає обидва ключі; нічого ще не пише під v2.
4. Виставити `MONO_TOKEN_ENC_KEY_CURRENT_VERSION=v2`, redeploy. Тепер:
   - нові connect-и пишуть ciphertext під v2 (`token_key_version=2`);
   - кожен успішний read legacy/v1-рядка **lazy re-encrypt**-ить його під v2
     (best-effort UPDATE з optimistic-lock на ciphertext, що ми прочитали).
5. Моніторити `mono_token_lazy_reencrypt_total{outcome="reencrypted"}` — коли
   `reencrypt_failed` стабільно 0 і дрейф `row_version="legacy"|"1"` зійшов
   нанівець (зазвичай після того, як усі активні connection-и проходять
   webhook-rotation cron-ом / disconnect / backfill), старий ключ можна
   прибрати.
6. Перевірити дренаж SQL-запитом:

   ```sql
   SELECT token_key_version, count(*)
     FROM mono_connection
    GROUP BY token_key_version;       -- ціль: усі рядки під version=2
   ```

   `token_key_version IS NULL` означає legacy-рядок, який ще не перечитувався.
   Для проактивного дренажу dormant-connection-ів — прогнати один цикл
   webhook-secret rotation cron-у (`POST /api/internal/mono/webhook/rotate`),
   який читає кожен active-token (і тригерить lazy re-encrypt).

7. Після дренажу прибрати `v1:` із `MONO_TOKEN_ENC_KEYS`, redeploy. Архівувати
   `MONO_TOKEN_ENC_KEY (v1)` у 1Password (не видаляти — DR-restore).

**Backward-compat гарантія:** до кроку 4 (і навіть якщо rotation ніколи не
запускали) усі legacy unversioned Mono-рядки (`token_key_version=NULL`)
розшифровуються прозоро під v1 — нічого не ламається.

## Verification — після rotation

- [ ] `auth_token_lazy_reencrypt_total{row_version="1"}` (Better Auth) і
      `mono_token_lazy_reencrypt_total{outcome="reencrypted"}` (Mono) стабільно
      ≈ 0 протягом 7 днів (нема нових stale-рядків).
- [ ] `mono_token_lazy_reencrypt_total{outcome="reencrypt_failed"}` == 0
      (re-encrypt write не фейлить).
- [ ] SQL-запит з кроку 6 показує `key_version=2` для всіх non-null
      OAuth-токенів і `token_key_version=2` для всіх `mono_connection` рядків.
- [ ] Sentry без `auth_token_decrypt_failed` / `mono_token_decrypt_failed` за вікно ротації.
- [ ] [`docs/security/secret-ownership-register.md`](../../security/secret-ownership-register.md) оновлено: запис rotation-event-у з датою.

## Cross-references

- [`../security/hardening/H4-encryption-key-rotation.md`](../../security/hardening/H4-encryption-key-rotation.md) — origin card.
- [`../security/disaster-recovery.md`](../../security/disaster-recovery.md) — DR покриває "compromised key" поверх цього runbook-у.
- [`../security/secret-ownership-register.md`](../../security/secret-ownership-register.md) — owner-list для всіх AES-256-GCM ключів.
- [`apps/server/src/lib/keyRing.ts`](../../../apps/server/src/lib/keyRing.ts) — реалізація.
- [`apps/server/src/auth/tokenCrypto.ts`](../../../apps/server/src/auth/tokenCrypto.ts) — Better Auth формат `enc:v2:k<N>:iv:tag:ct`.
- [`apps/server/src/modules/mono/crypto.ts`](../../../apps/server/src/modules/mono/crypto.ts) + [`tokenStore.ts`](../../../apps/server/src/modules/mono/tokenStore.ts) — Mono BYTEA + `token_key_version` read/lazy-reencrypt.
