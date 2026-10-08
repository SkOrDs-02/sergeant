/**
 * Резолв назви вправи з чату в справжній `exerciseId` (data-11).
 *
 * AI-DANGER: `log_set` / `plan_workout` будували `WorkoutItem` з
 * `exerciseId: ""`. Адаптер слав `exercise_id = ""`, сервер відповідав
 * `rejected / missing_exercise_id`, а підходи далі падали на FK
 * `workout_item_id`: тренування, записане голосом чи текстом, жило лише в
 * локальній SQLite одного пристрою. Порожній `exercise_id` не слати ніколи.
 *
 * Порядок, як у UI (каталог = користувацькі вправи з кешу SQLite + вбудований
 * каталог, `FizrukData.mergeExerciseCatalog`; пошук = `FizrukData.searchExercises`):
 *   1. точний збіг назви/аліасу (uk, en) — беремо цю вправу;
 *   2. єдиний кандидат, у чиїй НАЗВІ/аліасі є запит, — беремо його (без
 *      опису й груп: «жим» не має мовчки ставати першою з двадцяти вправ);
 *   3. інакше створюємо custom-вправу тим самим генератором id, що й
 *      `AddExerciseSheet`, і той самий шлях запису (`triggerFizrukDualWrite`
 *      зі зрізом `customExercises`) — див. `persistFizrukCustomExercises`.
 */
import {
  FizrukData,
  type WorkoutItem,
  type WorkoutSet,
} from "@sergeant/fizruk-domain";
import { foldApostrophes } from "@sergeant/shared";
import { newCustomExerciseId } from "../../../../modules/fizruk/lib/customExerciseId";
import { getCachedFizrukSqliteState } from "../../../../modules/fizruk/lib/sqliteReader";

type RawExerciseDef = FizrukData.RawExerciseDef;

function norm(s: unknown): string {
  return foldApostrophes(
    String(s ?? "")
      .trim()
      .toLowerCase(),
  );
}

function labelsOf(ex: RawExerciseDef): string[] {
  return [ex.name?.uk, ex.name?.en, ...(ex.aliases ?? [])]
    .map(norm)
    .filter(Boolean);
}

export interface ChatExerciseResolver {
  /** Вправа з каталогу/custom, або щойно створена custom-вправа. */
  resolve(name: string): RawExerciseDef;
  /** Створені цим резолвером custom-вправи (ще НЕ записані в базу). */
  readonly created: readonly RawExerciseDef[];
}

/** Користувацькі вправи з прогрітого кешу (холодний кеш = порожньо). */
function cachedCustomExercises(): RawExerciseDef[] {
  const cache = getCachedFizrukSqliteState();
  return cache.refreshedAt === null ? [] : cache.customExercises;
}

/**
 * Реєстр custom-вправ, створених чатом у цій сесії й ще не підтверджених
 * кешем SQLite.
 *
 * AI-DANGER: `executeActions` запускає всі tool calls ходу синхронно, а кеш
 * fizruk оновлюється лише після асинхронного apply. Резолвер на кожен виклик
 * свіжий, тож без спільного реєстру два `log_set` в одному ході з ТІЄЮ САМОЮ
 * невідомою назвою створили б дві різні вправи-дублі (id тепер випадковий
 * `custom_<uuid>`, колізії id немає — data-01, але дубль за назвою лишається).
 * Реєстр додається в пул пошуку: та сама назва перевикористає вправу, інша
 * отримає власний id. Запис живе до підтвердження кешем або `TTL`.
 */
const PENDING_TTL_MS = 2 * 60 * 1000;
const pendingCustom = new Map<string, { def: RawExerciseDef; at: number }>();

function pendingCustomExercises(): RawExerciseDef[] {
  const now = Date.now();
  const confirmed = new Set(cachedCustomExercises().map((ex) => ex.id));
  for (const [id, entry] of pendingCustom) {
    if (confirmed.has(id) || now - entry.at > PENDING_TTL_MS) {
      pendingCustom.delete(id);
    }
  }
  return Array.from(pendingCustom.values(), (entry) => entry.def);
}

/** Лише для тестів: скинути реєстр між кейсами. */
export function __resetPendingChatExercisesForTests(): void {
  pendingCustom.clear();
}

export function createChatExerciseResolver(): ChatExerciseResolver {
  const created: RawExerciseDef[] = [];

  function pool(): RawExerciseDef[] {
    return FizrukData.mergeExerciseCatalog(
      [...created, ...pendingCustomExercises(), ...cachedCustomExercises()],
      FizrukData.EXERCISES,
    );
  }

  /**
   * Вправа з реєстру, яку цей резолвер віддає вперше, теж потрапляє в
   * `created`: екзекутор перезапише її через `persistFizrukCustomExercises`,
   * і item ніколи не посилається на вправу, якої немає в outbox (FK).
   */
  function adopt(ex: RawExerciseDef): RawExerciseDef {
    if (pendingCustom.has(ex.id) && !created.some((c) => c.id === ex.id)) {
      created.push(ex);
    }
    return ex;
  }

  function buildCustom(nameUk: string): RawExerciseDef {
    // id випадковий (`custom_<uuid>`): кілька невідомих назв в одному виклику
    // (`plan_workout`) чи ході не зіллються й не збіжаться з чужим рядком на
    // глобальному PK сервера.
    const id = newCustomExerciseId();
    return {
      id,
      name: { uk: nameUk, en: nameUk },
      primaryGroup: "full_body",
      primaryGroupUk: FizrukData.PRIMARY_GROUPS_UK["full_body"] ?? "full_body",
      muscles: { primary: [], secondary: [] },
      equipment: [],
      equipmentUk: [],
      description: "",
      source: "chat",
      _custom: true,
    };
  }

  return {
    created,
    resolve(rawName: string): RawExerciseDef {
      const name = String(rawName ?? "").trim();
      const q = norm(name);
      const all = pool();

      const exact = all.find((ex) => labelsOf(ex).includes(q));
      if (exact) return adopt(exact);

      const byLabel = FizrukData.searchExercises(name, all).filter((ex) =>
        labelsOf(ex).some((label) => label.includes(q)),
      );
      if (byLabel.length === 1 && byLabel[0]) return adopt(byLabel[0]);

      const custom = buildCustom(name);
      created.push(custom);
      pendingCustom.set(custom.id, { def: custom, at: Date.now() });
      return custom;
    },
  };
}

/**
 * `WorkoutItem` з вправи — той самий набір полів, що кладе UI
 * (`addExerciseToActive`) і швидкий запис (`buildQuickLogWorkout`).
 */
export function buildWorkoutItemFromExercise(
  ex: RawExerciseDef,
  id: string,
  sets: WorkoutSet[],
): WorkoutItem {
  return {
    id,
    exerciseId: ex.id,
    nameUk: ex.name?.uk || ex.name?.en || ex.id,
    primaryGroup: ex.primaryGroup ?? "",
    type: "strength",
    musclesPrimary: ex.muscles?.primary ?? [],
    musclesSecondary: ex.muscles?.secondary ?? [],
    sets,
    durationSec: 0,
    distanceM: 0,
    ...(typeof ex.met === "number" ? { met: ex.met } : {}),
  };
}
