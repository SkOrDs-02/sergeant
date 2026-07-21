import { FizrukData } from "@sergeant/fizruk-domain";
import { formatMoney, formatMoneyFromKopecks } from "@sergeant/shared";
import { safeReadStringLS } from "@shared/lib/storage/storage";
import { loadRoutineState } from "@routine/lib/routineStorage";
import { getCachedFizrukSqliteState } from "@fizruk/lib/sqliteReader";
import { loadNutritionLog } from "@nutrition/lib/nutritionStorage";
import { getCachedFinykMonoMirrorState } from "@finyk/lib/monoMirrorReader";
import { tokenize } from "../hubSearchEngine";
import { searchActions, searchAiHandoff } from "./searchActions";
import { safeParseLS, scoreLru } from "./searchCache";
import { searchAssistantTools, searchSettings } from "./searchSettings";
import { type Hit, localDateKey, pushScored } from "./searchTypes";

interface FinykTx {
  id?: string;
  time?: number;
  amount?: number;
  description?: string;
  comment?: string;
}

interface FinykSub {
  id?: string;
  name?: string;
  amount?: number;
}

function searchFinyk(tokens: string[]): Hit[] {
  const results: Hit[] = [];

  const txList = getCachedFinykMonoMirrorState().transactions as FinykTx[];
  if (Array.isArray(txList)) {
    for (const tx of txList) {
      if (!tx || typeof tx !== "object") continue;
      const amtRaw = Number(tx.amount);
      const amount = (Number.isFinite(amtRaw) ? amtRaw : 0) / 100;
      const time = tx.time ?? 0;
      const stop = pushScored(
        results,
        {
          id: `finyk_tx_${tx.id || time}`,
          module: "finyk",
          moduleLabel: "Фінік",
          title: tx.description || tx.comment || "Транзакція",
          subtitle: `${formatMoney(amount, { signed: true, maxFractionDigits: 2 })} · ${time > 1e10 ? localDateKey(new Date(time)) : localDateKey(new Date(time * 1000))}`,
          icon: "credit-card",
          target: { kind: "module", moduleId: "finyk" },
        },
        tokens,
        20,
      );
      if (stop) break;
    }
  }

  // Hub search reads the finyk_subs LS shard; STORAGE_KEYS.FINYK_* is banned
  // outside module wrappers by the no-restricted-syntax retirement guard.
  // eslint-disable-next-line sergeant-design/no-raw-storage-key -- intentional LS-shard read; STORAGE_KEYS.FINYK_* banned in hub/search (retirement guard)
  const subs = safeParseLS<FinykSub[]>("finyk_subs", []);
  if (Array.isArray(subs)) {
    for (const s of subs) {
      if (!s || typeof s !== "object") continue;
      const amtRaw = Number(s.amount);
      const amt = Number.isFinite(amtRaw) && amtRaw > 0 ? amtRaw : 0;
      pushScored(
        results,
        {
          id: `finyk_sub_${s.id}`,
          module: "finyk",
          moduleLabel: "Фінік",
          title: s.name || "Підписка",
          subtitle: `Підписка · ${amt ? formatMoneyFromKopecks(amt) : ""}`,
          icon: "refresh-cw",
          target: { kind: "module", moduleId: "finyk" },
        },
        tokens,
        25,
      );
    }
  }

  return results.sort((a, b) => b._score - a._score).slice(0, 10);
}

