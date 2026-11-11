import { EventEmitter } from "node:events";
import type { Response } from "express";
import { describe, expect, it } from "vitest";
import { abortOnClientClose } from "./clientAbort.js";

function fakeRes(writableFinished: boolean): Response & EventEmitter {
  return Object.assign(new EventEmitter(), {
    writableFinished,
  }) as unknown as Response & EventEmitter;
}

describe("abortOnClientClose", () => {
  it("скасовує сигнал, коли сокет закрився до кінця відповіді", () => {
    const res = fakeRes(false);
    const signal = abortOnClientClose(res);
    res.emit("close");
    expect(signal.aborted).toBe(true);
  });

  it("не скасовує після штатно завершеної відповіді", () => {
    const res = fakeRes(true);
    const signal = abortOnClientClose(res);
    res.emit("close");
    expect(signal.aborted).toBe(false);
  });
});
