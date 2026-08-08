// Тести моделі юніт-економіки.
//
// WHY: попередні розрахунки економіки жили в прозі і мовчки ламались — у
// 01-monetization-and-pricing.md §9.4 беззбитковість ділила фіксовані витрати
// на число, яке той самий абзац двома рядками вище спростовував. Арифметику,
// що визначає рішення про ціну і квоти, треба тримати під тестом.

import test from "node:test";
import assert from "node:assert/strict";
import {
  anonAiCostUsd,
  breakEven,
  breakEvenConversion,
  contributionMargin,
  fixedCosts,
  freeAiCostUsd,
  loadAssumptions,
  ltv,
  proAiCostUsd,
  revenue,
  trialCost,
  unitsPerMessage,
} from "../economics/model.mjs";

const a = loadAssumptions();

test("blended ARPU лежить між річним і місячним планом", () => {
  const r = revenue(a);
  assert.ok(r.blendedArpuUah < r.monthlyUah);
  assert.ok(r.blendedArpuUah > r.annualMonthlyUah);
});

test("податок і еквайринг рахуються від повного платежу, не по черзі", () => {
  const r = revenue(a);
  const expected = r.blendedArpuUah * (1 - r.taxRate - r.acquiringRate);
  assert.ok(Math.abs(r.netRevenueUah - expected) < 1e-9);
});

test("одиниць на повідомлення — між 1 і вартістю tool-виклику", () => {
  const perMsg = unitsPerMessage(a);
  assert.ok(perMsg >= 1);
  assert.ok(perMsg <= a.quota.toolCostUnits.value);
});

test("AI-COGS монотонно зростає з інтенсивністю профілю", () => {
  const light = proAiCostUsd(a, "light").usd;
  const medium = proAiCostUsd(a, "medium").usd;
  const ceiling = proAiCostUsd(a, "ceiling").usd;
  assert.ok(light < medium, "light має бути дешевшим за medium");
  assert.ok(medium < ceiling, "medium має бути дешевшим за стелю");
});

test("тиринг Pro: після premium-відра трафік їде standard, далі floor", () => {
  const { msgsPerDayByTier: tiers } = proAiCostUsd(a, "ceiling");
  const perMsg = unitsPerMessage(a);
  assert.ok(
    Math.abs(tiers.premiumMsgs - a.quota.proPremiumUnitsPerDay.value / perMsg) <
      1e-9,
  );
  assert.ok(
    Math.abs(
      tiers.standardMsgs - a.quota.proStandardUnitsPerDay.value / perMsg,
    ) < 1e-9,
  );
  assert.ok(tiers.floorMsgs > 0, "стеля мусить діставати безлімітного floor");
});

test("Free не може витратити більше, ніж дозволяє денна квота", () => {
  const perMsg = unitsPerMessage(a);
  const free = freeAiCostUsd(a);
  const usedUnits = free.msgsPerDay * perMsg + a.usage.freeProfile.coachPerDay;
  assert.ok(
    usedUnits <= a.quota.freeUnitsPerDay.value + 1e-9,
    `Free з'їв ${usedUnits} одиниць при ліміті ${a.quota.freeUnitsPerDay.value}`,
  );
});

test("анонім дешевший за Free, Free дешевший за платника", () => {
  assert.ok(anonAiCostUsd(a).usd < freeAiCostUsd(a).usd);
  assert.ok(freeAiCostUsd(a).usd < proAiCostUsd(a, "medium").usd);
});

test("вартість trial на одного платника росте при падінні конверсії", () => {
  const base = trialCost(a).perPaidUah;
  const worse = JSON.parse(JSON.stringify(a));
  worse.funnel.conversionFreeToPaid.value /= 2;
  assert.ok(trialCost(worse).perPaidUah > base);
});

test("ЄСВ і Vercel Pro з'являються лише на фазах із платежами", () => {
  const beta = fixedCosts(a, "beta");
  const launch = fixedCosts(a, "launch");
  assert.ok(launch.totalUah > beta.totalUah);
  const esv = launch.lines.find((l) => l.label.startsWith("ЄСВ"));
  assert.equal(esv.uah, a.taxes.esvMonthlyUah.value);
  assert.equal(beta.lines.find((l) => l.label.startsWith("ЄСВ")).uah, 0);
});

test("Free-когорта завжди зменшує внесок платника", () => {
  const own = contributionMargin(a, { includeFreeCohort: false });
  const full = contributionMargin(a, { includeFreeCohort: true });
  assert.ok(full.marginUah < own.marginUah);
  assert.ok(full.freeCohortUah > 0);
});

test("на критичній конверсії внесок дорівнює нулю", () => {
  const c = breakEvenConversion(a);
  const at = JSON.parse(JSON.stringify(a));
  at.funnel.conversionFreeToPaid.value = c;
  const margin = contributionMargin(at, { includeFreeCohort: true }).marginUah;
  assert.ok(
    Math.abs(margin) < 1e-6,
    `внесок на критичній конверсії має бути 0, отримано ${margin}`,
  );
});

test("нижче критичної конверсії беззбитковості не існує", () => {
  const below = JSON.parse(JSON.stringify(a));
  below.funnel.conversionFreeToPaid.value = breakEvenConversion(a) * 0.9;
  assert.equal(
    breakEven(below, { includeFreeCohort: true }).subscribers,
    Infinity,
  );
});

test("беззбитковість = фіксовані витрати / внесок", () => {
  const be = breakEven(a, { includeFreeCohort: false, phase: "launch" });
  assert.ok(
    Math.abs(be.subscribers - be.fixedUah / be.marginUah) < 1e-9,
    "дільник мусить бути тим самим внеском, що надрукований поруч",
  );
});

test("LTV рахується на внеску, а не на виручці", () => {
  const l = ltv(a, { includeFreeCohort: false });
  const cm = contributionMargin(a, { includeFreeCohort: false });
  assert.ok(l.ltvUah < cm.blendedArpuUah * l.lifetimeMonths);
  assert.ok(l.cacTrialUah > 0, "reverse trial мусить потрапити в CAC");
});
