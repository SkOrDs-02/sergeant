/**
 * Регресійний корпус на РЕАЛЬНИХ відповідях моделей (ADR-0097, спека
 * `link-evidence-standard.md`): 83 унікальні відповіді (86 входжень), 69 зі
 * стенду моделей 2026-08-25 і 14 із касет вибору інструментів. Відповіді й
 * «подане» лежать у `fixtures/` з номерами рядків першоджерел.
 *
 * Очікувані вердикти НЕ записані руками. Їх дає незалежний оракул: окремий
 * простий розбір чисел (без маскування id, без пулу, без бюджету) і повний
 * перебір знакових комбінацій побітовими масками. Бібліотека й оракул мають
 * збігатись на кожній відповіді, а на мутаціях - на кожній зміні.
 */

import { describe, expect, it } from "vitest";
import {
  EMPTY_GIVEN,
  buildGivenCorpus,
  extractNumberTokens,
  verifyNumbers,
  type GivenSources,
} from "./index.js";
import { REAL_CASES, realCase } from "./fixtures/index.js";
import type { RealCase } from "./fixtures/types.js";

// ── Незалежний оракул ──────────────────────────────────────────────────

const CLAIM_RE =
  /(\d+(?:[ \u00A0\u202F]\d{3})*(?:[.,]\d+)?)[*\s\u00A0\u202F]*(?:грн|₴|ккал|кг|г)(?![а-яіїєґ])/giu;
const ANY_NUMBER_RE = /\d+(?:[ \u00A0\u202F]\d{3})*(?:[.,]\d+)?/g;

const toNumber = (raw: string): number =>
  Number(raw.replace(/[ \u00A0\u202F]/g, "").replace(",", "."));

function givenText(given: GivenSources): string {
  return [
    ...(given.contexts ?? []),
    ...(given.toolResults ?? []),
    ...(given.userMessages ?? []),
    ...(given.assistantMessages ?? []),
  ].join("\n");
}

function oracleGivenNumbers(given: GivenSources): number[] {
  return [...givenText(given).matchAll(ANY_NUMBER_RE)].map((m) =>
    toNumber(m[0]),
  );
}

/** Чи дає знакова комбінація (≥2 операнди, ≤6) число `target` за модулем. */
function reachable(target: number, operands: readonly number[]): boolean {
  const n = operands.length;
  if (n > 12) throw new Error("оракул розрахований на пул до 12");
  for (let mask = 1; mask < 1 << n; mask++) {
    const picked = operands.filter((_, i) => (mask >> i) & 1);
    if (picked.length < 2 || picked.length > 6) continue;
    for (let signs = 0; signs < 1 << (picked.length - 1); signs++) {
      let sum = picked[0] as number;
      for (let k = 1; k < picked.length; k++) {
        sum += ((signs >> (k - 1)) & 1 ? -1 : 1) * (picked[k] as number);
      }
      if (Math.abs(Math.abs(sum) - target) <= 0.5) return true;
    }
  }
  return false;
}

interface OracleVerdict {
  outcome: "ok" | "mismatch" | "no_scoped";
  unexplained: number[];
}

function oracle(answer: string, given: GivenSources): OracleVerdict {
  const claims = [...answer.matchAll(CLAIM_RE)].map((m) => toNumber(m[1]!));
  const known = oracleGivenNumbers(given);
  const inGiven = (v: number) => known.some((g) => Math.abs(g - v) <= 0.5);

  const literal = claims.map(inGiven);
  const derivedValues: number[] = [];
  const unexplained: number[] = [];
  let scoped = 0;
  claims.forEach((value, i) => {
    if (value < 100) return;
    scoped += 1;
    if (literal[i]) return;
    if (derivedValues.some((d) => Math.abs(d - value) <= 0.5)) return;
    const pool = [
      ...new Set([
        ...claims.filter((_, j) => j !== i && literal[j]),
        ...derivedValues,
      ]),
    ];
    if (reachable(value, pool)) derivedValues.push(value);
    else unexplained.push(value);
  });
  return {
    outcome:
      scoped === 0 ? "no_scoped" : unexplained.length ? "mismatch" : "ok",
    unexplained,
  };
}

