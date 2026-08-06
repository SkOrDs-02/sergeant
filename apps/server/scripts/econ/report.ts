/**
 * Last validated: 2026-08-06
 * Status: Active
 *
 * Рендер звіту юніт-економіки AI-шару в markdown.
 *
 * AI-GENERATED: `docs/90-work/audits/ai-unit-economics-2026-08-06.md`
 * генерується звідси. Правити треба цей файл, не доку.
 */

import {
  callCostUsd,
  isBudgetVisible,
  measureChatPrefix,
  minCacheable,
  priceFor,
  TOOL_COUNT,
  tokensFromChars,
  type TokenBand,
} from "./model.js";
import {
  CHAT_CONTEXT,
  CHAT_MAX_TOKENS,
  CHAT_MODELS,
  CHAT_TOOL_RESULT,
  CHAT_USER_MSG,
  COMMERCE,
  PERSONAS,
  PIPELINES,
  type Persona,
  type Pipeline,
  type TextBlock,
} from "./inventory.js";

export type Gateway = "anthropic" | "openrouter";

const FIRST_TURN_OUTPUT_RATIO = 0.25;
const SYNTHESIS_OUTPUT_RATIO = 0.35;

const tok = (b: TextBlock, band: TokenBand) =>
  tokensFromChars(b[0], b[1], band);
const usd = (v: number | null, digits = 4) =>
  v === null ? "—" : `$${v.toFixed(digits)}`;

// ── Вартість одного виклику не-чатового шляху ────────────────────────

export function pipelineCost(
  p: Pipeline,
  gateway: Gateway,
  band: TokenBand = "mid",
): number | null {
  const model = gateway === "anthropic" ? p.anthropicModel : p.gatewayModel;
  return callCostUsd({
    model,
    prefixTokens: tok(p.system, band),
    freshTokens: tok(p.user, band) + (p.imageTokens ?? 0),
    outputTokens: Math.round(p.maxTokens * p.outputRatio),
    cached: false,
  });
}

// ── Вартість одного повідомлення в чат ───────────────────────────────

export interface ChatCost {
  firstTurn: number | null;
  synthesis: number | null;
  /** Очікувана вартість повідомлення з урахуванням частоти tool-use. */
  expected: number | null;
  prefixTokens: number;
  inContextTools: number;
  cacheActive: boolean;
}

export function chatMessageCost(
  gateway: Gateway,
  tier: Persona["tier"],
  opts: {
    contextKey?: keyof typeof CHAT_CONTEXT;
    toolUseRate: number;
    sessionMessages: number;
    band?: TokenBand;
  },
): ChatCost {
  const band = opts.band ?? "mid";
  const ctx = CHAT_CONTEXT[opts.contextKey ?? "typical"]!;
  const firstModel = CHAT_MODELS[gateway].firstTurn;
  const synthModel = CHAT_MODELS[gateway][tier];

  const p1 = measureChatPrefix(firstModel, band);
  const p2 = measureChatPrefix(synthModel, band);
  const cached = gateway === "anthropic";

  const firstTurn = callCostUsd({
    model: firstModel,
    prefixTokens: p1.tokens,
    freshTokens: tok(ctx, band) + tok(CHAT_USER_MSG, band),
    outputTokens: Math.round(
      CHAT_MAX_TOKENS.firstTurn * FIRST_TURN_OUTPUT_RATIO,
    ),
    cached,
    sessionMessages: opts.sessionMessages,
  });

  const synthesis = callCostUsd({
    model: synthModel,
    prefixTokens: p2.tokens,
    freshTokens:
      tok(ctx, band) + tok(CHAT_USER_MSG, band) + tok(CHAT_TOOL_RESULT, band),
    outputTokens: Math.round(
      CHAT_MAX_TOKENS.synthesis * SYNTHESIS_OUTPUT_RATIO,
    ),
    cached,
    sessionMessages: opts.sessionMessages,
  });

  const expected =
    firstTurn === null || synthesis === null
      ? null
      : firstTurn + opts.toolUseRate * synthesis;

  const min = minCacheable(synthModel);
  return {
    firstTurn,
    synthesis,
    expected,
    prefixTokens: p1.tokens,
    inContextTools: p1.inContextTools,
    cacheActive: cached && min !== null && p2.tokens >= min,
  };
}

