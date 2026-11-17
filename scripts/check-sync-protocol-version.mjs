#!/usr/bin/env node
/**
 * Гейт `SYNC_PROTOCOL_VERSION` (аудит 2026-10-01, `data-48`).
 *
 * Фронт викочується раніше за бекенд. Нова таблиця в `OP_LOG_TABLE_REGISTRY`
 * без підняття `SYNC_PROTOCOL_VERSION` дає у вікні деплою термінальний
 * `table_not_allowed` замість `retry / unknown_table`. Скрипт порівнює
 * поточний перелік таблиць реєстру і версію із закоміченим знімком
 * `scripts/__fixtures__/sync-protocol-tables.json`.
 *
 * Статичний парс тексту (без імпорту TS-рантайму), як інші скрипти в scripts/.
 *
 * Запуск:
 *   node scripts/check-sync-protocol-version.mjs           # перевірка
 *   node scripts/check-sync-protocol-version.mjs --update  # переписати знімок
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

export const REGISTRY_FILE = "apps/server/src/modules/sync/syncV2.ts";
export const VERSION_FILE = "packages/shared/src/sync/protocolVersion.ts";
export const SNAPSHOT_FILE = "scripts/__fixtures__/sync-protocol-tables.json";

/** Ключі `OP_LOG_TABLE_REGISTRY` (коментарі відкидаються до парсу). */
export function extractRegistryTables(source) {
  const start = source.search(/const\s+OP_LOG_TABLE_REGISTRY\b[^=]*=\s*\{/);
  if (start < 0) {
    throw new Error("OP_LOG_TABLE_REGISTRY не знайдено у syncV2.ts");
  }
  const open = source.indexOf("{", source.indexOf("=", start));
  const end = source.indexOf("\n};", open);
  if (end < 0) throw new Error("кінець OP_LOG_TABLE_REGISTRY не знайдено");
  const body = source
    .slice(open + 1, end)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const tables = [
    ...body.matchAll(/^\s*["']?([a-z][a-z0-9_]*)["']?\s*:/gm),
  ].map((m) => m[1]);
  if (tables.length === 0) throw new Error("реєстр порожній або не розпарсено");
  return [...new Set(tables)].sort();
}

export function extractProtocolVersion(source) {
  const m = source.match(/export\s+const\s+SYNC_PROTOCOL_VERSION\s*=\s*(\d+)/);
  if (!m) throw new Error("SYNC_PROTOCOL_VERSION не знайдено");
  return Number(m[1]);
}

/** Повертає масив повідомлень про помилки (порожній = ok). */
export function evaluate(current, snapshot) {
  const added = current.tables.filter((t) => !snapshot.tables.includes(t));
  const removed = snapshot.tables.filter((t) => !current.tables.includes(t));
  const changed = added.length > 0 || removed.length > 0;
  const diff =
    (added.length ? ` додано: ${added.join(", ")};` : "") +
    (removed.length ? ` прибрано: ${removed.join(", ")};` : "");
  if (changed && current.version === snapshot.version) {
    return [
      `Набір sync-таблиць змінився,${diff} а SYNC_PROTOCOL_VERSION лишився ${current.version}. ` +
        `Підніми SYNC_PROTOCOL_VERSION (${VERSION_FILE}) і онови знімок: ` +
        `node scripts/check-sync-protocol-version.mjs --update`,
    ];
  }
  if (current.version < snapshot.version) {
    return [
      `SYNC_PROTOCOL_VERSION (${current.version}) менший за версію у знімку (${snapshot.version}); версію не знижують.`,
    ];
  }
  if (changed || current.version !== snapshot.version) {
    return [
      `Знімок ${SNAPSHOT_FILE} застарів (версія ${snapshot.version} -> ${current.version}${diff ? "," + diff : ""}). ` +
        `Онови: node scripts/check-sync-protocol-version.mjs --update`,
    ];
  }
  return [];
}

export function readCurrent(root = REPO_ROOT) {
  return {
    version: extractProtocolVersion(
      readFileSync(join(root, VERSION_FILE), "utf8"),
    ),
    tables: extractRegistryTables(
      readFileSync(join(root, REGISTRY_FILE), "utf8"),
    ),
  };
}

export function serializeSnapshot(current) {
  return (
    JSON.stringify(
      { version: current.version, tables: current.tables },
      null,
      2,
    ) + "\n"
  );
}

function main() {
  const update = process.argv.includes("--update");
  const current = readCurrent();
  const snapPath = join(REPO_ROOT, SNAPSHOT_FILE);
  if (update) {
    writeFileSync(snapPath, serializeSnapshot(current));
    console.log(
      `check-sync-protocol-version: знімок оновлено (v${current.version}, ${current.tables.length} таблиць)`,
    );
    return;
  }
  if (!existsSync(snapPath)) {
    console.error(
      `check-sync-protocol-version: немає ${SNAPSHOT_FILE}; створи: --update`,
    );
    process.exit(1);
  }
  const snapshot = JSON.parse(readFileSync(snapPath, "utf8"));
  const errors = evaluate(current, snapshot);
  if (errors.length > 0) {
    for (const e of errors) console.error(`check-sync-protocol-version: ${e}`);
    process.exit(1);
  }
  console.log(
    `check-sync-protocol-version: OK (v${current.version}, ${current.tables.length} таблиць)`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
