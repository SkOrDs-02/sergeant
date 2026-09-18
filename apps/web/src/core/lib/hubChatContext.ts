import { perfMark, perfEnd } from "@shared/lib/ui/perf";
import { readAllData } from "./hubChatContext/readAllData";
import { appendFinanceLines } from "./hubChatContext/finance";
import {
  appendAiSignalLines,
  appendNutritionLines,
  appendRoutineLines,
  appendWorkoutLines,
} from "./hubChatContext/sections";

function buildContext(): string {
  const d = readAllData();
  const lines: string[] = [];
  const now = new Date();

  appendFinanceLines(lines, d, now);
  appendWorkoutLines(lines);
  appendRoutineLines(lines, now);
  appendNutritionLines(lines, now);
  appendAiSignalLines(lines);

  return lines.length > 1
    ? lines.join("\n")
    : "Даних немає. Monobank не підключено.";
}

export function buildContextMeasured(): string {
  const m = perfMark("hubchat:buildContext");
  const ctx = buildContext();
  perfEnd(m, { len: ctx?.length || 0 });
  return ctx;
}
