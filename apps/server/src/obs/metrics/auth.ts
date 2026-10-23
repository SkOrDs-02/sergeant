import client from "prom-client";

import { register } from "./registry.js";

/**
 * sec-10 (аудит 2026-10-01): невірний поточний пароль на перевірках для ВЖЕ
 * автентифікованої сесії — `DELETE /api/me` і `POST /api/auth/change-password`.
 *
 * Це не логін: власник сесії свій пароль знає, тож серія відмов означає
 * підбір пароля з украденої сесії (оракул) або навантаження scrypt. Ліміти
 * (`PASSWORD_CHECK_*_RATE_LIMIT`) обмежують швидкість, а цей лічильник живить
 * алерт `AuthPasswordCheckFailureSeries` (prometheus/alert_rules.yml).
 *
 * `route` = `account_delete` | `change_password`. Без user/IP у лейблах:
 * кардинальність і Hard Rule #21; кореляцію дає лог `auth.password_check.failed`.
 */
export const authPasswordCheckFailuresTotal = new client.Counter({
  name: "auth_password_check_failures_total",
  help: "Wrong current password on authenticated password checks (DELETE /api/me, change-password)",
  labelNames: ["route"],
  registers: [register],
});
