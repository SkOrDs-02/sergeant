/**
 * Unit tests for `sergeant-design/no-raw-req-in-pino-log`.
 *
 * Stack-pulse PR-16 (Pino redaction policy + Hard Rule #21). Rule блокує
 * передачу raw `req` / `res` / `req.headers` / `req.body` (та shorthand
 * `{ req }` / `{ res }`) у Pino-style logger-методи. Тести фіксують
 * матрицю forbidden / allowed форм, які описані у
 * `docs/security/logging-redaction-policy.md`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-raw-req-in-pino-log";

function lint(code) {
  return linter.verify(code, {
    plugins: { "sergeant-design": plugin },
    rules: { [RULE_ID]: "error" },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  });
}

// ── BAD: should flag ────────────────────────────────────────────────────

describe("no-raw-req-in-pino-log \u2014 raw identifier as first arg", () => {
  it("flags logger.info(req)", () => {
    const messages = lint("logger.info(req);");
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags logger.error(res, 'msg')", () => {
    const messages = lint("logger.error(res, 'msg');");
    assert.equal(messages.length, 1);
  });

  it("flags logger.warn(headers)", () => {
    const messages = lint("logger.warn(headers);");
    assert.equal(messages.length, 1);
  });

  it("flags logger.debug(body)", () => {
    const messages = lint("logger.debug(body);");
    assert.equal(messages.length, 1);
  });

  it("flags logger.fatal(payload)", () => {
    const messages = lint("logger.fatal(payload);");
    assert.equal(messages.length, 1);
  });

  it("flags logger.trace(cookies)", () => {
    const messages = lint("logger.trace(cookies);");
    assert.equal(messages.length, 1);
  });

  it("flags logger.info(ctx)", () => {
    const messages = lint("logger.info(ctx);");
    assert.equal(messages.length, 1);
  });
});

describe("no-raw-req-in-pino-log \u2014 raw member-expression bag", () => {
  it("flags logger.error(req.headers)", () => {
    const messages = lint("logger.error(req.headers);");
    assert.equal(messages.length, 1);
  });

  it("flags logger.warn(res.body)", () => {
    const messages = lint("logger.warn(res.body);");
    assert.equal(messages.length, 1);
  });

  it("flags logger.info(req.cookies)", () => {
    const messages = lint("logger.info(req.cookies);");
    assert.equal(messages.length, 1);
  });

  it("flags logger.debug(req.params)", () => {
    const messages = lint("logger.debug(req.params);");
    assert.equal(messages.length, 1);
  });

  it("flags logger.trace(req.query)", () => {
    const messages = lint("logger.trace(req.query);");
    assert.equal(messages.length, 1);
  });

  it("flags logger.error(req.user)", () => {
    const messages = lint("logger.error(req.user);");
    assert.equal(messages.length, 1);
  });

  it("flags logger.error(req.session)", () => {
    const messages = lint("logger.error(req.session);");
    assert.equal(messages.length, 1);
  });

  it("flags logger.warn(req.signedCookies)", () => {
    const messages = lint("logger.warn(req.signedCookies);");
    assert.equal(messages.length, 1);
  });
});

describe("no-raw-req-in-pino-log \u2014 object shorthand", () => {
  it("flags logger.warn({ req }, 'msg')", () => {
    const messages = lint("logger.warn({ req }, 'msg');");
    assert.equal(messages.length, 1);
  });

  it("flags logger.error({ res }, 'msg')", () => {
    const messages = lint("logger.error({ res }, 'msg');");
    assert.equal(messages.length, 1);
  });

  it("flags logger.info({ headers }, 'msg')", () => {
    const messages = lint("logger.info({ headers }, 'msg');");
    assert.equal(messages.length, 1);
  });

  it("flags logger.debug({ body, traceId })", () => {
    const messages = lint("logger.debug({ body, traceId });");
    assert.equal(messages.length, 1);
  });
});

describe("no-raw-req-in-pino-log \u2014 different logger receivers", () => {
  it("flags log.error(req) (alternate receiver)", () => {
    const messages = lint("log.error(req);");
    assert.equal(messages.length, 1);
  });

  it("flags pino.warn(res)", () => {
    const messages = lint("pino.warn(res);");
    assert.equal(messages.length, 1);
  });

  it("flags req.log.info(req)", () => {
    const messages = lint("req.log.info(req);");
    assert.equal(messages.length, 1);
  });

  it("flags ctx.logger.warn(res)", () => {
    const messages = lint("ctx.logger.warn(res);");
    assert.equal(messages.length, 1);
  });

  it("flags childLogger.error({ req })", () => {
    const messages = lint("childLogger.error({ req });");
    assert.equal(messages.length, 1);
  });

  it("flags httpLogger.info(req.headers)", () => {
    const messages = lint("httpLogger.info(req.headers);");
    assert.equal(messages.length, 1);
  });
});

// ── GOOD: should NOT flag ───────────────────────────────────────────────

describe("no-raw-req-in-pino-log \u2014 explicit destructure is allowed", () => {
  it("allows logger.info({ url: req.url, method: req.method })", () => {
    const messages = lint(
      "logger.info({ url: req.url, method: req.method }, 'ok');",
    );
    assert.equal(messages.length, 0);
  });

  it("allows logger.error({ status: res.statusCode })", () => {
    const messages = lint("logger.error({ status: res.statusCode }, 'fail');");
    assert.equal(messages.length, 0);
  });

  it("allows logger.error({ err }, 'msg') (Error-arg pino convention)", () => {
    const messages = lint("logger.error({ err }, 'handler failed');");
    assert.equal(messages.length, 0);
  });

  it("allows logger.warn('plain string message')", () => {
    const messages = lint("logger.warn('slow path');");
    assert.equal(messages.length, 0);
  });

  it("allows logger.error(err) (pino Error-arg)", () => {
    const messages = lint("logger.error(err);");
    assert.equal(messages.length, 0);
  });

  it("allows logger.info({ urls: [req.url] }, 'msg')", () => {
    const messages = lint("logger.info({ urls: [req.url] }, 'msg');");
    assert.equal(messages.length, 0);
  });

  it("allows logger.info({ traceId: ctx.traceId })", () => {
    const messages = lint("logger.info({ traceId: ctx.traceId });");
    assert.equal(messages.length, 0);
  });
});

describe("no-raw-req-in-pino-log \u2014 non-logger receivers are ignored", () => {
  it("does NOT flag handler.info(req) (unknown receiver)", () => {
    const messages = lint("handler.info(req);");
    assert.equal(messages.length, 0);
  });

  it("does NOT flag emitter.warn(req) (EventEmitter style)", () => {
    const messages = lint("emitter.warn(req);");
    assert.equal(messages.length, 0);
  });

  it("does NOT flag obs$.info(req) (RxJS-style subject)", () => {
    const messages = lint("obs$.info(req);");
    assert.equal(messages.length, 0);
  });

  it("does NOT flag bare info(req) call (no receiver)", () => {
    const messages = lint("info(req);");
    assert.equal(messages.length, 0);
  });
});

describe("no-raw-req-in-pino-log \u2014 non-method logger calls are ignored", () => {
  it("does NOT flag logger.child(req) (not a log method)", () => {
    const messages = lint("logger.child(req);");
    assert.equal(messages.length, 0);
  });

  it("does NOT flag logger.bindings() (zero-arg)", () => {
    const messages = lint("logger.bindings();");
    assert.equal(messages.length, 0);
  });
});

describe("no-raw-req-in-pino-log \u2014 outside-scope identifiers are ignored", () => {
  it("does NOT flag logger.info(user)", () => {
    const messages = lint("logger.info(user);");
    assert.equal(messages.length, 0);
  });

  it("does NOT flag logger.error(traceId)", () => {
    const messages = lint("logger.error(traceId);");
    assert.equal(messages.length, 0);
  });

  it("does NOT flag logger.info(req.url) (single-field MemberExpression)", () => {
    const messages = lint("logger.info(req.url);");
    assert.equal(messages.length, 0);
  });

  it("does NOT flag logger.warn({ url: req.url }) (no shorthand)", () => {
    const messages = lint("logger.warn({ url: req.url });");
    assert.equal(messages.length, 0);
  });
});
