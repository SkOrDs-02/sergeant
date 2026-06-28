/**
 * Audience Discovery Survey — генератор Google-форми зі skip-логікою.
 *
 * ЯК ЗАПУСТИТИ:
 *   1. https://script.google.com → New project
 *   2. Встав увесь цей файл (заміни порожній myFunction)
 *   3. Обери функцію buildAudienceSurvey → Run → Authorize
 *   4. View → Logs: візьми Edit URL (правити) і Live URL (роздавати)
 *
 * Skip-логіка: «Ніколи не вів» → контрольна гілка (без Q7/Q8 і retention-інпутів),
 * решта сегментів → повний потік. Так never-users не псують H1/H3-метрики.
 *
 * Безпечно прогонити кілька разів — щоразу створюється НОВА форма.
 */
function buildAudienceSurvey() {
  const form = FormApp.create('Трекери: як ти ведеш облік — 5 хв')
    .setDescription(
      'Коротке опитування про те, як люди відстежують гроші, їжу, спорт і звички. ' +
        '5–7 хв. Опитування анонімне — єдиний виняток це необовʼязкове поле пошти в кінці, ' +
        'яке заповнюєш лише якщо сам хочеш ранній доступ. Дякую, що допомагаєш!',
    )
    .setProgressBar(true)
    .setAllowResponseEdits(false)
    .setCollectEmail(false);

  // --- Сторінки (page breaks). Додаємо ЗАРАЗ, щоб мати посилання для навігації,
  //     але фізично вони стають роздільниками в тому порядку, в якому додані items. ---
  // Порядок item-ів нижче і визначає сторінки. Спершу — Блок A на стартовій сторінці.

  // ===== Блок A. Скринінг + розгалуження =====
  const screening = form.addMultipleChoiceItem();
  screening
    .setTitle('Чи ведеш ти зараз або вів(-ла) раніше облік чогось у житті — гроші, їжа, тренування, звички?')
    .setRequired(true);

  // Сторінки створюємо ПІСЛЯ скринінгу, щоб вони йшли за ним.
  const pageTracker = form.addPageBreakItem().setTitle('Як ти це ведеш');
  // Q2..Q8 (для тих, хто трекав) — додамо одразу під цим page break.

  // --- Блок B (основна гілка) ---
  form
    .addCheckboxItem()
    .setTitle('Що з цього ти відстежуєш?')
    .setChoiceValues(['Гроші', 'Їжу / калорії', 'Тренування / активність', 'Звички / рутину'])
    .showOtherOption(true)
    .setRequired(true);

  form
    .addCheckboxItem()
    .setTitle('Чим переважно ведеш?')
    .setChoiceValues([
      'Банк-апка',
      'Спец-апка (MyFitnessPal тощо)',
      'Excel / Google Sheets',
      'Notion',
      'Зошит / папір',
      'В голові',
    ])
    .showOtherOption(true)
    .setRequired(true);

  form
    .addMultipleChoiceItem()
    .setTitle('Як часто вносиш дані?')
    .setChoiceValues(['Щодня', 'Кілька разів на тиждень', 'Раз на тиждень', 'Рідше', 'Коли згадаю'])
    .setRequired(true);

  form
    .addMultipleChoiceItem()
    .setTitle('Скільки різних інструментів сумарно використовуєш для всього обліку?')
    .setChoiceValues(['1', '2', '3', '4+'])
    .setRequired(true);

  // --- Блок C. Болі та кидання (тільки основна гілка) ---
  form
    .addCheckboxItem()
    .setTitle('Що найбільше заважає вести облік регулярно?')
    .setChoiceValues([
      'Лінь / забуваю',
      'Ручний ввід задовго',
      'Не бачу користі від цифр',
      'Незручний інтерфейс',
      'Все в різних місцях',
    ])
    .showOtherOption(true)
    .setRequired(true);

  form
    .addMultipleChoiceItem()
    .setTitle('Через скільки часу приблизно ти кинув(-ла) трекер?')
    .setChoiceValues(['<1 тижня', '1–2 тижні', '3–4 тижні', '1–3 місяці', '>3 місяців', 'Ще не кидав(-ла)'])
    .setRequired(true);

  form
    .addParagraphTextItem()
    .setTitle('Яка головна причина кидання?')
    .setHelpText('Якщо ще не кидав(-ла) — просто постав прочерк.')
    .setRequired(false);

  // ===== Контрольна гілка (never-users) =====
  const pageControl = form.addPageBreakItem().setTitle('Кілька питань для тебе');

  form
    .addCheckboxItem()
    .setTitle('Що ти ХОТІВ(-ЛА) БИ почати відстежувати, якби це було легко?')
    .setChoiceValues(['Гроші', 'Їжу / калорії', 'Тренування / активність', 'Звички / рутину'])
    .showOtherOption(true)
    .setRequired(true);

  form
    .addMultipleChoiceItem()
    .setTitle('Що головне зупиняє тебе почати вести облік?')
    .setChoiceValues([
      'Не знаю з чого почати',
      'Здається задовго / складно',
      'Не бачу сенсу',
      'Пробував і було незручно',
      'Просто не доходять руки',
    ])
    .showOtherOption(true)
    .setRequired(true);

  // ===== Блок D. Пріоритет і готовність (усі) =====
  const pagePriority = form.addPageBreakItem().setTitle('Що найважливіше');

  form
    .addMultipleChoiceItem()
    .setTitle('Який облік для тебе найважливіший / найболючіший прямо зараз?')
    .setChoiceValues(['Гроші', 'Їжа', 'Спорт', 'Рутина / звички'])
    .setRequired(true);

  form
    .addScaleItem()
    .setTitle('Наскільки тебе дратує те, як ти ведеш (або НЕ ведеш) це зараз?')
    .setBounds(1, 5)
    .setLabels('Зовсім ні', 'Дуже дратує')
    .setRequired(true);

  form
    .addScaleItem()
    .setTitle('Якби зʼявився інструмент, що веде все в одному місці й мінімізує ручний ввід — наскільки цікаво?')
    .setBounds(1, 5)
    .setLabels('Не цікаво', 'Дуже цікаво')
    .setRequired(true);

  // ===== Блок E. Демографія + лід-магніт (усі) =====
  form.addPageBreakItem().setTitle('Майже все');

  form
    .addMultipleChoiceItem()
    .setTitle('Вік')
    .setChoiceValues(['<18', '18–24', '25–34', '35–44', '45+'])
    .setRequired(false);

  form.addTextItem().setTitle('Рід занять / сфера').setRequired(false);

  const emailValidation = FormApp.createTextValidation().requireTextIsEmail().build();
  form
    .addTextItem()
    .setTitle('Пошта — якщо хочеш ранній доступ (необовʼязково)')
    .setHelpText('Залишиш — потрапиш у список раннього доступу. Не залишиш — нічого страшного.')
    .setValidation(emailValidation)
    .setRequired(false);

  // ===== Навігація =====
  // 1) Основна гілка (pageTracker) після завершення стрибає на Блок D, ОБХОДЯЧИ контрольну гілку.
  //    setGoToPage на page break керує виходом зі сторінки, що стоїть ПЕРЕД ним у лінійному потоці.
  pageControl.setGoToPage(pagePriority);

  // 2) Скринінг: «Ніколи не вів» → контрольна гілка; решта → CONTINUE (наступна сторінка = основна гілка).
  screening.setChoices([
    screening.createChoice('Веду зараз регулярно', FormApp.PageNavigationType.CONTINUE),
    screening.createChoice('Веду нерегулярно', FormApp.PageNavigationType.CONTINUE),
    screening.createChoice('Пробував(-ла) і кинув(-ла)', FormApp.PageNavigationType.CONTINUE),
    screening.createChoice('Ніколи не вів(-ла)', pageControl),
  ]);

  Logger.log('✅ Форму створено.');
  Logger.log('✏️  Edit URL: ' + form.getEditUrl());
  Logger.log('🔗 Live URL: ' + form.getPublishedUrl());
  Logger.log('📊 Відповіді: File → залий у Google Sheet через кнопку Responses у формі.');
}
