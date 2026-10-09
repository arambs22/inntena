import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { getErrorMessage, api } from "../lib/api";
import { Modal } from "./Modal";
import { FormError } from "./FormError";

interface AccountModalProps {
  onClose: () => void;
}

/** Modal with two independent sections: changing password and deleting the account. Both re-require the current password as a second confirmation, even though the user already holds a valid session. */
export function AccountModal({ onClose }: AccountModalProps) {
  const { logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeSuccess, setChangeSuccess] = useState(false);
  const [changing, setChanging] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    setChangeError(null);
    setChangeSuccess(false);
    if (newPassword !== confirmPassword) {
      setChangeError(t.account.changePassword.mismatch);
      return;
    }
    setChanging(true);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      setChangeSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setChangeError(getErrorMessage(err, t.auth.genericError));
    } finally {
      setChanging(false);
    }
  }

  async function handleDeleteAccount(event: FormEvent) {
    event.preventDefault();
    setDeleteError(null);
    if (!window.confirm(t.account.deleteAccount.confirmPrompt)) {
      return;
    }
    setDeleting(true);
    try {
      await api.delete("/auth/me", { password: deletePassword });
      await logout();
      navigate("/login");
    } catch (err) {
      setDeleteError(getErrorMessage(err, t.auth.genericError));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal title={t.account.title} onClose={onClose}>
      <form onSubmit={handleChangePassword} className="space-y-3 border-b border-border pb-6">
        <h3 className="text-sm font-semibold text-text">{t.account.changePassword.heading}</h3>
        {changeError && <FormError message={changeError} size="xs" />}
        {changeSuccess && <p className="rounded border border-border bg-bg p-2 text-xs text-text">{t.account.changePassword.success}</p>}
        <input
          type="password"
          required
          placeholder={t.account.changePassword.current}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder={t.account.changePassword.new}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder={t.account.changePassword.confirm}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text"
        />
        <button
          type="submit"
          disabled={changing}
          className="w-full rounded bg-primary-solid py-2 text-sm font-medium text-on-primary hover:bg-primary-solid-hover disabled:opacity-50"
        >
          {changing ? t.account.changePassword.submitting : t.account.changePassword.submit}
        </button>
      </form>

      <form onSubmit={handleDeleteAccount} className="space-y-3 pt-6">
        <h3 className="text-sm font-semibold text-text">{t.account.deleteAccount.heading}</h3>
        <p className="text-xs text-text-muted">{t.account.deleteAccount.warning}</p>
        {deleteError && <FormError message={deleteError} size="xs" />}
        <input
          type="password"
          required
          placeholder={t.account.deleteAccount.password}
          value={deletePassword}
          onChange={(e) => setDeletePassword(e.target.value)}
          className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text"
        />
        <button
          type="submit"
          disabled={deleting}
          className="w-full rounded border border-primary py-2 text-sm font-medium text-primary hover:bg-primary-tint disabled:opacity-50"
        >
          {deleting ? t.account.deleteAccount.submitting : t.account.deleteAccount.submit}
        </button>
      </form>
    </Modal>
  );
}
