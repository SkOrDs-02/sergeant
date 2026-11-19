import { writeSync } from "node:fs";

/**
 * Фатальна помилка старту: один синхронний JSON-рядок у stdout і код виходу 1.
 *
 * AI-CONTEXT: без цього обробника throw до кінця тіла `index.ts` був німим
 * (деплой 2026-11-19, `WEBHOOK_HMAC_SECRET`). Власний `uncaughtException`
 * в `index.ts` реєструється аж після сотень рядків тіла модуля, а до того
 * єдиним слухачем лишається Sentry. Він ковтає виняток, друкує його лише в
 * stderr і процес не завершує, тож event loop просто спорожнюється і Node
 * виходить з кодом 0. Pino тут не допомагає: з Loki-транспортом він пише
 * через worker-потік, який до виходу не встигає нічого скинути.
 *
 * Модуль імпортується в `index.ts` ПЕРШИМ, ще до `./sentry.js`, щоб покрити
 * й throw під час оцінки імпортів (`parseEnv` в `env/env.ts`). Правилу
 * «Sentry раніше за express/http» це не шкодить: тут лише `node:fs`.
 */

/**
 * Вікно для Sentry, щоб відправити подію: його слухач викликається після
 * нашого і сам процес не завершує. Таймер навмисно без `unref`: вихід з
 * кодом 1 гарантований, навіть якщо якийсь handle тримає event loop.
 */
const EXIT_DELAY_MS = 2_000;

function onStartupFatal(err: unknown): void {
  const e = err instanceof Error ? err : new Error(String(err));
  process.exitCode = 1;
  try {
    writeSync(
      1,
      JSON.stringify({
        level: "fatal",
        time: new Date().toISOString(),
        service: "sergeant-api",
        msg: "startup_failed",
        err: { name: e.name, message: e.message, stack: e.stack },
      }) + "\n",
    );
  } catch {
    // stdout як неблокуючий pipe може віддати EAGAIN; вихід важливіший.
  }
  setTimeout(() => process.exit(1), EXIT_DELAY_MS);
}

process.on("uncaughtException", onStartupFatal);

/** Викликати рівно перед реєстрацією штатного `uncaughtException` у `index.ts`. */
export function releaseStartupFatalHandler(): void {
  process.off("uncaughtException", onStartupFatal);
}
