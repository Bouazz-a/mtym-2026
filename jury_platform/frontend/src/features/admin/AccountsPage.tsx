import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Badge, Btn, BrutalCard, Field, Input, Modal, PageHeader, PageLoading, PageMotion, SectionHeading, Select, Stagger,
} from "@/features/shared/primitives";
import { ColumnFilterMenu, FilterSummary, NoMatchRow } from "@/features/shared/ColumnFilterMenu";
import { useColumnFilters } from "@/features/shared/useColumnFilters";
import { LoadError, StatCard } from "@/features/shared/widgets";
import { queryState } from "@/features/shared/queryState";
import { useSession } from "@/features/shared/SessionContext";
import {
  createAccount, deleteAccount, getAccounts, getMailStatus, resetPassword, sendCredentials, updateAccount,
  type AccountInput, type EmailOutcome,
} from "@/lib/repositories/accountRepository";
import { getPools } from "@/lib/repositories/poolRepository";
import type { FilterColumn } from "@/lib/services/columnFilters";
import { errorMessage } from "@/lib/services/errors";
import type { Account, PoolDetails } from "@/types";
import { centerLabel, formatDay } from "@/utils/labels";
import { useAction } from "./useAction";

// AccountsPage — the jury and admin accounts: create one (its password is
// shown once, and emailed when asked), edit it, issue a new password (shown,
// and emailed), delete it. « Envoyer les identifiants » emails a new
// password to the jurors the table's filters leave (all by default) who
// never got one by email — or, when asked, to those who did too — one
// account per request like the convocations; the Identifiants column says
// who got one. Spreadsheet-style filters pick them: role, days judged,
// passages, credentials sent or not.

const ACCOUNT_QUERIES = [["accounts"], ["pools"], ["duos"]];

// A password the admin is shown once, and what became of its email
type Revealed = { email: string; password: string } & EmailOutcome;

const sentOn = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
const sentAt = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// What the table knows of an account besides the account: the days it
// judges (one line each) and its passages — none for an admin who doesn't
// judge
interface AccountRow {
  account: Account;
  days: string[]; // "Casablanca · sam. 24 oct.", in date order
  firstDate: string | null; // the first of them, for the sort
  passages: number | null;
}

function accountRows(accounts: Account[], pools: PoolDetails[]): AccountRow[] {
  const judged = new Map<string, { passages: number; days: Map<string, { date: string; label: string }> }>();
  for (const pool of pools) {
    for (const passage of pool.passages) {
      for (const member of passage.duo?.members ?? []) {
        const entry = judged.get(member.id) ?? { passages: 0, days: new Map() };
        entry.passages += 1;
        const day = pool.centerDay;
        if (day) entry.days.set(day.id, { date: day.date, label: `${centerLabel(day.center)} · ${formatDay(day.date)}` });
        judged.set(member.id, entry);
      }
    }
  }
  return [...accounts]
    .sort((a, b) => a.role.localeCompare(b.role) || a.lastName.localeCompare(b.lastName))
    .map((account) => {
      const entry = judged.get(account.id);
      const days = [...(entry?.days.values() ?? [])].sort((x, y) => x.date.localeCompare(y.date));
      return {
        account,
        days: days.map((d) => d.label),
        firstDate: days[0]?.date ?? null,
        passages: account.isJuror ? entry?.passages ?? 0 : null,
      };
    });
}

const roleText = (a: Account) => (a.role === "jury" ? "Jury" : a.isJuror ? "Admin · juré" : "Admin");

const COLUMNS: FilterColumn<AccountRow>[] = [
  {
    key: "name",
    label: "Nom",
    value: ({ account: a }) => `${a.lastName} ${a.firstName}`,
    text: ({ account: a }) => `${a.firstName} ${a.lastName}`,
  },
  { key: "role", label: "Rôle", value: ({ account }) => roleText(account), text: ({ account }) => roleText(account) },
  { key: "days", label: "Jours", value: (r) => r.firstDate, text: (r) => r.days.join(", ") },
  {
    key: "passages",
    label: "Passages",
    value: (r) => r.passages,
    text: (r) => (r.passages === null ? "" : String(r.passages)),
  },
  {
    key: "credentials",
    label: "Identifiants",
    value: ({ account }) => account.credentialsSentAt,
    text: ({ account }) => (account.credentialsSentAt ? "Envoyés" : "Jamais envoyés"),
  },
];
const [NAME, ROLE, DAYS, PASSAGES, CREDENTIALS] = COLUMNS;

