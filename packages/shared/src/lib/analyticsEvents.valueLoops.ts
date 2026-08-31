/**
 * Хвиля 2 — канонічні імена подій «петель цінності»
 * («сигнал показано → дію зроблено»).
 *
 * Джерело: `docs/90-work/planning/product-knowledge-backlog.md` § Хвиля 2.
 *
 * Живе окремим модулем від `analyticsEvents.ts` виключно заради
 * module-size-дисципліни (Hard Rule #18) — реєстр лишається один:
 * група спредиться у `ANALYTICS_EVENTS`, тож публічний доступ
 * `ANALYTICS_EVENTS.VALUE_SIGNAL_SHOWN` не змінюється. НЕ додавай сюди
 * транспорт, хелпери чи типи payload-у: тут тільки рядкові константи
 * і їхні контракти в коментарях.
 */
export const VALUE_LOOP_ANALYTICS_EVENTS = Object.freeze({
  // Увесь іменний контракт хвилі заморожено ОДНИМ патчем ДО того, як
  // інструментовано хоч один callsite. Причина: `analyticsEvents.test.ts`
  // пінить ці рядки verbatim, а `.telemetry/tracking-plan.yaml`
  // (§ naming_convention) прямо фіксує, що ренейм ламає дашборди й губить
  // історію. Дешево написати — дорого переписати.
  //
  // ── 1) Продуктовий сигнал: показ / активація / dismiss ─────────────
  //
  //   VALUE_SIGNAL_SHOWN     { module: DashboardModuleId,
  //                            signal: string,
  //                            surface: "module" | "hub" }
  //   VALUE_SIGNAL_ACTIVATED { module, signal, surface }
  //   VALUE_SIGNAL_DISMISSED { module, signal, surface }
  //   VALUE_SIGNAL_ASK_AI    { module, signal, surface } — чип «Спитати AI»
  //     на InsightCard (insights-ask-ai-chip): відкриває HubChat із
  //     префілом `Insight.askAiPrompt`. Не замінює ACTIVATED — тіло картки
  //     (навігація в модуль) і чип — дві різні дії користувача.
  //
  // Модуль і вид сигналу їдуть property-полями (конвенція
  // `cross_module_preview_*` / `daily_nudge_action`), а не в імені події —
  // інакше кожен новий сигнал плодив би власний дашборд.
  //
  // `signal` — СТАБІЛЬНИЙ kind БЕЗ змінного суфікса:
  // `finyk-budget-overrun` (а НЕ `finyk-budget-overrun-<categoryId>`),
  // `finyk-coffee-limit` (а НЕ `…-<YYYY-MM>`), `nutrition-streak-7-days`
  // (а НЕ `…-<weekKey>`). Сирий insight id у payload НЕ кладеться ніколи:
  // по-перше це high-cardinality property у PostHog, по-друге
  // `categoryId` кастомної категорії — potential PII.
  VALUE_SIGNAL_SHOWN: "value_signal_shown",
  VALUE_SIGNAL_ACTIVATED: "value_signal_activated",
  VALUE_SIGNAL_DISMISSED: "value_signal_dismissed",
  VALUE_SIGNAL_ASK_AI: "value_signal_ask_ai",

  // ── 2) Друга половина петлі: «дію зроблено» ────────────────────────
  //
  // Чотири іменовані події, а не один `loop_action_done` з
  // дискримінатором: кожна несе власні доменні поля і має власну точку
  // емісії, тож спільне імʼя лише змішало б різні знаменники.
  //
  // СПІЛЬНІ поля атрибуції в УСІХ чотирьох:
  //
  //   after_signal:    boolean        — чи передував дії показ сигналу
  //   ms_since_signal: number | null  — сирий інтервал; null коли показу не було
  //   signal:          string | null  — який саме стабільний kind (див. §1)
  //
  // КРИТИЧНО: обчисленого булеана «дія протягом N» тут НЕМАЄ і не буде.
  // Емітимо сирий `ms_since_signal`; вікно N обирається у PostHog-запиті,
  // тож його можна переглянути заднім числом, не переливаючи бандл, і
  // питання «яке N» перестає бути блокером коду.
  //
  //   ROUTINE_HABIT_CHECKED   { state: "done" | "undone",
  //                             source: "ui" | "bulk" | "chat",
  //                             saw_streak_surface: string | null,
  //                             streak_days_at_checkin: number | null,
  //                             ms_since_streak_shown: number | null,
  //                             scope: "max_across_habits",
  //                             after_signal, ms_since_signal, signal }
  //   FIZRUK_WORKOUT_FINISHED { after_signal, ms_since_signal, signal }
  //   NUTRITION_MEAL_LOGGED   { after_signal, ms_since_signal, signal }
  //   FINYK_TX_CATEGORIZED    { after_signal, ms_since_signal, signal }
  //
  // `scope: "max_across_habits"` у ROUTINE_HABIT_CHECKED обовʼязкове:
  // стрік, який бачить користувач, — це `derived.streakMax` (максимум по
  // всіх звичках), а чекін — per-habit. Без цього поля аналіз збреше,
  // нібито показаний стрік належить саме відміченій звичці.
  //
  // `source: "bulk" | "chat"` НЕ є мотивованим чекіном — виключається зі
  // знаменника петлі на боці дашборда, а не на боці коду.
  ROUTINE_HABIT_CHECKED: "routine_habit_checked",
  FIZRUK_WORKOUT_STARTED: "fizruk_workout_started",
  FIZRUK_WORKOUT_FINISHED: "fizruk_workout_finished",
  FIZRUK_WORKOUT_DISCARDED: "fizruk_workout_discarded",
  FIZRUK_REST_TIMER_DONE: "fizruk_rest_timer_done",
  FIZRUK_INJURY_MARKED: "fizruk_injury_marked",
  FIZRUK_INJURY_CLEARED: "fizruk_injury_cleared",
  NUTRITION_MEAL_LOGGED: "nutrition_meal_logged",
  FINYK_TX_CATEGORIZED: "finyk_tx_categorized",

  // ── 3) AI-порада: показ + реакція ──────────────────────────────────
  //
  //   AI_ADVICE_SHOWN   { advice_id: string,
  //                       source: "coach_insight" | "weekly_digest",
  //                       surface: string,
  //                       day_key: string,   — YYYY-MM-DD, день ПРИСТРОЮ (ADR-0078)
  //                       chars: number,
  //                       instrumentation_version: number }
  //   AI_ADVICE_REACTED { advice_id: string,
  //                       reaction: "ask_ai" | "refresh" | "collapse" | "expand",
  //                       seconds_since_shown: number }
  //
  // ТІЛА ПОРАДИ В PAYLOAD НЕ ІСНУЄ — ні як `advice_text`, ні під будь-яким
  // іншим ключем. `scrubPII` (`packages/shared/src/lib/pii.ts`) чистить за
  // ІМЕНАМИ ключів, тож поле з текстом поради він НЕ виріже: захист тут
  // мусить бути контрактом, а не сподіванням на скраб (Hard Rule #21).
  // З тієї ж причини `advice_id` — випадковий uuid, а НЕ хеш тексту: хеш
  // перетворив би подію на приховану сигнатуру змісту.
  //
  // `instrumentation_version` дозволяє відрізати когорту «ще не розкатано»
  // (PWA service-worker тримає старий бандл), а не гадати про знаменник.
  //   AI_ADVICE_FAILED  { source: "coach_insight" | "weekly_digest",
  //                       kind: "http" | "network" | "parse" | "aborted"
  //                             | "unknown",
  //                       status: number | null,
  //                       instrumentation_version: number }
  //
  // `kind` дзеркалить `ApiErrorKind` і `HUBCHAT_ERROR.kind` — один словник
  // збоїв на весь AI-шар. `unknown` покриває не-`ApiError` викиди.
  //
  // Дзеркало `HUBCHAT_ERROR` для двох НЕчатових поверхонь AI-шару. Без неї
  // провал генерації невидимий: `useCoachInsight` тримає помилку всередині
  // React Query, `useWeeklyDigest.generate` ковтає її в `catch { return null }`,
  // і назовні обидва випадки виглядають однаково — просто відсутність
  // `AI_ADVICE_SHOWN`.
  //
  // Чому це критично саме для коуча: у нього Є легітимна тиша — гейт
  // достатності даних (`hub-coach.md` §6.2) навмисно мовчить, поки жоден
  // модуль не дав сигналу. Без цієї події «коуч мовчить, бо нема даних» і
  // «коуч мовчить, бо провайдер віддає 400» — один і той самий нуль на
  // дашборді. Саме цей нуль треба вміти розрізняти під час бети.
  //
  // Тіла помилки тут немає — лише `kind` + `status`. Текст провайдера може
  // містити фрагмент промпту, тобто дані користувача (Hard Rule #21).
  AI_ADVICE_SHOWN: "ai_advice_shown",
  AI_ADVICE_REACTED: "ai_advice_reacted",
  AI_ADVICE_FAILED: "ai_advice_failed",

  // ── 4) Експозиція стріку ПОЗА InsightCard ──────────────────────────
  //
  //   ROUTINE_STREAK_SHOWN { surface: "hero_flame" | "stats_pill" | "hub_badge",
  //                          streak_days: number,
  //                          scope: "max_across_habits" }
  //
  // МЕЖА (не порушувати): показ стріку через streak-record-карточку вже
  // покривається `VALUE_SIGNAL_SHOWN` — вона рендериться через
  // `InsightCard`. `ROUTINE_STREAK_SHOWN` призначена ВИКЛЮЧНО для
  // поверхонь, які НЕ є InsightCard (полумʼя героя, mobile stats-pill,
  // хаб-бейдж). Інакше покази подвояться і конверсія петлі впаде вдвічі
  // на рівному місці.
  //
  // Експозиція між платформами РІЗНА: web ховає полумʼя при `streak = 0`,
  // mobile показує «0 дн.» безумовно. Тому крос-платформна агрегація
  // робиться лише з розрізом по `surface`.
  ROUTINE_STREAK_SHOWN: "routine_streak_shown",

  // ── 5) Стабільний крос-девайсний advice_id (беtа-хардненінг, рішення
  // founder-а) ─────────────────────────────────────────────────────────
  //
  // Доповнює §1 (`VALUE_SIGNAL_*`), а не замінює: ті події навмисно НЕ
  // несуть сирий insight id (high-cardinality + potential PII в
  // кастомній категорії), тож дашборд «скільки унікальних порад
  // згенеровано» побудувати з них не можна. `advice_id` тут —
  // `computeAdviceId(adviceType, canonicalContent)`
  // (`packages/insights/src/adviceId.ts`) — детермінований хеш, тож той
  // самий інсайт на двох пристроях того самого акаунта дає ОДИН і той
  // самий id (на відміну від `ai_advice_shown.advice_id`, який лишається
  // випадковим uuid — окреме, документоване рішення в
  // `apps/web/src/core/observability/adviceTelemetry.ts`, тут НЕ
  // ревізується).
  //
  //   ADVICE_SHOWN     { advice_id: string, advice_type: string,
  //                       module: Module | "hub" }
  //   ADVICE_DISMISSED { advice_id: string, advice_type: string,
  //                       module: Module | "hub" }
  //
  // `advice_type` — стабільний kind (той самий словник, що `signal` у §1:
  // `finyk-budget-overrun`, а НЕ `…-<categoryId>`). `ADVICE_SHOWN` — once
  // per `advice_id` per сесію (той самий page-load `shownOnce`-guard, що
  // й `VALUE_SIGNAL_SHOWN`, — `advice_id` детерміновано з `id`, тож
  // ключ еквівалентний). `ADVICE_DISMISSED` — фактичний dismiss-клік
  // («юзер сховав»), без дедуплікації: кожен dismiss — окремий факт.
  // Обидві емітяться лише коли активна analytics-згода
  // (`getAnalyticsConsent()`,
  // `apps/web/src/core/observability/analyticsConsent.ts`) — «мінімальний
  // зріз» без серверного реєстру унікальних порад.
  ADVICE_SHOWN: "advice_shown",
  ADVICE_DISMISSED: "advice_dismissed",
} as const);
