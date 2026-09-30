import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Badge, Btn, BrutalCard, Field, Input, Modal, PageHeader, PageLoading, PageMotion, Select, Stagger,
} from "@/features/shared/primitives";
import { LoadError, StatCard } from "@/features/shared/widgets";
import { queryState } from "@/features/shared/queryState";
import { useSession } from "@/features/shared/SessionContext";
import {
  createAccount, deleteAccount, getAccounts, getMailStatus, resetPassword, sendCredentials, updateAccount,
  type AccountInput, type EmailOutcome,
} from "@/lib/repositories/accountRepository";
import { getPools } from "@/lib/repositories/poolRepository";
import { errorMessage } from "@/lib/services/errors";
import type { Account } from "@/types";
import { useAction } from "./useAction";

// AccountsPage — the jury and admin accounts: create one (its password is
// shown once, and emailed when asked), edit it, issue a new password (shown,
// and emailed), delete it. « Envoyer les identifiants » emails a new
// password to every juror who never got one by email, one account per
// request like the convocations; the Identifiants column says who did.

const ACCOUNT_QUERIES = [["accounts"], ["pools"], ["duos"]];

// A password the admin is shown once, and what became of its email
type Revealed = { email: string; password: string } & EmailOutcome;

const sentAt = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function AccountsPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: () => getAccounts() });
  const poolsQ = useQuery({ queryKey: ["pools"], queryFn: () => getPools() });
  const mailQ = useQuery({ queryKey: ["mail-status"], queryFn: getMailStatus });
  const { run, busy, error } = useAction(ACCOUNT_QUERIES);
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState<Account[] | null>(null); // jurors about to get their credentials
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  if (accountsQ.isLoading || poolsQ.isLoading) return <PageLoading />;
  const load = queryState(accountsQ, poolsQ);
  if (load.failed) return <LoadError onRetry={load.retry} />;

  const accounts = accountsQ.data ?? [];
  const passages = (poolsQ.data ?? []).flatMap((p) => p.passages);
  const passageCount = (id: string) => passages.filter((p) => p.duo?.members.some((m) => m.id === id)).length;
  const sorted = [...accounts].sort((a, b) => a.role.localeCompare(b.role) || a.lastName.localeCompare(b.lastName));
  const jurors = accounts.filter((a) => a.isJuror); // admins who also judge included
  // Unknown until the status arrives: the buttons wait, no warning flashes
  const mailConfigured = mailQ.data?.configured ?? false;
  // Your own password is changed from your account menu, never emailed from here
  const unsent = jurors.filter((j) => !j.credentialsSentAt && j.id !== user?.id);
  const canSend = mailConfigured && !progress;

  const reset = async (account: Account) => {
    setConfirmReset(null);
    const res = await run(() => resetPassword(account.id));
    if (res) setRevealed({ email: account.email, ...res });
  };

  // One account per request; stops on the first failure
  const sendAll = async (rows: Account[]) => {
    setConfirmSend(null);
    setSendError(null);
    for (const [i, row] of rows.entries()) {
      setProgress({ done: i, total: rows.length, current: `${row.firstName} ${row.lastName}` });
      try {
        await sendCredentials(row.id);
      } catch (err) {
        setSendError(`${row.firstName} ${row.lastName} : ${errorMessage(err)} — envoi arrêté (${i}/${rows.length} envoyés).`);
        break;
      }
    }
    setProgress(null);
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
  };

  return (
    <PageMotion className="space-y-10">
      <PageHeader
        eyebrow="Administration"
        title="Comptes"
        sub="Les comptes des jurés et des administrateurs. Un mot de passe n'est affiché qu'une fois : il part aussi par email quand l'envoi est configuré, sinon transmettez-le à la personne."
        right={
          <div className="flex gap-2 flex-wrap">
            <Btn variant="ghost" disabled={!canSend || unsent.length === 0} onClick={() => setConfirmSend(unsent)}>
              Envoyer les identifiants ({unsent.length})
            </Btn>
            <Btn onClick={() => setEditing("new")}>Nouveau compte</Btn>
          </div>
        }
      />

      <Stagger className="grid grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard label="Jurés" value={jurors.length} />
        <StatCard
          label="Jurés avec un passage"
          value={jurors.filter((j) => passageCount(j.id) > 0).length}
          denom={jurors.length || undefined}
          progressColor="var(--sage)"
        />
        <StatCard label="Administrateurs" value={accounts.filter((a) => a.role === "admin").length} progressColor="var(--forest-soft)" />
      </Stagger>

      {mailQ.data && !mailConfigured && (
        <Alert tone="warning" title="Envoi non configuré">
          Aucun email ne peut partir : les réglages SMTP_… manquent dans le fichier backend/.env du serveur. Les mots de passe
          restent affichés une fois, à transmettre vous-même.
        </Alert>
      )}
      {error && <Alert>{error}</Alert>}
      {sendError && <Alert>{sendError}</Alert>}
      {progress && (
        <BrutalCard withCorners={false} className="px-5 py-4" role="status">
          <div className="flex items-center justify-between font-mont text-xs uppercase tracking-widest mb-2" style={{ color: "var(--forest)", fontWeight: 800 }}>
            <span>Envoi · {progress.current}</span>
            <span>{progress.done}/{progress.total}</span>
          </div>
          <div style={{ height: 6, background: "var(--paper-2)" }}>
            <div style={{ height: "100%", width: `${(progress.done / progress.total) * 100}%`, background: "var(--saffron)", transition: "width 200ms" }} />
          </div>
        </BrutalCard>
      )}
      <BrutalCard className="overflow-hidden">
        <div className="table-scroll">
          <table className="brutal-table">
            <thead>
              <tr>
                <th className="col-tight">Nom</th>
                <th>Email</th>
                <th className="col-tight">Rôle</th>
                <th className="col-tight" style={{ textAlign: "center" }}>Passages</th>
                <th className="col-tight" title="Le dernier mot de passe envoyé par email">Identifiants</th>
                <th className="col-tight" style={{ borderRight: "none" }} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id}>
                  <td className="col-tight">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex items-center justify-center font-mont shrink-0"
                        style={{ width: "2.125rem", height: "2.125rem", background: "var(--paper-2)", color: "var(--forest)", fontWeight: 900, border: "1px solid var(--forest)", fontSize: "0.75rem" }}
                      >
                        {`${a.firstName[0] ?? ""}${a.lastName[0] ?? ""}`.toUpperCase()}
                      </span>
                      <span className="font-mont" style={{ color: "var(--forest)", fontWeight: 800 }}>
                        {a.firstName} {a.lastName}
                      </span>
                    </div>
                  </td>
                  <td className="font-open text-sm" style={{ color: "var(--ink-soft)" }}>{a.email}</td>
                  <td className="col-tight">
                    <span className="inline-flex items-center gap-1.5">
                      <Badge tone={a.role === "admin" ? "dark" : "sage"}>{a.role === "admin" ? "Admin" : "Jury"}</Badge>
                      {a.role === "admin" && a.isJuror && (
                        <span title="Administrateur qui fait aussi partie du jury">
                          <Badge tone="sage">Juré</Badge>
                        </span>
                      )}
                    </span>
                  </td>
                  <td style={{ textAlign: "center" }} className="font-mont col-tight">{a.isJuror ? passageCount(a.id) : "—"}</td>
                  <td className="col-tight">
                    {a.credentialsSentAt
                      ? <Badge tone="sage">Envoyés · {sentAt(a.credentialsSentAt)}</Badge>
                      : <Badge tone="neutral">Jamais envoyés</Badge>}
                  </td>
                  <td className="col-tight" style={{ borderRight: "none" }}>
                    {/* No wrapping: the column hugs the buttons instead of
                        stacking them, and the table scrolls if too narrow */}
                    <div className="flex gap-1.5 justify-end flex-nowrap">
                      <Btn variant="ghost" size="sm" onClick={() => setEditing(a)}>Modifier</Btn>
                      {/* The old password stops working at once: asked first */}
                      {confirmReset === a.id ? (
                        <>
                          <Btn
                            variant="forest"
                            size="sm"
                            disabled={busy}
                            onClick={() => reset(a)}
                            title={mailConfigured ? "Générer un nouveau mot de passe et l'envoyer par email" : "Générer un nouveau mot de passe"}
                          >
                            Confirmer
                          </Btn>
                          <Btn variant="ghost" size="sm" onClick={() => setConfirmReset(null)}>Annuler</Btn>
                        </>
                      ) : (
                        <Btn variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmReset(a.id)}>Nouveau mot de passe</Btn>
                      )}
                      {a.id !== user?.id && (confirmDelete === a.id ? (
                        <>
                          <Btn variant="danger" size="sm" onClick={() => { setConfirmDelete(null); run(() => deleteAccount(a.id)); }}>Confirmer</Btn>
                          <Btn variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>Annuler</Btn>
                        </>
                      ) : (
                        <Btn variant="danger" size="sm" onClick={() => setConfirmDelete(a.id)}>Supprimer</Btn>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </BrutalCard>

      {editing && (
        <AccountModal
          account={editing === "new" ? null : editing}
          mailConfigured={mailConfigured}
          onClose={() => setEditing(null)}
          onCreated={(created) => { setEditing(null); setRevealed(created); }}
        />
      )}
      {revealed && <PasswordModal {...revealed} onClose={() => setRevealed(null)} />}
      {confirmSend && (
        <Modal
          open
          title="Envoyer les identifiants"
          onClose={() => setConfirmSend(null)}
          width={500}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setConfirmSend(null)}>Annuler</Btn>
              <Btn onClick={() => sendAll(confirmSend)}>Envoyer</Btn>
            </>
          }
        >
          <div className="space-y-3 font-open text-sm" style={{ color: "var(--ink)" }}>
            <p>
              {confirmSend.length > 1
                ? `${confirmSend.length} jurés vont recevoir leurs identifiants par email`
                : "1 juré va recevoir ses identifiants par email"}{" "}
              : {confirmSend.map((j) => `${j.firstName} ${j.lastName}`).join(", ")}.
            </p>
            <Alert tone="warning">
              Un nouveau mot de passe est généré pour chacun : un mot de passe déjà transmis à la main ne fonctionnera plus.
            </Alert>
          </div>
        </Modal>
      )}
    </PageMotion>
  );
}

