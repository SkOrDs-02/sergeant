import { describe, expect, it } from "vitest";
import {
  FETCH_DIAG_CAPACITY,
  FetchDiagBuffer,
  MARK_CAPACITY,
  sanitizePath,
} from "./fetchDiag";

function clock(start = 1000) {
  let t = start;
  return {
    now: () => t,
    tick: (ms: number) => {
      t += ms;
    },
  };
}

describe("sanitizePath", () => {
  it("відкидає query і hash", () => {
    expect(
      sanitizePath("https://app.test/api/v2/me?token=secret&x=1#frag"),
    ).toBe("/api/v2/me");
  });

  it("лишає хешовані імена збірки в /assets/", () => {
    expect(sanitizePath("https://app.test/assets/index-AbC12345.js?v=1")).toBe(
      "/assets/index-AbC12345.js",
    );
  });

  it("маскує id-подібні сегменти поза /assets/", () => {
    expect(
      sanitizePath(
        "https://app.test/api/users/0f8fad5b-d9cb-469f-a165/profile",
      ),
    ).toBe("/api/users/:x/profile");
    expect(sanitizePath("https://app.test/api/items/123456")).toBe(
      "/api/items/:x",
    );
    expect(sanitizePath("https://app.test/api/x/" + "a".repeat(30))).toBe(
      "/api/x/:x",
    );
  });

  it("не падає на сміттєвому URL", () => {
    expect(sanitizePath("http://[bad")).toBe("?");
  });
});

describe("FetchDiagBuffer", () => {
  it("фіксує життєвий цикл запиту", () => {
    const c = clock();
    const b = new FetchDiagBuffer(c.now);
    const e = b.start("https://a.test/assets/x.js", "no-cors", "script");
    expect(e).toMatchObject({ h: null, st: "dispatch", e: null, o: null });
    c.tick(5);
    b.handler(e, "precache");
    b.stage(e, "cache-read");
    c.tick(7);
    b.finish(e, "ok");
    expect(b.snapshot().fetches[0]).toMatchObject({
      p: "/assets/x.js",
      m: "no-cors",
      d: "script",
      h: "precache",
      st: "done",
      s: 1000,
      e: 1012,
      o: "ok",
    });
  });

  it("pending рахує лише незавершені", () => {
    const b = new FetchDiagBuffer(clock().now);
    const a = b.start("https://a.test/a.js", "cors", "script");
    b.start("https://a.test/b.js", "cors", "script");
    b.finish(a, "error");
    const snap = b.snapshot();
    expect(snap.pending).toBe(1);
    expect(snap.total).toBe(2);
  });

  it("перший обробник виграє, завершений запис не змінюється", () => {
    const b = new FetchDiagBuffer(clock().now);
    const e = b.start("https://a.test/", "navigate", "document");
    b.handler(e, "navigation");
    b.handler(e, "api");
    b.finish(e, "ok");
    b.finish(e, "error");
    b.stage(e, "network");
    expect(b.snapshot().fetches[0]).toMatchObject({
      h: "navigation",
      o: "ok",
      st: "done",
    });
  });

  it("кільцевий: лишає останні FETCH_DIAG_CAPACITY, total не втрачає", () => {
    const b = new FetchDiagBuffer(clock().now, 3);
    for (let i = 0; i < 5; i++) b.start(`https://a.test/p${i}`, "cors", "");
    const snap = b.snapshot();
    expect(snap.fetches.map((f) => f.p)).toEqual(
      ["/p0", "/p1", "/p2"].map((_, i) => `/p${i + 2}`),
    );
    expect(snap.total).toBe(5);
    expect(FETCH_DIAG_CAPACITY).toBeGreaterThanOrEqual(30);
  });

  it("позначки повідомлень мають часові мітки й обмежені MARK_CAPACITY", () => {
    const c = clock();
    const b = new FetchDiagBuffer(c.now);
    b.mark("set_user");
    c.tick(40);
    b.mark("set_user_done");
    expect(b.snapshot().marks).toEqual([
      { t: "set_user", at: 1000 },
      { t: "set_user_done", at: 1040 },
    ]);
    for (let i = 0; i < MARK_CAPACITY + 5; i++) b.mark("clear_caches");
    expect(b.snapshot().marks).toHaveLength(MARK_CAPACITY);
  });

  it("знімок — копія: подальші зміни його не чіпають і він без PII-полів", () => {
    const b = new FetchDiagBuffer(clock().now);
    const e = b.start("https://a.test/api/me?email=a@b.c", "cors", "");
    const snap = b.snapshot();
    b.finish(e, "ok");
    expect(snap.fetches[0]?.e).toBeNull();
    expect(JSON.stringify(snap)).not.toMatch(/email|a@b/);
  });
});