// ── Місячна вартість персони ─────────────────────────────────────────

export interface PersonaCost {
  chat: number;
  other: number;
  total: number;
  byPipeline: Array<{ key: string; usd: number }>;
}

/**
 * Вартість чату за місяць. `chatTierMix` (Pro на стелі) рахується по тирах
 * окремо: перші 20 викликів доби йдуть premium-моделлю, решта — standard,
 * і різниця між ними кратна. Персони без mix лишаються на одному тирі.
 */
function chatMonthlyCost(
  persona: Persona,
  gateway: Gateway,
  band: TokenBand,
): number {
  const perTier = (tier: Persona["tier"], messages: number) =>
    (chatMessageCost(gateway, tier, {
      toolUseRate: persona.toolUseRate,
      sessionMessages: persona.sessionMessages,
      band,
    }).expected ?? 0) * messages;

  if (persona.chatTierMix) {
    return Object.entries(persona.chatTierMix).reduce(
      (sum, [tier, messages]) =>
        sum + perTier(tier as Persona["tier"], messages ?? 0),
      0,
    );
  }
  return perTier(persona.tier, persona.chatMessages);
}

export function personaCost(
  persona: Persona,
  gateway: Gateway,
  band: TokenBand = "mid",
): PersonaCost {
  const chat = chatMonthlyCost(persona, gateway, band);

  const byPipeline: Array<{ key: string; usd: number }> = [];
  let other = 0;
  for (const p of PIPELINES) {
    const n = persona.perMonth[p.key] ?? 0;
    if (!n) continue;
    const c = pipelineCost(p, gateway, band);
    if (c === null) continue;
    other += c * n;
    byPipeline.push({ key: p.key, usd: c * n });
  }
  byPipeline.sort((a, b) => b.usd - a.usd);
  return { chat, other, total: chat + other, byPipeline };
}

// ── Парк ─────────────────────────────────────────────────────────────

export interface FleetRow {
  mau: number;
  aiCogsUsd: number;
  payingUsers: number;
  revenueUsd: number;
  grossUsd: number;
  marginPct: number;
}

export function fleet(
  mau: number,
  gateway: Gateway,
  band: TokenBand = "mid",
): FleetRow {
  const proUsd = COMMERCE.proMonthlyUahKopiykas / 100 / COMMERCE.uahPerUsd;
  let cogs = 0;
  let paying = 0;
  for (const persona of PERSONAS) {
    const share =
      COMMERCE.fleetMix[persona.key as keyof typeof COMMERCE.fleetMix] ?? 0;
    const n = mau * share;
    cogs += personaCost(persona, gateway, band).total * n;
    if (persona.key.startsWith("pro")) paying += n;
  }
  const revenue = paying * proUsd * (1 - COMMERCE.paymentFeeRate);
  const gross = revenue - cogs - COMMERCE.fixedMonthlyUsd;
  return {
    mau,
    aiCogsUsd: cogs,
    payingUsers: paying,
    revenueUsd: revenue,
    grossUsd: gross,
    marginPct: revenue > 0 ? (gross / revenue) * 100 : Number.NaN,
  };
}

/** Скільки Pro треба, щоб покрити фікс + AI-COGS усього парку при цьому міксі. */
export function breakevenMau(
  gateway: Gateway,
  band: TokenBand = "mid",
): number | null {
  for (let mau = 10; mau <= 200_000; mau += 10) {
    if (fleet(mau, gateway, band).grossUsd >= 0) return mau;
  }
  return null;
}

// ── Markdown ─────────────────────────────────────────────────────────

