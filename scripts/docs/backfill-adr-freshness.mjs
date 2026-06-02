#!/usr/bin/env node
/**
 * @scaffolded — D4 codemod з 2026-05-15-deep-audit-state-of-repo.md.
 *
 * Backfill `Last validated:` + `Next review:` header у ADR-документах
 * без freshness-маркера. Запускати один раз; повторне виконання — no-op
 * (skip-ається коли `Last validated:` вже присутнє).
 *
 * Usage: `node scripts/docs/backfill-adr-freshness.mjs`
 *
 * @nextStep: після того як власник rebump-не дати per-ADR (правильна
 * дата прийняття, not bulk-backfill date), цей скрипт можна видалити.
 */

import { readFile, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..", "..");
const ADR_DIR = join(REPO_ROOT, "docs", "adr");

const LAST_VALIDATED = "2026-05-15";
const NEXT_REVIEW = "2026-08-13";
const VALIDATOR =
  "Claude Sonnet 4.6 (external session — bulk freshness backfill, D4 audit)";

const VALIDATED_LINE = `- **Last validated:** ${LAST_VALIDATED} by ${VALIDATOR}. **Next review:** ${NEXT_REVIEW}.`;

/**
 * Insert pattern: знайти перший рядок, що починається з `- **Status:**`
 * і вставити VALIDATED_LINE як наступний рядок. Інші ADR-поля
 * (`- **Date:**`, `- **Reviewers:**`, `- **Supersedes:**`, etc.) лишаються
 * нижче — так само як у вже-помарковані ADR (e.g. `0002-tool-lifecycle.md`).
 */
function backfillContent(content) {
  if (content.includes("Last validated:")) return null;
  const lines = content.split("\n");
  const statusIdx = lines.findIndex((line) => /^- \*\*Status:\*\* /.test(line));
  if (statusIdx === -1) return null;
  lines.splice(statusIdx + 1, 0, VALIDATED_LINE);
  return lines.join("\n");
}

async function main() {
  const adrFiles = readdirSync(ADR_DIR)
    .filter((name) => /^\d{4}-.*\.md$/.test(name))
    .sort();

  let patched = 0;
  let skipped = 0;
  let unmatched = 0;

  for (const filename of adrFiles) {
    const path = join(ADR_DIR, filename);
    const original = await readFile(path, "utf8");
    const updated = backfillContent(original);
    if (updated === null) {
      if (original.includes("Last validated:")) {
        skipped += 1;
      } else {
        unmatched += 1;
        process.stderr.write(
          `WARN: no \`- **Status:**\` line found in ${filename} — skipping\n`,
        );
      }
      continue;
    }
    await writeFile(path, updated, "utf8");
    patched += 1;
    process.stdout.write(`patched: ${filename}\n`);
  }

  process.stdout.write(
    `\nDone. patched=${patched}, skipped=${skipped}, unmatched=${unmatched}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message ?? String(err)}\n`);
  process.exit(1);
});
