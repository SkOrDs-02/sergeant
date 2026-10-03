/**
 * Last validated: 2026-08-02
 * Status: Active
 *
 * Межі recovery-поради, показані користувачеві (аудит E-2/E-3/E-7).
 *
 * AI-CONTEXT: fizruk — єдиний модуль, де порада з неповних даних означає
 * фізичний ризик (канон `fizruk.md`, шапка). Аудит знайшов три різні способи,
 * якими порада могла виглядати впевненіше, ніж вона є:
 *
 *  - **E-2** — recovery рахується з локальної репліки, а маркера повноти
 *    синку не було ніде: офлайн-тренування з телефону лишало ноги «green»
 *    на вебі до вечора;
 *  - **E-3** — запис самопочуття діяв без терміну придатності; тепер він
 *    випадає з розрахунку через 72 год, і це треба сказати вголос, інакше
 *    «журнал заповнено» читається як «журнал впливає»;
 *  - **E-7** — пороги калібровані n=1 (тіло founder-а) і відвантажуються
 *    загальній аудиторії без каналу зворотного звʼязку.
 *
 * Тон — за `docs/product/copy/style-guide.uk.md`: це межі обіцянки, а не
 * збій і не вибачення. Порада лишається порадою (§4 — «не гейт»).
 *
 * **Доповнення 2026-09-01 — безумовна плашка жанру.** Три ноти вище умовні:
 * у нормальному стані (свіжа репліка, свіжий журнал) не рендериться жодна,
 * і людина читає «готово / рано» як вердикт без будь-якої рамки. Тому зверху
 * додано безумовне «Спостереження, не порада», а внизу – межа компетенції
 * («болить – до лікаря»). Привід не косметичний: Whoop отримав
 * попереджувальний лист FDA (2025-07-14) саме за функцію, подану як
 * медичну, і канон `fizruk.md` §2 тримає цей рядок як контракт, а не як
 * юридичну формальність.
 *
 * **Доповнення 2026-09-26 – один рядок замість стіни.** На mobile плашки й
 * абзаци стояли над силуетом і виштовхували його за перший екран. Тепер
 * блок – нативний `<details>` під картою: безумовним лишається лише рядок
 * `summary` («Спостереження, не медична порада»), він і несе жанр, і межу
 * компетенції; решта відкривається тапом. Нота про свіжість репліки має
 * сенс лише там, де є що синхронізувати: анонімний пристрій і є вся
 * історія, тож для нього «синхронізації ще не було» – скарга системи на
 * власний стан, а не межа поради.
 */
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import type { WellbeingSignal } from "@sergeant/fizruk-domain";
import type { ReplicaFreshness } from "../../../core/syncEngine/replicaFreshness";

export interface RecoveryHonestyNotesProps {
  freshness: ReplicaFreshness;
  wellbeing: WellbeingSignal;
  syncEnabled: boolean;
}

export function RecoveryHonestyNotes({
  freshness,
  wellbeing,
  syncEnabled,
}: RecoveryHonestyNotesProps) {
  const t = messages.fizruk.recoveryHonesty;
  const neverSynced = freshness.lastPullAt === null;

  return (
    <details className="group mb-3 rounded-xl border border-line bg-panel px-3">
      <summary className="touch-target flex cursor-pointer items-center gap-1.5 text-style-caption text-muted marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fizruk">
        <Icon
          name="info"
          size={13}
          className="shrink-0 text-subtle"
          aria-hidden
        />
        <span className="min-w-0 flex-1">{t.observationBadge}</span>
        <Icon
          name="chevron-right"
          size={13}
          className="shrink-0 text-subtle transition-transform group-open:rotate-90"
          aria-hidden
        />
      </summary>

      <div className="pb-3">
        {syncEnabled && !freshness.complete && (
          <div className="mb-2">
            <p className="text-style-caption text-text leading-snug">
              {t.staleReplicaTitle}
            </p>
            <p className="text-style-caption text-subtle leading-snug">
              {neverSynced
                ? t.neverSyncedNote
                : freshness.stale
                  ? t.staleReplicaNote
                  : t.pendingOpsNote}
            </p>
            {freshness.ageHours !== null && (
              <p className="text-style-caption text-muted mt-0.5 tabular-nums">
                {`${t.lastSyncPrefix}: ${Math.round(freshness.ageHours)} ${t.hoursAgoSuffix}`}
              </p>
            )}
          </div>
        )}

        {wellbeing.stale && (
          <div className="mb-2">
            <p className="text-style-caption text-text leading-snug">
              {t.staleWellbeingTitle}
            </p>
            <p className="text-style-caption text-subtle leading-snug">
              {t.staleWellbeingNote}
            </p>
          </div>
        )}

        <p className="text-style-caption text-muted leading-snug mb-1">
          {t.n1Note}
        </p>
        <p className="text-style-caption text-muted leading-snug">
          {t.medicalNote}
        </p>
      </div>
    </details>
  );
}
