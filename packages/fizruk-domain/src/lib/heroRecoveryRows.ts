/**
 * Selects and ranks the (up to 6) rows the Fizruk dashboard hero shows for
 * "стан тіла" — the muscle-group-or-injury rows that back
 * `HeroRecoveryBars` (web).
 *
 * Спека: `docs/90-work/planning/specs/fizruk-hero-recovery-bars.md` § Рішення
 * дизайну, пункт 1.
 *
 * AI-CONTEXT: два різні простори id стикаються тут навмисно, а не помилково.
 * `by` (з `computeRecoveryBy`) ключує стани ДОМЕННИМИ id (`pectoralis_major`
 * — снейк-кейс, як у `exercises.gymup.json`). `injurySites` (з
 * `useInjuries().activeSites`) дає АТЛАСНІ id (`chest`) і зони, яких серед
 * доменних станів нема взагалі (`knee` — суглоб, атлас його не малює).
 * Тому травма НЕ шукається серед `by` через `mapDomainMuscleToAtlas` — вона
 * СИНТЕЗУЄТЬСЯ окремим рядком (так само як `useRecovery` вже робить для
 * `avoid`), а доменні стани лише домішуються й дедуплікуються проти вже
 * синтезованих травм.
 */
import type { MuscleState, RecoveryStatus } from "../domain/types.js";
import {
  BODY_ATLAS_MUSCLE_LABELS_UK,
  mapDomainMuscleToAtlas,
  type BodyAtlasMuscleId,
} from "../data/bodyAtlas.js";
import { injurySiteLabelUk } from "../data/injurySites.js";

/** Discriminates a synthesized injury row from a trained-muscle row. */
export type HeroRecoveryRowKind = "injury" | "muscle";

export interface HeroRecoveryRow {
  /**
   * Navigation/dedup target. For `kind: "muscle"` rows this is always a
   * `BodyAtlasMuscleId` (the atlas can highlight it). For `kind: "injury"`
   * rows it may also be an `InjuryZoneId` (e.g. `"knee"`) the atlas has no
   * silhouette for — callers navigate there anyway; `Atlas.tsx` no-ops the
   * highlight for ids it can't draw.
   */
  readonly atlasId: string;
  readonly label: string;
  readonly kind: HeroRecoveryRowKind;
  readonly status: RecoveryStatus;
  /** Raw `MuscleState.fatigue` accumulator — `0` for injury rows (no bar). */
  readonly fatigue: number;
  /**
   * The domain `MuscleState.id` with the highest fatigue folded into this
   * atlas group (mirrors `aggregateRecoveryToAtlas`'s max-fatigue rule, plus
   * tracking which id won). Callers use it to look up a `forecastFullRecoveryByDate`
   * entry for the `red`-status caption. `null` for injury rows — they never
   * show a forecast, only the static "травма" caption.
   */
  readonly domainMuscleId: string | null;
}

const STATUS_RANK: Record<RecoveryStatus, number> = {
  red: 0,
  yellow: 1,
  green: 2,
};

function worstStatus(a: RecoveryStatus, b: RecoveryStatus): RecoveryStatus {
  if (a === "red" || b === "red") return "red";
  if (a === "yellow" || b === "yellow") return "yellow";
  return "green";
}

interface AtlasAggregate {
  fatigue: number;
  load14d: number;
  status: RecoveryStatus;
  domainMuscleId: string;
}

/**
 * Ранжовані рядки hero-смуг відновлення (рішення 1 спеки):
 *
 *  1. Позначені травми — завжди, незалежно від навантаження, першими.
 *  2. Мʼязові групи з навантаженням за останні 14 днів (`load14d > 0`),
 *     відсортовані `red → yellow → green`, усередині — `fatigue` спадно.
 *  3. Один рядок на атласну ціль: мʼязова група, чий атласний id збігається
 *     з уже синтезованою травмою, у мʼязові рядки не потрапляє.
 *  4. Разом — не більше `limit` рядків; травми займають слоти першими.
 */
export function selectHeroRecoveryRows(
  by: Record<string, MuscleState> | null | undefined,
  injurySites: ReadonlySet<string> | Iterable<string> | null | undefined,
  limit = 6,
): HeroRecoveryRow[] {
  const injuredIds = new Set<string>(injurySites ? [...injurySites] : []);

  const injuryRows: HeroRecoveryRow[] = [...injuredIds].map((site) => ({
    atlasId: site,
    label: injurySiteLabelUk(site),
    kind: "injury" as const,
    status: "red" as const,
    fatigue: 0,
    domainMuscleId: null,
  }));

  const agg = new Map<BodyAtlasMuscleId, AtlasAggregate>();
  for (const state of Object.values(by || {})) {
    const atlasId = mapDomainMuscleToAtlas(state.id);
    if (!atlasId) continue;
    // Dedup against a synthesized injury row for the same atlas target
    // (рішення 1: "Один рядок на атласну ціль").
    if (injuredIds.has(atlasId)) continue;

    const load14d = state.load14d ?? 0;
    const prev = agg.get(atlasId);
    if (!prev) {
      agg.set(atlasId, {
        fatigue: state.fatigue,
        load14d,
        status: state.status,
        domainMuscleId: state.id,
      });
      continue;
    }
    prev.load14d += load14d;
    prev.status = worstStatus(prev.status, state.status);
    if (state.fatigue > prev.fatigue) {
      prev.fatigue = state.fatigue;
      prev.domainMuscleId = state.id;
    }
  }

  const muscleRows: HeroRecoveryRow[] = [];
  for (const [atlasId, a] of agg) {
    // Не показуємо групи без навантаження за 14 днів (рішення 1) — крім
    // травм, які вже пішли окремим шляхом вище.
    if (a.load14d <= 0) continue;
    muscleRows.push({
      atlasId,
      label: BODY_ATLAS_MUSCLE_LABELS_UK[atlasId],
      kind: "muscle",
      status: a.status,
      fatigue: a.fatigue,
      domainMuscleId: a.domainMuscleId,
    });
  }
  muscleRows.sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.fatigue - a.fatigue,
  );

  return [...injuryRows, ...muscleRows].slice(0, Math.max(0, limit));
}
