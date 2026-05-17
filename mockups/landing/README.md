# Sergeant landing — 3 preliminary mockups

> Не виробничий код. Three static HTML directional sketches для quick visual comparison перед тим як обрати напрямок для Phase 1 з [`docs/marketing/launch-plan.md`](../../docs/marketing/launch-plan.md).
>
> Усі три використовують ту саму copy з ради (hero H1, sub, waitlist form, 4 module names), той самий palette (з `brandbook.md`), той самий Manrope + JetBrains Mono. Відрізняються тільки **візуальна мова, IA та mood**.

## Open in browser

Double-click any of:

- [`v1-soft-organic.html`](v1-soft-organic.html) — **default brandbook tone**
- [`v2-bento-modular.html`](v2-bento-modular.html) — **modern premium product**
- [`v3-editorial.html`](v3-editorial.html) — **indie build-in-public**

Або серви статично: `python -m http.server 8000` у цій папці.

## Comparison matrix

| Аспект                      | V1 Soft & Organic                                          | V2 Bento Modular                                         | V3 Editorial                                                           |
| --------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Mood reference**          | Yazio × Notion                                             | Linear × iOS keynote                                     | Stripe blog × Substack                                                 |
| **Background**              | Кремовий `#fdf9f3` + warm radial glow                      | Mesh-gradient на cream base                              | Paper texture + subtle noise SVG                                       |
| **Hero layout**             | Centered, generous white space                             | Asymmetric grid (text + stat cards)                      | Left-aligned editorial column                                          |
| **Module showcase**         | Tabbed single-card з module gradient                       | Bento grid 4 cards різних сізів з glass + hero gradients | Vertical timeline з index numbers + preview cards                      |
| **Typography hero**         | Manrope 800, 64px                                          | Manrope 800 з gradient highlight                         | Lora serif italic, mono mast meta                                      |
| **Numbers/stats**           | JetBrains Mono як accent                                   | JetBrains Mono = primary stat treatment                  | JetBrains Mono = entire build journal                                  |
| **Hero copy treatment**     | Plain "Усе про себе — в одному місці"                      | "Усе про себе — **в одному місці**" (gradient highlight) | "Усе про себе — _в одному місці_" (italic accent)                      |
| **CTA primary**             | Emerald-700 pill, soft shadow                              | Ink-strong rounded square з micro shadow                 | Ink rectangular з mono uppercase label                                 |
| **Build-in-public surface** | Не присутній (clean marketing)                             | Не присутній                                             | Журнальний "Field notes / build journal" блок з SHIPPED/BROKE/WIP теги |
| **Persona vibe**            | Доступний для масової non-tech аудиторії                   | Premium tech-savvy early adopter                         | Indie tech-curious / dev / маркетингова niche                          |
| **Mobile-first quality**    | Excellent — все вертикалізується чисто                     | Good — bento grid складніше на 360px                     | Excellent — column natively narrow                                     |
| **Implementation cost**     | S — найпростіший                                           | M — більше cards + glass effects                         | M — більше typography setup, 3 fonts                                   |
| **Voice fit per brandbook** | ⭐⭐⭐ Найближче ("Soft & Organic", "Доступний, не лякає") | ⭐⭐ Modern, потенційно "холодніше"                      | ⭐⭐ Доросліший, niche-er audience fit                                 |
| **AI-search readiness**     | OK — structured heading hierarchy                          | OK — semantic HTML                                       | **Best** — content-rich text density                                   |
| **Conversion bet**          | Broad UA mass-market                                       | Tech early-adopters who appreciate craft                 | Niche UA-dev/PM/indie crowd via DOU.ua referral                        |

## Trade-off summary

### V1 — Soft & Organic (default)

**Чому обирати:**

- Найближче до brandbook tone ("Soft & Organic", warm, безпечний).
- Найшвидший до ship — найменше комплексності в CSS.
- Найкраще для broad mass-market UA — не лякає non-tech людей.
- Доступний для всіх 4 модулів equally.

**Чому НЕ обирати:**

- Виглядає "як ще один SaaS landing" — менше signature.
- Не використовує v2 redesign glass/bento patterns — marketing і product візуально розходяться.
- Не має build-in-public surface — solo dev leverage не показано.

### V2 — Bento Modular

**Чому обирати:**

- Resonates з v2 redesign mood (glass + module hero gradients) — marketing → product continuity.
- Bento grid = signature visual для запам'ятовуваності, share-friendly screenshots.
- Поіменно показує всі 4 модулі одразу — нема "обери таб" UX cost.
- "Premium feel" — підвищує perceived quality продукту до launch.

**Чому НЕ обирати:**

- Glass effects + bento grid складніший на mobile 360px — risk implementation drift.
- "Холодніше" tone може конфліктувати з brandbook "warm friend" persona.
- Більше unique CSS — solo dev maintenance cost вищий.

### V3 — Editorial / Build-in-public

**Чому обирати:**

- Унікальний leverage — solo dev + build-in-public є literally візуально показано.
- "Field notes" блок робить продукт human-scale, особистим — резонує з UA-tech community.
- Найкраща content-density для AI search citation (Perplexity, ChatGPT) — більше text matter.
- Підходить для DOU.ua / X UA-dev referral traffic — те, що audience очікує бачити.

**Чому НЕ обирати:**

- Narrow column = niche audience — не optimal для Routine/Nutrition mass-market.
- Lora serif + JetBrains Mono = більше font weight (more bandwidth, slower CWV).
- Build journal вимагає підтримки cadence — якщо empty / stale = signal "продукт мертвий".
- Менше module-color поки що — модулі виглядають як абзаци, не як 4 окремі pillars.

## Hybrid suggestion (моя рекомендація)

Беремо **V2 як baseline** (resonance з v2 product redesign + bento module showcase signature) + **інтегруємо V3 "Field notes / Build journal" block** як окрему секцію між module showcase і waitlist. Це дає:

- ✓ Marketing-product continuity (glass + module gradients) — V2 win
- ✓ Solo dev leverage publicly visible — V3 win
- ✓ Persona "warm friend" зберігається через copy воркшоп з brand-voice playbook
- ✓ Mobile-first зберігається через bento collapse → vertical stack (V2 вже це робить)

Build journal може автоматично pull'итися з n8n flow "git commit / Linear ticket → blog teaser" — solo dev не пише manually, тільки cadence підтримує.

## What's NOT in mockups (defer to Phase 1 impl)

- Реальні app screenshots — поки що placeholders (gradient cards з mock numbers)
- Live waitlist counter integration з Google Sheet API — поки hardcoded "847"
- Module showcase swipe carousel для mobile — V2 collapsed to grid, V1 single-tab
- FAQ block + JSON-LD schema — заплановано в Phase 1.7-1.8
- Cookie banner / GDPR — UA-only context, мінімальний
- Sticky footer CTA з Intersection Observer — поки не emulated в mockups

## Next step

Обери direction (V1 / V2 / V3 / hybrid) → у Phase 0.6 launch-plan'у Astro bootstrap robitsya з обраним visual language → Phase 1 ship'ить production landing на цьому foundation.

Якщо є feedback на конкретні елементи (CTA копія, hero layout, форма style) — додай у `mockups/landing/feedback.md` або open GitHub issue, наступна сесія застосує до production build.
