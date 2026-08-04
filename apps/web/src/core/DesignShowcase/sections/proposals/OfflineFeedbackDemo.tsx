import { ComparePair, MiniPhone } from "./_Compare";
import { Icon } from "@shared/components/ui";

/**
 * UX-6 — Per-record offline-write feedback.
 *
 * Зараз: a single global OfflineBanner pill tells you the app is offline,
 * but individual records look identical whether they're synced or still
 * queued — you can't tell which entries are "safe".
 *
 * Може бути: every record carries its own tiny sync-state chip
 * (synced ✓ / queued ↑ / offline), so the user trusts that a write landed
 * locally and will sync later.
 */

const ROWS = [
  { name: "Кава", amount: "−85 ₴", time: "09:12" },
  { name: "Продукти", amount: "−420 ₴", time: "08:40" },
  { name: "Зарплата", amount: "+32 000 ₴", time: "Вчора" },
];

function ListChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col px-3">
      <div className="text-style-label text-text px-1 mb-2">Транзакції</div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

export function OfflineFeedbackDemo() {
  return (
    <ComparePair
      before={
        <MiniPhone dim>
          <div className="px-3 pt-1 pb-2">
            <div className="flex items-center gap-2 rounded-xl bg-warning/10 border border-warning/30 px-2.5 py-1.5">
              <Icon name="wifi-off" size={14} className="text-warning" />
              <span className="text-style-caption text-warning">
                Немає мережі
              </span>
            </div>
          </div>
          <ListChrome>
            {ROWS.map((r) => (
              <div
                key={r.name}
                className="flex items-center justify-between rounded-xl border border-line bg-panel px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-style-body text-text truncate">
                    {r.name}
                  </div>
                  <div className="text-style-caption text-muted">{r.time}</div>
                </div>
                <span className="text-style-body text-text tabular-nums">
                  {r.amount}
                </span>
              </div>
            ))}
          </ListChrome>
          <p className="text-style-caption text-muted text-center px-4 pb-2 pt-3">
            Не видно, які записи вже збережено
          </p>
        </MiniPhone>
      }
      after={
        <MiniPhone>
          <div className="px-3 pt-1 pb-2">
            <div className="flex items-center gap-2 rounded-xl bg-warning/10 border border-warning/30 px-2.5 py-1.5">
              <Icon name="wifi-off" size={14} className="text-warning" />
              <span className="text-style-caption text-warning">
                Офлайн · синхронізую пізніше
              </span>
            </div>
          </div>
          <ListChrome>
            {/* queued */}
            <div className="flex items-center justify-between rounded-xl border border-accent/40 bg-accent/5 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-style-body text-text truncate">Кава</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <Icon name="cloud-off" size={11} className="text-accent" />
                  <span className="text-style-caption text-accent">
                    Збережено · в черзі
                  </span>
                </div>
              </div>
              <span className="text-style-body text-text tabular-nums">
                −85 ₴
              </span>
            </div>
            {/* queued */}
            <div className="flex items-center justify-between rounded-xl border border-accent/40 bg-accent/5 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-style-body text-text truncate">
                  Продукти
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <Icon name="cloud-off" size={11} className="text-accent" />
                  <span className="text-style-caption text-accent">
                    Збережено · в черзі
                  </span>
                </div>
              </div>
              <span className="text-style-body text-text tabular-nums">
                −420 ₴
              </span>
            </div>
            {/* synced */}
            <div className="flex items-center justify-between rounded-xl border border-line bg-panel px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-style-body text-text truncate">
                  Зарплата
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <Icon name="cloud-check" size={11} className="text-success" />
                  <span className="text-style-caption text-muted">
                    Синхронізовано
                  </span>
                </div>
              </div>
              <span className="text-style-body text-text tabular-nums">
                +32 000 ₴
              </span>
            </div>
          </ListChrome>
          <p className="text-style-caption text-muted text-center px-4 pb-2 pt-3">
            Кожен запис показує свій стан
          </p>
        </MiniPhone>
      }
    />
  );
}
