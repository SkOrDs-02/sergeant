#!/usr/bin/env node
/**
 * Lint-гейт для portable-манифестів дашбордів PostHog.
 *
 * Валідує кожен `ops/posthog/dashboards/*.json` проти
 * `ops/posthog/schema/dashboard.schema.json` (AJV, draft-07) і додатково
 * перевіряє референційну цілісність, яку JSON Schema виразити не може:
 *
 *   1. `panels[].key` унікальні всередині манифесту;
 *   2. кожен `alerts[].panel` вказує на наявну панель;
 *   3. кожен `umbrella_dashboard.tiles[].panel` вказує на наявну панель;
 *   4. кожна панель присутня рівно в одному tile (нічого не загубилось);
 *   5. `key` манифесту збігається з іменем файлу;
 *   6. tag-namespace (`tagPrefix(key)`) не колізує між манифестами.
 *
 * Навіщо: обидва наявні манифести посилалися на схему, якої не існувало, а
 * механічного гейта на drift `analyticsEvents.ts` ↔ манифест не було взагалі
 * (див. ops/posthog/README.md § «Контракт із canonical events»).
 *
 * Usage: node scripts/posthog/lint-manifests.mjs [--dir ops/posthog/dashboards]
 */
import { readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv from "ajv";

import { tagPrefix } from "./import-founder-pulse.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const SCHEMA_PATH = join(REPO_ROOT, "ops/posthog/schema/dashboard.schema.json");
const DEFAULT_DIR = join(REPO_ROOT, "ops/posthog/dashboards");

/**
 * Колізія tag-namespace між манифестами. Повертає масив рядків-помилок і
 * МУТУЄ `prefixes` (prefix → перший манифест, що його зайняв).
 *
 * Винесено з `main()` рівно тому, що інакше цей шлях неможливо протестувати:
 * колізія виникає лише на ДРУГОМУ манифесті, а в репо сьогодні немає пари
 * ключів, що колідують, — тобто найважливіша гілка ніколи не виконувалась би
 * у тестах.
 */
export function checkTagNamespace(manifest, prefixes) {
  if (!manifest?.key) return [];
  const prefix = tagPrefix(manifest.key);
  const owner = prefixes.get(prefix);
  if (owner && owner !== manifest.key) {
    // Власника НЕ перезаписуємо: перший манифест, що зайняв префікс, лишається
    // власником назавжди. Інакше третій колізійний манифест звинуватив би
    // другого замість першого, а повторний прогін того самого колізійного
    // ключа виглядав би валідним (owner став би === manifest.key).
    return [
      `tag-namespace "${prefix}:" collides with manifest "${owner}" — ` +
        `rename one of the manifest keys (insights would share a tag prefix)`,
    ];
  }
  if (!owner) prefixes.set(prefix, manifest.key);
  return [];
}

/** Референційні перевірки поверх схеми. Повертає масив рядків-помилок. */
export function checkReferentialIntegrity(manifest, fileName) {
  const errors = [];
  const panelKeys = new Set();
  for (const panel of manifest.panels ?? []) {
    if (panelKeys.has(panel.key)) {
      errors.push(`duplicate panels[].key "${panel.key}"`);
    }
    panelKeys.add(panel.key);
  }

  for (const alert of manifest.alerts ?? []) {
    if (!panelKeys.has(alert.panel)) {
      errors.push(
        `alerts[key=${alert.key}].panel "${alert.panel}" does not match any panels[].key`,
      );
    }
  }

  const tiled = new Set();
  for (const tile of manifest.umbrella_dashboard?.tiles ?? []) {
    if (!panelKeys.has(tile.panel)) {
      errors.push(
        `umbrella_dashboard.tiles[].panel "${tile.panel}" does not match any panels[].key`,
      );
    }
    if (tiled.has(tile.panel)) {
      errors.push(`umbrella_dashboard pins panel "${tile.panel}" twice`);
    }
    tiled.add(tile.panel);
  }
  for (const key of panelKeys) {
    if (!tiled.has(key)) {
      errors.push(`panel "${key}" is not pinned in umbrella_dashboard.tiles`);
    }
  }

  if (fileName) {
    const expected = `${manifest.key}.json`;
    if (basename(fileName) !== expected) {
      errors.push(
        `manifest key "${manifest.key}" does not match file name (expected ${expected})`,
      );
    }
  }

  return errors;
}

function main() {
  const args = process.argv.slice(2);
  const dirIdx = args.indexOf("--dir");
  const dir =
    dirIdx >= 0 && args[dirIdx + 1]
      ? resolve(REPO_ROOT, args[dirIdx + 1])
      : DEFAULT_DIR;

  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    console.error(`✗ no manifests found in ${dir}`);
    process.exit(1);
  }

  let failed = 0;
  const prefixes = new Map();

  for (const file of files) {
    const path = join(dir, file);
    const rel = path.slice(REPO_ROOT.length + 1);
    const errors = [];

    let manifest;
    try {
      manifest = JSON.parse(readFileSync(path, "utf8"));
    } catch (err) {
      console.error(`✗ ${rel}: invalid JSON — ${err.message}`);
      failed += 1;
      continue;
    }

    if (!validate(manifest)) {
      for (const e of validate.errors ?? []) {
        errors.push(`${e.instancePath || "/"} ${e.message}`);
      }
    }
    errors.push(...checkReferentialIntegrity(manifest, file));

    errors.push(...checkTagNamespace(manifest, prefixes));

    if (errors.length > 0) {
      failed += 1;
      console.error(`✗ ${rel}`);
      for (const e of errors) console.error(`    ${e}`);
    } else {
      console.log(
        `✓ ${rel} (${manifest.panels.length} panels, tag-namespace "${tagPrefix(manifest.key)}:")`,
      );
    }
  }

  if (failed > 0) {
    console.error(
      `\n${failed} manifest(s) failed validation against ops/posthog/schema/dashboard.schema.json`,
    );
    process.exit(1);
  }
  console.log(`\nAll ${files.length} PostHog manifest(s) valid.`);
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) main();
