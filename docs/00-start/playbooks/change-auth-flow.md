# Playbook: Change an Auth Flow (Better Auth)

> **Last validated:** 2026-06-09 by @claude. **Next review:** 2026-09-07.
> **Status:** Active

**Trigger:** «Зміни логін / реєстрацію / скидання пароля» / правка session middleware, cookie- чи redirect-поведінки / новий Better Auth plugin / зміна account lifecycle або token refresh.

## Owner surface

- Primary surface: `apps/server/src/auth.ts`, `apps/web/src/core/auth/`
- Coupled surface: auth-роути та session middleware на сервері, env-vars (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ALLOWED_ORIGINS`)
- Governing skill: `better-auth-best-practices`

---

## Контекст

Better Auth — **high-risk integration-поверхня**. Помилка тут — це не баг одного екрана, а втрата сесій усіх юзерів або відкритий редирект. Тому два правила над усім: тримай зміну **вузькою** і верифікуй кукі на **парі Vercel ↔ Railway**, бо cross-site cookie-поведінка — це deploy-concern, а не лише код.

Завантаж skill `better-auth-best-practices` перед роботою. Якщо задача — це звичайна API-робота, якій просто потрібен `user.id`, цей плейбук **не** для неї: візьми `sergeant-server-api` і не чіпай auth-обвʼязку.

Серверний config живе в `apps/server/src/auth.ts` і ділить Postgres-пул із `db.ts`. Web-клієнт — `apps/web/src/core/auth/authClient.ts` плюс auth-UI поряд (`LoginForm.tsx`, `RegisterForm.tsx`, `ForgotPasswordPanel.tsx`, `ResetPasswordPage.tsx`).

---

## Decision Tree

**Q1: Що саме рухається в auth-поведінці?**

- Лише UI-копія/верстка форми без зміни контракту → це робота `sergeant-web-ui`, не повний auth-флоу. Все одно прогони [§4](#4-верифікувати-на-парі-vercel--railway).
- Login / logout / session / redirect / cookie → [§1](#1-звузити-обсяг) → [§2](#2-сервер-і-клієнт-в-одній-зміні) → [§4](#4-верифікувати-на-парі-vercel--railway)
- Новий Better Auth plugin або зміна schema (нова колонка/таблиця сесій) → [§3](#3-schema-чи-plugin--разом-із-міграцією) (обовʼязково перед §4)
- Підозра компрометації акаунта / витік credential-а → **STOP** → [`access-governance.md` § Suspected account compromise](./access-governance.md)

**Q2: Чи змінюється cross-site cookie-поведінка?**

- Так (`sameSite`, домен куки, проксі `/api/*`, `ALLOWED_ORIGINS`) → перечитай [`docs/02-engineering/integrations/railway-vercel.md`](../../02-engineering/integrations/railway-vercel.md) **до** правки; це частина auth-контракту.
- Ні → лишайся в межах §1–§2.

---

## Steps

### 1. Звузити обсяг

- Опиши в одному реченні, яка саме auth-поведінка змінюється (наприклад «після reset-у redirect веде на `/login`, а має на `/`»).
- Не змішуй auth-зміну з feature-роботою в одному PR — auth ревʼюється окремо й суворіше.
- Бери env-vars замість hardcoded `baseURL` чи `secret`. Будь-який літерал секрета в коді — це stop.
- User-id-и Better Auth — **непрозорі рядки**. Не припускай UUID-форму, не парси, не валідуй як UUID.

### 2. Сервер і клієнт в одній зміні

Коли auth-поведінка переїжджає, обвʼязку треба оновити **і** на сервері (`apps/server/src/auth.ts`, session middleware), **і** на клієнті (`apps/web/src/core/auth/authClient.ts` + UI) в одному PR. Розʼїхана пара = зламаний логін на проді.

- Захищені роути мусять читати **ту саму форму** серверної сесії — не вводь паралельний спосіб діставати юзера.
- Якщо додаєш новий метод (OAuth-провайдер, magic link) — переконайся, що клієнт викликає рівно той самий endpoint, що сервер реєструє.
- Зміну тягни з тестами поряд (`AuthContext.test.tsx`, `AuthPage.test.tsx`, `ResetPasswordPage.test.tsx` як приклади).

### 3. Schema чи plugin — разом із міграцією

Будь-яка schema- або plugin-зміна Better Auth (нова колонка сесій, таблиця акаунтів, поле верифікації) йде **разом** із потрібною міграцією або CLI-кроком у тому ж PR.

- Міграцію створюй за [`add-sql-migration.md`](./add-sql-migration.md) — послідовна нумерація, two-phase для DROP (Hard Rule #4).
- Перед merge прогони [`pre-merge-migration-checklist.md`](./pre-merge-migration-checklist.md).
- Не лишай «міграцію докину окремим PR» — на проді plugin без колонки = 500 на кожному логіні.

### 4. Верифікувати на парі Vercel ↔ Railway

Compile success тут нічого не доводить. Перевір runtime-поведінку через Vercel-фронтенд (він проксює `/api/*` на Railway-бекенд — це частина auth-контракту):

- Login, logout і session-refresh усе ще працюють через Vercel-фронтенд.
- Захищені роути віддають дані залогіненому і 401 — анонімному.
- Кукі ставиться з правильними атрибутами (`Secure`, `SameSite`, домен) на cross-site парі.
- Якщо змінювалася operator-side setup (env-vars, redirect URL-и) — оновлено auth- або env-доки в тому ж PR.

E2E-покриття auth-флоу веди за [`write-e2e-test.md`](./write-e2e-test.md); auth-fixture описаний у `.agents/skills/sergeant-e2e-testing/references/auth-flow.md`.

---

## Verification

- [ ] Зміна звужена до однієї auth-поведінки; не змішана з feature-роботою.
- [ ] Сервер і клієнт оновлені в одному PR; захищені роути читають ту саму форму сесії.
- [ ] Жодного hardcoded `secret` / `baseURL`; усе через env-vars.
- [ ] User-id трактується як непрозорий рядок (без UUID-припущень).
- [ ] Schema/plugin-зміна йде з міграцією; пройдено `pre-merge-migration-checklist.md`.
- [ ] Login / logout / session-refresh верифіковані через Vercel-фронтенд (не лише `pnpm typecheck`).
- [ ] Cross-site cookie-атрибути перевірені; за потреби звірено з `railway-vercel.md`.
- [ ] Auth/env-доки оновлені, якщо змінилася operator-side setup.

## Notes

- Проксі Vercel через `/api/*` — це **частина auth-контракту**, а не деталь хостингу. Зміна `ALLOWED_ORIGINS` чи домену куки ламає логін мовчки.
- Не дублюй правила, які вже покриває `sergeant-server-api` (bigint coercion, contract triplet, Kyiv time) — бери його першим, а цей skill лише для самої auth-поведінки.
- Governance привілейованого доступу (видача/відкликання/ревʼю/компрометація) — це **не** цей плейбук, а [`access-governance.md`](./access-governance.md).

## See also

- [access-governance.md](./access-governance.md) — видача/відкликання доступу, підозра компрометації
- [add-sql-migration.md](./add-sql-migration.md) — schema-зміна для auth-таблиць
- [pre-merge-migration-checklist.md](./pre-merge-migration-checklist.md) — гейт перед merge міграції
- [write-e2e-test.md](./write-e2e-test.md) — E2E-покриття login/logout/reset
- [docs/02-engineering/integrations/railway-vercel.md](../../02-engineering/integrations/railway-vercel.md) — cross-site cookie контракт
- `.agents/skills/better-auth-best-practices/SKILL.md` — жорсткі правила auth