// ── Допоміжне ──────────────────────────────────────────────────────────

function verify(answer: string, given: GivenSources) {
  return verifyNumbers(answer, buildGivenCorpus(given));
}

function unexplainedValues(answer: string, given: GivenSources): number[] {
  return verify(answer, given).unexplained.map((u) => u.token.value);
}

/** Детермінований ГПВЧ: тест не має залежати від випадку. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rand: () => number, items: readonly T[]): T =>
  items[Math.floor(rand() * items.length)] as T;

/** Перемішування Фішера-Єйтса: компаратор `sort(() => rand() - 0.5)` нерівномірний. */
function shuffled<T>(rand: () => number, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Єдина відповідь корпусу з реальною помилкою в сумі (45 050 замість 47 050). */
const KNOWN_WRONG = ["eval-L3765"];

const TOTAL_OCCURRENCES = REAL_CASES.reduce((n, c) => n + c.occurrences, 0);

// ── Тести ──────────────────────────────────────────────────────────────

describe("корпус реальних відповідей", () => {
  it("розмір корпусу: 83 унікальні відповіді, 86 входжень", () => {
    expect(REAL_CASES).toHaveLength(83);
    expect(TOTAL_OCCURRENCES).toBe(86);
  });

  it("бібліотека збігається з незалежним оракулом на кожній відповіді", () => {
    for (const c of REAL_CASES) {
      const lib = verify(c.answer, c.given);
      const ref = oracle(c.answer, c.given);
      expect({ id: c.id, outcome: lib.outcome }).toEqual({
        id: c.id,
        outcome: ref.outcome,
      });
      expect({
        id: c.id,
        unexplained: lib.unexplained.map((u) => u.token.value),
      }).toEqual({ id: c.id, unexplained: ref.unexplained });
    }
  });

  it("єдина відповідь, яку звірка відхиляє, - справжня помилка в сумі", () => {
    const flagged = REAL_CASES.filter(
      (c) => verify(c.answer, c.given).outcome === "mismatch",
    ).map((c) => c.id);
    expect(flagged).toEqual(KNOWN_WRONG);
  });

  it("хибних відхилень не більше 2 із 87 (спека), фактично нуль", () => {
    const falseRejections = REAL_CASES.filter(
      (c) =>
        !KNOWN_WRONG.includes(c.id) &&
        verify(c.answer, c.given).outcome === "mismatch",
    ).reduce((n, c) => n + c.occurrences, 0);
    expect(falseRejections).toBeLessThanOrEqual(2);
    expect(falseRejections).toBe(0);
  });

  it("корпус не порожній за змістом: чимало чисел виведено, а не лише дослівних", () => {
    let given = 0;
    let derived = 0;
    for (const c of REAL_CASES) {
      for (const s of verify(c.answer, c.given).scoped) {
        if (s.explained === "given") given += 1;
        if (s.explained === "derived") derived += 1;
      }
    }
    expect(given).toBeGreaterThan(150);
    expect(derived).toBeGreaterThan(20);
  });
});

describe("іменовані реальні відповіді", () => {
  it("45 050 замість 47 050: розбіжність, виправлена сума проходить", () => {
    const c = realCase("eval-L3765");
    const operands = [12000, 250, 34000, 800];
    const trueTotal = operands.reduce((a, b) => a + b, 0);
    const claimed = 45050;
    expect(claimed).not.toBe(trueTotal);
    expect(trueTotal).toBe(47050);
    expect(unexplainedValues(c.answer, c.given)).toEqual([claimed]);
    const fixed = c.answer.replace(String(claimed), String(trueTotal));
    expect(verify(fixed, c.given).outcome).toBe("ok");
  });

  it("ланцюжок 32 000 - 18 090 = 13 910 (реальна відповідь)", () => {
    const c = realCase("eval-L2635");
    const r = verify(c.answer, c.given);
    expect(r.outcome).toBe("ok");
    const byValue = new Map(r.scoped.map((s) => [s.token.value, s.explained]));
    expect(32000 - 18090).toBe(13910);
    expect(8420 + 4870 + 2600 + 1310 + 890).toBe(18090);
    expect(byValue.get(18090)).toBe("derived");
    expect(byValue.get(13910)).toBe("derived");
    expect(byValue.get(13290)).toBe("derived");
    expect(byValue.get(32000)).toBe("given");
  });

  it("ланцюжок у касеті: 200 + 150 = 350, 640 - 350 = 290", () => {
    const c = REAL_CASES.find((x) => x.source.endsWith(":709"))!;
    const byValue = new Map(
      verify(c.answer, c.given).scoped.map((s) => [s.token.value, s.explained]),
    );
    expect(200 + 150).toBe(350);
    expect(640 - 350).toBe(290);
    expect(byValue.get(350)).toBe("derived");
    expect(byValue.get(290)).toBe("derived");
  });

  it("групування: «18 090» у відповіді проти «8420» у поданому без групи", () => {
    const c = realCase("eval-L2671");
    expect(c.answer).toContain("18 090");
    expect(c.given.toolResults?.[0]).toContain("8420");
    expect(verify(c.answer, c.given).outcome).toBe("ok");
  });

  it("жирне **960 грн** (реальна відповідь)", () => {
    const c = realCase("eval-L2467");
    expect(c.answer).toContain("**960 грн**");
    expect(verify(c.answer, c.given).outcome).toBe("ok");
  });

  it("порожні дані: відповіді без сум не мають перевірюваних чисел", () => {
    for (const id of ["eval-L2858", "eval-L2923", "eval-L2943"]) {
      expect(verify(realCase(id).answer, realCase(id).given).outcome).toBe(
        "no_scoped",
      );
    }
  });

  it("порожні дані: вигадана сума при порожньому результаті - розбіжність", () => {
    const c = realCase("eval-L2858");
    const invented = `${c.answer} Орієнтовно 4500 грн на тиждень.`;
    expect(verify(invented, c.given).outcome).toBe("mismatch");
  });
});

// ── Мутації ────────────────────────────────────────────────────────────

/** Значення перевірюваних токенів, які дослівно є в поданому. */
function literalScopedValues(c: RealCase): number[] {
  const values = verify(c.answer, c.given)
    .scoped.filter((s) => s.explained === "given")
    .map((s) => s.token.value);
  return [...new Set(values)];
}

interface Mutation {
  caseId: string;
  text: string;
  given: GivenSources;
}

const SUM_DELTAS = [-2000, -1000, -500, -100, -50, 50, 100, 500, 1000, 2000];

/** Підроблена сума: справжня сума операндів відповіді зі зсувом, дописана «Разом …». */
function forgedSums(seed: number, perCase: number): Mutation[] {
  const rand = mulberry32(seed);
  const out: Mutation[] = [];
  for (const c of REAL_CASES) {
    const operands = literalScopedValues(c);
    if (operands.length < 2) continue;
    for (let k = 0; k < perCase; k++) {
      const size = 2 + Math.floor(rand() * Math.min(3, operands.length - 1));
      const chosen = shuffled(rand, operands).slice(0, size);
      const forged = Math.max(
        100,
        chosen.reduce((a, b) => a + b, 0) + pick(rand, SUM_DELTAS),
      );
      out.push({
        caseId: c.id,
        text: `${c.answer}\n\nРазом ${forged} грн.`,
        given: c.given,
      });
    }
  }
  return out;
}

const TOKEN_DELTAS = [-1000, -300, -100, -30, -10, 10, 30, 100, 300, 1000];

/** Підроблене число: один токен відповіді замінено на значення зі зсувом. */
function perturbedTokens(seed: number): Mutation[] {
  const rand = mulberry32(seed);
  const out: Mutation[] = [];
  for (const c of REAL_CASES) {
    for (const token of extractNumberTokens(c.answer)) {
      if (!token.scoped) continue;
      const numeral = /^[\d \u00A0\u202F.,]+/.exec(
        c.answer.slice(token.start, token.end),
      )?.[0];
      if (!numeral) continue;
      const delta = pick(rand, TOKEN_DELTAS);
      const forged =
        token.value + delta >= 100
          ? token.value + delta
          : token.value + Math.abs(delta);
      const from = token.start;
      const to = token.start + numeral.trimEnd().length;
      out.push({
        caseId: c.id,
        text: `${c.answer.slice(0, from)}${forged}${c.answer.slice(to)}`,
        given: c.given,
      });
    }
  }
  return out;
}

function rejectionRate(mutations: readonly Mutation[]): {
  rejected: number;
  total: number;
  accepted: Mutation[];
} {
  const accepted = mutations.filter(
    (m) => verify(m.text, m.given).outcome !== "mismatch",
  );
  return {
    rejected: mutations.length - accepted.length,
    total: mutations.length,
    accepted,
  };
}

describe("мутаційний тест: підроблені суми й числа відхиляються", () => {
  it("підроблені суми з чисел відповіді відхиляються у ≥95%", () => {
    const { rejected, total, accepted } = rejectionRate(
      forgedSums(20260922, 8),
    );
    expect(total).toBeGreaterThan(300);
    expect(rejected / total).toBeGreaterThanOrEqual(0.95);
    // Усе, що пройшло, збіглось випадково, і оракул з цим згоден.
    for (const m of accepted) {
      expect(oracle(m.text, m.given).outcome).not.toBe("mismatch");
    }
  });

  it("підмінене число (зсув ±10…±1000) відхиляється у ≥95%", () => {
    const { rejected, total, accepted } = rejectionRate(perturbedTokens(7));
    expect(total).toBeGreaterThan(150);
    expect(rejected / total).toBeGreaterThanOrEqual(0.95);
    for (const m of accepted) {
      expect(oracle(m.text, m.given).outcome).not.toBe("mismatch");
    }
  });

  it("бібліотека й оракул збігаються на кожній мутації, не лише в середньому", () => {
    for (const m of [...forgedSums(11, 2), ...perturbedTokens(3)]) {
      expect(verify(m.text, m.given).outcome).toBe(
        oracle(m.text, m.given).outcome,
      );
    }
  });
});

// ── Шум у контексті ────────────────────────────────────────────────────

/** 60 «сум контексту»: суми пар і трійок чисел самого подання, дописані як довідка. */
function noiseSums(c: RealCase, rand: () => number): string[] {
  const base = [
    ...new Set(
      extractNumberTokens(givenText(c.given))
        .map((t) => t.value)
        .filter((v) => v >= 100),
    ),
  ];
  if (base.length < 2) return [];
  return Array.from({ length: 60 }, () => {
    const size = Math.min(base.length, 2 + Math.floor(rand() * 2));
    const sum = shuffled(rand, base)
      .slice(0, size)
      .reduce((a, b) => a + b, 0);
    return `Довідка: ${sum} грн.`;
  });
}

function withNoise(c: RealCase, rand: () => number): GivenSources {
  return {
    ...c.given,
    contexts: [...(c.given.contexts ?? []), ...noiseSums(c, rand)],
  };
}

describe("шум: ще 60 сум у контексті не прикриває вигадане", () => {
  it("вердикти справжніх відповідей не змінюються", () => {
    const rand = mulberry32(99);
    for (const c of REAL_CASES) {
      const noisy = withNoise(c, rand);
      expect({ id: c.id, outcome: verify(c.answer, noisy).outcome }).toEqual({
        id: c.id,
        outcome: verify(c.answer, c.given).outcome,
      });
    }
  });

  it("підроблені суми й під шумом відхиляються у ≥95%", () => {
    const rand = mulberry32(5);
    const noisyByCase = new Map(
      REAL_CASES.map((c) => [c.id, withNoise(c, rand)]),
    );
    const mutations = forgedSums(20260922, 8).map((m) => ({
      ...m,
      given: noisyByCase.get(m.caseId) ?? m.given,
    }));
    const { rejected, total } = rejectionRate(mutations);
    expect(total).toBeGreaterThan(300);
    expect(rejected / total).toBeGreaterThanOrEqual(0.95);
  });

  it("порожнє подане нічого не пояснює, навіть якщо відповідь складена з сум", () => {
    const c = realCase("eval-L3743");
    const r = verifyNumbers(c.answer, EMPTY_GIVEN);
    expect(r.outcome).toBe("mismatch");
    expect(r.scoped.some((s) => s.explained !== "none")).toBe(false);
  });
});
