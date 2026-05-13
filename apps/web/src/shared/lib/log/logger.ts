/**
 * Тонкий web-only logger поверх Sentry + DEV-консолі.
 *
 * Контракт:
 *   - `logger.debug(...args)` — лише у DEV; production ⇒ no-op
 *     (нічого в консоль, нічого в Sentry).
 *   - `logger.info(...args)` — у DEV пише в `console.info`; у production
 *     лишає Sentry-breadcrumb (level=info). Не throw-ить.
 *   - `logger.warn(...args)` — у DEV пише в `console.warn`; у production
 *     лишає Sentry-breadcrumb (level=warning). Не throw-ить.
 *   - `logger.error(...args)` — у DEV пише в `console.error`; у production
 *     лишає Sentry-breadcrumb (level=error) і, якщо серед аргументів є
 *     `Error`, викликає `captureException` з ним як головним payload-ом.
 *
 * Конвенція повідомлень така ж, як у попередніх `console.*` сайтах
 * (префікс `[scope] message`, далі довільні meta-аргументи), щоб
 * pre-PR audit (`grep -rn 'console\.'`) повертав 0 production-рядків,
 * а Sentry-side ергономіка лишалась однотипною з `addSentryBreadcrumb`-
 * хелпером з `core/observability/sentry.ts`.
 *
 * Logger навмисно НЕ кидає виключення з власних шляхів — будь-який
 * throw з `console.*` / Sentry-forward врапиться у `try/catch` і
 * проковтнеться (логування не повинно ламати viewer).
 */

import {
  addSentryBreadcrumb,
  captureException,
} from "../../../core/observability/sentry";

const isDev = (): boolean => {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    // SSR / non-Vite caller-и (наприклад, `node`-only smoke-тести):
    // вважаємо «не DEV», тобто Sentry-only path.
    return false;
  }
};

function stringifyForBreadcrumb(args: unknown[]): {
  message: string;
  data: Record<string, unknown>;
  errorArg: Error | undefined;
} {
  const parts: string[] = [];
  const data: Record<string, unknown> = {};
  let errorArg: Error | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a instanceof Error) {
      if (!errorArg) errorArg = a;
      parts.push(a.message);
      data[`error_${i}`] = {
        name: a.name,
        message: a.message,
      };
      continue;
    }
    if (
      typeof a === "string" ||
      typeof a === "number" ||
      typeof a === "boolean"
    ) {
      parts.push(String(a));
      continue;
    }
    if (a === null || a === undefined) {
      parts.push(String(a));
      continue;
    }
    // Plain object / array — лишаємо як structured data, у message
    // ставимо плейсхолдер, щоб саме повідомлення лишалося компактним
    // (Sentry breadcrumb message має ліміт ~10KB).
    data[`arg_${i}`] = a;
    parts.push("<object>");
  }

  return {
    message: parts.join(" ").slice(0, 1024),
    data,
    errorArg,
  };
}

function safeBreadcrumb(
  level: "info" | "warning" | "error",
  args: unknown[],
): { errorArg: Error | undefined } {
  try {
    const { message, data, errorArg } = stringifyForBreadcrumb(args);
    addSentryBreadcrumb({
      category: "web.logger",
      level,
      message,
      data,
    });
    return { errorArg };
  } catch {
    return { errorArg: undefined };
  }
}

function safeConsole(
  method: "debug" | "info" | "warn" | "error",
  args: unknown[],
): void {
  try {
    // DEV-only, gated by `isDev()`; production шлях іде через
    // `safeBreadcrumb` і ніколи сюди не падає.
    console[method](...args);
  } catch {
    /* logging must never throw */
  }
}

export const logger = {
  debug(...args: unknown[]): void {
    if (!isDev()) return;
    safeConsole("debug", args);
  },

  info(...args: unknown[]): void {
    if (isDev()) {
      safeConsole("info", args);
      return;
    }
    safeBreadcrumb("info", args);
  },

  warn(...args: unknown[]): void {
    if (isDev()) {
      safeConsole("warn", args);
      return;
    }
    safeBreadcrumb("warning", args);
  },

  error(...args: unknown[]): void {
    if (isDev()) {
      safeConsole("error", args);
      return;
    }
    const { errorArg } = safeBreadcrumb("error", args);
    if (errorArg) {
      try {
        captureException(errorArg);
      } catch {
        /* noop */
      }
    }
  },
};

export type Logger = typeof logger;
