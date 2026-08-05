/**
 * Last validated: 2026-08-05
 * Status: Active
 *
 * `CrossModuleLinkCard` — форма крос-модульного зв'язку (анти-слоп P2,
 * `docs/05-design/design/anti-slop-strategy.md` §5 P2). Головний
 * диференціатор продукту («зв'язки між сферами — головна цінність»,
 * `docs/01-product/model/product-overview.md` §1) зараз доставляється
 * рядком у списку інсайтів (`digestCorrelations.ts` → `WeeklyDigestCard`);
 * ця картка — його власна форма, а не ще один рядок.
 *
 * Дві осі (сфера А × сфера Б), а не список: `poleA`/`poleB` завжди по
 * різні боки сітки. Місток між ними несе ВПЕВНЕНІСТЬ візуально — товщина
 * і суцільність зростають раніше, ніж читається текст (пунктир → тонка
 * суцільна → товста суцільна лінія), і саме тому він стоїть над
 * текстовим рядком ступеня, а не під ним.
 *
 * Три ступені градації + право мовчати — рахує `crossModuleLinkTiers.ts`
 * з порогів `digestCorrelations.ts` (`MIN_N`, `NOTABLE_R`), не з голови.
 * Коли зв'язку не видно (`gradeCrossModuleLink` → `null`), картка НЕ
 * ховається — вона чесно каже «закономірностей поки не бачу» і показує
 * прогрес до порогу. Це окремий стан із власним виглядом (пунктирна
 * рамка, без містка й доказової смуги), не порожній список.
 *
 * Домішки: жодного causality-натяку (немає стрілки — це кореляція, не
 * причина); нейтральний місток (текстовий/приглушений колір), акцент —
 * лише на полюсах, по одному на модуль (module-accent containment).
 */
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import {
  gradeCrossModuleLink,
  nextTierThreshold,
  tierMeta,
  tierWord,
  formatObservationsUk,
  observationsWordUk,
  MIN_N,
  type CrossModuleLinkTier,
} from "./crossModuleLinkTiers";

export type CrossModuleLinkModule =
  "finyk" | "fizruk" | "routine" | "nutrition";

export interface CrossModuleLinkPole {
  module: CrossModuleLinkModule;
  /** Канонічна назва модуля, як у налаштуваннях («Фінік», «Фізрук»…). */
  label: string;
  /** Головний факт полюса — велике число чи коротка фраза («3+», «−18%»). */
  value: string;
  /** Уточнення під значенням («тренування / тиждень»). */
  unit: string;
}

export interface CrossModuleLinkCardProps {
  poleA: CrossModuleLinkPole;
  poleB: CrossModuleLinkPole;
  /** `PairCorrelation.n` — спільні дні з обома метриками (pairwise-complete). */
  observations: number;
  /** `PairCorrelation.pearson` — -1..1, знак не впливає на ступінь. */
  strength: number;
  /**
   * Людське формулювання зв'язку — ЄДИНЕ місце, де видно НАПРЯМОК
   * («…витрачаєш більше» проти «…менше»).
   *
   * AI-CONTEXT: додано 2026-08-05 після зауваження власника. До цього
   * картка показувала два полюси, місток і ступінь — але знак `pearson`
   * ніде не проявлявся, тож «Фізрук 1,3 × Фінік 412 ₴» читалось однаково
   * і при r = +0.74, і при r = −0.74. Два користувачі робили з однієї
   * картки протилежні висновки. Товщина містка несе ВПЕВНЕНІСТЬ, а не
   * напрямок — і не може нести обидва, бо це різні виміри.
   *
   * Напрямок навмисно віддано тексту, а не стрілці: стрілка читалась би
   * як причинність, а це кореляція (`product-overview.md` §6).
   *
   * Опційний із тієї ж причини, що й `weeks`: якщо викликач формулювання
   * не має, картка мовчить, а не вигадує.
   */
  phrase?: string;
  /**
   * Скільки тижнів поспіль зв'язок тримається. Опційно і НЕ оцінюється з
   * `observations` (різні статистики — див. AI-CONTEXT у
   * `crossModuleLinkTiers.ts`): якщо викликач не порахував тижні окремо,
   * картка чесно опускає це число замість вигаданого.
   */
  weeks?: number;
}

const MODULE_TEXT_CLASS: Record<CrossModuleLinkModule, string> = {
  finyk: "text-finyk",
  fizruk: "text-fizruk",
  routine: "text-routine",
  nutrition: "text-nutrition",
};

// Пунктир → тонка суцільна → товста суцільна: товщина ТА суцільність
// зростають разом зі ступенем, тому впевненість читається з форми лінії
// ще до того, як очі дійдуть до тексту нижче.
const BOND_CONFIG: Record<
  CrossModuleLinkTier,
  { strokeWidth: number; dashArray?: string; className: string }
> = {
  1: { strokeWidth: 1.5, dashArray: "2 6", className: "stroke-muted/60" },
  2: { strokeWidth: 2.5, className: "stroke-text/70" },
  3: { strokeWidth: 5, className: "stroke-text" },
};

const TIER_WORD_CLASS: Record<CrossModuleLinkTier, string> = {
  1: "text-style-label font-semibold text-muted",
  2: "text-style-label font-bold text-text",
  3: "text-style-label font-extrabold text-text",
};

