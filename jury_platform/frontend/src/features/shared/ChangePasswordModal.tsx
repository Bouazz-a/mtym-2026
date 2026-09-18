import { useState } from "react";
import { Alert, Btn, Field, Input, Modal } from "./primitives";
import { changeOwnPassword } from "@/lib/repositories/accountRepository";
import { errorMessage } from "@/lib/services/errors";

// Accounts start with a generated password — this lets their owner pick one.
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const valid = current.length > 0 && next.length >= 8 && next === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await changeOwnPassword(current, next);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="Changer le mot de passe"
      onClose={onClose}
      width={440}
      footer={
        done ? (
          <Btn onClick={onClose}>Fermer</Btn>
        ) : (
          <>
            <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
            <Btn type="submit" form="change-password" disabled={!valid || busy}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </Btn>
          </>
        )
      }
    >
      {done ? (
        <Alert tone="success">Votre mot de passe a été modifié.</Alert>
      ) : (
        <form id="change-password" onSubmit={submit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Mot de passe actuel">
            <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
          </Field>
          <Field label="Nouveau mot de passe" hint="8 caractères minimum">
            <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Confirmer" error={mismatch ? "Les deux mots de passe diffèrent" : undefined}>
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        </form>
      )}
    </Modal>
  );
}
