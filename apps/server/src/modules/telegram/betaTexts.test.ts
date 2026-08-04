import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  appReply,
  helpReply,
  installReply,
  startReplyQueued,
  surveyAnsweredText,
  STOP_REPLY,
  SURVEYS,
  WEEKLY_PULSE_SURVEY,
  type BetaLinks,
} from "./betaTexts.js";

const FULL: BetaLinks = {
  appUrl: "https://beta.sergeant.app",
  groupLink: "https://t.me/+abc123",
  feedbackFormUrl: "https://forms.gle/xyz",
  founderUsername: "@skords",
};

const EMPTY: BetaLinks = {
  appUrl: "",
  groupLink: "",
  feedbackFormUrl: "",
  founderUsername: "",
};

describe("appReply", () => {
  it("дає адресу і відсилає по інструкцію встановлення", () => {
    const out = appReply(FULL);
    expect(out).toContain(FULL.appUrl);
    expect(out).toContain("/install");
  });

  it("без адреси не надсилає порожнє посилання", () => {
    const out = appReply(EMPTY);
    // Найгірший тут варіант — «Sergeant тут: » з порожнечею: виглядає як
    // зламаний бот і провокує звернення, на яке нема що відповісти.
    expect(out).not.toMatch(/тут:\s*$/m);
    expect(out).toMatch(/ще не налаштована/);
  });
});

describe("installReply", () => {
  it("покриває обидві платформи їхніми власними кроками", () => {
    const out = installReply(FULL);
    expect(out).toContain("Safari");
    expect(out).toContain("На початковий екран");
    expect(out).toContain("Chrome");
    expect(out).toContain("Встановити застосунок");
  });

  it("не звужує встановлення на iPhone до Safari", () => {
    // З iOS 16.4 «На початковий екран» є в Chrome, Edge і Firefox, і
    // встановлений звідти застосунок отримує ті самі права, включно з push.
    // «Тільки Safari» коштувало б тестера, який Safari не тримає.
    expect(installReply(FULL)).not.toMatch(/тільки через Safari/i);
  });

  it("наголошує, що на iPhone нагадування живуть лише у встановленому застосунку", () => {
    // Найдорожчий розрив очікувань бети: людина вмикає нагадування, бачить,
    // що налаштування збереглось, і робить висновок, що продукт їх не шле.
    // Це обмеження iOS, і сказати про нього треба ДО того, як воно вкусить.
    const out = installReply(FULL);
    expect(out).toMatch(/лише у встановленому застосунку/i);
    expect(out).toMatch(/обмеження самої iOS/i);
  });

  it("без налаштованої адреси лишається придатною до читання", () => {
    const out = installReply(EMPTY);
    expect(out).toContain("/app");
    expect(out).toContain("Safari");
    // Ані порожнього рядка замість URL, ані підвішеного контакту founder-а.
    expect(out).not.toMatch(/Відкрий\s*$/m);
    expect(out).not.toMatch(/напиши\s*,/);
  });
});

describe("helpReply", () => {
  it("розводить чотири канали й починає з in-app віджета", () => {
    const out = helpReply(FULL);
    // Віджет першим свідомо: він прикладає екран і версію, тож не доводиться
    // перепитувати «а де саме».
    const widgetAt = out.indexOf("Повідомити про проблему");
    const groupAt = out.indexOf(FULL.groupLink);
    expect(widgetAt).toBeGreaterThan(-1);
    expect(widgetAt).toBeLessThan(groupAt);

    expect(out).toContain(FULL.feedbackFormUrl);
    expect(out).toContain(FULL.founderUsername);
  });

  it("перелічує саме ті команди, які бот розуміє", () => {
    const out = helpReply(FULL);
    for (const command of ["/app", "/install", "/help", "/stop"]) {
      expect(out).toContain(command);
    }
    // /stats — командa власника. Згадка про неї в довідці для всіх
    // підтверджувала б її існування, а весь її захист саме в тиші.
    expect(out).not.toContain("/stats");
  });

  it("ненастроєні канали просто зникають зі списку", () => {
    const out = helpReply({ ...FULL, feedbackFormUrl: "", groupLink: "" });
    expect(out).not.toContain("анонімна форма");
    expect(out).not.toContain("група бети");
    // Але баг-віджет лишається — він не залежить від жодної змінної.
    expect(out).toContain("Повідомити про проблему");
  });
});

