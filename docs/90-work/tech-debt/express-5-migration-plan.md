# Express 4 → 5 Migration Plan (draft)

> **Status:** Archived
> **Last touched:** 2026-07-09 by @claude. **Next review:** ніколи (read-only архів).
> **Owner:** @SkOrDs-02
> **Supersedes:** —
> **Related:** [`backend.md`](./backend.md) (backend tech-debt inventory), [`AGENTS.md § Verification before PR`](../../../AGENTS.md), governing skill `sergeant-tech-debt`.
>
> **Closeout 2026-07-09.** План повністю виконано в [PR #131](https://github.com/SkOrDs-02/sergeant/pull/131) — `express` 4.22 → 5.2, `@types/express` 4 → 5. Усі 4 передбачені wildcard-блокери (§ 3) поправлені точно за планом; `@types/express@5` дав нуль type-drift (менше невизначеності, ніж план прогнозував); повний server unit-suite (3308 тестів) зелений. `asyncHandler`-cleanup (§ 4) свідомо НЕ виконано в тому PR — окремий opt-in follow-up, трекається окремо. Документ лишається як історичний запис; не редагувати — якщо asyncHandler-cleanup колись піде в роботу, для нього заводиться новий документ.
>
> ⚠️ **Це чернетка беклог-плану, не активна ініціатива.** Апгрейд Express 4.22 → 5
> — **low-priority tech-debt, не блокер**. Express 4.x досі під підтримкою і
> пропатчений (security-overrides у root `package.json`). Виконувати **окремим
> тематичним PR** під `sergeant-tech-debt`, коли є capacity — ніколи в складі
> продуктової фічі. «Версія не остання» ≠ «версія проблемна».

## 1. Навіщо (і чому не терміново)

Головний виграш Express 5 — **нативне пробрасування reject-ів з `async`-хендлерів**
у error-middleware. У нас це вже вирішено обгорткою
`apps/server/src/http/asyncHandler.ts` (62 файли, 170 call-sites), тож головний
біль Express 4 закритий місяці тому. <!-- de-linked: файл видалено у PR #134 (asyncHandler cleanup) — обгортка стала зайвою під Express 5; історична згадка лишається як plain-текст. -->
Апгрейд лишає: сучасніший baseline, path-to-regexp v8, −1 обгортковий патерн
(опційно), актуальні `@types/express@5`.

**Не переписуємо на Fastify/Hono/Nest.** Express вплетений глибоко (197 файлів
імпортують `express`, 88 `Router()`), а вузьке місце особистого AI-хаба —
Anthropic/Postgres latency, не router overhead (бюджет `/health` p95 < 100 ms).
Рерайт HTTP-шару = тижні агентного часу за мінус-нуль користувацької цінності.

## 2. Реальна поверхня зачеплення (скан `apps/server/src`, 2026-07-09)

| Breaking-change Express 5 / path-to-regexp v8                                                                                            | Знайдено             | Ризик       | Дія                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------- | ------------------------------------------------ |
| Bare `*` у роут-стрінгах (path-to-regexp v8 забороняє)                                                                                   | **4**                | 🔴 блокер   | § 3 — перейменувати на named wildcard            |
| Regex/optional params у path (`/:x(\d+)`, `/:x?`)                                                                                        | 0                    | —           | нема роботи                                      |
| Мутації `req.query` (у v5 — read-only getter)                                                                                            | 0                    | —           | нема роботи (є 1 **read**, не мутація)           |
| Видалені API (`app.del`, `req.param()`, `res.json(obj,status)`, `res.send(status)`, `res.sendfile`, `res.redirect('back')`, `res.jsonp`) | 0                    | —           | нема роботи                                      |
| `express.static(...)` (API незмінний у v5)                                                                                               | 2                    | 🟢 низький  | лише smoke-перевірка роздачі `dist/`             |
| `express.json` / вбудований body-parser (лишається у v5)                                                                                 | 30                   | 🟢 низький  | без змін                                         |
| Термінальний `errorHandler` (arity-4)                                                                                                    | 1                    | 🟢 низький  | перевірити, що досі ловить                       |
| `asyncHandler` обгортки (v5 проброшує async нативно)                                                                                     | 62 файли / 170 sites | 🟡 опційно  | **окремий cleanup, поза критичним шляхом** — § 4 |
| `@types/express@^4` bump                                                                                                                 | 1                    | 🟡 середній | → `^5`, вичистити type-drift                     |

**Висновок:** реальних блокерів — **4 рядки**. Це вузька, обмежена міграція, а не
розпил по всіх 88 роутерах.

## 3. Хард-блокери: 4 wildcard-роути

path-to-regexp v8 (Express 5) більше не приймає голий `*` — потрібен **named
wildcard** або regex. ⚠️ **Ключова пастка:** `/*splat` (named wildcard **без**
фігурних дужок) **НЕ матчить корінь `/`** — тому для root-inclusive поведінки
(як у поточного `app.get("*", …)`) треба саме `/{*splat}` або regex `/.*/`.

| Файл:рядок                                                                                   | Поточне                                     | Призначення           | Пропозиція                                             |
| -------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------- | ------------------------------------------------------ |
| [`src/app.ts:176`](../../../apps/server/src/app.ts)                                          | `app.get("*", fe)`                          | SPA-fallback          | `app.get(/.*/, fe)` **або** `app.get("/{*splat}", fe)` |
| [`src/app.ts:180`](../../../apps/server/src/app.ts)                                          | `app.get("*", fe.sendIndex)`                | SPA-fallback          | так само                                               |
| [`src/routes/auth.ts:24`](../../../apps/server/src/routes/auth.ts)                           | `r.all("/api/auth/*", toNodeHandler(auth))` | **Better Auth mount** | `r.all("/api/auth/{*splat}", toNodeHandler(auth))`     |
| [`src/http/bodySizePolicy.test.ts:31`](../../../apps/server/src/http/bodySizePolicy.test.ts) | `app.all("*", ...)`                         | тест-фікстура         | `app.all(/.*/, ...)`                                   |

> 🔴 **AI-DANGER — Better Auth.** `/api/auth/*` мусить і далі матчити **всі**
> суб-шляхи (`/api/auth/sign-in`, `/sign-up`, `/callback/*`, …). Після заміни на
> `/{*splat}` **обов'язково** прогнати auth-e2e/інтеграційні тести — регрес тут
> = зламаний вхід у прод. `toNodeHandler` очікує повний шлях (див. коментар у
> `auth.ts`), named-wildcard семантику зберігає, але верифікуй емпірично.
>
> **AI-NOTE — SPA-fallback.** Обидва варіанти (`/.*/` regex чи `/{*splat}`)
> root-inclusive; голий `/*splat` **пропустив би `/`**. `/.*/` ближчий до
> поточної поведінки «зловити все» без ризику інтерпретації сегментів. Вибрати
> один стиль і застосувати консистентно в `app.ts`.

## 4. Опційний cleanup: `asyncHandler` (НЕ в критичному шляху)

Express 5 сам проброшує reject `async`-хендлера в `errorHandler`, тож 170
`asyncHandler(...)` обгорток стають технічно зайвими. **Але:**

- це **окремий PR після** того, як базова міграція зелена і в проді;
- знімати можна поетапно (per-module), не одним махом;
- обгортка не шкодить — лишити її теж коректно. Пріоритет: низький.

Не змішувати з § 3 — інакше діф роздувається зі «4 рядки» до «170 sites» і ревʼю
втрачає сигнал.

## 5. Виконання (окремий PR, послідовно)

1. `git checkout -B <devin/…-express5>` від свіжого `main`.
2. Bump у [`apps/server/package.json`](../../../apps/server/package.json):
   `express ^4.22.2 → ^5.x`, `@types/express ^4.17.25 → ^5.x`. `pnpm install
--frozen-lockfile` не пройде на bump → оновити lockfile окремим кроком.
3. Полагодити 4 wildcard-роути (§ 3). Один стиль для SPA-fallback.
4. `pnpm --filter @sergeant/server typecheck` — вичистити `@types/express@5`
   type-drift (сигнатури `Request`/`Response`/`RequestHandler` дещо звузились).
5. Перевірити `helmet@8` / `compression@1.8` сумісність із Express 5 (мажорних
   конфліктів не очікується — обидва middleware-агностичні).
6. Прогнати повний регрес (§ 6). Особлива увага — auth-flow.
7. **НЕ** чіпати `asyncHandler` у цьому PR (§ 4 — окремо).
8. Commit scope — `server` (Hard Rule #5). Напр.:
   `chore(server): migrate express 4 → 5 (path-to-regexp v8 wildcard routes)`.

## 6. Верифікація

- **Safety-net уже сильний:** 52 тест-файли б'ють HTTP/роути через `supertest`/
  `request(app)` — регрес зловиться.
- Обов'язково: `pnpm check` (= `format:check && lint && check:typecheck-and-test
&& build`).
- Точково:
  - `pnpm --filter @sergeant/server test` — увесь server-suite;
  - auth-інтеграційні/e2e — після зміни `/api/auth/{*splat}` (§ 3, критично);
  - SPA-fallback змонтовано в [`src/app.ts`](../../../apps/server/src/app.ts)
    (`app.get("*", fe.sendIndex)`), а [`src/routes/frontend.ts`](../../../apps/server/src/routes/frontend.ts)
    лише будує middleware (`express.static` для `dist/assets`) — smoke-перевірити
    обидва: статику **і** curl глибокого шляху (→ має віддати `index.html`);
  - `errorHandler` — переконатись, що `ExternalServiceError` з async-хендлерів
    досі мапиться в 4xx/5xx (`chat`/`digest`/`transcribe` тести це покривають).

## 7. Ризики і rollback

| Ризик                                                 | Мітигація                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Better Auth catch-all перестає матчити суб-шляхи      | auth-e2e перед merge; при фейлі — тимчасово regex `/^\/api\/auth\//`                                   |
| `@types/express@5` ламає компіляцію в багатьох файлах | typecheck-first; звузити локально, не `any`-глушити                                                    |
| Прихована зміна порядку/семантики middleware          | 52 supertest-файли + повний `pnpm check`                                                               |
| Rollback                                              | доки-PR + один код-PR ізольовані; revert код-PR повертає 4.22 без побічних наслідків (lockfile revert) |

## 8. Оцінка обсягу

**S (small).** 4 рядки коду + 2 версійні bump-и + typecheck-cleanup. Основний
час — не написання, а **регрес-прогін і auth-верифікація**. Опційний
`asyncHandler`-cleanup (§ 4) — окремий M-tier PR пізніше.

## 9. Definition of Done

- [ ] `express@5` + `@types/express@5` у `apps/server`, lockfile оновлено.
- [ ] 4 wildcard-роути на named wildcard / regex; стиль консистентний.
- [ ] `pnpm check` зелений; server-suite (52 HTTP-файли) зелений.
- [ ] Auth-flow верифіковано емпірично (не лише unit).
- [ ] `asyncHandler` **не чіпано** (винесено в окремий беклог-пункт).
- [ ] PR-body за шаблоном; scope `server`; Hard Rule #15 ack.
- [ ] `backend.md` оновлено (пункт «Express 4 → 5» закрито/просунуто).
