/**
 * Grafana Cloud Loki transport factory.
 *
 * Гейтинг: всі три env-змінні мають бути задані одночасно — при відсутності
 * будь-якої `resolveLokiConfig` повертає `null` і транспорт не створюється
 * (clean no-op, prod не крашиться). Дзеркалить патерн Sentry (gated on DSN).
 *
 * Редакція: pino `formatters.log` (`redactKeysRecursively`) та `redact.paths`
 * виконуються у main thread ДО серіалізації рекорду і передачі у worker-thread
 * транспорту — Loki-target отримує вже редаговані JSON-рядки.
 */
import type { TransportTargetOptions } from "pino";

export interface LokiEnvInput {
  readonly lokiUrl?: string | undefined;
  readonly username?: string | undefined;
  readonly token?: string | undefined;
  readonly nodeEnv?: string | undefined;
}

export interface LokiTransportConfig {
  readonly lokiUrl: string;
  readonly username: string;
  readonly token: string;
  readonly nodeEnv: string;
}

/**
 * Перевіряє наявність усіх трьох Loki env-змінних і повертає типізований
 * конфіг або `null`. Testable без моку env-схеми — приймає explicit params.
 */
export function resolveLokiConfig(
  input: LokiEnvInput,
): LokiTransportConfig | null {
  const { lokiUrl, username, token, nodeEnv = "development" } = input;
  if (!lokiUrl || !username || !token) return null;
  return { lokiUrl, username, token, nodeEnv };
}

/**
 * Будує pino transport target для pino-loki. Credentials передаються через
 * `basicAuth` (НЕ вбудовуються у URL). Labels: `job`, `env`, `service`.
 */
export function buildLokiTarget(
  config: LokiTransportConfig,
): TransportTargetOptions {
  return {
    target: "pino-loki",
    options: {
      host: config.lokiUrl,
      basicAuth: {
        username: config.username,
        password: config.token,
      },
      labels: {
        job: "sergeant-api",
        env: config.nodeEnv,
        service: "sergeant-api",
      },
      batching: true,
      interval: 5,
    },
  };
}
