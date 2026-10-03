import { ValidationError } from "../../obs/errors.js";
import { ADVICE_BOUNDARY_RULE } from "../../lib/adviceBoundary.js";
import {
  DATA_FENCE_RULE,
  PERSONA_RULE,
  VOICE_RULE_JSON,
} from "../chat/toolDefs/systemPrompt.js";
import { wrapAndScanUserContext } from "../chat/toolOutputWrapping.js";
import type { WeeklyDigestRequest } from "../../http/schemas.js";

/**
 * Промпт тижневого дайджесту — рівно той, що йде в прод.
 *
 * AI-CONTEXT: винесено з хендлера, щоб стенд (`scripts/eval/pipelines.finance.ts`)
 * подавав моделі справжній промпт із реальним блоком ДАНІ, а не однорядкову
 * заглушку. Промпт тут динамічний (збирається з тижневих даних), тому
 * експортується білдер, а не константа — стенд подає йому фіксований зразок
 * тижня.
 *
 * Кидає `ValidationError`, коли жодної секції немає — інваріант лишається на
 * місці, лише переїхав разом зі своїм єдиним користувачем.
 */
export function buildWeeklyDigestPrompt(data: WeeklyDigestRequest): {
  system: string;
  user: string;
} {
  const { weekRange, finyk, fizruk, nutrition, routine } = data;
  const sections: string[] = [];

  if (finyk) {
    // Темп рахує код, а не модель (як дефіцит калорій нижче): на живому
    // прогоні 2026-09-28 модель при 4 844 грн за тиждень і бюджеті 38 000 на
    // місяць написала «витрати вищі за планові на день».
    const spent = finyk.totalSpent ?? 0;
    const weeklyShare = finyk.monthlyBudget
      ? Math.round((finyk.monthlyBudget * 7) / 30.4)
      : 0;
    const paceVerdict =
      weeklyShare <= 0
        ? ""
        : spent <= weeklyShare
          ? `, тижнева частка ${weeklyShare} грн, у межах`
          : `, тижнева частка ${weeklyShare} грн, перевищено на ${spent - weeklyShare} грн`;
    const budgetLine = finyk.monthlyBudget
      ? `Місячний бюджет: ${finyk.monthlyBudget} грн${paceVerdict}`
      : "Місячний бюджет: не встановлено";
    const topCats =
      Array.isArray(finyk.topCategories) && finyk.topCategories.length
        ? finyk.topCategories
            .map((c) => `  - ${c.name}: ${c.amount} грн`)
            .join("\n")
        : "  Немає даних";
    sections.push(`[ФІНАНСИ (${weekRange || "тиждень"})]
Витрати: ${finyk.totalSpent ?? 0} грн | Надходження: ${finyk.totalIncome ?? 0} грн
${budgetLine}
Топ категорії витрат:
${topCats}
Операцій: ${finyk.txCount ?? 0}`);
  }

  if (fizruk) {
    const exercises =
      Array.isArray(fizruk.topExercises) && fizruk.topExercises.length
        ? fizruk.topExercises
            .map((e) => `  - ${e.name}: ${e.totalVolume} кг`)
            .join("\n")
        : "  Немає даних";
    sections.push(`[ТРЕНУВАННЯ (${weekRange || "тиждень"})]
Тренувань завершено: ${fizruk.workoutsCount ?? 0}
Загальний обʼєм: ${fizruk.totalVolume ?? 0} кг
Стан відновлення: ${fizruk.recoveryLabel ?? "Немає даних"}
Топ вправи:
${exercises}`);
  }

  if (nutrition) {
    const targetKcal = nutrition.targetKcal ?? 0;
    const deficit = targetKcal - (nutrition.avgKcal ?? 0);
    const balance =
      targetKcal <= 0
        ? "без вердикту: історична ціль невідома"
        : deficit > 50
          ? `дефіцит ${Math.round(deficit)} ккал`
          : deficit < -50
            ? `профіцит ${Math.round(Math.abs(deficit))} ккал`
            : "баланс";
    const targetLabel =
      targetKcal > 0 ? `ціль ${targetKcal} ккал` : "ціль невідома";
    sections.push(`[ХАРЧУВАННЯ (${weekRange || "тиждень"})]
Середньодобово: ${nutrition.avgKcal ?? 0} ккал (${targetLabel}, ${balance})
Середній БЖВ: Б ${nutrition.avgProtein ?? 0}г / Ж ${nutrition.avgFat ?? 0}г / В ${nutrition.avgCarbs ?? 0}г
Днів із записами: ${nutrition.daysLogged ?? 0} з 7`);
  }

  if (routine) {
    const habitsInfo =
      Array.isArray(routine.habits) && routine.habits.length
        ? routine.habits
            .map(
              (h) =>
                `  - ${h.name}: ${h.completionRate}% (${h.done}/${h.total} днів)`,
            )
            .join("\n")
        : "  Немає активних звичок";
    sections.push(`[ЗВИЧКИ (${weekRange || "тиждень"})]
Загальний відсоток: ${routine.overallRate ?? 0}%
Активних звичок: ${routine.habitCount ?? 0}
По звичках:
${habitsInfo}`);
  }

  if (!sections.length) {
    throw new ValidationError("Немає даних для генерації звіту");
  }

  const dataContext = sections.join("\n\n");
  const userPrompt = `Проаналізуй тижневі дані юзера і поверни ТІЛЬКИ валідний JSON (без markdown-обгортки, без \`\`\`json) такого вигляду:
{
  "finyk": {
    "summary": "1 речення: що відбулося з фінансами",
    "comment": "2-3 речення: аналіз витрат, тенденції",
    "recommendations": ["рекомендація 1", "рекомендація 2"]
  },
  "fizruk": {
    "summary": "1 речення: підсумок тренувань",
    "comment": "2-3 речення: аналіз обʼєму, відновлення",
    "recommendations": ["рекомендація 1", "рекомендація 2"]
  },
  "nutrition": {
    "summary": "1 речення: підсумок харчування",
    "comment": "2-3 речення: аналіз калоражу, макросів",
    "recommendations": ["рекомендація 1", "рекомендація 2"]
  },
  "routine": {
    "summary": "1 речення: підсумок звичок",
    "comment": "2-3 речення: аналіз виконання",
    "recommendations": ["рекомендація 1", "рекомендація 2"]
  },
  "overallRecommendations": ["загальна рекомендація 1", "загальна рекомендація 2"]
}
Якщо даних по модулю немає, поверни null для цього ключа. Відповідай ВИКЛЮЧНО валідним JSON.`;

  const systemPrompt = `${PERSONA_RULE}
Зараз ти складаєш тижневий звіт за даними людини.

${ADVICE_BOUNDARY_RULE}
Відповідай ВИКЛЮЧНО валідним JSON: без markdown, без коментарів, без преамбули.
Увесь текст українською. Числа бери з блоку даних.

СТИЛЬ ТЕКСТОВИХ ПОЛІВ (summary, comment, recommendations):
${VOICE_RULE_JSON}

ПОКРИТТЯ ДАНИХ Є ЧАСТИНОЮ ВЕРДИКТУ, А НЕ ПРИМІТКОЮ.
Середні по харчуванню рахуються ЛИШЕ за днями із записами, тож два залоговані
дні дають таку саму «гарну» середню, як і сім. Якщо днів із записами менше
чотирьох із семи, це і є головний висновок блоку «Харчування»: скажи про
пропуски прямо і не став тижню вищу оцінку, ніж дозволяють дані. Мало даних
не означає ні дефіциту, ні успіху, це просто мало даних.

ФІНАНСИ: вердикт щодо бюджету вже пораховано в рядку «Місячний бюджет», бери
його, а не рахуй сам. Надходження за тиждень не показують доходу: зарплата
приходить раз на місяць, тож 0 надходжень за тиждень не є дефіцитом і не
привід радити «планувати надходження».

${DATA_FENCE_RULE}

ДАНІ:
${wrapAndScanUserContext(dataContext)}`;

  return { system: systemPrompt, user: userPrompt };
}
