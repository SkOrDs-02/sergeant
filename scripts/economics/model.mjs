// ---------------------------------------------------------------------------
// model.mjs — юніт-економіка Sergeant як обчислювана функція, а не таблиця в
// прозі.
// ---------------------------------------------------------------------------
//
// WHY THIS EXISTS
//   Цифри економіки жили в чотирьох доках і розійшлися між собою: breakeven
//   називався 12, 17 і 30 в трьох місцях, а рядок «AI marginal cost ≈ ₴5/міс»
//   пережив два переписування вартості AI. Один із розрахунків ділив на число,
//   яке сам же двома рядками вище спростував.
//
//   Тут кожне число має рівно одне джерело: `assumptions.json` (вхідні
//   параметри з позначкою довіри) і функції нижче (арифметика). Док
//   `07-unit-economics.md` не містить власних обчислень — він читає те, що
//   згенерував `generate-unit-economics.mjs`.
//
// Модуль чистий: жодного I/O крім читання JSON-параметрів.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadAssumptions(path = resolve(__dirname, "assumptions.json")) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** `{ value: X }` або голе число — обидві форми читаються однаково. */
const v = (node) => (node && typeof node === "object" ? node.value : node);

export const usdToUah = (a, usd) => usd * v(a.fx.uahPerUsd);

// ── Виручка ────────────────────────────────────────────────────────────────

export function revenue(a) {
  const monthly = v(a.pricing.proMonthlyUah);
  const annualMonthly = v(a.pricing.proAnnualUah) / 12;
  const annualShare = v(a.pricing.annualShare);
  const blended = monthly * (1 - annualShare) + annualMonthly * annualShare;

  const taxRate = v(a.taxes.singleTaxRate) + v(a.taxes.militaryLevyRate);
  const acquiringRate = v(a.acquiring.primaryRate);

  // Єдиний податок і військовий збір рахуються від ПОВНОЇ суми, яку заплатив
  // покупець, а не від суми за мінусом еквайрингу — тому обидві ставки
  // множаться на gross, а не по черзі.
  const tax = blended * taxRate;
  const acquiring = blended * acquiringRate;

  return {
    monthlyUah: monthly,
    annualMonthlyUah: annualMonthly,
    blendedArpuUah: blended,
    taxUah: tax,
    acquiringUah: acquiring,
    netRevenueUah: blended - tax - acquiring,
    taxRate,
    acquiringRate,
  };
}

// ── AI-COGS ────────────────────────────────────────────────────────────────

/**
 * Скільки одиниць квоти коштує одне повідомлення в середньому.
 * Виклик з інструментом коштує `toolCostUnits`, звичайний — одну.
 */
export function unitsPerMessage(a) {
  return 1 + v(a.quota.toolShare) * (v(a.quota.toolCostUnits) - 1);
}

/**
 * Вартість чату за добу з урахуванням тирингу: премʼєр-модель до вичерпання
 * денного відра, далі standard, далі безлімітний floor.
 *
 * `premiumUnits === null` означає «премʼєр-тиру немає» (Free/анон після
 * 2026-08-06 їдуть standard-моделлю синтезу).
 */
export function chatCostPerDayUsd(
  a,
  { msgsPerDay, premiumUnits, standardUnits },
) {
  const perMsg = unitsPerMessage(a);
  const first = v(a.ai.chatFirstTurnUsd);
  const premiumSynth = v(a.ai.chatSynthesisPremiumUsd);
  const standardSynth = v(a.ai.chatSynthesisStandardUsd);
  const floorSynth = v(a.ai.chatSynthesisFloorUsd);

  const premiumMsgs =
    premiumUnits === null ? 0 : Math.min(msgsPerDay, premiumUnits / perMsg);
  const standardMsgs =
    standardUnits === null
      ? msgsPerDay - premiumMsgs
      : Math.min(msgsPerDay - premiumMsgs, standardUnits / perMsg);
  const floorMsgs = Math.max(0, msgsPerDay - premiumMsgs - standardMsgs);

  return {
    premiumMsgs,
    standardMsgs,
    floorMsgs,
    usd:
      premiumMsgs * (first + premiumSynth) +
      standardMsgs * (first + standardSynth) +
      floorMsgs * (first + floorSynth),
  };
}

