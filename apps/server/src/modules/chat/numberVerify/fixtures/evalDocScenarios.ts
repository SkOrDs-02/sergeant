/**
 * Питання й результати інструментів, на які відповідали моделі у стенді
 * 2026-08-25. Скопійовано дослівно з
 * `apps/server/scripts/eval/pipelines.finance.ts` (виклик
 * `synthesisTurn(питання, інструмент, вивід)`); діапазон рядків кейса - у
 * `source`. Тест `realCorpus.provenance.test.ts` перевіряє, що кожен рядок
 * справді є у цьому файлі.
 *
 * Стенд подавав моделі `SYSTEM_PREFIX` без блоку ДАНІ, тож «подане» тут - лише
 * питання користувача і вивід інструмента в огорожі `<tool_output>` (так його
 * шле прод через `toolOutputWrapping.ts`).
 */

import type { EvalScenario } from "./types.js";

const FILE = "apps/server/scripts/eval/pipelines.finance.ts";

export const EVAL_DOC_SCENARIOS: Readonly<Record<string, EvalScenario>> = {
  // chatPipeline
  chatSimple: {
    source: `${FILE}:515-521`,
    question: "Скільки я цього тижня витратив на каву?",
    tool: "query_transactions",
    output:
      "8 транзакцій, разом 960 грн, категорія «їжа поза домом», остання 2026-07-29 на 120 грн",
  },
  chatCategories: {
    source: `${FILE}:524-531`,
    question: "Покажи мої витрати за липень",
    tool: "aggregate_spending",
    output:
      "продукти 8420 грн, транспорт 1310 грн, їжа поза домом 4870 грн, комуналка 2600 грн, підписки 890 грн; дохід 32000 грн",
  },
  chatEmpty: {
    source: `${FILE}:534-542`,
    question: "Як мої фінанси цього тижня?",
    tool: "query_transactions",
    output: "транзакцій не знайдено; бюджет не налаштований",
  },
  chatOverspend: {
    source: `${FILE}:544-555`,
    question: "Як у мене з бюджетом цього місяця?",
    tool: "aggregate_spending",
    output:
      "витрати 34200 грн, дохід 28000 грн; третій місяць поспіль витрати перевищують дохід",
  },
  chatCompare: {
    source: `${FILE}:557-568`,
    question: "Порівняй їжу поза домом з минулим місяцем",
    tool: "compare_periods",
    output:
      "їжа поза домом: липень 4870 грн, червень 2100 грн; решта категорій без змін",
  },
  chatCross: {
    source: `${FILE}:570-578`,
    question: "Як у мене з фінансами й тренуваннями?",
    tool: "get_daily_series",
    output:
      "доставка їжі 3200 грн за місяць; тренування виконано 2 з 12 запланованих",
  },
  // analysisPipeline
  analysisContradiction: {
    source: `${FILE}:617-628`,
    question: "Куди пішли гроші цього місяця?",
    tool: "aggregate_spending",
    output:
      "разом витрачено 12800 грн; продукти 5200 грн, транспорт 1310 грн, комуналка 2600 грн, підписки 200 грн",
  },
  analysisPriority: {
    source: `${FILE}:643-654`,
    question: "З чого почати наводити лад у фінансах?",
    tool: "get_daily_series",
    output:
      "кредитна картка: борг 42000 грн під 32% річних; підписки 340 грн/міс; їжа поза домом 4870 грн/міс; заощаджень немає",
  },
  analysisCrossLink: {
    source: `${FILE}:656-670`,
    question: "Що не так із моїм режимом?",
    tool: "get_daily_series",
    output:
      "доставка їжі: пн-ср 0 грн, чт-нд 2800 грн; тренування: виконані пн-ср, пропущені чт-нд; сон: пн-ср 7.5 год, чт-нд 5.2 год",
  },
  analysisFalseCause: {
    source: `${FILE}:672-683`,
    question: "Чому я погано сплю?",
    tool: "get_daily_series",
    output:
      "дні з витратами на таксі після 22:00 (14 днів) збігаються з днями, коли сон < 6 год (13 з тих 14); також у ці дні робочі зустрічі тривали до 21:00",
  },
  analysisImplausible: {
    source: `${FILE}:698-709`,
    question: "Перевір мої регулярні платежі",
    tool: "query_transactions",
    output:
      "оренда 12000 грн/міс; інтернет 250 грн/міс; підписки 34000 грн/міс; спортзал 800 грн/міс",
  },
};
