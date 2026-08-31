# Спека: fizruk — «Тренування» та «Активне тренування» (UX-чистка + safety + route + телеметрія)

> **Last touched:** 2026-08-01 by @claude (інтерв'ю з founder-ом).
> **Status:** Archived (реалізовано) — виконано в #589 (route активного тренування, чесний 1RM, injury-UI на [ADR-0083](../../../../04-governance/adr/0083-injury-model-zone-level.md)); супутні #585 (старіння 1RM) і #586 (recovery), міграція `097_fizruk_injuries.sql`, телеметрія `apps/web/src/modules/fizruk/lib/workoutTelemetry.ts`.
> Контекст-джерела: [канон fizruk](../../../../01-product/model/fizruk.md), [аудит product-knowledge-fizruk](../../../audits/product-knowledge-fizruk.md) (напруги 3/4, blindspot E-1).

## Проблема

Модуль fizruk розвивався менше за finyk і накопичив структурний шум та фізично небезпечні механіки. «Активне тренування» — не сторінка, а стан `view === "log"` всередині `Workouts.tsx`: немає URL, refresh/deep-link неможливі, resume тримається на LS-вказівнику з поллінгом кожні 1.5 с. Старт тренування розмазаний по чотирьох концептах (Quick Start, шаблони, програми, план у routine). Rest-таймер — блокуючий overlay без авто-старту. e1RM рахується формулою Еплі без rep-cap (сет 40 кг × 20 → «1RM 66.7 кг»), LoadCalculator радить % від цього піка без старіння, PR-борд святкує лише вгору; поняття травми в моделі немає, хоча гачок `hasHardBlock` уже написаний і мертвий для UI. Телеметрії нуль — «чи працює модуль» нічим не виміряти.

## Ціль

Сторінка «Тренування» має два чіткі шляхи старту; активне тренування — повноцінний route, що переживає refresh; rest-таймер не заважає логувати; цифри, від яких вантажать штангу, чесні (rep-cap + staleness + режим повернення); травмований м'яз можна позначити, і recovery його виключає; 5 подій телеметрії дають дані для наступного аудиту. Платформа — **PWA на телефоні в залі** (mobile Expo не чіпаємо).

## Рішення з інтерв'ю (зафіксовані)

1. **Старт = 2 шляхи.** На сторінці «Тренування» старт має рівно два входи: Quick Start (порожнє тренування) і шаблон. Сторінка «Програми» (`Programs.tsx`) **лишається як є** (перегляд/редагування/активація), але перестає бути старт-точкою на «Тренуваннях» — кнопка/CTA «Програми» зі старт-флоу Workouts прибирається (у nav модуля програми доступні). Програма веде до шаблону, не до окремого входу. План лишається deep-link-ом у routine (`onOpenRoutine`) — не чіпати.
2. **Активне тренування — route.** Нова сторінка `workout` у `FIZRUK_PAGES` з deep-link сегментом `workout/<id>` (той самий механізм, що `exercise/<id>` — див. `onNavigate` у `FizrukRouter.tsx`). **Одне активне тренування на користувача:** refresh повністю відновлює стан; банер «Продовжити тренування» на всіх fizruk-сторінках, поки є активне; старт нового при живому активному — явний діалог «завершити старе / викинути». 1.5с-поллінг у `useActiveFizrukWorkout.ts` видаляється — заміна на підписку на існуючі sqlite-tick/storage-події.
3. **Rest-таймер:** (а) неблокуючий — компактний pill замість overlay, можна далі гортати й редагувати сети; (б) авто-старт після залогованого сету; (в) швидка зміна тривалості ±15/30 с прямо на pill + дефолт per-вправа (розширити наявний `restSettings.ts`). Notifications/спрацювання при вимкненому екрані — **не** в цій спеці.
4. **Safety — повний пакет** (напруги 3, 4 і E-1 аудиту):
   - **Rep-cap e1RM:** в оцінку `best1rm` входять лише сети ≤10 повторів (формули rep-max статистично невалідні вище). Точка зміни — `epley1rm`/агрегація в `workoutStats.ts` і всі споживачі.
   - **Staleness:** `best1rm` носить дату досягнення; якщо старша за 4 тижні — LoadCalculator показує бейдж «оцінка застаріла» і не пропонує % від піка як основну цифру.
   - **PR-регрес / режим повернення:** після ≥3 тижнів без конкретної вправи вона входить у «режим повернення» — LoadCalculator дає знижені орієнтири, порівняння з піком і PR-celebration приглушені, доки не з'явиться свіжий результат.
   - **Модель травми:** позначка болю ставиться (а) опційним кроком у фініш-флоу (`WorkoutFinishSheets.tsx` — «щось болить?» з вибором м'язової групи з 18 канонічних груп `bodyAtlas`) і (б) керується (перегляд/зняття) на сторінці Body. Позначений м'яз: `hasHardBlock` з `recoveryConflict.ts` нарешті під'єднується до UI; recovery виключає м'яз із порад **до ручного зняття**; Quick Start / додавання вправи на заблокований м'яз показує жорстке застереження (не блокує дію). **Жодних медичних порад** — тільки «ти позначив біль, ми не радимо це навантажувати».
5. **Телеметрія:** 5 подій через наявний transport (`core/observability/posthog.ts`, ring-buffer `window.__hubAnalytics`): `fizruk_workout_started` (`source: quick_start|template|resume`), `fizruk_workout_finished` (тривалість, кількість сетів/вправ), `fizruk_workout_discarded`, `fizruk_rest_timer_done` (`completed|skipped`), `fizruk_injury_marked` / `fizruk_injury_cleared`.

## Torкнута поверхня (шляхи перевірені)

**Web (`apps/web/src/modules/fizruk/`):**

- `shell/fizrukRoute.ts` — +`"workout"` у `FIZRUK_PAGES`; `shell/FizrukRouter.tsx` — новий lazy chunk + `PAGE_ERROR_TITLES`.
- `pages/Workouts.tsx`, `hooks/useWorkoutsOrchestrator.ts`, `hooks/useWorkoutsLifecycle.ts` — view `log` замінюється навігацією на route; sessionStorage-ключ `fizruk_workouts_mode` («log»-гілка) чиститься.
- `components/workouts/`: `ActiveWorkoutPanel.tsx` (стає тілом нової сторінки), `WorkoutJournalSection.tsx` (журнал/фініш), `WorkoutsHome.tsx` (2 CTA старту, банер «Продовжити»), `QuickStartSheet.tsx`, `WorkoutFinishSheets.tsx` (+крок болю), `RestTimerOverlay.tsx`/`RestTimerOverlayConnected.tsx` (→ pill), `WorkoutItemCard.tsx` (авто-старт таймера після сету).
- `context/RestTimerProvider.tsx` — авто-старт, ±15/30 с.
- `apps/web/src/shared/hooks/useActiveFizrukWorkout.ts` — прибрати поллінг, лишити LS-вказівник `fizruk_active_workout_id_v1` + подієву інвалідацію.
- `pages/Exercise.tsx` (`best1rm`, `isNewPR`, LoadCalculator), `pages/Body.tsx` (керування травмами).

**Домен (`packages/fizruk-domain/src/`):**

- `lib/workoutStats.ts` (+тести) — rep-cap; `domain/dashboard/topPRs.ts`, `domain/progress/progressKpis.ts`, `domain/workouts/exerciseDetail.ts` — споживачі best1rm (staleness/повернення).
- `lib/recoveryCompute.ts`, `lib/recoveryConflict.ts` (+тести) — виключення м'язів за травмою.
- `lib/restSettings.ts` — per-вправа дефолт.

**Дані (нова сутність — найважчий шматок):**

- Нова таблиця `fizruk_injuries` (id, user_id, muscle_group, noted_at, cleared_at NULL) — SQLite-схема + PG-дзеркало в `packages/db-schema/src/pg/fizruk.ts`; міграція `apps/server/src/migrations/094_fizruk_injuries.sql` (наступний вільний номер після 093; Hard Rule #4 — additive, без DROP).
- Dual-write: `apps/web/src/modules/fizruk/lib/sqliteWriter/adapter.ts` + server-sync `apps/server/src/modules/sync/fizruk/applySync.ts` / `applySyncFullState.ts`. Якщо контракт sync-тіла змінюється — тріплет Hard Rule #3 (server ↔ `packages/api-client` ↔ contract-test) в одному PR. Bigint → number у серіалізаторах (Hard Rule #1).

**Доки:** канон `docs/01-product/model/fizruk.md` §5 (безпека поради), §6 (регрес/повернення), §3 (сутності — травма) оновлюються **в тих самих PR**, що змінюють поведінку (Hard Rule #15).

## Порядок виконання (рекомендовані PR)

1. `feat(web)`: активне тренування як route + одне-активне-інваріант + банер + видалення поллінгу.
2. `feat(web)`: rest-таймер (pill, авто-старт, ±15/30 с, per-вправа дефолт).
3. `feat(web)`: старт = 2 шляхи (чистка WorkoutsHome; Програми — не старт-точка).
4. `feat(fizruk-domain)`: чесна 1RM — rep-cap + staleness + режим повернення (+ канон §6).
5. `feat(migrations+server+web)`: модель травми end-to-end (+ канон §3/§5).
6. `feat(web)`: телеметрія (5 подій) — можна злити з PR 1–5 по місцю.

## Поза скоупом (явно)

- Mobile Expo (`apps/mobile*`) — платформа зараз тільки PWA.
- Notifications / фоновий rest-таймер при вимкненому екрані; wake lock.
- Видалення/злиття сторінки «Програми», перенос `FizrukDayPlanSheet` з routine (напруга 5), фікс стріку (напруга 1), похвала об'єму в digest/coach (напруга 2), індикатор свіжості репліки (E-2), RPE у recovery (E-3) — окремий беклог.
- Two-phase DROP таблиць програм; будь-які зміни `fizruk_programs`.
- Медичні поради будь-якого роду.

## Верифікація (обов'язкова, end-to-end)

**Команди:**

```bash
pnpm --filter @sergeant/db-schema build
pnpm --filter @sergeant/fizruk-domain test   # нові тести: rep-cap, staleness, режим повернення, виключення м'яза
pnpm --filter @sergeant/web test
pnpm check                                    # повна матриця перед PR
```

**Клік-скрипт на `pnpm dev:db && pnpm dev:server && pnpm dev:web` (http://localhost:5173, мобільний viewport):**

1. Fizruk → «Тренування»: на екрані рівно два шляхи старту (Quick Start, шаблон); входу «Програми» у старт-флоу немає.
2. Quick Start → додати вправу → залогувати сет → rest-таймер **стартує сам** як pill; під час відліку можна редагувати сети; ±15 с на pill працює.
3. URL містить `workout/<id>`. **F5** → тренування повністю відновлене (вправи, сети, таймер не зомбі).
4. Перейти на Dashboard → банер «Продовжити тренування» видно; тап повертає в активне.
5. Спробувати стартувати нове при активному → діалог «завершити старе / викинути».
6. У вправі з історією лише високоповторних сетів (15–20 повт.) — `best1rm` **не** роздутий (rep-cap); у вправі без свіжих результатів — бейдж застарілості в LoadCalculator, PR-celebration приглушений.
7. Фініш → wellbeing-флоу → позначити біль (напр., «поперек») → на Body видно позначку; recovery-поради більше не пропонують цей м'яз; Quick Start з вправою на нього показує застереження. Зняти позначку на Body → поради повертаються.
8. У консолі `window.__hubAnalytics` — події `fizruk_workout_started{source}`, `fizruk_rest_timer_done`, `fizruk_workout_finished`, `fizruk_injury_marked/cleared` (PostHog network вимкнений без `VITE_POSTHOG_KEY` — ring-buffer детермінований).

**E2E:** +1 smoke-тест `apps/web/tests/smoke/` з `@critical`: старт → сет → refresh → resume → фініш (правила — `apps/web/AGENTS.md § E2E smoke`).
