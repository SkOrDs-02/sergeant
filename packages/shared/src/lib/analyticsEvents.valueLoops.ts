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

  // ── 2) Друга половина петлі: «дію зроблено» ────────────────────────
  //
  // Чотири іменовані події, а не один `loop_action_done` з
  // дискримінатором: кожна несе власні доменні поля і має власну точку
  // емісії, тож спільне ім'я лише змішало б різні знаменники.
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
  FIZRUK_WORKOUT_FINISHED: "fizruk_workout_finished",
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
  AI_ADVICE_SHOWN: "ai_advice_shown",
  AI_ADVICE_REACTED: "ai_advice_reacted",

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
} as const);
