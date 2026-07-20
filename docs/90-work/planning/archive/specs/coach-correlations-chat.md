# SPEC: Проактивні coach-кореляції в чаті + розширення метрик-пар

> **Last touched:** 2026-07-20 by @cursoragent. **Next review:** ніколи (read-only архів).
> **Status:** Archived (read-only). Fast-forward archived 2026-07-20 (90-day gate skipped за рішенням founder-а). Source: `docs/90-work/planning/specs/coach-correlations-chat.md`. Purpose: `getCoachCorrelationsBlock` у chat + PAIRS 4→9 у `digestCorrelations.ts` shipped; RAG-boost лишився deferred як у спеки.

<!-- Самодостатня спека. Ground truth зібрано code-розвідкою 2026-07-20 —
переважна частина «розумного чату» ВЖЕ в проді; ця спека закриває вужчу
залишкову діру. -->

## Проблема

Наш AI-чат уже має крос-сесійну пам'ять і рахує кореляції між метриками
користувача (сон, витрати, тренування, калорії тощо) — але ці інсайти живуть
лише в тижневому дайджесті. У живій розмові (`/api/chat`) асистент їх не
бачить, тож не може проактивно сказати «твої витрати ростуть у тижні з меншим
обсягом тренувань». Цінний, вже-обчислений сигнал не доходить до головної
поверхні спілкування.

## Мета

Коли готово: у звичайній чат-розмові асистент має доступ до останніх
обчислених кореляцій і може на них посилатися без окремого запиту в дайджест;
набір метрик-пар ширший за поточні чотири. Перевірка: у чаті питаєш «є якісь
закономірності в моїх даних?» — відповідь спирається на персистовані
`correlations`, а не рахує з нуля й не мовчить.

## Рішення дизайну

- Обсяг «ширше» (за рішенням користувача), АЛЕ ground truth змінив зміст:
  пам'ять чату й обчислення кореляцій вже існують — не будуємо їх наново.
  «Ширше» = (а) проактивне surfacing наявних кореляцій у `/api/chat`, (б)
  розширення списку метрик-пар, (в) опційне підсилення RAG-пам'яті.
- Surfacing без нового обчислення. Найменший реальний приріст: інжектити
  `coach_memory.weeklyDigests[-1].correlations` у системний промпт першого
  turn чату (як memory-блок). `dailySeries.ts` / `digestCorrelations.ts`
  переюзаються as-is — нової математики не пишемо.
- Розширення пар — керовано. Поточний `PAIRS` (4 пари) розширюємо
  curated-списком, не «всі проти всіх» (уникаємо p-hacking на малих `n`).
  Поріг лишається `|r|≥0.4`, `n≥5`.
- Пам'ять уже крос-сесійна — `buildRagContext()` + pgvector `ai_memories` +
  `coach_memory`. Якщо RAG-якість достатня, пункт (в) можна відкласти;
  спершу довести (а)+(б).

## Поверхня змін

Owner-скіл: `sergeant-server-api` (chat/coach модулі, system-prompt
assembly); дотичне `sergeant-web-ui` лише якщо додаємо UI-візуалізацію (поза
скоупом v1).

### Ground truth — що ВЖЕ є (не чіпати як «нове»)

- Чат: `apps/server/src/routes/chat.ts` → `apps/server/src/modules/chat/chat.ts`
  (`handler`), 2 turns (Haiku→Sonnet/tiered).
- Крос-сесійна пам'ять: `apps/server/src/modules/ai-memory/ragContext.ts`
  (`buildRagContext`, pgvector/Voyage), tools `remember`/`recall_memory`/
  `forget`/`my_profile` у `apps/server/src/modules/ai-memory/`.
- `coach_memory` таблиця: `apps/server/src/modules/chat/coach.ts`
  (`getMemory`) — персистить `weeklyDigests[]` + `lastInsightText`,
  читається у майбутні coach-промпти.
