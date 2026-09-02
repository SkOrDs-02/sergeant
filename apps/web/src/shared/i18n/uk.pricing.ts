/** @status Active */

/**
 * Копія сторінки тарифів.
 *
 * AI-CONTEXT: винесено з `uk.ts` 2026-07-25 — найбільша самодостатня група
 * каталогу. Каталог перетнув `max-lines: 600` (Hard Rule #18) при додаванні
 * `dataExport`, і репо-конвенція тут — «ділити перед тим, як перетнути», а
 * не піднімати ліміт. Група марк-копії ні від чого в каталозі не залежить,
 * тож переїзд механічний.
 */
export const pricingMessages = {
  pageTitle: "Тарифи",
  backLabel: "Назад",
  plansAriaLabel: "Тарифні плани",
  hero: {
    headlineLine1: "Sergeant безкоштовний для базового користування.",
    headlineLine2: "Premium, коли треба все одразу.",
    // B4 (браузерний аудит 2026-08-05): прибрано обіцянку «натиснеш Premium —
    // відкриється оплата». Premium ще не запущений, оплати немає, а нижче на
    // тій самій сторінці стоїть waitlist — обіцянка суперечила формі.
    subtitle:
      "Один платний план. Без рівнів, без довічної підписки, без trial-таймера.",
  },
  tiers: {
    freeName: "Free",
    freePrice: "0 ₴",
    freeCadence: "назавжди",
    freeTagline: "Усі модулі, ручний трекінг без лімітів. AI: 5 запитів/день.",
    premiumName: "Premium",
    // B4: конкретна ціна («199 ₴ / місяць») знята до запуску — вона
    // суперечила waitlist-у «Один лист, коли Premium стартує».
    premiumPrice: "Скоро",
    premiumCadence: "Ціну оголошу на запуску",
    premiumTagline: "Усе розблоковано. Один план, без рівнів і доплат.",
  },
  features: {
    allModules: "Усі 4 модулі: повний функціонал",
    manualTracking: "Ручний трекінг без числових лімітів",
    aiChat: "AI-чат",
    cloudSync2Devices: "Cloud-sync на 2 пристрої",
    expensesFinyk: "Витрати у Фініку",
    aiPhotoFood: "AI-фото їжі у Харчуванні",
    aiPhotoFoodShort: "AI-фото їжі",
    manualMeals: "Ручні прийоми їжі",
    activeWorkoutTemplate: "Активний шаблон тренування",
    workoutTemplates: "Шаблони тренувань",
    activeHabits: "Активні звички",
    habits: "Звички",
    pdfExport: "PDF-експорт звітів",
    // B3: `multiCurrency` прибрано — функції не існує. У формі активу валюта
    // статична («UAH») однаково для Free і Premium; не-гривневі значення
    // бувають лише у старих записах і в загальний капітал не зводяться.
    monoAutoSync: "Авто-синхронізація з Monobank",
    cloudSync: "CloudSync між пристроями",
  },
  limits: {
    // Leading space intentional — composes як `${N} / місяць`.
    perMonth: " / місяць",
    unlimited: "без ліміту",
    aiChatPerDay: "5 / день",
  },
  cta: {
    tryPremium: "Спробувати Premium",
    openingCheckout: "Відкриваю оплату…",
    manageSubscription: "Керувати підпискою",
    openingPortal: "Відкриваю керування…",
    switchToFree: "Перейти на Free",
    currentPlan: "Зараз твій план",
    // Гість: «Зараз твій план» — неправда, поки акаунта немає. Free-CTA
    // для нього стає входом (browser QA 2026-08-23).
    signInToStart: "Увійти й почати",
  },
  status: {
    // Renders як «Сесію оплати створено (test mode).» — caller appends `(${mode} mode).`.
    checkoutCreatedPrefix: "Сесію оплати створено",
  },
  errors: {
    checkoutUnavailable:
      "Оплата тимчасово недоступна. Можеш залишити email нижче, напишемо, коли можна буде оплатити.",
    portalNoBillingCustomer:
      "Не знайдено платіжний профіль. Напиши у підтримку, підключимо вручну.",
    portalUnavailable:
      "Керування підпискою тимчасово недоступне. Спробуй пізніше.",
    portalGeneric:
      "Не вдалося відкрити керування підпискою. Перевір звʼязок і спробуй ще раз.",
  },
  toast: {
    subscriptionActive: "Підписку активовано, ласкаво просимо в Premium!",
    subscriptionActiveCta: "Перейти у налаштування",
    paymentCanceled: "Оплату скасовано. Підписка не оформлена.",
  },
  waitlist: {
    headline: "Email для waitlist",
    subtitle: "Один лист, коли Premium стартує. Без спаму, без авто-списань.",
  },
  footer:
    "Ціни у гривні. Оплата через українські провайдери (LiqPay / Plata). Legacy Stripe-підписки керуються окремим платіжним порталом.",
};
