# Аудит тестового покриття Sergeant

> **Last touched:** 2026-09-02 by @claude. **Next review:** 2027-11-25.
> **Status:** Active — 6 із 7 рекомендацій закриті (звірка 2026-08-25, див. § «Статус рекомендацій»): №3, №4, №5, №7 виконані як сформульовані; №6 закрита **з поправкою** — сама рекомендація стояла на хибному діагнозі; №2 виконана частково (лишився visual/Argos, прибраний ADR-0082). №1 **знято з розгляду** продуктовим рішенням про заморозку mobile.

> **Звірка стану 2026-08-25 (web-first).** Аналіз рекомендацій проти фактичного
> коду показав, що більшість уже закрита, хоча статус-хедер цього звіту досі
> казав «№1–7 не виконані» — доки дрейфували від реальності рівно так само, як
> це сам звіт зафіксував про Detox. Актуальні статуси — у таблиці § «Статус
> рекомендацій» нижче. Головне для читача: **рекомендація №1 (реанімувати
> Detox) свідомо НЕ виконується** — mobile quality gates заморожені до
> валідації web-продукту ([`docs/90-work/tech-debt/mobile.md`](../tech-debt/mobile.md),
> блок «Оновлено 2026-08-25»). Це рішення, а не забутий борг: не переоцінюй
> цю знахідку як діру №1 у наступних аудитах.

> **Що це.** Глибокий аудит рівня і глибини тестового покриття монорепо
> (юніт / інтеграційні / контрактні / E2E web / E2E mobile / мутаційні),
> виконаний мульти-агентним воркфло у 3 фази: 5 паралельних аналітиків по
> поверхнях (web, server, packages, e2e, quality-gates) → 3 верифікатори
> (реальний coverage-прогін усіх packages + apps/server, адверсарна перевірка
> тверджень аналітиків, пошук прогалин у критичній бізнес-логіці за
> [`domain-invariants.md`](../../02-engineering/architecture/domain-invariants.md)) → синтез.
> Числа покриття — з фактичного прогону `vitest run --coverage`
> (TZ=Europe/Kyiv) на свіжому checkout, не з декларованих floors.

## TL;DR

Тестова база Sergeant — **сильно вище середнього**: реальний coverage-прогін показав 97–100% lines у всіх 9 packages та 92.95% в apps/server (3695 тестів, усі зелені), з property-based тестами на доменних інваріантах (копійки, Kyiv/DST, bigint до ±2^63) і зразковим інтеграційним шаром (Testcontainers + реальний Postgres, syncV2.integration — 5497 рядків, 73 тести). Класичні анти-патерни майже відсутні: 0 закомічених `.only`, 0 `expect(true).toBe(true)`, лише 0.23% toBeDefined-only блоків з ~18 774. Адверсарна перевірка **підтвердила всі 13 вибіркових тверджень аналітиків** — фаза 1 навіть трохи консервативна. Дві системні слабкості: **декоративні E2E-лейни** (Detox повністю вимкнений у CI — 13 сьютів × 2 платформи не ловлять нічого; 3 Playwright-конфіги не підключені до жодного workflow) і **over-mocking у web page-тестах** (62 файли з >5 `vi.mock`, до 37 на файл). Найризиковіші прогалини — позитивний флоу Better Auth, який ніде не ганяється наскрізно, і незахищений контракт server toolDefs ↔ client executors у HubChat. Загальна оцінка глибини: **4/5**.

## Зведена таблиця по шарах піраміди тестування

> Таблиця нижче — **знімок станом на 2026-08-04** і навмисно не переписується
> заднім числом (це історія аудиту, а не живий дашборд). Частина рядків уже
> застаріла: mutation-лейн відтоді отримав issue-на-червоний-прогін і ratchet,
> `tests/ledger` підключено в nightly. Актуальний стан — § «Статус рекомендацій».