/** Місячний AI-COGS одного Pro-користувача за профілем використання. */
export function proAiCostUsd(a, profileName) {
  const p = a.usage.profiles[profileName];
  const days = v(a.usage.daysPerMonth);

  const chat = chatCostPerDayUsd(a, {
    msgsPerDay: p.chatMsgsPerDay,
    premiumUnits: v(a.quota.proPremiumUnitsPerDay),
    standardUnits: v(a.quota.proStandardUnitsPerDay),
  });

  const chatUsd = chat.usd * days;
  const coachUsd = p.coachPerDay * days * v(a.ai.coachUsd);
  const visionUsd = p.photosPerDay * days * v(a.ai.visionUsd);
  const digestUsd = (days / 7) * v(a.ai.digestUsd);
  const miscUsd = v(a.ai.miscPerUserMonthUsd);

  const usd = chatUsd + coachUsd + visionUsd + digestUsd + miscUsd;
  return {
    profile: profileName,
    chatUsd,
    coachUsd,
    visionUsd,
    digestUsd,
    miscUsd,
    usd,
    uah: usdToUah(a, usd),
    msgsPerDayByTier: chat,
  };
}

/**
 * Free-користувач. Денна порада коуча стоїть за тією ж квотою (ADR-0085), тож
 * вона з'їдає одиниці ПЕРШОЮ, а чат отримує залишок — інакше модель показала б
 * більше повідомлень, ніж код узагалі дозволяє.
 */
export function freeAiCostUsd(a) {
  const p = a.usage.freeProfile;
  const days = v(a.usage.daysPerMonth);
  const budget = v(a.quota.freeUnitsPerDay);
  const perMsg = unitsPerMessage(a);

  const coachPerDay = Math.min(p.coachPerDay, budget);
  const unitsLeft = Math.max(0, budget - coachPerDay);
  const msgsPerDay = Math.min(p.chatMsgsPerDay, unitsLeft / perMsg);

  const chat = chatCostPerDayUsd(a, {
    msgsPerDay,
    premiumUnits: null,
    standardUnits: null,
  });

  const chatUsd = chat.usd * days;
  const coachUsd = coachPerDay * days * v(a.ai.coachUsd);
  const usd = chatUsd + coachUsd;
  return { msgsPerDay, chatUsd, coachUsd, usd, uah: usdToUah(a, usd) };
}

/** Анонім: одна одиниця на добу на IP, standard-модель. */
export function anonAiCostUsd(a) {
  const days = v(a.usage.daysPerMonth);
  const perMsg = unitsPerMessage(a);
  const msgsPerDay = v(a.quota.anonUnitsPerDay) / perMsg;
  const chat = chatCostPerDayUsd(a, {
    msgsPerDay,
    premiumUnits: null,
    standardUnits: null,
  });
  const usd = chat.usd * days;
  return { msgsPerDay, usd, uah: usdToUah(a, usd) };
}

/**
 * Reverse trial: 7 днів повного Pro на КОЖНОГО, хто зареєструвався. Це не
 * маркетингова знижка, а витрата грошей — і вона лягає на кожен signup, а не
 * лише на того, хто потім заплатив.
 */
export function trialCost(a) {
  const pro = proAiCostUsd(a, v(a.funnel.trialUsageProfile));
  const days = v(a.usage.daysPerMonth);
  const perSignupUah = (pro.uah / days) * v(a.funnel.trialDays);
  const conversion = v(a.funnel.conversionFreeToPaid);
  return {
    perSignupUah,
    perPaidUah: perSignupUah / conversion,
    signupsPerPaid: 1 / conversion,
  };
}

// ── Фіксовані витрати ──────────────────────────────────────────────────────

