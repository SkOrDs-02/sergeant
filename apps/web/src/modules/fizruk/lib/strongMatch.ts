/**
 * Зіставлення назв вправ Strong із каталогом Фізрука.
 *
 * Винесено зі `strongImport.ts`: парсинг CSV і зіставлення з каталогом це
 * різні відповідальності, а разом вони пробивали ліміт у 600 рядків
 * (Hard Rule #18). Пошук і ранжування належать `searchExercises`; тут лише
 * ворота, які вирішують, коли верхній кандидат достатньо певний, щоб
 * пропустити ручне звіряння.
 */

import { FizrukData } from "@sergeant/fizruk-domain";

const AUTO_MATCH_THRESHOLD = 0.9;
const MIN_AUTO_MATCH_GAP = 0.08;

export interface StrongExerciseMatch {
  readonly strongName: string;
  readonly candidates: readonly FizrukData.RawExerciseDef[];
  readonly autoExerciseId: string | null;
  readonly confidence: number;
  readonly status: "auto" | "ambiguous" | "miss";
}

export function matchStrongExerciseName(
  strongName: string,
  pool: readonly FizrukData.RawExerciseDef[] = FizrukData.EXERCISES,
): StrongExerciseMatch {
  const candidates = collectSearchCandidates(strongName, pool);
  const ranked = candidates
    .map((exercise, index) => ({
      exercise,
      index,
      confidence: confidenceFor(strongName, exercise),
    }))
    .sort((a, b) => b.confidence - a.confidence || a.index - b.index);

  const top = ranked[0];
  if (!top) {
    return {
      strongName,
      candidates,
      autoExerciseId: null,
      confidence: 0,
      status: "miss",
    };
  }
  const second = ranked[1]?.confidence ?? 0;

  // searchExercises owns retrieval and ranking. This gate only decides when
  // the top result is safe enough to skip human review: exact Strong labels
  // and equipment-normalized labels land above 0.9, while bare base-name
  // matches such as "Lateral Raise" stay below it and require review.
  const auto =
    top.confidence >= AUTO_MATCH_THRESHOLD &&
    top.confidence - second >= MIN_AUTO_MATCH_GAP;

  return {
    strongName,
    candidates,
    autoExerciseId: auto ? top.exercise.id : null,
    confidence: top.confidence,
    status: auto ? "auto" : "ambiguous",
  };
}

function collectSearchCandidates(
  strongName: string,
  pool: readonly FizrukData.RawExerciseDef[],
): FizrukData.RawExerciseDef[] {
  const seen = new Set<string>();
  const out: FizrukData.RawExerciseDef[] = [];
  for (const query of searchQueries(strongName)) {
    for (const exercise of FizrukData.searchExercises(query, [...pool])) {
      if (seen.has(exercise.id)) continue;
      seen.add(exercise.id);
      out.push(exercise);
    }
  }
  return out;
}

function searchQueries(strongName: string): string[] {
  const trimmed = strongName.trim();
  const parts = /^(.*?)\s*\((.*?)\)\s*$/.exec(trimmed);
  if (!parts) return [trimmed];
  const base = parts[1]?.trim() ?? trimmed;
  const equipment = parts[2]?.trim() ?? "";
  return [trimmed, `${equipment} ${base}`.trim(), base].filter(Boolean);
}

function confidenceFor(
  strongName: string,
  exercise: FizrukData.RawExerciseDef,
): number {
  const { base, equipment } = splitStrongName(strongName);
  const labels = [
    exercise.name?.uk,
    exercise.name?.en,
    ...(exercise.aliases ?? []),
  ]
    .map(normalizeLabel)
    .filter(Boolean);
  const raw = normalizeLabel(strongName);
  const normalizedBase = normalizeLabel(base);
  const equipmentName = normalizeLabel(equipment);
  const equipmentMatches = (exercise.equipment ?? []).some(
    (eq) => eq === equipmentName,
  );

  if (labels.includes(raw)) return 1;
  if (equipmentName && labels.includes(`${equipmentName} ${normalizedBase}`)) {
    return 0.96;
  }
  if (labels.includes(normalizedBase) && equipmentMatches) return 0.94;
  if (labels.includes(normalizedBase)) return 0.88;
  return tokenCoverage(raw, labels) >= 1 ? 0.72 : 0.5;
}

function splitStrongName(strongName: string): {
  base: string;
  equipment: string;
} {
  const parts = /^(.*?)\s*\((.*?)\)\s*$/.exec(strongName.trim());
  return {
    base: parts?.[1]?.trim() || strongName.trim(),
    equipment: parts?.[2]?.trim().toLowerCase() || "",
  };
}

function normalizeLabel(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яіїєґʼ]+/giu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenCoverage(query: string, labels: readonly string[]): number {
  const tokens = query.split(" ").filter((token) => token.length > 1);
  if (tokens.length === 0) return 0;
  const haystack = labels.join(" ");
  const hits = tokens.filter((token) => haystack.includes(token)).length;
  return hits / tokens.length;
}
