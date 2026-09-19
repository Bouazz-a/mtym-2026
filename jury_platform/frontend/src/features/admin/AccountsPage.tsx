import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert, Badge, Btn, BrutalCard, Field, Input, Modal, PageHeader, PageLoading, PageMotion, Select, Stagger,
} from "@/features/shared/primitives";
import { StatCard } from "@/features/shared/widgets";
import { useSession } from "@/features/shared/SessionContext";
import {
  createAccount, deleteAccount, getAccounts, resetPassword, updateAccount, type AccountInput,
} from "@/lib/repositories/accountRepository";
import { getPools } from "@/lib/repositories/poolRepository";
import type { Account } from "@/types";
import { useAction } from "./useAction";

// AccountsPage — the jury and admin accounts: create one (its password is
// shown once), edit it, issue a new password, delete it.

const ACCOUNT_QUERIES = [["accounts"], ["pools"], ["duos"]];

export function AccountsPage() {
  const { user } = useSession();
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: () => getAccounts() });
  const poolsQ = useQuery({ queryKey: ["pools"], queryFn: () => getPools() });
  const { run, busy, error } = useAction(ACCOUNT_QUERIES);
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [revealed, setRevealed] = useState<{ email: string; password: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (accountsQ.isLoading || poolsQ.isLoading) return <PageLoading />;

  const accounts = accountsQ.data ?? [];
  const passages = (poolsQ.data ?? []).flatMap((p) => p.passages);
  const passageCount = (id: string) => passages.filter((p) => p.duo?.members.some((m) => m.id === id)).length;
  const sorted = [...accounts].sort((a, b) => a.role.localeCompare(b.role) || a.lastName.localeCompare(b.lastName));
  const jurors = accounts.filter((a) => a.role === "jury");

  const reset = async (account: Account) => {
    const res = await run(() => resetPassword(account.id));
    if (res) setRevealed({ email: account.email, password: res.password });
  };

  return (
    <PageMotion className="space-y-10">
      <PageHeader
        eyebrow="Administration"
        title="Comptes"
        sub="Les comptes des jurés et des administrateurs. Le mot de passe d'un nouveau compte n'est affiché qu'une fois : transmettez-le à la personne."
        right={<Btn onClick={() => setEditing("new")}>Nouveau compte</Btn>}
      />

      <Stagger className="grid grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard label="Jurés" value={jurors.length} />
        <StatCard
          label="Jurés avec un passage"
          value={jurors.filter((j) => passageCount(j.id) > 0).length}
          denom={jurors.length || undefined}
          progressColor="var(--sage)"
        />
        <StatCard label="Administrateurs" value={accounts.length - jurors.length} progressColor="var(--forest-soft)" />
      </Stagger>

      {error && <Alert>{error}</Alert>}
      <BrutalCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="brutal-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Email</th>
                <th>Rôle</th>
                <th style={{ textAlign: "center" }}>Passages</th>
                <th style={{ borderRight: "none" }} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <span
                        className="flex items-center justify-center font-mont shrink-0"
                        style={{ width: 34, height: 34, background: "var(--paper-2)", color: "var(--forest)", fontWeight: 900, border: "1px solid var(--forest)", fontSize: "0.75rem" }}
                      >
                        {`${a.firstName[0] ?? ""}${a.lastName[0] ?? ""}`.toUpperCase()}
                      </span>
                      <span className="font-mont" style={{ color: "var(--forest)", fontWeight: 800 }}>
                        {a.firstName} {a.lastName}
                      </span>
                    </div>
                  </td>
                  <td className="font-open text-sm" style={{ color: "var(--ink-soft)" }}>{a.email}</td>
                  <td><Badge tone={a.role === "admin" ? "dark" : "sage"}>{a.role === "admin" ? "Admin" : "Jury"}</Badge></td>
                  <td style={{ textAlign: "center" }} className="font-mont">{a.role === "jury" ? passageCount(a.id) : "—"}</td>
                  <td style={{ borderRight: "none" }}>
                    <div className="flex gap-1.5 justify-end flex-wrap">
                      <Btn variant="ghost" size="sm" onClick={() => setEditing(a)}>Modifier</Btn>
                      <Btn variant="ghost" size="sm" disabled={busy} onClick={() => reset(a)}>Nouveau mot de passe</Btn>
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
          onClose={() => setEditing(null)}
          onCreated={(email, password) => { setEditing(null); setRevealed({ email, password }); }}
        />
      )}
      {revealed && <PasswordModal {...revealed} onClose={() => setRevealed(null)} />}
    </PageMotion>
  );
}

function AccountModal({
  account,
  onClose,
  onCreated,
}: {
  account: Account | null; // null = create
  onClose: () => void;
  onCreated: (email: string, password: string) => void;
}) {
  const [draft, setDraft] = useState<AccountInput>({
    firstName: account?.firstName ?? "",
    lastName: account?.lastName ?? "",
    email: account?.email ?? "",
    phone: account?.phone ?? "",
    role: account?.role ?? "jury",
  });
  const { run, busy, error } = useAction(ACCOUNT_QUERIES);
  const set = (key: keyof AccountInput, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const valid = draft.firstName.trim() && draft.lastName.trim() && draft.email.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...draft, phone: draft.phone?.trim() || undefined };
    if (account) {
      if (await run(() => updateAccount(account.id, payload))) onClose();
    } else {
      const created = await run(() => createAccount(payload));
      if (created) onCreated(created.account.email, created.password);
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
        {!account && (
          <p className="font-open text-xs" style={{ color: "var(--ink-faint)" }}>
            Un mot de passe sera généré et affiché une seule fois.
          </p>
        )}
      </form>
    </Modal>
  );
}

function PasswordModal({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(password);
    setCopied(true);
  };
  return (
    <Modal open title="Mot de passe" onClose={onClose} width={460} footer={<Btn onClick={onClose}>J'ai noté le mot de passe</Btn>}>
      <p className="font-open text-sm mb-4" style={{ color: "var(--ink)" }}>
        Transmettez ce mot de passe à <strong>{email}</strong>. Il ne sera plus affiché ; la personne pourra le
        changer après sa première connexion.
      </p>
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