export function fixedCosts(a, phaseName) {
  const phase = a.phases[phaseName];
  const lines = [];
  const push = (label, uah, note = "") => lines.push({ label, uah, note });

  push(
    "VPS під Coolify (API + Postgres + Redis)",
    usdToUah(a, phase.vpsUsdMonth ?? v(a.fixed.hetznerUsdMonth)),
  );
  push("Домен + Cloudflare", usdToUah(a, v(a.fixed.domainDnsUsdMonth)));
  push(
    "Apple Developer Program",
    usdToUah(a, v(a.fixed.appleDeveloperUsdYear) / 12),
  );

  // Vercel Hobby заявлений як non-commercial — щойно з'являється платна
  // підписка, фронт мусить переїхати на Pro. Це не «оптимізація», а умова
  // ліцензії, тому рядок з'являється разом із першим платежем, не пізніше.
  push(
    "Vercel (фронтенд)",
    phase.hasVercelPro ? usdToUah(a, v(a.fixed.vercelProUsdMonth)) : 0,
    phase.hasVercelPro
      ? "Pro — комерційне використання"
      : "Hobby — поки безкоштовно",
  );

  push(
    "ЄСВ (ФОП 3 група, мінімальний)",
    phase.hasFop ? v(a.taxes.esvMonthlyUah) : 0,
    phase.hasFop ? "не залежить від обороту" : "ФОП ще не зареєстровано",
  );

  const events = phase.mau * v(a.fixed.eventsPerMauMonth);
  const overage = Math.max(0, events - v(a.fixed.posthogFreeEventsPerMonth));
  push(
    "PostHog (понад free tier)",
    usdToUah(a, overage * v(a.fixed.posthogUsdPerEventOverage)),
    `${events.toLocaleString("uk-UA")} подій/міс при ${phase.mau} MAU`,
  );

  push("Sentry / Resend / Grafana / GitHub Actions", 0, "free tier достатній");

  const totalUah = lines.reduce((sum, l) => sum + l.uah, 0);
  return {
    phase: phaseName,
    label: phase.label,
    mau: phase.mau,
    lines,
    totalUah,
  };
}

// ── Маржа і точка беззбитковості ───────────────────────────────────────────

/**
 * Внесок одного Pro у покриття фіксованих витрат.
 *
 * `includeFreeCohort` — головний перемикач цієї моделі. Free-користувачі не
 * платять, але споживають AI, тож їхня вартість мусить лягати на когось. При
 * конверсії c на кожного платника припадає (1/c − 1) безкоштовних, і саме це
 * число, а не власне споживання платника, вирішує знак маржі.
 */
export function contributionMargin(
  a,
  { profile = "medium", includeFreeCohort = true } = {},
) {
  const rev = revenue(a);
  const pro = proAiCostUsd(a, profile);
  const free = freeAiCostUsd(a);
  const conversion = v(a.funnel.conversionFreeToPaid);
  const activeShare = v(a.usage.activeFreeShare);

  const freePerPaid = 1 / conversion - 1;
  const freeCohortUah = includeFreeCohort
    ? freePerPaid * activeShare * free.uah
    : 0;

  const marginUah = rev.netRevenueUah - pro.uah - freeCohortUah;
  return {
    profile,
    includeFreeCohort,
    blendedArpuUah: rev.blendedArpuUah,
    taxUah: rev.taxUah,
    acquiringUah: rev.acquiringUah,
    proAiUah: pro.uah,
    freePerPaid,
    activeFreePerPaid: freePerPaid * activeShare,
    freeCohortUah,
    marginUah,
    marginPct: (marginUah / rev.blendedArpuUah) * 100,
  };
}

export function breakEven(a, opts = {}) {
  const cm = contributionMargin(a, opts);
  const fixed = fixedCosts(a, opts.phase ?? "launch");
  return {
    ...cm,
    fixedUah: fixed.totalUah,
    phase: fixed.label,
    subscribers: cm.marginUah > 0 ? fixed.totalUah / cm.marginUah : Infinity,
  };
}

/**
 * Конверсія, за якої безкоштовний трафік з'їдає весь внесок платника.
 * Нижче цього числа кожен новий платник приносить збиток — скільки б їх не було.
 */
export function breakEvenConversion(a, { profile = "medium" } = {}) {
  const rev = revenue(a);
  const pro = proAiCostUsd(a, profile);
  const free = freeAiCostUsd(a);
  const activeShare = v(a.usage.activeFreeShare);
  const headroom = rev.netRevenueUah - pro.uah;
  if (headroom <= 0) return 1;
  // headroom = (1/c − 1) · activeShare · freeUah  ⇒  c = 1 / (headroom/(a·f) + 1)
  return 1 / (headroom / (activeShare * free.uah) + 1);
}

export function ltv(a, opts = {}) {
  const cm = contributionMargin(a, opts);
  const churn = v(a.funnel.monthlyChurn);
  const lifetimeMonths = 1 / churn;
  const trial = trialCost(a);
  const cac = v(a.funnel.cacAdsUah) + trial.perPaidUah;
  return {
    lifetimeMonths,
    ltvUah: cm.marginUah * lifetimeMonths,
    cacUah: cac,
    cacAdsUah: v(a.funnel.cacAdsUah),
    cacTrialUah: trial.perPaidUah,
    ratio: (cm.marginUah * lifetimeMonths) / cac,
    paybackMonths: cm.marginUah > 0 ? cac / cm.marginUah : Infinity,
  };
}
