/**
 * Audience Discovery Survey — аналіз відповідей у зрізах.
 *
 * Що робить: читає відповіді твоєї Google-форми, рахує всі зрізи (сегменти,
 * H1–H4, pain-score по модулях, fragmentation, waitlist) і
 *   1) друкує текстовий звіт у Logs (View → Logs),
 *   2) створює Google-таблицю «Audience Survey — Dashboard» з тим самим звітом.
 *
 * ЯК ЗАПУСТИТИ:
 *   1. Той самий проєкт у script.google.com, де лежить google-form-generator.gs
 *      (або новий — байдуже, головне твій акаунт).
 *   2. Встав цей файл.
 *   3. Внизу впиши FORM_ID (береш з Edit URL форми: .../forms/d/<FORM_ID>/edit).
 *   4. Обери функцію analyzeResponses → Run. У Logs зʼявиться звіт + лінк на таблицю.
 *
 * Безпечно ганяти скільки завгодно — щоразу свіжий звіт із поточних відповідей.
 */

// ===== ВСТАВ СЮДИ ID СВОЄЇ ФОРМИ =====
const FORM_ID = 'PASTE_FORM_ID_HERE';

function analyzeResponses() {
  const form = FormApp.openById(FORM_ID);
  const responses = form.getResponses();
  const N = responses.length;
  if (!N) {
    Logger.log('Ще немає жодної відповіді. Зачекай на перші сабміти й запусти знову.');
    return;
  }

  // Кожну відповідь зводимо до обʼєкта { "Заголовок питання": відповідь }.
  // Пропущені (через skip-логіку) питання просто відсутні — це нам і треба.
  const rows = responses.map(function (r) {
    const o = {};
    r.getItemResponses().forEach(function (ir) {
      o[ir.getItem().getTitle()] = ir.getResponse();
    });
    return o;
  });

  // ---- helpers ----
  // дістати значення питання за стабільним підрядком заголовка
  function val(row, sub) {
    const key = Object.keys(row).find(function (t) {
      return t.indexOf(sub) !== -1;
    });
    return key === undefined ? undefined : row[key];
  }
  function answered(sub) {
    return rows.filter(function (r) {
      const v = val(r, sub);
      return v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
    });
  }
  function pct(n, base) {
    const d = base === undefined ? N : base;
    return d ? Math.round((n / d) * 100) + '%' : '0%';
  }
  // частотний розподіл одиночних відповідей
  function tally(sub) {
    const m = {};
    rows.forEach(function (r) {
      const v = val(r, sub);
      if (v === undefined || v === '') return;
      const key = String(v);
      m[key] = (m[key] || 0) + 1;
    });
    return m;
  }
  // частотний розподіл multi-select (checkbox → масив)
  function tallyMulti(sub) {
    const m = {};
    rows.forEach(function (r) {
      let v = val(r, sub);
      if (v === undefined || v === '') return;
      if (!Array.isArray(v)) v = [v];
      v.forEach(function (x) {
        if (x === undefined || x === '') return;
        m[x] = (m[x] || 0) + 1;
      });
    });
    return m;
  }
  function mean(sub) {
    const nums = rows
      .map(function (r) {
        return Number(val(r, sub));
      })
      .filter(function (n) {
        return !isNaN(n);
      });
    if (!nums.length) return null;
    return (
      nums.reduce(function (a, b) {
        return a + b;
      }, 0) / nums.length
    );
  }

  const report = [];
  function line(s) {
    report.push(s === undefined ? '' : s);
  }
  // вивести розподіл відсортовано за спаданням
  function dump(map, base) {
    const entries = Object.keys(map).map(function (k) {
      return [k, map[k]];
    });
    entries.sort(function (a, b) {
      return b[1] - a[1];
    });
    entries.forEach(function (e) {
      line('    ' + e[0] + ': ' + e[1] + ' (' + pct(e[1], base) + ')');
    });
  }

  // ============ ЗВІТ ============
  line('AUDIENCE SURVEY — DASHBOARD');
  line('Усього відповідей: ' + N);
  line('');

  // --- Сегменти (Q1) ---
  line('## Сегменти (Q1)');
  const seg = tally('Чи ведеш ти зараз або вів');
  dump(seg);
  const neverKey = Object.keys(seg).find(function (k) {
    return k.indexOf('Ніколи') !== -1;
  });
  const neverN = neverKey ? seg[neverKey] : 0;
  const trackedN = N - neverN;
  line('  → трекери: ' + trackedN + ' (' + pct(trackedN) + '), never-users: ' + neverN + ' (' + pct(neverN) + ')');
  line('');

  // --- H2: фрагментація ---
  line('## H2 — Фрагментація');
  line('  Що відстежують (Q2):');
  dump(tallyMulti('Що з цього ти відстежуєш'));
  line('  Інструменти (Q3):');
  const tools = tallyMulti('Чим переважно ведеш');
  dump(tools);
  const golovaKey = Object.keys(tools).find(function (k) {
    return k.indexOf('голові') !== -1;
  });
  if (golovaKey) line('  → «в голові»: ' + tools[golovaKey] + ' (' + pct(tools[golovaKey]) + ' усіх) — розмір можливості');
  line('  Кількість інструментів (Q5):');
  const toolCount = tally('Скільки різних інструментів');
  dump(toolCount);
  const frag = (toolCount['3'] || 0) + (toolCount['4+'] || 0);
  const q5base = answered('Скільки різних інструментів').length;
  line('  → FRAGMENTATION RATE (3+ інструментів): ' + frag + ' з ' + q5base + ' (' + pct(frag, q5base) + ')');
  line('');

  // --- H1: тертя й кидання ---
  line('## H1 — Тертя і кидання');
  line('  Що заважає (Q6):');
  dump(tallyMulti('Що найбільше заважає'));
  line('  Час до кидання (Q7):');
  const quit = tally('Через скільки часу приблизно ти кинув');
  dump(quit);
  // медіанний бакет серед тих, хто реально кидав
  const order = ['<1 тижня', '1–2 тижні', '3–4 тижні', '1–3 місяці', '>3 місяців'];
  const quitters = [];
  order.forEach(function (b) {
    for (let i = 0; i < (quit[b] || 0); i++) quitters.push(b);
  });
  if (quitters.length) {
    line('  → RETENTION-БЕНЧМАРК (медіана серед тих, хто кидав): ' + quitters[Math.floor((quitters.length - 1) / 2)]);
  }
  line('  Причини кидання (Q8, вільний текст):');
  answered('Яка головна причина кидання').forEach(function (r) {
    const t = String(val(r, 'Яка головна причина кидання')).replace(/\s+/g, ' ').trim();
    if (t && t !== '-') line('    • ' + t);
  });
  line('');

  // --- H3: пріоритет модуля ---
  line('## H3 — Пріоритет модуля (Q9)');
  const prio = tally('Який облік для тебе найважливіший');
  dump(prio);
  const prioTop = Object.keys(prio).sort(function (a, b) {
    return prio[b] - prio[a];
  })[0];
  if (prioTop) line('  → НАЙБОЛЮЧІШИЙ МОДУЛЬ: ' + prioTop);
  line('');

  // --- Problem prevalence + готовність ---
  line('## Problem prevalence і готовність');
  const annoy = tally('Наскільки тебе дратує');
  const annoyBase = answered('Наскільки тебе дратує').length;
  const hot = (Number(annoy['4']) || 0) + (Number(annoy['5']) || 0);
  line('  Роздратування (Q10), середнє: ' + (mean('Наскільки тебе дратує') || 0).toFixed(2));
  line('  → PROBLEM PREVALENCE (оцінка 4–5): ' + hot + ' з ' + annoyBase + ' (' + pct(hot, annoyBase) + ')');
  const interest = tally('наскільки цікаво');
  const intBase = answered('наскільки цікаво').length;
  const intHot = (Number(interest['4']) || 0) + (Number(interest['5']) || 0);
  line('  Інтерес до рішення (Q11), середнє: ' + (mean('наскільки цікаво') || 0).toFixed(2));
  line('  → інтерес 4–5: ' + intHot + ' з ' + intBase + ' (' + pct(intHot, intBase) + ')');
  line('');

  // --- Pain score по модулях (середнє Q10 у розрізі Q9) ---
  line('## Pain score по модулях (середнє роздратування × найболючіший модуль)');
  const byModule = {};
  rows.forEach(function (r) {
    const m = val(r, 'Який облік для тебе найважливіший');
    const a = Number(val(r, 'Наскільки тебе дратує'));
    if (m === undefined || isNaN(a)) return;
    (byModule[m] = byModule[m] || []).push(a);
  });
  Object.keys(byModule).forEach(function (m) {
    const arr = byModule[m];
    const avg =
      arr.reduce(function (a, b) {
        return a + b;
      }, 0) / arr.length;
    line('    ' + m + ': ' + avg.toFixed(2) + ' (n=' + arr.length + ')');
  });
  line('');

  // --- Контрольна гілка (never-users) ---
  if (neverN) {
    line('## Контрольна гілка (never-users)');
    line('  Що хотіли б трекати (Q2c):');
    dump(tallyMulti('ХОТІВ'));
    line('  Що зупиняє почати (Q3c):');
    dump(tally('Що головне зупиняє'));
    line('');
  }

  // --- Waitlist ---
  const emails = answered('Пошта');
  line('## Waitlist');
  line('  → CONVERSION (лишили пошту): ' + emails.length + ' з ' + N + ' (' + pct(emails.length) + ')');
  emails.forEach(function (r) {
    line('    • ' + val(r, 'Пошта'));
  });
  line('');

  // ============ ВИВІД ============
  Logger.log(report.join('\n'));

  const ss = SpreadsheetApp.create('Audience Survey — Dashboard');
  const sh = ss.getActiveSheet();
  sh.getRange(1, 1, report.length, 1).setValues(
    report.map(function (l) {
      return [l];
    }),
  );
  sh.setColumnWidth(1, 720);
  Logger.log('📊 Dashboard-таблиця: ' + ss.getUrl());
}