- Кореляції: `get_daily_series` (merged, sys-prompt v12) — def
  `apps/server/src/modules/chat/toolDefs/crossModule.ts:105`; executor
  `apps/web/src/core/lib/chatActions/crossActions/dailySeries.ts`
  (`buildDailySeries`, `computePairwiseCorrelations`).
- WP3 дайджест-кореляції: `apps/web/src/core/insights/digestCorrelations.ts`
  (`buildDigestCorrelations`, `PAIRS`), wired у
  `apps/web/src/core/insights/useWeeklyDigest.ts`; персист у
  `WeeklyDigestEntry.correlations`.

### Що реально змінили

- `apps/server/src/modules/chat/coach.ts` — новий exported
  `getCoachCorrelationsBlock(userId)` (fail-safe, ≤3 найсвіжіші дедупльовані
  кореляції з `coach_memory.weeklyDigests`, з freshness-міткою
  `weekRange`/`weekKey`). Спільний dedup-helper `pickRecentCorrelations`
  винесено й переюзано в `buildMemorySummary` (без зміни поведінки там).
- `apps/server/src/modules/chat/chat.ts` — виклик
  `getCoachCorrelationsBlock` на першому турі `/api/chat` (той самий шлях,
  де вже живе RAG-injection), блок мерджиться в `context` до
  `buildRagContext`.
- `apps/web/src/core/insights/digestCorrelations.ts` — `PAIRS` розширено з 4
  до 9 curated пар (додано `wellbeing`, `water`, `workouts` у `METRICS`);
  нові пари додано в КІНЕЦЬ масиву, щоб не зламати existing
  order-залежний unit-тест.

## Поза скоупом v1

- Нова математика кореляцій (Pearson/Spearman вже є).
- Побудова пам'яті чату «з нуля» (вже існує — не переписуємо).
- UI-візуалізація кореляцій у web (окрема design-задача).
- Розширення `PAIRS` до all-pairs матриці (свідомо curated, щоб не ловити
  шум).
- Чіпати `finyk_tx_cache`/`finyk_tx_splits` raw-storage residue
  (документований, не в скоупі).
- Пункт (в) — підсилення RAG-пам'яті — відкладено, (а)+(б) виявились
  достатнім і малим приростом (<2 файли по суті).

## Верифікація

1. Проактивне surfacing: локальний стек (docker pg + `LLM_*=stub` + migrate
   - dev:server/web), акаунт із ≥5 днями даних і згенерованим дайджестом; у
     чаті запит «які в мене закономірності?» — відповідь цитує персистовану
     кореляцію (звірити з `coach_memory.weeklyDigests[-1].correlations` у БД).
     Без дайджесту — асистент чесно каже, що даних замало.
2. Розширені пари: unit-тест на `digestCorrelations.ts` — нові пари
   з'являються в результаті при `|r|≥0.4`/`n≥5` і відсікаються нижче порога.
3. Gate: `pnpm check` зелений.
4. Contract-integrity (Hard Rule #3) — не застосовується: `/api/chat`
   response shape не змінився (блок іде лише всередину `system` prompt-у,
   не в JSON-відповідь), тож api-client/contract-test чіпати не треба.

## Ризики та відкриті питання

- Роздування system-prompt / токен-кост — інжект кореляцій збільшує промпт
  кожного turn. Мітигація: лише top-3 інсайти, коротким рядком
  (`CHAT_CORRELATIONS_MAX = 3`).
- Свіжість — `weeklyDigests[-1]` може бути тижневої давнини; вирішено
  інжектити «станом на `<weekRange>`», щоб асистент не видавав старе за
  поточне.
- Дублювання з RAG — окремий блок від RAG-пам'яті (`ai_memories`); не
  дедуплюється між ними в v1 — низький ризик, бо кореляції — code-generated
  текст, а RAG — сирі user-записи, малоймовірний точний збіг.
- Приватність/redaction — кореляції можуть містити фінансові інсайти в
  system prompt; Pino логує лише `msg`/`userId`/`err` на помилку, не сам
  контент блоку (Hard Rule #21 дотримано).
