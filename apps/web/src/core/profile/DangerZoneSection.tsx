import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { useToast } from "@shared/hooks/useToast";
import { deleteUser, signOut } from "../auth/authClient";
import { DeleteAccountDialog } from "./DeleteAccountDialog";

interface DangerZoneSectionProps {
  online: boolean;
  onLogout: () => Promise<void>;
}

export function DangerZoneSection({
  online,
  onLogout,
}: DangerZoneSectionProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const closeDialog = () => {
    if (deleting) return;
    setShowConfirm(false);
    setPassword("");
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await deleteUser({ password: password || undefined });
      if (res.error) {
        toast.error(res.error.message ?? "Не вдалося видалити акаунт");
        return;
      }
      toast.success("Акаунт видалено");
      setShowConfirm(false);
      setPassword("");
      try {
        await signOut();
      } catch {
        /* ignore */
      }
      await onLogout();
      navigate("/", { replace: true });
    } catch {
      toast.error("Не вдалося видалити акаунт");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Card
        radius="lg"
        padding="none"
        className="overflow-hidden border-danger/30"
      >
        <div className="px-4 py-3.5 flex items-center gap-2 border-b border-danger/20">
          <Icon name="alert" size={18} className="text-danger" />
          <span className="text-style-label text-danger">Небезпечна зона</span>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-sm text-muted">
            Видалення акаунту є незворотною дією. Усі ваші дані буде повністю
            видалено з серверу.
          </p>
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            disabled={!online}
            onClick={() => setShowConfirm(true)}
          >
            Видалити акаунт
          </Button>
        </div>
      </Card>

      <DeleteAccountDialog
        open={showConfirm}
        password={password}
        deleting={deleting}
        onPasswordChange={setPassword}
        onCancel={closeDialog}
        onConfirm={handleDelete}
      />
    </>
  );
}
