import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Бакет, якого не дозволяє CHECK `ai_usage_daily_bucket_format`, не падає
// голосно: `assertAiQuota` ловить помилку вставки і пропускає запит без
// ліміту. Так `preset:*` жив без квоти до міграції 150. Тест звіряє кожну
// родину бакетів, яку пише код, з CHECK останньої міграції.
const BUCKETS_WRITTEN_BY_CODE = [
  "default",
  "premium",
  "standard",
  "tool:log_meal",
  "transcribe:whisper-large-v3-turbo",
  "anthropic:claude-sonnet",
  "week:ai",
  "week:photo",
  "week:finyk-vision",
  "preset:profile_interview",
];

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations",
);

function latestBucketCheck(): string {
  const file = readdirSync(migrationsDir)
    .filter((f) => /^\d+_.*\.sql$/.test(f) && !f.endsWith(".down.sql"))
    .sort()
    .filter((f) =>
      /ADD CONSTRAINT ai_usage_daily_bucket_format/.test(
        readFileSync(path.join(migrationsDir, f), "utf8"),
      ),
    )
    .at(-1);
  if (!file) throw new Error("no migration defines the bucket CHECK");
  const sql = readFileSync(path.join(migrationsDir, file), "utf8");
  const body = /CHECK\s*\(([\s\S]*?)\);/.exec(sql)?.[1];
  if (!body) throw new Error(`cannot parse CHECK in ${file}`);
  return body;
}

function matchers(check: string): RegExp[] {
  const out: RegExp[] = [];
  for (const [, op, lit] of check.matchAll(/bucket\s+(=|LIKE)\s+'([^']*)'/g)) {
    const src =
      op === "="
        ? lit!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        : lit!
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            .replace(/_/g, ".")
            .replace(/%/g, ".*");
    out.push(new RegExp(`^${src}$`));
  }
  return out;
}

describe("ai_usage_daily bucket CHECK", () => {
  const allowed = matchers(latestBucketCheck());

  it.each(BUCKETS_WRITTEN_BY_CODE)("дозволяє %s", (bucket) => {
    expect(allowed.some((re) => re.test(bucket))).toBe(true);
  });
});
