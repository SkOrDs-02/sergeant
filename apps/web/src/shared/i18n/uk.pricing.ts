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
  pageTitle: "Плани",
  backLabel: "Назад",
  plansAriaLabel: "Плани",
  hero: {
    headlineLine1: "Sergeant безкоштовний для базового користування.",
    headlineLine2: "Premium, коли треба все одразу.",
    // B4 (браузерний аудит 2026-08-05): прибрано обіцянку «натиснеш Premium —
    // відкриється оплата». Premium ще не запущений, оплати немає, а нижче на
    // тій самій сторінці стоїть waitlist — обіцянка суперечила формі.
    // Обіцянку «без trial-таймера» знято: новий акаунт може стартувати з
    // 7 днів Premium (спека access-tiers, ADR про пакетування Free/Premium).
    subtitle: "Один платний план. Без рівнів і без довічної підписки.",
  },
  tiers: {
    freeName: "Free",
    freePrice: "0 ₴",
    freeCadence: "назавжди",
    freeTagline:
      "Усі модулі, ручний трекінг без лімітів. Сержант: 20 дій на тиждень.",
    premiumName: "Premium",
    // B4: конкретна ціна («199 ₴ / місяць») знята до запуску — вона
    // суперечила waitlist-у «Один лист, коли Premium стартує».
    premiumPrice: "Скоро",
    premiumCadence: "Ціну оголошу на запуску",
    premiumTagline: "Усе розблоковано. Один план, без рівнів і доплат.",
  },
  // Рядки таблиці: доступ і ліміти кожного бере `core/pricing/pricingTiers.ts`
  // з реєстру `@sergeant/shared` FEATURES, тут лише підписи.
  features: {
    manualTracking: "Ручний трекінг без числових лімітів",
    aiActions: "Дії Сержанта: чат, порада, план дня, рецепти",
    aiPhotoFoodShort: "Фото їжі від Сержанта",
    finykVision: "AI-скан чека без QR і скрінів банку",
    monoAutoSync: "Авто-синхронізація з Monobank",
    cloudSync: "CloudSync між пристроями",
    csvExport: "Експорт CSV",
    voice: "Голосовий ввід",
    memoryRecall: "Памʼять Сержанта",
    pdfExport: "PDF-експорт звітів",
    weekPlan: "План харчування на тиждень",
    // Озвучення стану рядка для скрінрідера. Доти включена й виключена
    // функція звучали ІДЕНТИЧНО: різницю несли лише форма іконки
    // (`check`/`close`) і приглушений колір, а `Icon` без `title`
    // рендериться `aria-hidden` (аудит 2026-09-16, WF-25; WCAG 1.4.1).
    includedSr: "входить:",
    excludedSr: "не входить:",
  },
  limits: {
    // Leading space intentional: composes як `${N} / тиждень`.
    perWeek: " / тиждень",
    unlimited: "без ліміту",
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
      "Оплата тимчасово недоступна. Можеш залишити email нижче, напишу, коли можна буде оплатити.",
    portalNoBillingCustomer:
      "Не знайдено платіжний профіль. Напиши у підтримку, підключу вручну.",
    portalUnavailable:
      "Керування підпискою тимчасово недоступне. Спробуй пізніше.",
    portalGeneric:
      "Не вдалося відкрити керування підпискою. Перевір звʼязок і спробуй ще раз.",
  },
  toast: {
    subscriptionActive: "Підписку активовано, Premium уже діє.",
    subscriptionActiveCta: "Перейти у налаштування",
    paymentCanceled: "Оплату скасовано. Підписка не оформлена.",
  },
  waitlist: {
    headline: "Повідомити про запуск Premium",
    subtitle: "Один лист, коли Premium стартує. Без спаму, без авто-списань.",
  },
  footer:
    "Ціни у гривні. Оплата через українські провайдери (LiqPay / Plata). Legacy Stripe-підписки керуються окремим платіжним порталом.",
};
