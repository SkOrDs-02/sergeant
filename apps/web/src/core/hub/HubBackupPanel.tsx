import { useRef, useState } from "react";
import { downloadJson } from "@sergeant/shared";
import type { BackupRestoreMode } from "@shared/lib/backup/restoreMode";
import { useAuthOptional } from "../auth/AuthContext";
import { outboxCheckpoint } from "../syncEngine/outboxCheckpoint";
import { Banner } from "@shared/components/ui/Banner";
import { Button } from "@shared/components/ui/Button";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { useToast } from "@shared/hooks/useToast";
import { cn } from "@shared/lib/ui/cn";
import {
  applyHubBackupPayload,
  buildHubBackupPayload,
  isHubBackupPayload,
} from "./hubBackup";
import { HubRestoreModePicker } from "./HubRestoreModePicker";
import { useHubRestoreBlock } from "./useHubRestoreReady";

interface HubBackupPanelProps {
  className?: string;
}

// Adversarial review (backup group) #2: назва модуля → людський опис. Ключі
// збігаються з полями HubBackupPayload (`hubBackup.ts`).
const OVERWRITE_LABELS: Record<string, string> = {
  finyk: "Фінік: витрати, борги, бюджети, підписки",
  fizruk: "Фізрук: тренування",
  routine: "Рутина: звички",
  nutrition: "Їжа: харчування",
  // Дефект #3 (CodeRabbit post-merge review PR #756): `applyHubBackupPayload`
  // (`hubBackup.ts`) застосовує й секцію `hub` (останній відкритий модуль +
  // опційна історія чату), але цей список про неї мовчав — бекап лише з
  // `hub` (наприклад окремий експорт із `includeChat: true`) показував
  // порожнє попередження замість переліку того, що реально буде перетерто.
  hub: "Hub: останній відкритий розділ і історія чату із Сержантом",
};

// Adversarial review (backup group) #2 (HIGH): раніше цей список був
// статичним "найгіршим випадком" і показувався незалежно від того, що
// насправді містить обраний файл — файл із самим лише `finyk` показував
// попередження про всі чотири модулі. Тепер рахуємо секції, які
// `applyHubBackupPayload` (`hubBackup.ts:137-157`) РЕАЛЬНО застосує: ті самі
// truthy-перевірки, продубльовані тут навмисно (без експорту private-типу
// з hubBackup.ts), бо ціль — показати правду про КОНКРЕТНИЙ файл, а не
// гіпотетичний. Якщо hubBackup.ts зміните умови застосування секції — синхронізуйте
// і цю функцію.
function sectionsThatWillBeOverwritten(data: unknown): string[] {
  const record =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const sections: string[] = [];
  const finyk = record["finyk"];
  if (
    finyk &&
    typeof finyk === "object" &&
    Object.keys(finyk as object).some((k) => k !== "version")
  ) {
    sections.push(OVERWRITE_LABELS["finyk"] as string);
  }
  if (record["routine"]) sections.push(OVERWRITE_LABELS["routine"] as string);
  if (record["fizruk"]) sections.push(OVERWRITE_LABELS["fizruk"] as string);
  if (record["nutrition"])
    sections.push(OVERWRITE_LABELS["nutrition"] as string);
  // Дефект #3: та сама перевірка, що й `applyHubBackupPayload` для `hub`
  // (`hubBackup.ts`) — `parsed.hub && typeof parsed.hub === "object"`.
  const hub = record["hub"];
  if (hub && typeof hub === "object") {
    sections.push(OVERWRITE_LABELS["hub"] as string);
  }
  return sections;
}

