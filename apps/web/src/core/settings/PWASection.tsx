import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { logger } from "@shared/lib";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { useToast } from "@shared/hooks/useToast";
import {
  swClearCaches,
  swGetDebugSnapshot,
  swSetDebug,
} from "../app/swControl";
import { SettingsGroup } from "./SettingsPrimitives";

export function PWASection() {
  const toast = useToast();
  const [swBusy, setSwBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [swSnapshot, setSwSnapshot] = useState<unknown>(null);

  const performClearCaches = async () => {
    setConfirmOpen(false);
    setSwBusy(true);
    try {
      const res = await swClearCaches();
      logger.info("[sw] caches cleared", res);
      toast.success("Кеш PWA скинуто. Перезавантажую…", 4000);
      setTimeout(() => window.location.reload(), 300);
    } catch (err) {
      // Скидання кешу ідемпотентне — повторна спроба безпечна і це єдиний
      // вихід із «застряглої версії», заради якої користувач сюди й прийшов.
      toast.error("Не вдалося скинути кеш PWA", undefined, {
        label: "Повторити",
        onClick: () => {
          void performClearCaches();
        },
      });
      logger.warn("[sw] clear caches failed", err);
    } finally {
      setSwBusy(false);
    }
  };

  const runSwDiagnostics = async () => {
    setSwBusy(true);
    try {
      await swSetDebug(true);
      const snap = await swGetDebugSnapshot();
      setSwSnapshot(snap);
      logger.info("[sw] snapshot", snap);
      toast.success("SW-діагностику підготовлено");
    } catch (err) {
      toast.error("Не вдалося отримати діагностику SW", undefined, {
        label: "Повторити",
        onClick: () => {
          void runSwDiagnostics();
        },
      });
      logger.warn("[sw] debug failed", err);
    } finally {
      setSwBusy(false);
    }
  };

  return (
    <SettingsGroup title="PWA та офлайн" icon="smartphone">
      <p className="text-style-body text-subtle leading-snug">
        Якщо після оновлення щось «застрягло» (стара версія або дивні дані),
        можна скинути кеш Service Worker і перезавантажити застосунок.
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 flex-1"
          disabled={swBusy || !("serviceWorker" in navigator)}
          onClick={() => {
            void runSwDiagnostics();
          }}
        >
          Діагностика SW
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          className="h-10 flex-1"
          disabled={swBusy || !("serviceWorker" in navigator)}
          onClick={() => setConfirmOpen(true)}
        >
          Скинути кеш PWA
        </Button>
      </div>
      {/* V-12 (аудит 2026-08-08, docs/90-work/audits/2026-08-08-profile-settings-deep-audit.md
          §5): цей блок НАВМИСНО не переведено на `SettingsSubGroup`.
          «Результат діагностики» — не структурний заголовок підрозділу, а
          inline-лейбл у ряду з кнопкою «Скопіювати» (флекс-рядок
          `justify-between`, а не окрема стрічка над вмістом), і сам блок —
          умовний preview-контейнер JSON-снепшота, що зʼявляється лише
          після діагностики, а не завжди-видима група налаштувань. Примітив
          рендерить `title` окремим рядком над `children`
          (`SettingsPrimitives.tsx`, який тут не чіпаємо) — вимога title
          зламала б цей ряд «лейбл + дія», а вигадувати для неї фальшивий
          структурний заголовок заради самого примітиву гірше, ніж лишити
          як є. */}
      {swSnapshot ? (
        <div className="rounded-xl border border-line bg-panelHi p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-style-label">Результат діагностики</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                void navigator.clipboard?.writeText(
                  JSON.stringify(swSnapshot, null, 2),
                );
                toast.success("Діагностику скопійовано");
              }}
            >
              Скопіювати
            </Button>
          </div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-style-caption text-subtle">
            {JSON.stringify(swSnapshot, null, 2)}
          </pre>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title="Скинути кеш PWA?"
        description="Service Worker очистить локальні кеші, після чого сторінка перезавантажиться. Несинхронізовані зміни в офлайн-черзі можуть бути втрачені."
        confirmLabel="Скинути та перезавантажити"
        cancelLabel="Скасувати"
        danger
        onConfirm={performClearCaches}
        onCancel={() => setConfirmOpen(false)}
      />
    </SettingsGroup>
  );
}
