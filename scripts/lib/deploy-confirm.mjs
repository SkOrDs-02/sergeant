// Спільне підтвердження для deploy-скриптів (deploy-api.mjs, deploy-vercel.mjs).
//
// AI-DANGER: без `--yes` деплой-скрипт нічого не викочує і не ходить у мережу:
// лише друкує прев'ю і виходить з кодом 0. Причина - аудит DG-32: «тестовий»
// запуск `node scripts/deploy-api.mjs` одразу став продакшн-деплоєм, а міграції
// їдуть в ENTRYPOINT образу і змінюють схему живої БД.
//
// `pnpm deploy:*` прапорець НЕ передає навмисно: `--yes` додає людина
// (`pnpm deploy:api -- --yes`) або агент, якому власник дозволив деплой.

/**
 * Розбір аргументів деплой-скрипта. Голе `--` (pnpm може передати його як є)
 * ігнорується.
 * @param {string[]} argv аргументи після імені скрипта (process.argv.slice(2))
 * @returns {{ yes: boolean, syncOnly: boolean, positional: string[] }}
 */
export function parseDeployArgs(argv) {
  return {
    yes: argv.includes("--yes"),
    syncOnly: argv.includes("--sync-only"),
    positional: argv.filter((a) => !a.startsWith("--")),
  };
}

/**
 * Друкує прев'ю і підказку «додай --yes».
 * @param {string} title що саме було б викочено
 * @param {string[]} lines рядки прев'ю
 * @param {string} rerun команда для справжнього запуску
 * @param {(s: string) => void} [log]
 */
export function printPreview(title, lines, rerun, log = console.log) {
  log(`ПРЕВ'Ю (нічого не викочено): ${title}`);
  for (const l of lines) log(`  ${l}`);
  log(`\nЩоб викотити справді, додай --yes: ${rerun}`);
}