function AccountModal({
  account,
  mailConfigured,
  onClose,
  onCreated,
}: {
  account: Account | null; // null = create
  mailConfigured: boolean;
  onClose: () => void;
  onCreated: (created: Revealed) => void;
}) {
  const [draft, setDraft] = useState<AccountInput>({
    firstName: account?.firstName ?? "",
    lastName: account?.lastName ?? "",
    email: account?.email ?? "",
    phone: account?.phone ?? "",
    role: account?.role ?? "jury",
    isJuror: account?.isJuror ?? false,
  });
  const [sendByEmail, setSendByEmail] = useState(mailConfigured);
  const { run, busy, error } = useAction(ACCOUNT_QUERIES);
  const set = (key: Exclude<keyof AccountInput, "isJuror">, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const valid = draft.firstName.trim() && draft.lastName.trim() && draft.email.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...draft, phone: draft.phone?.trim() || undefined };
    if (account) {
      if (await run(() => updateAccount(account.id, payload))) onClose();
    } else {
      const created = await run(() => createAccount({ ...payload, sendCredentials: mailConfigured && sendByEmail }));
      if (created) {
        const { account: made, password, emailed, emailError } = created;
        onCreated({ email: made.email, password, emailed, emailError });
      }
    }
  };

  return (
    <Modal
      open
      title={account ? "Modifier le compte" : "Nouveau compte"}
      onClose={onClose}
      width={520}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
          <Btn type="submit" form="account-form" disabled={!valid || busy}>{account ? "Enregistrer" : "Créer"}</Btn>
        </>
      }
    >
      <form id="account-form" onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Prénom"><Input value={draft.firstName} onChange={(e) => set("firstName", e.target.value)} autoFocus /></Field>
          <Field label="Nom"><Input value={draft.lastName} onChange={(e) => set("lastName", e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Téléphone (optionnel)"><Input value={draft.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="Rôle">
            <Select value={draft.role} onChange={(e) => set("role", e.target.value)}>
              <option value="jury">Jury</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
        </div>
        {/* A jury account always judges; an admin only when ticked */}
        {draft.role === "admin" && (
          <Checkbox
            checked={draft.isJuror ?? false}
            onChange={(isJuror) => setDraft((d) => ({ ...d, isJuror }))}
            label="Également juré"
            hint="Peut faire partie d'un duo, noter des passages et corriger des rapports, avec ce même compte."
          />
        )}
        {!account && mailConfigured && (
          <Checkbox
            checked={sendByEmail}
            onChange={setSendByEmail}
            label="Envoyer les identifiants par email"
            hint="L'adresse de la plateforme, l'email et le mot de passe partent à cette adresse."
          />
        )}
        {!account && (
          <p className="font-open text-xs" style={{ color: "var(--ink-faint)" }}>
            Un mot de passe sera généré et affiché une seule fois.
          </p>
        )}
      </form>
    </Modal>
  );
}

