/**
 * Last validated: 2026-09-03
 * Status: Active
 */
import type { NutritionNotFoodKind } from "@sergeant/api-client";

/**
 * Відмова аналізу: на фото немає їжі.
 *
 * AI-CONTEXT: до цієї гілки картка рендерила КБЖВ, «Зберегти в журнал» і блок
 * «Уточнення порції» щойно результат був не-null — тож фото кота давало нулі,
 * «Впевненість: 100%» і питання «Чи є на фото щось інше, окрім кота?», а
 * кнопка збереження писала це в денний журнал як `macroSource: photoAI`.
 * Найдорожчою була саме кнопка, а не назва: вигадані нулі потрапляли в
 * `estimatedKcalShare` і в підсумок дня.
 */
const NOT_FOOD_COPY: Record<
  NutritionNotFoodKind,
  { title: string; unnamed: string; action: string }
> = {
  animal: {
    title: "Це не страва, а тваринка",
    unnamed: "На фото тваринка, а не їжа.",
    action:
      "Краще погладь і пригости смаколиком, а для журналу зроби фото їжі.",
  },
  person: {
    title: "Це людина, а не страва",
    unnamed: "На фото людина, а не їжа.",
    action: "Наведи камеру на тарілку, або додай прийом їжі вручну.",
  },
  other: {
    title: "Не бачу тут страви",
    unnamed: "На фото немає їжі, для якої можна порахувати КБЖВ.",
    action: "Обери інше фото вище, або додай прийом їжі вручну.",
  },
};

export function NotFoodNotice({
  dishName,
  kind,
}: {
  dishName?: string | null | undefined;
  kind?: NutritionNotFoodKind | null | undefined;
}) {
  const what = (dishName || "").trim();
  const copy = NOT_FOOD_COPY[kind ?? "other"];
  return (
    <div className="mt-4 rounded-2xl border border-line bg-panelHi p-3">
      <div className="text-style-label text-text">{copy.title}</div>
      <p className="mt-1 text-style-caption text-muted leading-relaxed">
        {what
          ? `На фото схоже на «${what}», порахувати КБЖВ немає з чого.`
          : copy.unnamed}{" "}
        {copy.action}
      </p>
    </div>
  );
}
