import { describe, it, expect } from "vitest";
import { buildLokiTarget, resolveLokiConfig } from "./lokiTransport.js";

describe("resolveLokiConfig", () => {
  it("повертає null коли всі три env-змінні відсутні (Loki вимкнений)", () => {
    expect(resolveLokiConfig({})).toBeNull();
  });

  it("повертає null коли тільки URL задано", () => {
    expect(
      resolveLokiConfig({ lokiUrl: "https://logs-prod-025.grafana.net" }),
    ).toBeNull();
  });

  it("повертає null коли URL + USERNAME задані, але TOKEN відсутній", () => {
    expect(
      resolveLokiConfig({
        lokiUrl: "https://logs-prod-025.grafana.net",
        username: "12345",
      }),
    ).toBeNull();
  });

  it("повертає null коли URL + TOKEN задані, але USERNAME відсутній", () => {
    expect(
      resolveLokiConfig({
        lokiUrl: "https://logs-prod-025.grafana.net",
        token: "glc_abc123",
      }),
    ).toBeNull();
  });

  it("повертає null коли тільки USERNAME і TOKEN задані без URL", () => {
    expect(
      resolveLokiConfig({ username: "12345", token: "glc_abc123" }),
    ).toBeNull();
  });

  it("повертає конфіг коли всі три змінні задані", () => {
    const config = resolveLokiConfig({
      lokiUrl: "https://logs-prod-025.grafana.net",
      username: "12345",
      token: "glc_abc123",
      nodeEnv: "production",
    });

    expect(config).not.toBeNull();
    expect(config?.lokiUrl).toBe("https://logs-prod-025.grafana.net");
    expect(config?.username).toBe("12345");
    expect(config?.token).toBe("glc_abc123");
    expect(config?.nodeEnv).toBe("production");
  });

  it("дефолтить nodeEnv до 'development' коли не передано", () => {
    const config = resolveLokiConfig({
      lokiUrl: "https://logs-prod-025.grafana.net",
      username: "12345",
      token: "glc_abc123",
    });

    expect(config?.nodeEnv).toBe("development");
  });
});

describe("buildLokiTarget", () => {
  const baseConfig = {
    lokiUrl: "https://logs-prod-025.grafana.net",
    username: "12345",
    token: "glc_abc123",
    nodeEnv: "production",
  };

  it("використовує target pino-loki", () => {
    const target = buildLokiTarget(baseConfig);
    expect(target.target).toBe("pino-loki");
  });

  it("включає labels job=sergeant-api і env з конфігу", () => {
    const target = buildLokiTarget({ ...baseConfig, nodeEnv: "staging" });
    const opts = target.options as Record<string, unknown>;
    const labels = opts["labels"] as Record<string, string>;
    expect(labels["job"]).toBe("sergeant-api");
    expect(labels["env"]).toBe("staging");
  });

  it("включає label service=sergeant-api", () => {
    const target = buildLokiTarget(baseConfig);
    const opts = target.options as Record<string, unknown>;
    const labels = opts["labels"] as Record<string, string>;
    expect(labels["service"]).toBe("sergeant-api");
  });

  it("передає credentials через basicAuth, а НЕ вбудовує у URL (захист від credential leak)", () => {
    const target = buildLokiTarget(baseConfig);
    const opts = target.options as Record<string, unknown>;
    const basicAuth = opts["basicAuth"] as Record<string, string>;

    expect(basicAuth["username"]).toBe("12345");
    expect(basicAuth["password"]).toBe("glc_abc123");
    // Credentials НЕ мають бути у host-URL
    const host = opts["host"] as string;
    expect(host).not.toContain("12345");
    expect(host).not.toContain("glc_abc123");
  });

  it("host — базовий URL без шляху /loki/api/v1/push (pino-loki додає сам)", () => {
    const target = buildLokiTarget(baseConfig);
    const opts = target.options as Record<string, unknown>;
    expect(opts["host"]).toBe("https://logs-prod-025.grafana.net");
    expect(opts["host"] as string).not.toContain("/loki/api/v1/push");
  });

  it("увімкнено batching і interval=5", () => {
    const target = buildLokiTarget(baseConfig);
    const opts = target.options as Record<string, unknown>;
    expect(opts["batching"]).toBe(true);
    expect(opts["interval"]).toBe(5);
  });
});