// Фіксований, невипадковий паттерн висот доказової смуги (мокап
// `mockups/product/anti-slop-forms.html` блок 1) — детермінований для
// стабільних снапшотів/тестів, не `Math.random()`.
const EVIDENCE_HEIGHT_PATTERN = [
  14, 18, 11, 20, 16, 22, 13, 19, 17, 21, 12, 15,
];
const MAX_EVIDENCE_MARKS = 16;

function LinkBond({ tier }: { tier: CrossModuleLinkTier }) {
  const cfg = BOND_CONFIG[tier];
  return (
    <svg
      viewBox="0 0 96 34"
      width={96}
      height={34}
      className="shrink-0"
      aria-hidden="true"
    >
      <line
        x1={2}
        y1={17}
        x2={94}
        y2={17}
        strokeLinecap="round"
        strokeWidth={cfg.strokeWidth}
        {...(cfg.dashArray ? { strokeDasharray: cfg.dashArray } : {})}
        className={cfg.className}
      />
    </svg>
  );
}

function Pole({
  pole,
  align,
}: {
  pole: CrossModuleLinkPole;
  align: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-0.5",
        align === "right" && "items-end text-right",
      )}
    >
      <span
        className={cn(
          "text-style-caption font-bold uppercase tracking-wide",
          MODULE_TEXT_CLASS[pole.module],
        )}
      >
        {pole.label}
      </span>
      <span className="text-style-headline font-extrabold leading-none tracking-tight text-text tabular-nums">
        {pole.value}
      </span>
      <span className="text-style-caption text-muted">{pole.unit}</span>
    </div>
  );
}

/** Доказова смуга — n спостережень як позначки, з видимими «ще не набраними» до наступного ступеня. */
function EvidenceStrip({
  tier,
  observations,
}: {
  tier: CrossModuleLinkTier;
  observations: number;
}) {
  const target = nextTierThreshold(tier) ?? observations;
  const totalMarks = Math.min(
    Math.max(target, observations),
    MAX_EVIDENCE_MARKS,
  );
  const filledMarks = Math.min(observations, totalMarks);

  return (
    <div
      role="img"
      aria-label={formatObservationsUk(observations)}
      className="mt-3 flex h-[22px] items-end gap-[3px]"
    >
      {Array.from({ length: totalMarks }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn(
            "w-[7px] rounded-sm",
            i < filledMarks ? "bg-muted" : "bg-muted/35",
          )}
          style={{
            height: `${EVIDENCE_HEIGHT_PATTERN[i % EVIDENCE_HEIGHT_PATTERN.length]}px`,
          }}
        />
      ))}
    </div>
  );
}

/** «Мовчання з гідністю» — окремий стан, не порожній список. */
function SilentBody({
  poleA,
  poleB,
  observations,
}: {
  poleA: CrossModuleLinkPole;
  poleB: CrossModuleLinkPole;
  observations: number;
}) {
  const clamped = Math.max(0, Math.min(observations, MIN_N));
  const pct = Math.round((clamped / MIN_N) * 100);

  return (
    <div>
      <div className="flex items-center gap-1.5 text-style-caption font-bold uppercase tracking-wide">
        <span className={MODULE_TEXT_CLASS[poleA.module]}>{poleA.label}</span>
        <span className="text-subtle" aria-hidden="true">
          ×
        </span>
        <span className={MODULE_TEXT_CLASS[poleB.module]}>{poleB.label}</span>
      </div>
      <p className="mt-2 text-style-label font-bold text-text">
        {messages.crossModuleLink.silentTitle}
      </p>
      <p className="mt-1 text-style-body leading-relaxed text-muted">
        {messages.crossModuleLink.silentBody}
      </p>
      <div className="mt-3 flex items-center gap-2.5">
        <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-panelHi">
          <div
            className="h-full rounded-full bg-muted"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 text-style-caption tabular-nums text-muted">
          {clamped} {messages.crossModuleLink.progressOf} {MIN_N}{" "}
          {observationsWordUk(MIN_N)}
        </span>
      </div>
    </div>
  );
}

export function CrossModuleLinkCard({
  poleA,
  poleB,
  observations,
  strength,
  weeks,
  phrase,
}: CrossModuleLinkCardProps) {
  const tier = gradeCrossModuleLink(observations, strength);

  return (
    <div
      className={cn(
        "rounded-2xl border bg-panel p-4",
        tier === null ? "border-dashed border-line" : "border-line",
      )}
    >
      {tier === null ? (
        <SilentBody poleA={poleA} poleB={poleB} observations={observations} />
      ) : (
        <>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 sm:gap-3">
            <Pole pole={poleA} align="left" />
            <LinkBond tier={tier} />
            <Pole pole={poleB} align="right" />
          </div>
          <div className="mt-4 border-t border-line pt-3">
            {/*
              Формулювання стоїть НАД ступенем: спершу що саме збігається
              (і в який бік), потім наскільки впевнено. Зворотний порядок
              змушував би читати «Стабільно повторюється» ще не знаючи, що
              саме повторюється.
            */}
            {phrase && (
              <p className="text-style-body font-semibold leading-snug text-text">
                {phrase}
              </p>
            )}
            <div
              className={cn(
                "flex flex-wrap items-baseline gap-x-2 gap-y-0.5",
                phrase && "mt-1",
              )}
            >
              <span className={TIER_WORD_CLASS[tier]}>{tierWord(tier)}</span>
              <span className="text-style-caption tabular-nums text-muted">
                {tierMeta(tier, observations, weeks)}
              </span>
            </div>
          </div>
          <EvidenceStrip tier={tier} observations={observations} />
        </>
      )}
    </div>
  );
}