function searchFizruk(tokens: string[]): Hit[] {
  const results: Hit[] = [];

  // Built-in catalogue from `@sergeant/fizruk-domain` — користувач шукав
  // «жим» (Жим лежачи) і не знаходив, бо раніше ми проходили лише по
  // `fizruk_custom_exercises_v1` (порожньому до першої кастомної вправи)
  // та по логах тренувань. Тепер проганяємо ще й вбудований каталог,
  // щоб глобальний пошук відповідав тому, що показує `useExerciseCatalog`
  // у Фізрука. Беремо невеликий ліміт, бо це не основний фокус —
  // користувацькі вправи + тренування мають пріоритет вище.
  for (const ex of FizrukData.EXERCISES) {
    if (!ex || typeof ex !== "object") continue;
    const nameUk = ex.name?.uk;
    if (!nameUk) continue;
    const groupUk =
      (ex.primaryGroup &&
        FizrukData.PRIMARY_GROUPS_UK[ex.primaryGroup as string]) ||
      ex.primaryGroupUk ||
      ex.primaryGroup ||
      "";
    const aliases = Array.isArray(ex.aliases) ? ex.aliases.join(" ") : "";
    const stop = pushScored(
      results,
      {
        id: `fizruk_cat_${ex.id}`,
        module: "fizruk",
        moduleLabel: "Фізрук",
        title: nameUk,
        // subtitle включає aliases та англійську назву — щоб scoreMatch
        // ловив запит «bench», «жим лежа» тощо. Перед рендером ми
        // повертаємо короткий subtitle (lookup по id у мапі нижче).
        subtitle: `${groupUk} · ${ex.name?.en ?? ""} ${aliases}`.trim(),
        icon: "dumbbell",
        target: { kind: "module", moduleId: "fizruk" },
      },
      tokens,
      8,
    );
    if (stop) break;
  }
  // Заміняємо subtitle на коротку версію (без aliases) перед рендером —
  // довгий список синонімів був корисний для скорінгу, але в UI хочеться
  // лише примарну м'язову групу.
  for (const r of results) {
    const ex = FizrukData.EXERCISES.find((e) => `fizruk_cat_${e?.id}` === r.id);
    if (!ex) continue;
    const groupUk =
      (ex.primaryGroup &&
        FizrukData.PRIMARY_GROUPS_UK[ex.primaryGroup as string]) ||
      ex.primaryGroupUk ||
      ex.primaryGroup ||
      "Вправа";
    r.subtitle = `${groupUk} · з каталогу Фізрука`;
  }

  // `fizruk_workouts_v1` / `fizruk_custom_exercises_v1` are tombstoned — read
  // the canonical SQLite warm cache.
  const fizrukCache = getCachedFizrukSqliteState();
  const workouts = fizrukCache.refreshedAt === null ? [] : fizrukCache.workouts;
  for (const w of workouts) {
    const itemsRaw = w.items;
    const exNames = itemsRaw
      .slice(0, 2)
      .map((i) => i.nameUk)
      .filter(Boolean);
    const dateLabel = w.startedAt ? localDateKey(new Date(w.startedAt)) : "";
    const combinedTitle = w.note || exNames.join(", ") || "Тренування";
    // subtitle додатково "розширює" текст усіма вправами, щоб токен
    // типу "присідання" знайшовся навіть коли він не в `note`.
    const fullTokensText = itemsRaw
      .map((i) => i.nameUk)
      .filter(Boolean)
      .join(" ");
    const stop = pushScored(
      results,
      {
        id: `fizruk_w_${w.id}`,
        module: "fizruk",
        moduleLabel: "Фізрук",
        title: combinedTitle,
        subtitle:
          dateLabel +
          (itemsRaw.length
            ? ` · ${itemsRaw.length} вправ · ${fullTokensText}`
            : ""),
        icon: "dumbbell",
        target: { kind: "module", moduleId: "fizruk" },
      },
      tokens,
      10,
    );
    if (stop) break;
  }

  const customExercises =
    fizrukCache.refreshedAt === null ? [] : fizrukCache.customExercises;
  for (const e of customExercises) {
    const groupUk =
      (e.primaryGroup &&
        FizrukData.PRIMARY_GROUPS_UK[e.primaryGroup as string]) ||
      e.primaryGroupUk ||
      e.primaryGroup ||
      "Власна вправа";
    const stop = pushScored(
      results,
      {
        id: `fizruk_ex_${e.id}`,
        module: "fizruk",
        moduleLabel: "Фізрук",
        title: e.name?.uk || "Вправа",
        subtitle: groupUk,
        icon: "dumbbell",
        target: { kind: "module", moduleId: "fizruk" },
      },
      tokens,
      15,
    );
    if (stop) break;
  }

  return results.sort((a, b) => b._score - a._score).slice(0, 10);
}

function searchRoutine(tokens: string[]): Hit[] {
  const results: Hit[] = [];
  // `hub_routine_v1` is tombstoned — read the canonical SQLite warm cache.
  const habits = loadRoutineState().habits;
  for (const h of habits) {
    const title = `${h.emoji || ""} ${h.name || "Звичка"}`.trim();
    const stop = pushScored(
      results,
      {
        id: `routine_h_${h.id}`,
        module: "routine",
        moduleLabel: "Рутина",
        title,
        subtitle: h.archived ? "Архівовано" : h.recurrence || "daily",
        icon: "check-circle",
        target: { kind: "module", moduleId: "routine" },
      },
      tokens,
      10,
    );
    if (stop) break;
  }
  return results.sort((a, b) => b._score - a._score).slice(0, 10);
}

