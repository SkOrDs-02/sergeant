/**
 * Last validated: 2026-09-17
 * Status: Active
 *
 * Одноразове прибирання залишків демо-режиму, знятого 2026-09-17.
 *
 * Демо сіяло свій payload у localStorage під власним синтетичним
 * користувачем (`demo-local`). Разом із режимом пішли і сідери, і читачі
 * цих ключів — тобто на пристроях тих, хто демо колись відкривав, вони
 * лишились би лежати назавжди, нікому не потрібні.
 *
 * ЧОМУ БЕЗ ВЛАСНОГО ПРАПОРЦЯ «зроблено». Прибирання гейтиться самим
 * демо-прапорцем і стирає його разом з рештою, тож наступний бут виходить
 * на першому ж читанні. Воно самозавершальне за побудовою — окремий
 * прапорець додав би ще один ключ, який колись довелося б прибирати тим
 * самим способом.
 *
 * ЧОМУ ГЕЙТ САМЕ ТАКИЙ, і це несуче. Список нижче містить
 * `hub_onboarding_done_v1`, `hub_first_real_entry_v1` і
 * `finyk_manual_only_v1` — це НЕ демо-дані, а справжній стан користувача.
 * Стирати їх можна рівно тому, що гілка виконується лише коли пристрій
 * СТОЯВ У ДЕМО, а демо обходило автентифікацію: `clearDemoFlag()` знімав
 * прапорець на вході в акаунт, тож демо й реальна сесія не співіснували.
 * Прибрати гейт — означає показати splash-онбординг і банер «Без банку?»
 * усім наявним користувачам. Не послаблюй умову без тесту, який зве
 * функцію на пристрої БЕЗ демо-прапорця і доводить, що вона нічого не
 * чіпає.
 *
 * Рядки SQLite під скоупом `demo-local` свідомо лишаються: після зняття
 * режиму цей скоуп ніхто не читає, тож вони невидимі, а скоупований
 * DELETE був би окремою міграцією заради невидимих даних (рішення
 * власника 2026-09-17).
 */

import { safeReadStringLS, safeRemoveLS } from "@shared/lib/storage/storage";

/**
 * Прапорець демо. Значення дублюється літералом навмисно — модуль
 * констант `seedDemoData/keys.ts` пішов разом із режимом, а прибирання
 * мусить пережити його видалення.
 */
const DEMO_FLAG_KEY = "hub_demo_seeded_social_v1";

/**
 * Усе, що писав демо-сідер, плюс два його власні службові прапорці
 * (`hub_demo_cleanup_v1_done` від прибиральника попереднього покоління
 * демо і `hub_demo_banner_dismissed_v1` від його банера).
 */
const DEMO_OWNED_KEYS: readonly string[] = [
  DEMO_FLAG_KEY,
  "hub_demo_cleanup_v1_done",
  "hub_demo_banner_dismissed_v1",
  "hub_demo_seeded_v1",
  "hub_onboarding_done_v1",
  "hub_first_real_entry_v1",
  "finyk_manual_only_v1",
  "finyk_manual_expenses_v1",
  "finyk_assets",
  "finyk_custom_cats_v1",
  "finyk_monthly_plan",
  "finyk_tx_cache",
  "finyk_tx_cache_last_good",
  "fizruk_workouts_v1",
  "fizruk_measurements_v1", // gitleaks:allow
  "fizruk_workout_templates_v1",
  "hub_routine_v1",
  "nutrition_log_v1",
  "nutrition_prefs_v1", // gitleaks:allow
  "nutrition_water_v1",
  "finyk_quick_stats",
  "fizruk_quick_stats",
  "routine_quick_stats",
  "nutrition_quick_stats",
  "finyk_checklist_v1",
  "fizruk_checklist_v1",
  "routine_checklist_v1",
  "nutrition_checklist_v1",
];

/**
 * Прибрати демо-payload, якщо пристрій стояв у демо-режимі. Безпечно
 * кликати на кожному буті: на не-демо пристрої це одне читання рядка.
 */
export function cleanupDemoLeftoversOnce(): void {
  if (safeReadStringLS(DEMO_FLAG_KEY) !== "1") return;
  for (const key of DEMO_OWNED_KEYS) safeRemoveLS(key);
}
