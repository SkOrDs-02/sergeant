/**
 * Last validated: 2026-08-06
 * Status: Active
 *
 * `pnpm --filter @sergeant/server econ` — генерує
 * `docs/90-work/audits/ai-unit-economics-2026-08-06.md`.
 *
 * AI-CONTEXT: чому генератор, а не дока. Попередня оцінка юніт-економіки
 * (§ 9.5 монетизації) була прозою з числами, і протухла за 11 днів: 2026-08-04
 * чат переїхав на OpenRouter, а § 9.5 досі рахує Sonnet із prompt-cache. Той
 * самий клас дефекту, що описаний у `promptPrefixBudget.test.ts`: **цифра в
 * тексті не ламається, коли реальність від неї відходить**. Тут розміри
 * префікса й Anthropic-прайс читаються з продового коду на кожному прогоні,
 * тож зміна реєстру інструментів переписує доку, а не тихо її спростовує.
 *
 * Запуск без аргументів пише файл; `--stdout` друкує в консоль.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { COMMERCE, PERSONAS } from "./econ/inventory.js";
import {
  chatMessageCost,
  fleet,
  personaCost,
  prefixShareOfMessage,
  topCogsPersona,
} from "./econ/report.js";
import {
  FACTS,
  renderBandTable,
  renderChatTable,
  renderCogsMixTable,
  renderFleetTable,
  renderInventoryTable,
  renderPersonaTable,
  renderPipelineCostTable,
  renderPriceTable,
} from "./econ/report.js";

const OUT = resolve(
  import.meta.dirname,
  "../../../docs/90-work/audits/ai-unit-economics-2026-08-06.md",
);

const proUsd = COMMERCE.proMonthlyUah / COMMERCE.uahPerUsd;
const money = (v: number, d = 2) => `$${v.toFixed(d)}`;
const proTypical = PERSONAS.find((p) => p.key === "pro-typical")!;
const free = PERSONAS.find((p) => p.key === "free")!;
const ceiling = PERSONAS.find((p) => p.key === "pro-ceiling")!;

const proGw = personaCost(proTypical, "openrouter").total;
const proAn = personaCost(proTypical, "anthropic").total;
const freeGw = personaCost(free, "openrouter").total;
const ceilGw = personaCost(ceiling, "openrouter").total;
const prefixRatio = FACTS.gatewayPrefix.tokens / FACTS.anthropicPrefix.tokens;
const prefixShare = prefixShareOfMessage("openrouter", "premium");
const topCogs = topCogsPersona(1_000);
const msgPremium = chatMessageCost("openrouter", "premium", {
  toolUseRate: 0.6,
  sessionMessages: 5,
}).expected!;
const msgStandard = chatMessageCost("openrouter", "standard", {
  toolUseRate: 0.6,
  sessionMessages: 5,
}).expected!;

const doc = `<!-- AUTO-GENERATED FILE. Do not edit by hand. Generator: \`pnpm --filter @sergeant/server econ\` (apps/server/scripts/unit-economics.ts). -->

# Юніт-економіка AI-шару — 2026-08-06

> **Last touched:** 2026-08-06 by @claude. **Next review:** 2026-11-04.
> **Status:** Active

Питання, на яке відповідає документ: **які моделі де стоять, скільки коштує
кожен AI-шлях на різних сценаріях і навантаженнях, і чи сходиться це з ₴${COMMERCE.proMonthlyUah}/міс.**

Замінює § 9.5–9.6 [\`01-monetization-and-pricing.md\`](../../01-product/launch/business/01-monetization-and-pricing.md)
у частині цифр: та оцінка датована 2026-07-25 і рахує чат як Sonnet + Haiku з
prompt-cache. **2026-08-04 чат переїхав на OpenRouter**, і разом із транспортом
змінилося все, від чого залежала арифметика — модель, кеш і, головне, розмір
контексту. § 9.5 не помилилась; вона застаріла.

## Головне

**1. Під шлюзом у контекст їде весь реєстр інструментів.** Вимір цього
прогону: на Anthropic у контекстне вікно потрапляє ${FACTS.anthropicPrefix.inContextTools} tool-схем
(${FACTS.anthropicPrefix.tokens.toLocaleString("uk-UA")} токенів префікса), під OpenRouter — усі ${FACTS.gatewayPrefix.inContextTools}
(${FACTS.gatewayPrefix.tokens.toLocaleString("uk-UA")} токенів). Різниця **${prefixRatio.toFixed(1)}×**, і вона платиться на КОЖНОМУ
турі КОЖНОГО повідомлення.

Причина механічна, не випадкова: \`toolSearch.ts\` тримає allowlist моделей із
підтримкою \`defer_loading\`, і в ньому лише \`claude-*\` префікси. Дефолтна
модель першого туру під шлюзом — \`deepseek/deepseek-v4-flash\` — в allowlist не
входить, тож \`buildToolsPayload\` тихо відкочується на legacy-payload. Це
свідомий fail-safe (краще дорожче, ніж 400), але його ціна ніде не порахована.

Зверху накладається друге: **під шлюзом prompt-cache не працює взагалі**
(виміряно, \`promptCache.ts\`: \`cache_read\` = 0 навіть із явним
\`cache_control\`). Тобто ці ${FACTS.gatewayPrefix.tokens.toLocaleString("uk-UA")} токенів оплачуються за повним тарифом
щоразу.

**2. Попри це, шлюз усе одно дешевший.** Це неочевидно і саме тому важливо:
${prefixRatio.toFixed(1)}× більший контекст множиться на ціну, яка нижча в десятки разів.
Pro (типовий) коштує **${money(proGw)}/міс під дефолтним роутингом** проти
**${money(proAn)}/міс на прямому Anthropic**. Рішення 2026-08-04 було правильним —
але воно правильне *попри* архітектурний дефект, а не завдяки йому.

**3. Бюджетний гвард не бачить найдорожчих моделей.** \`deepseek-v4-flash\` і
\`glm-5.2\` відсутні в \`ANTHROPIC_PRICING_USD_PER_MTOK\`. B1 в
[\`ai-pipeline-2026-08-05.md\`](./ai-pipeline-2026-08-05.md) повернув гварду зір
через \`usage.cost\` від шлюзу — але лише там, де шлюз цю суму присилає. Будь-який
шлях, де він її не прислав, лишається невидимим, і пороги $3/$5 його не бачать.

**4. Структурна інверсія з § 9.5 жива, і вона вимірна.** Free та anon ідуть на
**premium**-модель синтезу без деградації, а Pro після 20 викликів на добу
падає на standard. У грошах: повідомлення premium — ${money(msgPremium, 4)},
standard — ${money(msgStandard, 4)}, тобто **${(msgPremium / msgStandard).toFixed(1)}×**.
Free-юзер на тому самому обсязі коштує в стільки ж разів дорожче за
здеградованого Pro — і не приносить нічого.

**5. Ризик — не середній юзер, а хвіст.** Pro на стелі квоти коштує
**${money(ceilGw)}/міс** проти виручки ${money(proUsd)} — ${(ceilGw / proUsd).toFixed(1)}× під водою.
Типовий Pro при цьому прибутковий із великим запасом. Наслідок для парку
неочевидний: при міксі нижче **${topCogs.label.toLowerCase()}** дає
**${topCogs.share.toFixed(0)} % усього COGS**, і саме ця група, а не чисельні Free,
з'їдає маржу.

## Чого цей документ не знає

Найважливіше — перед числами, а не після.

1. **Реального трафіку немає.** PostHog на 2026-08-06 за 60 днів:
   \`hubchat_message_sent\` — 7 подій від 3 людей, \`ai_advice_shown\` — 1.
   Усі частоти в § «Персони» — гіпотези, виведені зі стель квоти й характеру
   продукту. Точні тут лише дві речі: **розмір payload-у** (вимір прод-білдерів
   цим прогоном) і **прайс-лист**.
2. **Ціни \`deepseek-v4-flash\` і \`glm-5.2\` виведені з поведінки**, а не взяті з
   прайс-листа: у репо їх немає в жодній таблиці, тож вони пораховані назад із
   вартості прогону стенду ($1.51/1k і $1.64/1k, докстрінг \`env/chatModels.ts\`).
   Похибка тут може бути кратною.
3. **Який шлюз стоїть у проді — з репо не видно.** \`CHAT_VIA_OPENROUTER\` живе в
   Coolify, не в чекауті. Тому таблиці нижче дають ОБИДВА стани.
4. **Токенізатор наближений.** Символи → токени рахуються окремо для ASCII і
   кирилиці (діапазони § 9.5; єдиний живий вимір токенайзера в репо —
   \`cache_creation=12284\` — лягає всередину). Смуга похибки — в окремій
   таблиці нижче.
5. **Курс ₴/$ не зафіксований у коді.** Узято ₴${COMMERCE.uahPerUsd}/$.

## 1. Інвентар: що якою моделлю ходить

${renderInventoryTable()}

Чат — окремо, бо він єдиний двотуровий і єдиний, що несе tool-payload:

| Слот | Anthropic | OpenRouter | Коли |
| --- | --- | --- | --- |
| перший тур (роутер) | \`${"claude-haiku-4-5-20251001"}\` | \`deepseek/deepseek-v4-flash\` | кожне повідомлення |
| синтез, premium | \`claude-sonnet-4-6\` | \`z-ai/glm-5.2\` | Free/anon завжди; Pro — перші 20/добу |
| синтез, standard | \`claude-haiku-4-5-20251001\` | \`deepseek/deepseek-v4-flash\` | Pro, наступні 80/добу |
| синтез, floor | \`claude-haiku-4-5-20251001\` | \`google/gemini-2.5-flash-lite\` | Pro після 100/добу, без ліміту |

Поза LLM: **Voyage \`voyage-3.5-lite\`** ($0.02/1M) для AI-пам'яті —
\`AI_MEMORY_ENABLED\` за замовчуванням **false**, тож у базовому сценарії внесок
нульовий; **Groq \`whisper-large-v3-turbo\`** для голосу — $0.04 за 10 МБ із
персональною стелею $1/добу (\`transcribe/usdCap.ts\`), тобто це єдиний шлях із
жорстким per-user cap-ом у грошах.

## 2. Прайс-лист і сліпі зони гварда

${renderPriceTable()}

Колонка «бачить бюджетний гвард» — це не формальність. \`anthropicBudgetGuard\`
підсумовує \`ai_cost_estimate_usd_total\`, а той інкрементується лише коли
вартість вдалося порахувати. Для моделі поза таблицею єдине джерело суми —
\`usage.cost\` від шлюзу; немає його — витрати не існує.

## 3. Вартість одного виклику

${renderPipelineCostTable("mid")}

Колонка «різниця» читається так: у скільки разів дорожче було б ходити прямим
Anthropic. Для нутриції й дайджесту (усе на \`gemini-2.5-flash-lite\`) це
стабільно ~35× — саме тому \`LLM_*_PROVIDER\` дефолтяться на \`openrouter\`, і саме
тому ці шляхи в економіці майже не помітні. Виняток — \`coach-insight\`: він
єдиний ходить на \`openai/gpt-5.1\`, тож виграш там лише ~2×.

### Чат — окремо

${renderChatTable("mid")}

Три речі, які видно лише в цій таблиці:

- **Кеш не рятує навіть на Anthropic.** Мінімальний кешований префікс Haiku 4.5 —
  4096 токенів, а наш після tool search — ${FACTS.anthropicPrefix.tokens.toLocaleString("uk-UA")}. Запис не створюється зовсім,
  тихо. На Sonnet (мінімум 2048) кеш працює, тому синтез-тур на Anthropic
  дешевший, ніж наївно очікується.
- **Premium-тир під шлюзом дорожчий за standard у рази** — це і є та стаття, яку
  Free-юзер споживає безкоштовно.
- **Перший тур під шлюзом коштує більше за синтез-тур на Anthropic.** Весь
  реєстр інструментів у контексті переважує різницю в ціні за токен.

## 4. Персони: місяць життя

Припущення кожної персони — у \`scripts/econ/inventory.ts\` (\`PERSONAS\`), там же
обґрунтування частот. Коротко: Free упирається в 5 одиниць квоти на добу
(виклик з інструментом коштує 3), Pro — у 20 premium + 80 standard.

${renderPersonaTable("mid")}

Free коштує **${money(freeGw)}/міс** і не приносить нічого — але дешевий на юзера.
Що з цього виходить на парку, показує наступна таблиця; інтуїція «найбільше
юзерів = найбільше витрат» тут не працює.

## 5. Парк: скільки це на масштабі

Мікс MAU — гіпотеза: Free ${(COMMERCE.fleetMix.free * 100).toFixed(0)} %, trial ${(COMMERCE.fleetMix.trial * 100).toFixed(0)} %,
Pro типовий ${(COMMERCE.fleetMix["pro-typical"] * 100).toFixed(0)} %, Pro на стелі ${(COMMERCE.fleetMix["pro-ceiling"] * 100).toFixed(0)} %.
Остання група — свідомо песимістичне припущення: це юзери, які щодня впираються
у стелю квоти. Виручка — ₴${COMMERCE.proMonthlyUah} мінус ${(COMMERCE.paymentFeeRate * 100).toFixed(0)} % комісії;
фікс — ${money(COMMERCE.fixedMonthlyUsd, 0)}/міс (Hetzner CX23 + домен, ADR-0074).

Хто створює витрати при 1 000 MAU:

${renderCogsMixTable(1_000, "mid")}

${renderFleetTable("mid")}

Маржа не росте з масштабом — вона впирається в ~${fleet(100_000, "openrouter").marginPct.toFixed(0)} %, бо AI-COGS
лінійні за MAU, а фікс на цьому тлі зникає вже після кількох сотень юзерів.
Це не «економія на масштабі не працює» — це нагадування, що єдиний важіль тут
вартість запиту, а не кількість юзерів.

Беззбитковість під дефолтним роутингом настає приблизно з
**${FACTS.breakevenGateway === null ? "—" : FACTS.breakevenGateway.toLocaleString("uk-UA")} MAU**
(≈ ${FACTS.breakevenGateway === null ? "—" : Math.round(FACTS.breakevenGateway * (COMMERCE.fleetMix["pro-typical"] + COMMERCE.fleetMix["pro-ceiling"]))} платних).
${
  FACTS.breakevenAnthropic === null
    ? "**На прямому Anthropic при цьому міксі беззбитковості немає взагалі** — " +
      "COGS росте швидше за виручку, і жодна кількість юзерів цього не виправляє. " +
      "Тобто переїзд на шлюз 2026-08-04 був не оптимізацією, а умовою життєздатності моделі."
    : `На прямому Anthropic — з **${FACTS.breakevenAnthropic.toLocaleString("uk-UA")} MAU**.`
}

> Порівняння з § 9.4 монетизації («17 Pro покривають фікс») коректне лише за
> її ж припущенням «AI marginal cost ≈ ₴5/міс». Тут AI-COGS парку рахується
> разом із Free-хвостом, тому число інше — і воно чутливе саме до частки Free,
> а не до ціни Pro.

## 6. Смуга похибки

Токени рахуються посимвольно з розділенням ASCII/кирилиця. Нижче — той самий
розрахунок на трьох коефіцієнтах:

${renderBandTable()}

Розкид ~${(() => {
  const lo = personaCost(proTypical, "openrouter", "lo").total;
  const hi = personaCost(proTypical, "openrouter", "hi").total;
  return ((hi / lo - 1) * 100).toFixed(0);
})()} % між краями. Порядок величини він не змінює, і жоден висновок вище на
нього не спирається.

## 7. Що робити, за спаданням ефекту

1. **Додати OpenRouter-моделі чату в allowlist tool search — або підтвердити,
   що шлюз його не вміє.** Якщо не вміє (найімовірніше), то важіль інший:
   винести з контексту сам реєстр — наприклад, слати під шлюз лише гарячий
   набір + модульний підбір. Масштаб важеля: сам префікс — **${prefixShare.toFixed(0)} %**
   вартості першого туру, тобто більшість грошей витрачається ще до того, як
   модель прочитала питання.
2. **Поставити стелю на хвіст.** ${topCogs.label} дає ${topCogs.share.toFixed(0)} % COGS парку
   при 1 % чисельності. Floor-тир уже існує й безлімітний — бракує саме
   переходу в нього за витратами, а не за кількістю викликів. Готовий важіль:
   \`ANTHROPIC_BUDGET_HARD_DEGRADE_ALL\`, за замовчуванням вимкнений.
3. **Перевернути інверсію Free → premium.** Кілька рядків у \`chat.ts\`; продуктове
   рішення founder-а, не технічне. Ефект — ${(msgPremium / msgStandard).toFixed(1)}× на найчисельнішій групі.
3. **Внести \`deepseek-v4-flash\` і \`glm-5.2\` у прайс-таблицю.** Поки їх там немає,
   бюджетний гвард сліпий на найдорожчій поверхні; це чек-лист рев'ю з
   \`ai-pipeline-2026-08-05.md\`, а не нова ідея.
4. **Поставити стелю на \`context\`.** Схема дозволяє 40 000 символів
   (≈ ${((40000 * 0.7) / 1.9 + (40000 * 0.3) / 3.6).toFixed(0)} токенів) у КОЖНОМУ запиті, і вміст поля контролює клієнт
   (A2, \`ai-abuse-2026-08-05.md\`). Сьогодні це радше стеля ризику, ніж стаття
   витрат, але вона нічим не обмежена.
6. **Почати міряти.** Найдешевший крок із усіх: \`ai_usage_daily\` уже пише
   per-user \`est_cost_usd\`, і його досі ніхто не читає. Поки трафіку немає — це
   й не втрата; щойно з'явиться, цей документ треба перерахувати на фактах, а
   не на \`PERSONAS\`.

## Відтворити

\`\`\`bash
pnpm --filter @sergeant/server econ
\`\`\`

Розміри префікса й Anthropic-прайс читаються з продового коду
(\`promptCache.ts\`, \`aiPricing.ts\`) на кожному прогоні. Припущення — у
\`apps/server/scripts/econ/inventory.ts\`.
`;

/**
 * Прогін через Prettier перед записом. WHY: `pnpm format:check` — CI-гейт, а
 * markdown-таблиці тут генеровані, тож ширина колонок ніколи не збігається з
 * тим, що зробив би Prettier. Без цього кроку кожна регенерація лишає
 * репозиторій у стані «згенеровано → формат впав», і різницю доводиться
 * доформатовувати руками.
 */
async function formatMarkdown(raw: string): Promise<string> {
  const prettier = await import("prettier");
  const config = await prettier.resolveConfig(OUT);
  return prettier.format(raw, { ...config, filepath: OUT });
}

if (process.argv.includes("--stdout")) {
  process.stdout.write(doc);
} else {
  writeFileSync(OUT, await formatMarkdown(doc), "utf8");
  process.stdout.write(`written: ${OUT}\n`);
  process.stdout.write(
    `Pro(typical): ${money(proGw)}/міс gateway, ${money(proAn)}/міс anthropic; ` +
      `1k MAU COGS ${money(fleet(1_000, "openrouter").aiCogsUsd, 0)}/міс\n`,
  );
}
