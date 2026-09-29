#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const defaultAssetsDir = path.join(
  repoRoot,
  "apps",
  "server",
  "dist",
  "assets",
);
const assetsDir = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : defaultAssetsDir;

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

export function countScannedScripts(dir) {
  return walk(dir).filter((file) => file.endsWith(".js")).length;
}

export function findScenarioBridgeLeaks(dir) {
  return walk(dir)
    .filter((file) => file.endsWith(".js"))
    .filter((file) =>
      fs.readFileSync(file, "utf8").includes("__sergeantScenario"),
    );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  // Порожній скан не доказ: без білда тут нуль файлів, і «passed» брехав би.
  if (countScannedScripts(assetsDir) === 0) {
    console.error(
      `E2E seed boundary: у ${path.relative(repoRoot, assetsDir)} немає жодного .js. Спершу збери прод-білд.`,
    );
    process.exit(1);
  }
  const hits = findScenarioBridgeLeaks(assetsDir);

  if (hits.length > 0) {
    console.error(
      "E2E seed bridge leaked into production assets:\n" +
        hits.map((file) => `- ${path.relative(repoRoot, file)}`).join("\n"),
    );
    process.exit(1);
  }

  console.log("E2E seed boundary passed.");
}