function searchNutrition(tokens: string[]): Hit[] {
  const results: Hit[] = [];
  const seen = new Set<string>();
  // `nutrition_log_v1` is tombstoned — read the canonical SQLite warm cache.
  const log = loadNutritionLog();
  const dates = Object.keys(log).sort().reverse();

  for (const date of dates) {
    const dayLog = log[date];
    const meals = Array.isArray(dayLog?.meals) ? dayLog.meals : [];
    for (const m of meals) {
      if (!m || typeof m !== "object") continue;
      const key = m.name || `${date}_${m.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const stop = pushScored(
        results,
        {
          id: `nutrition_m_${m.id || date}`,
          module: "nutrition",
          moduleLabel: "Їжа",
          title: m.name || "Прийом їжі",
          subtitle: `${date} · ${m.macros?.kcal ?? 0} ккал`,
          icon: "utensils",
          target: { kind: "module", moduleId: "nutrition" },
        },
        tokens,
        10,
      );
      if (stop) break;
    }
    if (results.length >= 10) break;
  }
  return results.sort((a, b) => b._score - a._score).slice(0, 10);
}

/**
 * Build a cheap snapshot key that changes whenever the user's stored data
 * changes. We concatenate the raw string lengths (not full strings — avoids
 * hashing MBs of JSON) for the four scored sources. A length change always
 * means a content change; same-length edits (e.g. rename a habit) are rare
 * enough that a stale hit for one keystroke is acceptable.
 */
function storageSnapshot(): string {
  // finyk_* are still LS-backed; routine / fizruk / nutrition moved to the
  // SQLite warm caches (their `*_v1` LS keys are tombstoned). Build the cache
  // half from the canonical readers so the LRU still invalidates when that
  // data changes (counts + ids + habit/meal names catch add/remove/rename).
  // finyk_tx_cache is now tombstoned — derive change-signal from the mirror cache
  // (same semantics: length change + prefix/suffix fingerprint).
  const mirrorTxs = getCachedFinykMonoMirrorState().transactions;
  const mirrorSnapshot =
    mirrorTxs.length === 0
      ? "0"
      : `${mirrorTxs.length}:${mirrorTxs[0]?.id ?? ""}:${mirrorTxs[mirrorTxs.length - 1]?.id ?? ""}`;
  const lsParts = [
    mirrorSnapshot,
    ...["finyk_subs"].map((k) => {
      const v = safeReadStringLS(k);
      return v === null ? "0" : `${v.length}:${v.slice(0, 24)}:${v.slice(-24)}`;
    }),
  ];
  const routine = loadRoutineState();
  const fizruk = getCachedFizrukSqliteState();
  const nutrition = loadNutritionLog();
  const fizrukWarm = fizruk.refreshedAt !== null;
  const cacheParts = [
    `r:${routine.habits.map((h) => `${h.id}${h.name ?? ""}`).join("|")}`,
    `w:${fizrukWarm ? fizruk.workouts.map((w) => w.id).join("|") : ""}`,
    `x:${fizrukWarm ? fizruk.customExercises.map((e) => e.id).join("|") : ""}`,
    `n:${Object.entries(nutrition)
      .map(([d, day]) => `${d}#${day.meals?.length ?? 0}`)
      .join("|")}`,
  ];
  return [...lsParts, ...cacheParts].join(",");
}

export function performSearch(query: string): Hit[] {
  const tokens = tokenize(query);
  // Empty query: launcher landing — only the four quick-add Actions so the
  // palette doubles as a Spotlight-style command bar (no FAB lookup needed).
  if (tokens.length === 0) return searchActions(tokens);

  // LRU(16) hit: same query + same storage snapshot → return cached results.
  const snapshot = storageSnapshot();
  const lruKey = `${query}\x00${snapshot}`;
  const cached = scoreLru.get(lruKey);
  if (cached !== undefined) return cached as Hit[];

  // Order matters for the rendered groups (see `flat`/`grouped` below).
  // Actions surface first so command-style queries («витрата», «trening»)
  // land on a do-it row before stale data; module hits follow because the
  // user may be chasing concrete records; settings + AI capabilities are
  // the «what can I do?» tail; AI handoff sits at the very end as the
  // graceful-degradation fallback when nothing structured matched.
  const results: Hit[] = [
    ...searchActions(tokens),
    ...searchFinyk(tokens),
    ...searchFizruk(tokens),
    ...searchRoutine(tokens),
    ...searchNutrition(tokens),
    ...searchSettings(tokens),
    ...searchAssistantTools(tokens),
    ...searchAiHandoff(query),
  ];
  scoreLru.set(lruKey, results);
  return results;
}