export function HubBackupPanel({ className }: HubBackupPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  // Розібраний, ще НЕ застосований JSON. `null` — діалог закритий і дані
  // на пристрої недоторкані; вибір файлу лише парсить його і чекає на
  // свідоме підтвердження, перш ніж applyHubBackupPayload щось перепише.
  // `sections` — рахується один раз при виборі файлу (§2 вище), а не при
  // кожному рендері діалогу.
  const [pendingImport, setPendingImport] = useState<{
    data: unknown;
    sections: string[];
  } | null>(null);
  // Дефолт — «додати відсутнє»: видалення («замінити») лише явним вибором, бо
  // воно їде на сервер і на всі пристрої акаунта (аудит 2026-10-01, data-06).
  const [mode, setMode] = useState<BackupRestoreMode>("merge");
  const [busy, setBusy] = useState(false);
  // Імпорт до реєстрації dual-write контекстів, прогріву кешів і першого pull
  // з акаунта або нічого не пише, або перебиває новіші дані сервера (data-07),
  // тому кнопка чекає готовності.
  const restoreBlock = useHubRestoreBlock();
  const ready = restoreBlock === null;
  const signedIn = Boolean(useAuthOptional()?.user);

  const exportJson = async () => {
    const payload = buildHubBackupPayload({ includeChat: false });
    await downloadJson(
      `hub-backup-${new Date().toISOString().slice(0, 10)}.json`,
      payload,
    );
  };

  const showParseError = (err: unknown) => {
    const message =
      err instanceof Error ? err.message : "Не вдалось імпортувати файл";
    // Adversarial review (backup group) #8: цей самий тост тепер обслуговує
    // і невалідний файл (r.onload), і збій applyHubBackupPayload ПІСЛЯ
    // підтвердження (наприклад переповнення сховища) — в другому випадку
    // "інший файл" не гарантовано допоможе, але кнопка все одно нешкідлива
    // (лише знову відкриває file picker), тож лишаємо той самий CTA.
    toast.error(message, undefined, {
      label: "Обрати інший",
      onClick: () => fileRef.current?.click(),
    });
  };

  const runImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result as string);
        // Adversarial review (backup group) #1 (HIGH): раніше форма файлу
        // перевірялась лише всередині applyHubBackupPayload, ПІСЛЯ того як
        // юзер тиснув "Перезаписати" на діалозі, що попереджає про
        // незворотну заміну чотирьох модулів. Обраний не-hub-backup JSON
        // (наприклад package.json) відкривав те саме страшне попередження,
        // і єдиний спосіб дізнатись про помилку — натиснути червону кнопку.
        // Валідуємо форму тут, до setPendingImport, щоб діалог підтвердження
        // взагалі не зʼявлявся для файлу, який гарантовано не hub-backup.
        if (!isHubBackupPayload(data)) {
          throw new Error("Некоректний файл резервної копії Hub.");
        }
        // L-5 (P1): раніше тут одразу викликався applyHubBackupPayload +
        // reload — вибір файлу перетирав дані без жодного попередження.
        // Тепер лише ставимо файл у чергу на підтвердження.
        setMode("merge");
        setPendingImport({
          data,
          sections: sectionsThatWillBeOverwritten(data),
        });
      } catch (err) {
        showParseError(err);
      }
      e.target.value = "";
    };
    // Дефект #4 (CodeRabbit post-merge review PR #756): без onerror збій
    // readAsText (пошкоджений файл, обрив читання диска) не давав ні тосту,
    // ні скинутого значення інпута — браузер вважає `<input type="file">`
    // незмінним, якщо в ньому лежить той самий файл, тож повторний вибір
    // ТОГО САМОГО файлу після цього взагалі не спрацьовував (onChange не
    // фаериться). Та сама поведінка, що й catch-гілка в onload вище.
    // Фіксований текст, а не `r.error?.message` — `FileReaderError`/
    // `DOMException` НЕ є `instanceof Error` (ані в специфікації, ані в
    // jsdom), тож `showParseError` однаково впала б на дефолтне повідомлення;
    // явний текст стабільніший і зрозуміліший, ніж непередбачуваний
    // browser-specific рядок `DOMException.message`.
    r.onerror = () => {
      showParseError(new Error("Не вдалось прочитати файл"));
      e.target.value = "";
    };
    r.readAsText(f);
  };

  const confirmImport = async () => {
    if (!pendingImport || busy) return;
    const { data } = pendingImport;
    const importMode = mode;
    setPendingImport(null);
    setBusy(true);
    try {
      if (importMode === "replace") {
        // Заміна видаляє й на сервері, тож спершу знімок поточного стану. Якщо
        // знімок не зберігся, замінювати не можна: кидаємо до будь-якого запису.
        await downloadJson(
          `hub-backup-before-replace-${new Date().toISOString().slice(0, 10)}.json`,
          buildHubBackupPayload({ includeChat: false }),
        );
      }
      // Чекпоінт беремо ДО запису: він покриває всі рядки outbox, поставлені
      // під час імпорту, зокрема хвіст fire-and-forget черги адаптерів.
      const outboxSettled = outboxCheckpoint();
      await applyHubBackupPayload(data, { mode: importMode });
      // reload вбиває чергу outbox, тож чекаємо, поки всі рядки лягли.
      if (!(await outboxSettled())) {
        throw new Error(
          "Дані записались на пристрої, але не всі стали в чергу синхронізації. Спробуй імпорт ще раз.",
        );
      }
      window.location.reload();
    } catch (err) {
      showParseError(err);
    } finally {
      setBusy(false);
    }
  };

  const cancelImport = () => {
    // Скасування — дані на пристрої лишаються як були, без reload.
    setPendingImport(null);
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-panelHi px-3 py-2.5 flex flex-col gap-3 text-style-body text-subtle",
        className,
      )}
    >
      <p className="font-semibold text-text leading-snug">
        Резервна копія всього Hub (Фінік, Фізрук, Рутина, Їжа) у JSON-файл.
      </p>
      <p className="leading-relaxed text-style-body">
        Токен Monobank і кеш операцій не входять у файл, після імпорту підключи
        рахунок знову в Фініку.
      </p>
      <p className="leading-relaxed text-style-body">
        Ідентифікатори акаунта прибираю автоматично, але файл усе одно містить
        твої особисті дані: суми, назви боргів, нотатки й коментарі, які ти
        вписував сам. Тримай його як приватний, у менеджері паролів чи
        зашифрованій хмарі, не пересилай у відкритих чатах.
      </p>
      <Banner variant="warning" className="text-style-body leading-relaxed">
        {signedIn
          ? "Ручні витрати, борги, підписки й бюджети синхронізуються з твоїм акаунтом, тож є на всіх твоїх пристроях. Банк відновлюється сам, а ручні дані з файлу ні. Експорт лишається страховкою на випадок, якщо плануєш міняти телефон чи чистити дані."
          : "Без входу в акаунт ручні витрати, борги, підписки й бюджети живуть лише на цьому пристрої, банк відновлюється сам, а це ні. Зроби експорт, якщо плануєш міняти телефон чи чистити дані."}
      </Banner>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 min-h-[44px]"
          type="button"
          onClick={exportJson}
        >
          Експорт JSON
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 min-h-[44px]"
          type="button"
          disabled={!ready || busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? "Імпортую…" : "Імпорт…"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={runImport}
        />
      </div>
      {restoreBlock === "loading" && (
        <p className="text-style-body text-muted" role="status">
          Дані ще завантажуються, імпорт стане доступним за кілька секунд.
        </p>
      )}
      {restoreBlock === "sync" && (
        <p className="text-style-body text-muted" role="status">
          Чекаю на синхронізацію з акаунтом, імпорт стане доступним після неї.
          Для цього потрібен інтернет.
        </p>
      )}
      <ConfirmDialog
        open={pendingImport !== null}
        title={
          mode === "replace" ? "Замінити дані з файлу?" : "Додати дані з файлу?"
        }
        description={
          <>
            {pendingImport && pendingImport.sections.length > 0 ? (
              <>
                У файлі є:
                <ul className="mt-2 space-y-1 text-left">
                  {pendingImport.sections.map((section) => (
                    <li key={section}>• {section}</li>
                  ))}
                </ul>
              </>
            ) : (
              "Цей файл не містить даних Фініка, Фізрука, Рутини чи Їжі, імпорт нічого з цього не змінить."
            )}
            {/* Дефект #2 (CodeRabbit post-merge review PR #756): раніше
                ConfirmDialog обгортав description у <p>, а <ul> вище (блочний
                елемент) усередині <p> — невалідний HTML: реальний парсер
                авто-закрив би зовнішній <p> ще до <ul>, розриваючи
                aria-describedby, плюс React DOM-nesting warning. Виправлено
                в ConfirmDialog.tsx (обгортка тепер <div>). */}
            <HubRestoreModePicker value={mode} onChange={setMode} />
            <span className="mt-3 block">
              {mode === "replace"
                ? signedIn
                  ? "Заміна зачепить і акаунт: усе, чого немає у файлі, видалиться на сервері та на всіх твоїх пристроях. Перед заміною збережу файл із поточними даними, а скасувати її після цього не можна."
                  : "Усе, чого немає у файлі, видалиться на цьому пристрої. Перед заміною збережу файл із поточними даними, а скасувати її після цього не можна."
                : "Нічого не видаляю: ні на цьому пристрої, ні в акаунті."}
            </span>
          </>
        }
        confirmLabel={mode === "replace" ? "Замінити дані" : "Додати відсутнє"}
        cancelLabel="Скасувати"
        danger={mode === "replace"}
        onConfirm={() => void confirmImport()}
        onCancel={cancelImport}
      />
    </div>
  );
}
