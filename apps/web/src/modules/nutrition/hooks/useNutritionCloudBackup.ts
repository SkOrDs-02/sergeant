/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import type { AccessDenial } from "@shared/lib/api/accessDenial";
import { useAccessGuard } from "../../../core/access/useCanUse";
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useMutation } from "@tanstack/react-query";
import { nutritionApi } from "@shared/api";
import {
  applyNutritionBackupPayload,
  buildNutritionBackupPayload,
} from "../domain/nutritionBackup";
import {
  decryptBlobToJson,
  encryptJsonToBlob,
} from "../lib/nutritionCloudBackup";
import { formatNutritionError } from "../lib/nutritionErrors";
import type {
  BackupPasswordDialogState,
  RestoreConfirmState,
} from "./useNutritionUiState";

export interface NutritionToast {
  success: (message: string) => void;
  error?: (message: string) => void;
}

export interface UseNutritionCloudBackupParams {
  toast: NutritionToast;
  setErr: Dispatch<SetStateAction<string>>;
  /** Причина, з якої бекап НЕ запустили (A3, поставка 2). */
  setDenial: (denial: AccessDenial) => void;
  cloudBackupBusy: boolean;
  setCloudBackupBusy: Dispatch<SetStateAction<boolean>>;
  backupPasswordDialog: BackupPasswordDialogState | null;
  setBackupPasswordDialog: Dispatch<
    SetStateAction<BackupPasswordDialogState | null>
  >;
  setRestoreConfirm: Dispatch<SetStateAction<RestoreConfirmState | null>>;
}

export interface UseNutritionCloudBackupResult {
  uploadCloudBackup: () => void;
  downloadCloudBackup: () => void;
  handleBackupPasswordConfirm: (pass: string) => void;
  applyRestorePayload: (payload: unknown) => void;
}

export function useNutritionCloudBackup({
  toast,
  setErr,
  setDenial,
  cloudBackupBusy,
  setCloudBackupBusy,
  backupPasswordDialog,
  setBackupPasswordDialog,
  setRestoreConfirm,
}: UseNutritionCloudBackupParams): UseNutritionCloudBackupResult {
  // Гейт стоїть ПЕРЕД діалогом пароля, а не перед запитом. Просити
  // придумати пароль шифрування, щоб через екран відмовити, — рівно та
  // «запізніла заборона», з якої почався пункт A3.
  const guard = useAccessGuard(setDenial);

  const uploadCloudBackup = useCallback(() => {
    if (cloudBackupBusy) return;
    guard("cloud-backup", () =>
      setBackupPasswordDialog({
        mode: "upload",
        title: "Пароль для шифрування",
        description: "Введи пароль для шифрування бекапу (запамʼятай його):",
      }),
    );
  }, [cloudBackupBusy, guard, setBackupPasswordDialog]);

  const downloadCloudBackup = useCallback(() => {
    if (cloudBackupBusy) return;
    guard("cloud-backup", () =>
      setBackupPasswordDialog({
        mode: "download",
        title: "Пароль для розшифрування",
        description: "Введи пароль для розшифрування бекапу:",
      }),
    );
  }, [cloudBackupBusy, guard, setBackupPasswordDialog]);

  const uploadMutation = useMutation({
    mutationFn: async ({ pass }: { pass: string }) => {
      const payload = buildNutritionBackupPayload();
      const blob = await encryptJsonToBlob(payload, pass);
      return nutritionApi.backupUpload({ blob });
    },
    onMutate: () => {
      setCloudBackupBusy(true);
      setErr("");
    },
    onSuccess: () => {
      toast.success("Бекап завантажено.");
    },
    onError: (err) => {
      setErr(formatNutritionError(err, "Не вдалося завантажити бекап"));
    },
    onSettled: () => {
      setCloudBackupBusy(false);
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async ({ pass }: { pass: string }) => {
      const data = await nutritionApi.backupDownload();
      const payload = await decryptBlobToJson(data?.blob, pass);
      return { payload };
    },
    onMutate: () => {
      setCloudBackupBusy(true);
      setErr("");
    },
    onSuccess: ({ payload }: { payload: unknown }) => {
      setRestoreConfirm({ payload });
    },
    onError: (err) => {
      setErr(formatNutritionError(err, "Не вдалося відновити бекап"));
    },
    onSettled: () => {
      setCloudBackupBusy(false);
    },
  });

  const handleBackupPasswordConfirm = useCallback(
    (pass: string) => {
      const mode = backupPasswordDialog?.mode;
      setBackupPasswordDialog(null);
      if (!pass) return;
      if (mode === "upload") {
        uploadMutation.mutate({ pass });
      } else if (mode === "download") {
        downloadMutation.mutate({ pass });
      }
    },
    [
      backupPasswordDialog,
      setBackupPasswordDialog,
      uploadMutation,
      downloadMutation,
    ],
  );

  const applyRestorePayload = useCallback((payload: unknown) => {
    if (!payload) return;
    applyNutritionBackupPayload(payload);
    window.location.reload();
  }, []);

  return {
    uploadCloudBackup,
    downloadCloudBackup,
    handleBackupPasswordConfirm,
    applyRestorePayload,
  };
}