function table(head: string[], rows: string[][]): string {
  return [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

export function renderInventoryTable(): string {
  return table(
    [
      "Шлях",
      "Anthropic-модель",
      "Модель під дефолтним роутингом",
      "Шлюз",
      "max_tokens",
      "Тригер",
    ],
    PIPELINES.map((p) => [
      `\`${p.key}\``,
      `\`${p.anthropicModel}\``,
      `\`${p.gatewayModel}\``,
      p.defaultGateway,
      String(p.maxTokens),
      p.trigger,
    ]),
  );
}

export function renderPipelineCostTable(band: TokenBand): string {
  return table(
    [
      "Шлях",
      "Anthropic $/виклик",
      "Дефолтний роутинг $/виклик",
      "Різниця",
      "Ціна відома гварду?",
    ],
    PIPELINES.map((p) => {
      const a = pipelineCost(p, "anthropic", band);
      const g = pipelineCost(p, "openrouter", band);
      const ratio =
        a !== null && g !== null && g > 0 ? `${(a / g).toFixed(1)}×` : "—";
      return [
        `\`${p.key}\``,
        usd(a),
        usd(g),
        ratio,
        isBudgetVisible(p.gatewayModel) ? "так" : "**ні**",
      ];
    }),
  );
}

export function renderChatTable(band: TokenBand): string {
  const rows: string[][] = [];
  for (const gateway of ["anthropic", "openrouter"] as const) {
    for (const tier of ["premium", "standard", "floor"] as const) {
      const c = chatMessageCost(gateway, tier, {
        toolUseRate: 0.6,
        sessionMessages: 5,
        band,
      });
      rows.push([
        gateway,
        tier,
        `\`${CHAT_MODELS[gateway][tier]}\``,
        String(c.inContextTools),
        c.prefixTokens.toLocaleString("uk-UA"),
        c.cacheActive ? "так" : "ні",
        usd(c.firstTurn),
        usd(c.synthesis),
        `**${usd(c.expected)}**`,
      ]);
    }
  }
  return table(
    [
      "Шлюз",
      "Тир",
      "Модель синтезу",
      "Tools у контексті",
      "Префікс, токенів",
      "Кеш",
      "$ тур 1",
      "$ тур 2",
      "$ / повідомлення",
    ],
    rows,
  );
}

export function renderPersonaTable(band: TokenBand): string {
  const proUsd = COMMERCE.proMonthlyUahKopiykas / 100 / COMMERCE.uahPerUsd;
  return table(
    [
      "Персона",
      "Повідомлень/міс",
      "Anthropic $/міс",
      "Дефолтний роутинг $/міс",
      "з них чат",
      "Проти ₴199",
    ],
    PERSONAS.map((p) => {
      const a = personaCost(p, "anthropic", band);
      const g = personaCost(p, "openrouter", band);
      const verdict =
        p.key === "free"
          ? "виручки немає"
          : g.total > proUsd
            ? `**збиток ${usd(g.total - proUsd, 2)}**`
            : `маржа ${(((proUsd - g.total) / proUsd) * 100).toFixed(0)} %`;
      return [
        p.label,
        String(p.chatMessages),
        usd(a.total, 2),
        usd(g.total, 2),
        `${((g.chat / g.total) * 100).toFixed(0)} %`,
        verdict,
      ];
    }),
  );
}

export function renderFleetTable(band: TokenBand): string {
  return table(
    ["MAU", "Платних", "Виручка/міс", "AI-COGS/міс", "Валовий/міс", "Маржа"],
    [100, 1_000, 10_000, 100_000].map((mau) => {
      const f = fleet(mau, "openrouter", band);
      return [
        mau.toLocaleString("uk-UA"),
        f.payingUsers.toFixed(0),
        usd(f.revenueUsd, 0),
        usd(f.aiCogsUsd, 0),
        usd(f.grossUsd, 0),
        `${f.marginPct.toFixed(0)} %`,
      ];
    }),
  );
}

/**
 * Хто саме створює COGS парку. Окрема таблиця, бо інтуїція тут systematically
 * помиляється: «найбільше юзерів» ≠ «найбільше витрат», і різниця між цими
 * двома відповідями і є те, куди має йти наступний важіль.
 */
export function renderCogsMixTable(mau: number, band: TokenBand): string {
  const rows = PERSONAS.map((p) => {
    const share =
      COMMERCE.fleetMix[p.key as keyof typeof COMMERCE.fleetMix] ?? 0;
    const n = mau * share;
    return { p, n, cogs: personaCost(p, "openrouter", band).total * n };
  });
  const total = rows.reduce((a, r) => a + r.cogs, 0);
  return table(
    [
      "Персона",
      "Частка MAU",
      `Юзерів (${mau.toLocaleString("uk-UA")} MAU)`,
      "COGS/міс",
      "Частка COGS",
    ],
    rows
      .sort((a, b) => b.cogs - a.cogs)
      .map((r) => [
        r.p.label,
        `${(COMMERCE.fleetMix[r.p.key as keyof typeof COMMERCE.fleetMix] * 100).toFixed(0)} %`,
        r.n.toFixed(0),
        usd(r.cogs, 0),
        `**${((r.cogs / total) * 100).toFixed(0)} %**`,
      ]),
  );
}

interface CogsRow {
  label: string;
  key: string;
  /** Частка COGS парку, %. */
  share: number;
  /** Частка чисельності парку, %. */
  headcount: number;
}

function cogsRows(mau: number, band: TokenBand): CogsRow[] {
  const rows = PERSONAS.map((p) => {
    const mix = COMMERCE.fleetMix[p.key as keyof typeof COMMERCE.fleetMix] ?? 0;
    return {
      p,
      mix,
      cogs: personaCost(p, "openrouter", band).total * mau * mix,
    };
  });
  const total = rows.reduce((a, r) => a + r.cogs, 0);
  return rows
    .sort((a, b) => b.cogs - a.cogs)
    .map((r) => ({
      label: r.p.label,
      key: r.p.key,
      share: (r.cogs / total) * 100,
      headcount: r.mix * 100,
    }));
}

/** Найбільша за COGS персона при заданому міксі — щоб проза не вгадувала. */
export function topCogsPersona(mau: number, band: TokenBand = "mid"): CogsRow {
  return cogsRows(mau, band)[0]!;
}

/** Частка COGS конкретної персони — для тверджень про хвіст. */
export function cogsShareOf(
  key: string,
  mau: number,
  band: TokenBand = "mid",
): CogsRow {
  return cogsRows(mau, band).find((r) => r.key === key)!;
}

/**
 * Яку частку вартості повідомлення з'їдає сам префікс (tools + системний
 * промпт) — тобто скільки коштує розмова ще до того, як модель прочитала
 * питання.
 */
export function prefixShareOfMessage(
  gateway: Gateway,
  tier: Persona["tier"],
  band: TokenBand = "mid",
): number {
  const model = CHAT_MODELS[gateway].firstTurn;
  const p = measureChatPrefix(model, band);
  const price = priceFor(model);
  if (!price) return Number.NaN;
  const full = chatMessageCost(gateway, tier, {
    toolUseRate: 0,
    sessionMessages: 5,
    band,
  }).firstTurn;
  if (!full) return Number.NaN;
  return ((p.tokens * price.input) / 1e6 / full) * 100;
}

export function renderBandTable(): string {
  return table(
    ["Смуга оцінки", "Pro (типовий) $/міс", "Парк 1 000 MAU, AI-COGS/міс"],
    (["lo", "mid", "hi"] as const).map((band) => {
      const pro = PERSONAS.find((p) => p.key === "pro-typical")!;
      return [
        band === "mid" ? "**mid (базова)**" : band,
        usd(personaCost(pro, "openrouter", band).total, 2),
        usd(fleet(1_000, "openrouter", band).aiCogsUsd, 0),
      ];
    }),
  );
}

export function renderPriceTable(): string {
  const models = [
    ...new Set([
      ...Object.values(CHAT_MODELS.anthropic),
      ...Object.values(CHAT_MODELS.openrouter),
      ...PIPELINES.map((p) => p.anthropicModel),
      ...PIPELINES.map((p) => p.gatewayModel),
    ]),
  ].sort();
  return table(
    [
      "Модель",
      "$/1M вхід",
      "$/1M вихід",
      "Джерело ціни",
      "Бачить бюджетний гвард",
    ],
    models.map((m) => {
      const p = priceFor(m);
      return [
        `\`${m}\``,
        p ? p.input.toFixed(2) : "—",
        p ? p.output.toFixed(2) : "—",
        p?.source ?? "**невідома**",
        isBudgetVisible(m) ? "так" : "**ні**",
      ];
    }),
  );
}

export const FACTS = {
  toolCount: TOOL_COUNT,
  anthropicPrefix: measureChatPrefix("claude-sonnet-4-6"),
  gatewayPrefix: measureChatPrefix("deepseek/deepseek-v4-flash"),
  breakevenAnthropic: breakevenMau("anthropic"),
  breakevenGateway: breakevenMau("openrouter"),
};
