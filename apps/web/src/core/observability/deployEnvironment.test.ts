import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveDeployEnvironment } from "./deployEnvironment.js";

/**
 * Регресійні тести на два реальні інциденти розмітки середовища
 * (аудит телеметрії 2026-08-16):
 *
 *   1. `sergeant-web` отримав сторонній environment `vercel-production` через
 *      фолбек на `import.meta.env.MODE`.
 *   2. Шість preview-хостів (`beta-git-*`, `sergeant-git-main-*`) писали у
 *      прод-проєкт PostHog під міткою `beta`, успадкованою з env-vars
 *      основного деплою.
 */

function stubEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    vi.stubEnv(key, value as string);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveDeployEnvironment", () => {
  it("позначає канонічний прод-хост як production", () => {
    expect(resolveDeployEnvironment("sergeant.vercel.app")).toBe("production");
  });

  it("поважає явний VITE_APP_ENV на канонічному хості", () => {
    stubEnv({ VITE_APP_ENV: "beta" });
    expect(resolveDeployEnvironment("beta-tau-gilt.vercel.app")).toBe("beta");
  });

  it("дає VITE_SENTRY_ENVIRONMENT пріоритет над VITE_APP_ENV", () => {
    stubEnv({ VITE_APP_ENV: "beta", VITE_SENTRY_ENVIRONMENT: "staging" });
    expect(resolveDeployEnvironment("sergeant.vercel.app")).toBe("staging");
  });

  // Інцидент 2: preview успадковує env-vars основного деплою, тож хост мусить
  // бити змінну — інакше гілкові події осідають у прод-вибірці як `beta`.
  it.each([
    "beta-git-claude-ai-slop-design-0d6idv-skords-01s-projects.vercel.app",
    "beta-git-codex-nutrition-beta-feedback-skords-01s-projects.vercel.app",
    "sergeant-git-main-skords-01s-projects.vercel.app",
    "beta-h0ifldq44-skords-01s-projects.vercel.app",
  ])("класифікує preview-хост %s як preview попри VITE_APP_ENV", (host) => {
    stubEnv({ VITE_APP_ENV: "beta" });
    expect(resolveDeployEnvironment(host)).toBe("preview");
  });

  it.each(["localhost", "127.0.0.1", "sergeant.local"])(
    "класифікує %s як development",
    (host) => {
      stubEnv({ VITE_APP_ENV: "production" });
      expect(resolveDeployEnvironment(host)).toBe("development");
    },
  );

  // Інцидент 1: `MODE` більше не бере участі в резолві взагалі.
  it("ігнорує import.meta.env.MODE", () => {
    stubEnv({ MODE: "vercel-production" });
    expect(resolveDeployEnvironment("sergeant.vercel.app")).toBe("production");
  });

  it("дозволяє розширити allowlist через VITE_CANONICAL_HOSTS", () => {
    stubEnv({
      VITE_CANONICAL_HOSTS: "app.sergeant.io, beta.sergeant.io",
      VITE_APP_ENV: "beta",
    });
    expect(resolveDeployEnvironment("beta.sergeant.io")).toBe("beta");
    // Хост поза новим списком — навіть старий дефолтний — стає preview.
    expect(resolveDeployEnvironment("sergeant.vercel.app")).toBe("preview");
  });

  it("падає на env-var, коли hostname недоступний (SSR / worker)", () => {
    stubEnv({ VITE_APP_ENV: "beta" });
    expect(resolveDeployEnvironment("")).toBe("beta");
  });
});