| Шар              | Обсяг                                                                                                                                                     | Фактичне покриття                                                                                                                                     | Глибина (1–5)                                        | Вердикт                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Юніт**         | web 987 файлів (~8901 кейсів), server 313, packages ~245, mobile 183                                                                                      | packages 97.5–100% lines; server 92.95%; web не прогнано (див. нижче)                                                                                 | **4**                                                | Сильний шар: property-based на інваріантах, regression-anchored (129 web-файлів прив'язані до багів). Слабина — over-mocked page-смоуки (62 файли >5 vi.mock) |
| **Інтеграційні** | server: 18 integration-файлів, 24 на Testcontainers (pgvector:pg17); web: 20 файлів на реальному in-memory SQLite; db-schema: ~13 sqlite + pg-mem runner  | Fail-closed у CI (без Docker — throw, не skip)                                                                                                        | **5**                                                | Зразковий шар: LWW/idempotency/tombstones, session-protection walk усього роутера, migration-down-drill, parity LS↔SQLite                                     |
| **Контрактні**   | 15 pact consumer-файлів (25 interactions, 16 routes), provider replay 8/16, 5 web contract-тестів, OpenAPI freshness, daily pact-drift проти live staging | Pact покриває 9 з 17 endpoint-модулів api-client; `transcribe.ts` — 0 тестів                                                                          | **4**                                                | Hard Rule #3 механічно замкнений для ядра, але billing/privat/finyk без pact; msw у web — лише 2 тести при готовій інфрі                                      |
| **E2E web**      | Playwright: 25 smoke-специв (23 @critical, per-PR блокуючі проти реального стека), a11y lane, nightly webkit/safari                                       | critical-flow: браузер→HTTP→сервер→Postgres реально; але tests/ledger (49 кейсів), tests/mobile, visual/Argos — **не підключені до жодного workflow** | **4**                                                | Блокуючий @critical lane — рідкісна якість (CRUD+undo+reload-persistence). Мілке — поза CI                                                                    |
| **E2E mobile**   | Detox: 13 сьютів, добре спроєктовані                                                                                                                      | **Ефективно 0**: iOS runtime `exit 0` (detox-ios.yml:145), Android continue-on-error + soft-pass (detox-android.yml:191), nightly cron прибраний      | **1** (сценарії написані на 3–4, але не виконуються) | **Декоративний.** Мобільна платформа без жодного блокуючого E2E                                                                                               |
| **Мутаційні**    | Stryker tier-1: 2 файли shared (173 рядки) + 4 нормалізатори server (624 рядки) = ~797 рядків з ~76k                                                      | Weekly cron лише; break:70; звіти — артефакти на 30 днів, без історії/ratchet; червоний прогін НЕ створює issue                                       | **2**                                                | Цілі вибрані точно (гроші, DST, bigint), але scope ~1% кодобази, весь apps/web поза мутаціями, видимість провалу нульова                                      |

## Рівень покриття: декларовані floors vs фактичні числа

Реальний прогін (TZ=Europe/Kyiv, усі тести зелені):

| Workspace                 | Floor (декларований)                 | Факт lines  | Факт branches                 | Запас                       |
| ------------------------- | ------------------------------------ | ----------- | ----------------------------- | --------------------------- |
| apps/server               | 60 / 48 / 63                         | **92.95**   | 82.75                         | ~33 пп                      |
| packages/api-client       | 73                                   | **99.42**   | 92.55                         | ~26 пп                      |
| packages/routine-domain   | 74                                   | **98.93**   | 89.46                         | ~25 пп                      |
| packages/shared           | 75 (default)                         | **98.73**   | 93.29                         | ~24 пп                      |
| packages/db-schema        | 75                                   | **98.95**   | **97.90**                     | найкращі branches           |
| packages/dualwrite-core   | 75                                   | **100**     | 97.22                         | —                           |
| packages/finyk-domain     | 75                                   | 97.51       | 83.19 (найнижчі серед domain) | —                           |
| packages/fizruk-domain    | 75                                   | 99.51       | 90.74                         | —                           |
| packages/nutrition-domain | 75                                   | 97.69       | 90.88                         | —                           |
| packages/insights         | 75                                   | 98.95       | 82.20                         | —                           |
| apps/mobile               | **30 + CI skip** («web-focus phase») | не прогнано | —                             | **гейт фактично вимкнений** |

**Що прогін не зміг / не робив:** apps/web не запускався навмисно (987 файлів, надто довгий прогін — декларований floor lines 89, ratchet-baseline 93.72); apps/mobile, mobile-shell, landing — поза скоупом прогону. **Env-знахідка:** перший прогін apps/server дав 29 failed файлів через `Cannot find package '@sergeant/db-schema/pg'` — прихована build-order залежність (dist/ відсутній у свіжому checkout; turbo це маскує в CI). Після `pnpm --filter ./packages/db-schema build` — 294/294 зелені.

**Висновок:** статичні floors — свідомий «safety net» (задокументовано у vitest.config.ts), справжній гейт — coverage-ratchet.json з fail-closed. Але ratchet покриває **лише web+server**; домен-пакети «near 100%» тримаються на default 75 — легальний коридор деградації ~25 пп без жодного червоного. Поза будь-яким гейтом: apps/landing, design-tokens, config, eslint-plugins, apps/mobile.

## Глибина: що реально глибоке, що мілке

### Глибоке (підтверджено читанням файлів)

- `apps/server/src/modules/sync/syncV2.integration.test.ts` — рівно 5497 рядків, 73 тести проти реального Postgres: LWW-конфлікти, idempotency replay, tombstone resurrection guards, cross-user isolation.
- `packages/shared/src/utils/date.property.test.ts` + `apps/web/src/shared/lib/time/kyivTime.property.test.ts` — fast-check з незалежним оракулом, 1000 runs, природно ловлять 23/25-годинні DST-доби.
- `apps/server/src/lib/pgInt8.property.test.ts` — bigint поза [MIN_SAFE, MAX_SAFE] аж до ±2^63 з вимогою throw замість тихої втрати копійок (Hard Rule #1 на трьох рівнях: драйвер, нормалізатори, Pact wire-level).
- `apps/server/src/http/requireSession.test.ts` — stateful circuit-breaker M13 (4 fail → 401, 5-й → 503, reset), H8 CORP на всіх статусах.
- `apps/web/src/core/hub/chat/useChatSend.test.tsx` — гейт деструктивних tool-calls (§8 канону), 256KB SSE cap, envelope firewall; прив'язано до аудит-фіндингів F15/F22.
- `apps/web/tests/smoke/deep-module-crud.spec.ts` — CRUD→reload→persistence→delete→undo по 4 модулях проти реального сервера+Postgres.
- Мета-тести CI-гейтів (`scripts/__tests__/ci-dedupe-gate.test.mjs`, `coverage-ratchet.test.mjs`) — асертять відсутність `continue-on-error`/`|| true` у самих гейтах. Рідкісна дисципліна.

### Мілке (anti-patterns з числами)

- **Over-mocking:** 574 файли з `vi.mock` (1830 викликів) repo-wide; **62 файли з >5 моками**. Рекорди: `NutritionApp.test.tsx` — 37, `FinykApp.test.tsx` — 26, `RootLayout.test.tsx` — 26, fizruk `Dashboard.test.tsx` — 16 (всі 11 hooks + 4 дитини застаблені до `<div data-testid>`; асерти — «mounts without crashing»). Контракт props сторінка↔дитина не захищений.
- **Декоративні лейни:** `tests/ledger/user-story-ledger.spec.ts` — 49 кейсів «рендериться без console errors» з повністю мокнутим API, не підключено до жодного workflow; `tests/mobile` (44px touch-target аудит) — теж; Detox — 13 сьютів, які CI ніколи не виконує.
- **Mock-echo:** `NutritionMenuPage.test.tsx` (діти мокнуті на кнопки, асертяться callback-и), `BentoCard.stories.test.tsx` (чисте metadata-echo), mobile `hub-ux-smoke.e2e.ts` (тап theme-toggle без асерту, що тема змінилась).
- **Але:** снапшотів лише 35 викликів у 15 файлах (переважно свідомі drift-guards), toBeDefined-only — 43 блоки з 18 774 (0.23%), блоки без expect — 38 (0.2%), skip/todo — 7 на весь репо. Частка shallow-файлів: web ~10–15%, server ~5–10%, packages ~10–15%.

## Вердикти адверсарної перевірки

**Усі 13 вибіркових тверджень фази 1 — confirmed.** Аналітики точні і, якщо що, трохи консервативні. Розбіжності мінімальні:

- Дрібний нюанс: ledger — **49** route-кейсів, не 51 (`rg -c 'id: "WEB-'`) — на вердикт не впливає.
- Detox-твердження підтверджено повністю, включно з нюансом: коментар про nightly у detox-android.yml лишився (рядки 53–58), але `schedule:` тригера немає — доки дрейфують.
- **Фаза 4 виправила дві хибні тривоги фази 1:** (1) `stripeLifecycle.ts` — НЕ критична прогалина: поведінково покритий через глибокий `stripe.test.ts` (subscription lifecycle, payment_failed, after-COMMIT ordering); (2) dualwrite-core «лише 3 тести» — хибна тривога: apply.ts — суто типи, виконувані частини покриті, а справжня dual-write оркестрація тестується у 20 web sqliteWriter-файлах.
- bigint→number — не прогалина, а зразок (глобальний `installInt8Parser` + property + normalizers + Pact); окремі тести на кожен серіалізатор не потрібні.

## Критичні прогалини (за ризиком)

1. **Позитивний флоу Better Auth ніде не ганяється.** Навіть `auth-session-me.integration.test.ts` (реальна DB!) мокає `getSessionUser` через `vi.mock('../auth.js')`. Реальний Better Auth зачіпається лише негативно (unauth → 401, rate-limit → 429). Регресія у wiring (database adapter, encryptingAdapter, cookie config, bearer plugin), що ламає **сам логін**, пройде повз усі 313 файлів. Пом'якшує лише Playwright setup-project (реальна реєстрація через UI), але це один шлях в одному браузері.
2. **HubChat toolDefs ↔ client executors parity.** ~1900 рядків серверних tool-схем виконуються клієнтом (`hubChatActions.ts`), доки вимагають «три скоординовані правки» на tool — але жоден тест не звіряє список імен cross-surface. Failure mode задокументований: користувач бачить «Невідома дія» у продакшн-чаті. Серверні тести toolDefs — лише структурні; `chatStream.ts` (321 рядків SSE) — лише непряме покриття.
3. **internal_transfer закріплений тестами в 4 із 7 задокументованих місць.** Без тестів: `apps/web/src/modules/finyk/hooks/useStorage.ts:107-124`, `apps/web/src/core/lib/hubChatContext/finance.ts:90` (їде **в промпт AI-коуча**), `packages/finyk-domain/src/lib/transactions.ts:52`. Регресія завищить витрати користувача до копійки без червоного тесту.
4. **applyMisc.ts (255 рядків) / applyInjuries.ts (121)** — серверні sync-апплаєри fizruk без поведінкових тестів (лише table-smoke). Тиха втрата офлайн-даних при синку — діра в контурі, який решта sync-шару захищає зразково.
5. **apps/mobile — платформа без quality gates.** Coverage-гейт вимкнений (floor 30 + CI skip), Detox декоративний, mobile finyk sqliteWriter має лише SQL-снапшот — без integration/parity, які web має по 4–5 файлів на модуль. Це фінансові дані на платформі, де LS↔SQLite-паритет ніхто не перевіряє.
6. **privatConnection.ts (124 рядки) + routes/banks.ts (51)** — вхідна точка банківських даних (токени, lifecycle конекшна) з нульовими тестами, на контрасті з Mono (17 тест-файлів).

Недотестовані (нижчий ризик): семантика ~89 зі 101 міграцій (структурний rollback-drill є, поведінкові тести — лише 12); `env/env.ts` (909 рядків, часткове покриття); `transcribe.ts` endpoint — 0 тестів; 7 pact-контрактів без provider-side replay; `@live-chat` тест не матчиться жодним CI grep-ом.

## Топ-7 рекомендацій

1. **Реанімувати Detox або чесно його видалити.** Мінімум: зробити Android lane блокуючим (прибрати `continue-on-error` + `exit 0` у `.github/workflows/detox-android.yml:191,205-207`), повернути nightly `schedule:`; iOS — прибрати `exit 0` на `.github/workflows/detox-ios.yml:145`. Сьюти готові (`apps/mobile/e2e/routine-full.e2e.ts` — зразковий) — не виконувати їх дорожче, ніж виконувати.
2. **Підключити непідключені Playwright-лейни.** Насамперед `apps/web/tests/mobile/mobile-ui-audit.spec.ts` (єдиний enforcement 44px touch-floor — Hard-Rule-подібного інваріанта) у ci.yml; вирішити долю `tests/ledger` (49 shallow-кейсів — або в nightly, або видалити) і visual/Argos (доки ADR-0034/0046 посилаються на неіснуючий workflow).
3. **Наскрізний тест реального Better Auth.** Один integration-тест без мока `getSessionUser`: sign-up → cookie/bearer → авторизований `/api/me` — у `apps/server/src/__tests__/` на існуючому Testcontainers-харнесі. Закриває прогалину №1 одним файлом.
4. **Механічний parity-гейт toolDefs ↔ chatActions.** Спільний реєстр tool-імен (наприклад, у `packages/shared`) + тест з обох боків: кожне ім'я з `apps/server/src/modules/chat/toolDefs/` має executor у `apps/web/src/core/lib/chatActions/`, і навпаки. Плюс прямі тести `chatStream.ts`.
5. **Дотягнути internal_transfer до 7/7.** Тести на `useStorage.ts`, `hubChatContext/finance.ts`, `lib/transactions.ts`; заразом замінити рядковий літерал у `forecastEngine.ts:65,76` на константу.
6. **Поведінкові тести applyMisc/applyInjuries** за зразком сусіднього `applySync.test.ts` (валідація, soft-delete з client timestamp, межі значень) — той самий патерн, той самий харнес.
7. **Ратчетити floors і розширити ratchet.** Статичні floors на 25–33 пп нижче факту (server 60/48/63 vs 92.95/82.75/92.05; api-client 73 vs 99.42; routine-domain 74 vs 98.93) — підняти до факт−5пп; розширити coverage-ratchet.mjs з web+server на packages; закрити fail-open діру в ci.yml (`if [ ! -f "$summary" ] continue` — workspace, що перестає емітити coverage, тихо випадає з гейта). Бонус тим же заходом: mutation-провал → idempotent issue (механізм уже є в pact-drift.yml), і зафіксувати build-order залежність server-тестів від db-schema (alias `@sergeant/db-schema/pg` → src у vitest.config).

## Статус рекомендацій

Звірка проти фактичного коду станом на **2026-08-25** (web-first фаза). Колонка
«Доказ» — файл/симптом, за яким статус перевіряється повторно, без довіри до
цієї таблиці.

| #   | Рекомендація                              | Статус                                                                 | Доказ                                                                                                                                                                                                                                      |
| --- | ----------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Реанімувати Detox або видалити            | ⛔ **Знято** (заморозка)                                               | Продуктове рішення web-first — [`tech-debt/mobile.md`](../tech-debt/mobile.md) «Оновлено 2026-08-25». Сьюти лишаються активом до розморозки.                                                                                               |
| 2   | Підключити непідключені Playwright-лейни  | 🟡 **Частково**                                                        | 44px touch-target аудит промоутнуто в блокуючий гейт `ci.yml` :: `mobile-ui-audit`. `tests/ledger` підключено в nightly (2026-08-25). Visual/Argos — прибрано [ADR-0082](../../04-governance/adr/0082-private-storage-repo-posture.md) §4. |
| 3   | Наскрізний тест реального Better Auth     | ✅ **Виконано**                                                        | `apps/server/src/__tests__/auth-real-signup-flow.integration.test.ts`                                                                                                                                                                      |
| 4   | Parity-гейт toolDefs ↔ chatActions        | ✅ **Виконано**                                                        | `packages/shared/src/hubchat/toolNames.ts` + `toolNames.test.ts`                                                                                                                                                                           |
| 5   | internal_transfer до 7/7                  | ✅ **Виконано**                                                        | Тести в `useStorage.test.tsx`, `hubChatContext/finance.test.ts`, `finyk-domain/src/lib/{spending,metrics,forecastEngine}.test.ts`                                                                                                          |
| 6   | Поведінкові тести applyMisc/applyInjuries | ⚠️ **Рекомендація була помилковою** — закрито з поправкою (2026-08-25) | `apps/server/src/modules/sync/fizruk/applyMisc.test.ts`, `applyInjuries.test.ts` — див. поправку нижче                                                                                                                                     |
| 7   | Ратчетити floors і розширити ratchet      | ✅ **Виконано**                                                        | `coverage-thresholds.json` (`$ratchetLog 2026-08-04`: api-client 73→94, routine-domain 74→94, + 7 packages з default 75); `--floors` fail-closed у `scripts/ci/coverage-ratchet.mjs`; mutation red-run issue в `mutation-testing.yml`      |

### Поправка до рекомендації №6 (2026-08-25)

Аудит стверджував, що `applyMisc.ts` (255 рядків) і `applyInjuries.ts` (121) —
«серверні sync-апплаєри fizruk **без поведінкових тестів** (лише table-smoke)», і
ранжував це прогалиною №4 за ризиком. **Це неточність методу.** Перевірка на
2026-08-25 показала: обидва апплаєри вже мали повноцінне поведінкове покриття —
воно просто лежало у файлі-сусіді `applySync.test.ts`, який імпортує
`applyFizrukCustomExercises`, `applyFizrukMeasurements` (обидва з `applyMisc.ts`)
і `applyFizrukInjuries`, та містить для них окремі `describe`-блоки. Замір
дублювання при спробі виконати рекомендацію «в лоб»: з 29 нових тестів для
`applyMisc` **19 назв збіглися** з наявними, для `applyInjuries` — **18 із 20**.

**Урок для методології аудитів:** висновок «функція без тестів» робився за
наявністю файлу `<module>.test.ts` поруч із `<module>.ts`. Для монорепо, де
кілька модулів однієї теки історично тестуються з одного файлу, цей евристичний
крок дає хибний позитив. Наступного разу — перевіряти покриття за **імпортами
функції в тестах**, а не за іменем файлу.

**Що реально зроблено:** тести консолідовано за колокацією (soft rule «tests next
to code»), дублі прибрано, і додано **12 гілок, які справді ніде не перевірялись**:
`missing_user_id` до будь-якого запиту (для всіх трьох апплаєрів), field-specific
`invalid_created_at` / `invalid_deleted_at` для injuries, ідемпотентний retract
(повторне видалення вже tombstoned-рядка), відсутність подвійного JSON-кодування
для вже серіалізованого `data_json`, `invalid_measured_at` на NOT NULL колонці, і
soft-delete саме client timestamp-ом, а не `now()`.

**Побічна знахідка — ✅ виправлено 2026-08-25.** Числові поля вимірювань у
`applyMisc.ts` (`weight_kg`, `waist_cm`, `chest_cm`, `hips_cm`, `bicep_cm`,
`sleep_hours`, `energy_level`, `mood`) парсились через **необмежені**
`parseOptionalNumber` / `parseOptionalInt` — без min/max guard, тож у базу
проходили `weight_kg: -500` чи `sleep_hours: 999`. Сусідній nutrition-апплаєр
для аналогічних полів уже використовував `parseOptionalBoundedNumber`, тобто
хелпер і патерн у репо були — fizruk їх просто не підключив.

Це була **не вразливість, а відсутність санітарної перевірки на вході**: sync
вимагає власної сесії, запис у чужий рядок і так відхиляється
(`user_id_mismatch`), а абсурдно великі значення впираються в межі самих колонок
(`REAL` / `INTEGER`). Реальна діра — середня смуга правдоподібних, але фізично
неможливих чисел, куди сміття потрапляє від своїх: баг у клієнті, кривий імпорт,
помилка в одиницях (фунти замість кілограмів, хвилини замість годин).

**Як виправлено.** Канонічні межі винесені в
[`packages/shared/src/fizruk/measurementBounds.ts`](../../../packages/shared/src/fizruk/measurementBounds.ts)
(`MEASUREMENT_BOUNDS`) — вони вже існували в реєстрі полів
`fizruk-domain`, тож нових чисел ніхто не вигадував. `shared` обрано тому, що це
єдиний пакет у залежностях **обох** сторін: `apps/server` навмисно не залежить
від domain-пакетів, а дублювати константи по два боки не можна — розійдуться
(рішення власника, варіант «б»). `MEASUREMENT_FIELDS` у fizruk-domain тепер
імпортує межі звідти і доклеює лише label/unit. Серверний апплаєр перейшов на
`parseOptionalBoundedNumber` / новий `parseOptionalBoundedInt` (floor **до**
перевірки меж — щоб клієнт, який слав `5.4`, і далі отримував `5`, а не відмову).
Тест-пин перевернуто на регресійний якір: тепер він вимагає `rejected`.

**Свідомий вибір поведінки — відхиляти, не обрізати.** Обрізання до межі мовчки
змінює чужі дані про здоровʼя; відхилення консистентне з nutrition-апплаєром і є
drop-in-заміною (той самий `=== "invalid"` branch).

**Наслідок, який лишається відкритим боргом.** Відхилений push-оп у клієнта
термінальний — движок його не ретраїть (`syncOpOutboxLifecycle`), тож запис
лишається лише на пристрої. Лічильник `rejected` у `syncOpOutboxStatus` існує,
але **жоден UI у `apps/web` його не читає**, тож користувач не побачить, що
запис не доїхав. Це передумовна прогалина всіх причин відхилення, а не наслідок
цього фіксу — трекається у [`tech-debt/frontend.md`](../tech-debt/frontend.md).

**Додано понад рекомендації аудиту** (2026-08-25, web-first пріоритизація):

- **Mutation-ratchet** — аудит оцінив мутаційний шар на 2/5 через нульову
  видимість провалу; issue-механізм це закрив лише наполовину: score міг повзти
  з 95 до 71 без жодного червоного, бо єдиним гейтом лишався статичний
  `thresholds.break: 70`. Додано baseline-храповик за зразком coverage-ratchet.
- **Гейт проти over-mocking** — знахідка «62 файли з >5 `vi.mock`» не мала
  механічного стримування, тож борг міг лише рости. Додано baseline-храповик,
  який не вимагає рефакторингу наявних файлів, але не дає додавати нові.