// A ticked box with its label and what it does
function Checkbox({ checked, onChange, label, hint }: { checked: boolean; onChange: (checked: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
        style={{ accentColor: "var(--forest)", width: "1rem", height: "1rem" }}
      />
      <span>
        <span className="font-mont text-sm block" style={{ color: "var(--forest)", fontWeight: 800 }}>{label}</span>
        <span className="font-open text-xs" style={{ color: "var(--ink-soft)" }}>{hint}</span>
      </span>
    </label>
  );
}

// The password, shown once — and whether it also left by email
function PasswordModal({ email, password, emailed, emailError, onClose }: Revealed & { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(password);
    setCopied(true);
  };
  return (
    <Modal open title="Mot de passe" onClose={onClose} width={460} footer={<Btn onClick={onClose}>{emailed ? "Fermer" : "J'ai noté le mot de passe"}</Btn>}>
      <div className="mb-4">
        {emailed ? (
          <Alert tone="success" title="Envoyé par email">
            Le mot de passe est parti à <strong>{email}</strong>, avec l'adresse de la plateforme.
          </Alert>
        ) : emailError ? (
          <Alert tone="warning" title="L'email n'est pas parti">
            {emailError.replace(/\.$/, "")}. Transmettez vous-même ce mot de passe à <strong>{email}</strong>.
          </Alert>
        ) : (
          <p className="font-open text-sm" style={{ color: "var(--ink)" }}>
            Transmettez ce mot de passe à <strong>{email}</strong>. Il ne sera plus affiché ; la personne pourra le
            changer après sa première connexion.
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <code
          className="flex-1 px-3 py-2 font-mont text-lg tracking-wider select-all"
          style={{ background: "var(--paper-2)", border: "2px solid var(--forest)", color: "var(--forest)", fontWeight: 800 }}
        >
          {password}
        </code>
        <Btn variant="forest" size="sm" onClick={copy}>{copied ? "Copié" : "Copier"}</Btn>
      </div>
    </Modal>
  );
}