describe("тексти опитування", () => {
  it("питання називає полюси шкали, а кнопки лишає короткими", () => {
    expect(WEEKLY_PULSE_SURVEY.question).toMatch(/1 —/);
    expect(WEEKLY_PULSE_SURVEY.question).toMatch(/5 —/);
    // Довгий підпис Telegram ріже, і «1 — не за» виглядало б обірваним.
    for (const option of WEEKLY_PULSE_SURVEY.options) {
      expect(option.label.length).toBeLessThanOrEqual(2);
    }
  });

  it("каталог опитувань індексується власним id питання", () => {
    expect(SURVEYS[WEEKLY_PULSE_SURVEY.id]).toBe(WEEKLY_PULSE_SURVEY);
  });

  it("підтвердження лишає видимим саме питання", () => {
    // За тиждень людина відкриє чат і має побачити, на що відповіла, а не
    // самотнє «Дякую» без контексту.
    const out = surveyAnsweredText(WEEKLY_PULSE_SURVEY, "4");
    expect(out).toContain(WEEKLY_PULSE_SURVEY.question);
    expect(out).toContain("4");
  });
});

describe("скрипт розсилки не розʼїхався з каталогом", () => {
  /**
   * `scripts/telegram/send-survey.mjs` тримає власну копію визначення: у репо
   * немає TS-раннера для скриптів. Копія небезпечна саме контрактом кнопок —
   * `id` і `value` утворюють `callback_data`, і при розбіжності бот мовчки
   * відкине КОЖНЕ натискання. Ні в логах, ні у відповіді Telegram цього не
   * видно, тож ловимо тут.
   */
  const script = readFileSync(
    fileURLToPath(
      new URL(
        "../../../../../scripts/telegram/send-survey.mjs",
        import.meta.url,
      ),
    ),
    "utf8",
  );

  it("знає рівно ті самі опитування", () => {
    const ids = [...script.matchAll(/^\s{4}id: "([^"]+)"/gm)].map((m) => m[1]);
    expect(new Set(ids)).toEqual(new Set(Object.keys(SURVEYS)));
  });

  it("будує callback_data за тим самим правилом", () => {
    expect(script).toContain("`s:${survey.id}:${o.value}`");
  });

  it("пропонує ті самі варіанти відповіді", () => {
    const values = [...script.matchAll(/value: "([^"]+)"/g)].map((m) => m[1]);
    const expected = Object.values(SURVEYS).flatMap((s) =>
      s.options.map((o) => o.value),
    );
    expect(values).toEqual(expected);
  });
});

describe("STOP_REPLY", () => {
  it("спершу підтверджує відписку, і лише потім питає причину", () => {
    // Прохання перед підтвердженням читається як спроба утримати, і людина
    // закриває чат, не дочитавши.
    const confirmAt = STOP_REPLY.indexOf("Прибрав");
    const askAt = STOP_REPLY.search(/чому/i);
    expect(confirmAt).toBeGreaterThan(-1);
    expect(askAt).toBeGreaterThan(confirmAt);
  });

  it("знижує ціну відповіді до одного рядка і лишає шлях назад", () => {
    expect(STOP_REPLY).toMatch(/одним рядком/);
    expect(STOP_REPLY).toContain("/start");
  });
});

describe("startReplyQueued", () => {
  it("називає номер і не каже «не встиг»", () => {
    const out = startReplyQueued(41);
    expect(out).toContain("41-й у черзі");
    // Відмова відсіює людину назавжди, а черга нам потрібна для добору.
    expect(out).not.toMatch(/не встиг/i);
    expect(out).toContain("/stop");
  });
});

describe("копірайт за style-guide.uk.md", () => {
  const allTexts = [
    appReply(FULL),
    installReply(FULL),
    helpReply(FULL),
    STOP_REPLY,
    startReplyQueued(7),
    WEEKLY_PULSE_SURVEY.question,
  ];

  it("ніде не звертається на «Ви» і не говорить від «ми»", () => {
    for (const text of allTexts) {
      // Формальне «Ви» створює дистанцію, недоречну для daily-use tool;
      // 1-а множини звучить як команда підтримки, а не як сам застосунок.
      expect(text).not.toMatch(/\bВи\b/);
      expect(text).not.toMatch(/\bми\b/i);
    }
  });

  it("не використовує три крапки замість «…»", () => {
    for (const text of allTexts) {
      expect(text).not.toContain("...");
    }
  });
});
