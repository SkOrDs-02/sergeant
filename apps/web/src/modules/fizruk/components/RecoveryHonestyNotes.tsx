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
 * Тон — за `docs/01-product/copy/style-guide.uk.md`: це межі обіцянки, а не
 * збій і не вибачення. Порада лишається порадою (§4 — «не гейт»).
 */
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import type { WellbeingSignal } from "@sergeant/fizruk-domain";
import type { ReplicaFreshness } from "../../../core/syncEngine/replicaFreshness";

export interface RecoveryHonestyNotesProps {
  freshness: ReplicaFreshness;
  wellbeing: WellbeingSignal;
}

export function RecoveryHonestyNotes({
  freshness,
  wellbeing,
}: RecoveryHonestyNotesProps) {
  const t = messages.fizruk.recoveryHonesty;
  const neverSynced = freshness.lastPullAt === null;

  return (
    <>
      {!freshness.complete && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-panel border border-line flex items-start gap-2">
          <Icon
            name="info"
            size={16}
            className="shrink-0 text-subtle mt-0.5"
            aria-hidden
          />
          <div className="min-w-0">
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
        </div>
      )}

      {wellbeing.stale && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-panel border border-line">
          <p className="text-style-caption text-text leading-snug">
            {t.staleWellbeingTitle}
          </p>
          <p className="text-style-caption text-subtle leading-snug">
            {t.staleWellbeingNote}
          </p>
        </div>
      )}

      <p className="text-style-caption text-muted leading-snug mb-3">
        {t.n1Note}
      </p>
    </>
  );
}