// Who « Envoyer les identifiants » is about to reach: the jurors shown who
// never got theirs, and those shown who did (sent to only when asked)
type SendChoice = { fresh: Account[]; again: Account[] };

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
  const [confirmSend, setConfirmSend] = useState<SendChoice | null>(null);
  const [sendAgain, setSendAgain] = useState(false); // the modal's « also those who got theirs »
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const accounts = accountsQ.data ?? [];
  const rows = accountRows(accounts, poolsQ.data ?? []);
  const { shown, narrowed, clear, menuProps } = useColumnFilters(rows, COLUMNS);

  if (accountsQ.isLoading || poolsQ.isLoading) return <PageLoading />;
  const load = queryState(accountsQ, poolsQ);
  if (load.failed) return <LoadError onRetry={load.retry} />;

  const jurors = rows.filter((r) => r.account.isJuror); // admins who also judge included
  // Unknown until the status arrives: the buttons wait, no warning flashes
  const mailConfigured = mailQ.data?.configured ?? false;
  // The send button follows the filters: the jurors shown, but never you
  // (your own password is changed from your account menu)
  const filtered = shown.length < rows.length;
  const recipients = shown.map((r) => r.account).filter((a) => a.isJuror && a.id !== user?.id);
  const fresh = recipients.filter((a) => !a.credentialsSentAt);
  const again = recipients.filter((a) => a.credentialsSentAt);
  const canSend = mailConfigured && !progress && recipients.length > 0;
  // With nobody new among them, the button offers to send again
  const sendLabel = fresh.length > 0 || again.length === 0
    ? `${filtered ? "Envoyer aux jurés affichés" : "Envoyer les identifiants"} (${fresh.length})`
    : `${filtered ? "Renvoyer aux jurés affichés" : "Renvoyer les identifiants"} (${again.length})`;
  const toSend = confirmSend ? [...confirmSend.fresh, ...(sendAgain || confirmSend.fresh.length === 0 ? confirmSend.again : [])] : [];

  const reset = async (account: Account) => {
    setConfirmReset(null);
    const res = await run(() => resetPassword(account.id));
    if (res) setRevealed({ email: account.email, ...res });
  };

  // One account per request; stops on the first failure
  const sendAll = async (list: Account[]) => {
    setConfirmSend(null);
    setSendError(null);
    for (const [i, row] of list.entries()) {
      setProgress({ done: i, total: list.length, current: `${row.firstName} ${row.lastName}` });
      try {
        await sendCredentials(row.id);
      } catch (err) {
        setSendError(`${row.firstName} ${row.lastName} : ${errorMessage(err)} — envoi arrêté (${i}/${list.length} envoyés).`);
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
            <Btn
              variant="ghost"
              disabled={!canSend}
              onClick={() => { setSendAgain(false); setConfirmSend({ fresh, again }); }}
              title={filtered ? "Seulement les jurés que les filtres du tableau laissent affichés" : undefined}
            >
              {sendLabel}
            </Btn>
            <Btn onClick={() => setEditing("new")}>Nouveau compte</Btn>
          </div>
        }
      />

      <Stagger className="grid grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard label="Jurés" value={jurors.length} />
        <StatCard
          label="Jurés avec un passage"
          value={jurors.filter((j) => (j.passages ?? 0) > 0).length}
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
      <section>
        <SectionHeading
          title="Tous les comptes"
          right={narrowed
            ? <div className="flex items-center gap-2 flex-wrap"><FilterSummary shown={shown.length} total={rows.length} unit="comptes" onClear={clear} /></div>
            : <Badge tone="neutral">{rows.length} comptes</Badge>}
        />
        <BrutalCard className="overflow-hidden">
          <div className="table-scroll">
            <table className="brutal-table">
              <thead>
                <tr>
                  <th><FilterHeader column={NAME} menu={menuProps(NAME)} sortKind="text" /></th>
                  <th className="col-tight"><FilterHeader column={ROLE} menu={menuProps(ROLE)} sortKind="text" /></th>
                  <th className="col-tight"><FilterHeader column={DAYS} menu={menuProps(DAYS)} sortKind="date" emptyLabel="(Aucun)" /></th>
                  <th className="col-tight"><FilterHeader column={PASSAGES} menu={menuProps(PASSAGES)} emptyLabel="(Pas juré)" /></th>
                  <th className="col-tight" title="Le dernier mot de passe envoyé par email">
                    <FilterHeader column={CREDENTIALS} menu={menuProps(CREDENTIALS)} sortKind="date" align="right" />
                  </th>
                  <th className="col-tight" style={{ borderRight: "none" }} />
                </tr>
              </thead>
              <tbody>
                {shown.map(({ account: a, days, passages }) => (
                  <tr key={a.id}>
                    <td>
                      {/* The name, and the address the emails go to under it */}
                      <div className="flex items-center gap-3">
                        <span
                          className="flex items-center justify-center font-mont shrink-0"
                          style={{ width: "2.125rem", height: "2.125rem", background: "var(--paper-2)", color: "var(--forest)", fontWeight: 900, border: "1px solid var(--forest)", fontSize: "0.75rem" }}
                        >
                          {`${a.firstName[0] ?? ""}${a.lastName[0] ?? ""}`.toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="font-mont" style={{ color: "var(--forest)", fontWeight: 800 }}>
                            {a.firstName} {a.lastName}
                          </div>
                          {/* Too long for the column, it wraps after the @ */}
                          <div className="font-open text-xs" style={{ color: "var(--ink-soft)", overflowWrap: "anywhere" }}>
                            {a.email.split("@")[0]}<wbr />@{a.email.split("@").slice(1).join("@")}
                          </div>
                        </div>
                      </div>
                    </td>
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
                    <td className="col-tight font-open text-xs" style={{ color: "var(--ink-soft)" }}>
                      {days.length === 0 ? <span style={{ color: "var(--ink-faint)" }}>—</span> : days.map((d) => <div key={d}>{d}</div>)}
                    </td>
                    <td style={{ textAlign: "center" }} className="font-mont col-tight">{passages ?? "—"}</td>
                    <td className="col-tight">
                      {/* The day; the time under the pointer */}
                      {a.credentialsSentAt
                        ? <span title={`Envoyés le ${sentAt(a.credentialsSentAt)}`}><Badge tone="sage">Envoyés · {sentOn(a.credentialsSentAt)}</Badge></span>
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
                {shown.length === 0 && <NoMatchRow colSpan={6} label="Aucun compte ne correspond aux filtres." onClear={clear} />}
              </tbody>
            </table>
          </div>
        </BrutalCard>
      </section>

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
          title={confirmSend.fresh.length > 0 ? "Envoyer les identifiants" : "Renvoyer les identifiants"}
          onClose={() => setConfirmSend(null)}
          width={520}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setConfirmSend(null)}>Annuler</Btn>
              <Btn onClick={() => sendAll(toSend)}>Envoyer ({toSend.length})</Btn>
            </>
          }
        >
          <div className="space-y-4 font-open text-sm" style={{ color: "var(--ink)" }}>
            {confirmSend.fresh.length > 0 ? (
              <p>
                {confirmSend.fresh.length > 1
                  ? `${confirmSend.fresh.length} jurés${filtered ? " affichés" : ""} n'ont jamais reçu leurs identifiants par email`
                  : `1 juré${filtered ? " affiché" : ""} n'a jamais reçu ses identifiants par email`}{" "}
                : <Names list={confirmSend.fresh} />.
              </p>
            ) : (
              <p>
                {confirmSend.again.length > 1
                  ? `Les ${confirmSend.again.length} jurés${filtered ? " affichés" : ""} ont déjà reçu leurs identifiants ; ils vont en recevoir de nouveaux`
                  : `Le juré${filtered ? " affiché" : ""} a déjà reçu ses identifiants ; il va en recevoir de nouveaux`}{" "}
                : <Names list={confirmSend.again} />.
              </p>
            )}
            {confirmSend.fresh.length > 0 && confirmSend.again.length > 0 && (
              <Checkbox
                checked={sendAgain}
                onChange={setSendAgain}
                label={`Renvoyer aussi aux ${confirmSend.again.length} qui les ont déjà reçus`}
                hint={confirmSend.again.map((a) => `${a.firstName} ${a.lastName}`).join(", ")}
              />
            )}
            {filtered && (
              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                Seuls les jurés que les filtres du tableau laissent affichés sont concernés.
              </p>
            )}
            <Alert tone="warning">
              Un nouveau mot de passe est généré pour chacun : celui qu'il avait ne fonctionnera plus.
            </Alert>
          </div>
        </Modal>
      )}
    </PageMotion>
  );
}

// A header cell's label and its spreadsheet-style menu
function FilterHeader({
  column,
  menu,
  ...options
}: {
  column: FilterColumn<AccountRow>;
  menu: ReturnType<ReturnType<typeof useColumnFilters<AccountRow>>["menuProps"]>;
  sortKind?: "number" | "text" | "date";
  emptyLabel?: string;
  align?: "left" | "right";
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{column.label}</span>
      <ColumnFilterMenu {...menu} {...options} />
    </div>
  );
}

function Names({ list }: { list: Account[] }) {
  return <strong className="font-semibold">{list.map((a) => `${a.firstName} ${a.lastName}`).join(", ")}</strong>;
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
