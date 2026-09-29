import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  Alert, Badge, Btn, BrutalCard, Input, Modal, PageHeader, PageLoading, PageMotion, SectionHeading, Segmented, Stagger,
} from "@/features/shared/primitives";
import { useSession } from "@/features/shared/SessionContext";
import { CalendarIcon } from "@/features/shared/icons";
import { EmptyState, LoadError, Picker, StatCard } from "@/features/shared/widgets";
import { queryState } from "@/features/shared/queryState";
import { getCenterDays } from "@/lib/repositories/centerDayRepository";
import { getMailingPreview, getMailings, sendMailing } from "@/lib/repositories/mailingRepository";
import { errorMessage } from "@/lib/services/errors";
import type { Center, CenterDay, MailingAttachment, MailingRole, TeamMailingRow } from "@/types";
import { CENTERS, formatDay } from "@/utils/labels";

// ConvocationsPage — one email per team before its day: the date, its
// center, its timetable, the problem it defends (upload the presentation),
// and the ones it opposes and reports on with the defending team's report
// attached (backend: services/convocation.ts). One day at a time; the
// emails only go once the day's draw is validated. A test goes to the admin.

export function ConvocationsPage() {
  const [params, setParams] = useSearchParams();
  const daysQ = useQuery({ queryKey: ["center-days"], queryFn: () => getCenterDays() });

  if (daysQ.isLoading) return <PageLoading />;
  if (daysQ.isError) return <LoadError onRetry={() => daysQ.refetch()} />;

  const days = daysQ.data ?? [];
  const centers = CENTERS.filter((c) => days.some((d) => d.center === c.value));
  const center = centers.find((c) => c.value === params.get("centre"))?.value ?? centers[0]?.value;
  const centerDays = days.filter((d) => d.center === center);
  const dayIndex = Math.max(0, centerDays.findIndex((d) => d.id === params.get("jour")));
  const day = centerDays[dayIndex];
  const select = (c: Center, dayId?: string) => setParams(dayId ? { centre: c, jour: dayId } : { centre: c }, { replace: true });

  return (
    <PageMotion className="space-y-10">
      <PageHeader
        eyebrow="Gestion du tournoi"
        title="Convocations"
        sub="Un email par équipe avant son jour : la date, son centre, son planning, le problème qu'elle défend et ceux qu'elle oppose et rapporte, avec les rapports à lire en pièce jointe. Envoyez-vous un test avant d'envoyer aux équipes."
      />
      {!center || !day ? (
        <EmptyState icon={CalendarIcon} title="Aucun jour" sub="Déclarez d'abord les jours des centres depuis la page Génération des poules." />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <Picker label="Centre">
              <Segmented options={centers.map((c) => ({ value: c.value, label: c.label }))} value={center} onChange={(c) => select(c)} />
            </Picker>
            <Picker label="Jour">
              <Segmented
                options={centerDays.map((d, i) => ({ value: d.id, label: `J${i + 1} · ${formatDay(d.date)}` }))}
                value={day.id}
                onChange={(id) => select(center, id)}
              />
            </Picker>
          </div>
          <DayMailings key={day.id} day={day} dayIndex={dayIndex} />
        </>
      )}
    </PageMotion>
  );
}

// ─── One day ─────────────────────────────────────────────────────────

function DayMailings({ day, dayIndex }: { day: CenterDay; dayIndex: number }) {
  const queryClient = useQueryClient();
  const boardQ = useQuery({ queryKey: ["mailings", day.id], queryFn: () => getMailings(day.id) });
  const [preview, setPreview] = useState<TeamMailingRow | null>(null);
  const [confirm, setConfirm] = useState<TeamMailingRow[] | null>(null); // teams about to be sent
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = queryState(boardQ);
  if (load.loading) return <PageLoading variant="section" />;
  if (load.failed) return <LoadError onRetry={load.retry} />;

  const { teams, mailConfigured, drawValidated } = boardQ.data!;
  const sendable = (t: TeamMailingRow) => t.inPool && t.recipients > 0;
  const fresh = teams.filter((t) => sendable(t) && t.status === "never");
  const outdated = teams.filter((t) => sendable(t) && t.status === "outdated");
  const noEmail = teams.filter((t) => t.inPool && t.recipients === 0);
  const sent = teams.filter((t) => t.status === "sent").length;
  const canSend = mailConfigured && drawValidated && !progress;

  // One team per request; stops on the first failure
  const sendAll = async (rows: TeamMailingRow[]) => {
    setConfirm(null);
    setError(null);
    for (const [i, row] of rows.entries()) {
      setProgress({ done: i, total: rows.length, current: row.quadrigram });
      try {
        await sendMailing(row.teamId);
      } catch (err) {
        setError(`${row.quadrigram} : ${errorMessage(err)} — envoi arrêté (${i}/${rows.length} envoyées).`);
        break;
      }
    }
    setProgress(null);
    await queryClient.invalidateQueries({ queryKey: ["mailings"] });
  };

  return (
    <section className="space-y-6">
      <SectionHeading
        title={`Jour ${dayIndex + 1} · ${formatDay(day.date)}`}
        right={
          <div className="flex items-center gap-2 flex-wrap">
            {outdated.length > 0 && (
              <Btn variant="ghost" size="sm" disabled={!canSend} onClick={() => setConfirm(outdated)}>
                Renvoyer les convocations à renvoyer ({outdated.length})
              </Btn>
            )}
            <Btn size="sm" disabled={!canSend || fresh.length === 0} onClick={() => setConfirm(fresh)}>
              Envoyer aux équipes du jour ({fresh.length})
            </Btn>
          </div>
        }
      />

      {!mailConfigured && (
        <Alert tone="warning" title="Envoi non configuré">
          Les aperçus fonctionnent, mais aucun email ne peut partir : les réglages SMTP_… manquent dans le fichier backend/.env du serveur.
        </Alert>
      )}
      {!drawValidated && (
        <Alert tone="warning" title="Tirage non validé">
          Les convocations partent quand les poules ne bougent plus : validez d'abord le tirage de ce jour sur{" "}
          <Link to="/tournoi" className="underline font-semibold">Génération des poules</Link>. Les tests restent possibles.
        </Alert>
      )}
      {noEmail.length > 0 && (
        <Alert tone="warning" title="Équipes sans adresse email">
          {noEmail.map((t) => t.quadrigram).join(", ")} : aucun membre n'a d'email importé depuis le site principal, elles ne recevront rien.
        </Alert>
      )}
      {error && <Alert>{error}</Alert>}

      <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Équipes du jour" value={teams.length} />
        <StatCard label="Convocations envoyées" value={sent} denom={teams.length || undefined} progressColor="var(--sage)" highlight={teams.length > 0 && sent === teams.length} />
        <StatCard label="À renvoyer" value={outdated.length} progressColor="var(--saffron)" />
        <StatCard label="Sans email" value={noEmail.length} progressColor="var(--clay)" />
      </Stagger>

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

      {teams.length === 0 ? (
        <EmptyState icon={CalendarIcon} title="Aucune équipe ce jour" sub="Répartissez d'abord les équipes du centre entre ses jours." />
      ) : (
        <BrutalCard className="overflow-hidden">
          <div className="table-scroll">
            <table className="brutal-table">
              <thead>
                <tr>
                  <th>Équipe</th>
                  <th className="col-tight" title="Membres au statut QUALIFIED ayant un email">Destinataires</th>
                  <th className="col-tight">Défense</th>
                  <th className="col-tight">Opposition</th>
                  <th className="col-tight">Rapport</th>
                  <th className="col-tight">Statut</th>
                  <th className="col-tight" style={{ borderRight: "none" }} />
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => (
                  <tr key={t.teamId}>
                    <td>
                      <div className="font-mont text-xs" style={{ color: "var(--forest)", fontWeight: 900, letterSpacing: "0.05em" }}>{t.quadrigram}</div>
                      <div className="font-open text-xs" style={{ color: "var(--ink-soft)" }}>{t.name}</div>
                    </td>
                    <td className="col-tight font-mont text-xs" style={{ color: t.recipients === 0 ? "var(--clay)" : "var(--ink)", fontWeight: 700 }}>
                      {t.recipients}/{t.members}
                    </td>
                    <td className="col-tight">{t.defense ? <Problem n={t.defense.problem} /> : "—"}</td>
                    <td className="col-tight"><Against role={t.opposition} /></td>
                    <td className="col-tight"><Against role={t.report} /></td>
                    <td className="col-tight"><StatusBadge row={t} /></td>
                    <td className="col-tight" style={{ borderRight: "none" }}>
                      <div className="flex gap-1.5 justify-end flex-nowrap">
                        <Btn variant="ghost" size="sm" disabled={!t.inPool} onClick={() => setPreview(t)}>Aperçu</Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </BrutalCard>
      )}

      {confirm && (
        <Modal
          open
          title="Envoyer les convocations"
          onClose={() => setConfirm(null)}
          width={480}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setConfirm(null)}>Annuler</Btn>
              <Btn onClick={() => sendAll(confirm)}>Envoyer</Btn>
            </>
          }
        >
          <p className="font-open text-sm" style={{ color: "var(--ink)" }}>
            {confirm.length} équipe{confirm.length > 1 ? "s" : ""} ({confirm.reduce((s, t) => s + t.recipients, 0)} destinataires) vont
            recevoir leur convocation : {confirm.map((t) => t.quadrigram).join(", ")}.
          </p>
        </Modal>
      )}
      {preview && (
        <PreviewModal row={preview} canSend={canSend} onClose={() => setPreview(null)} />
      )}
    </section>
  );
}

// ─── The email of one team ───────────────────────────────────────────

function PreviewModal({ row, canSend, onClose }: { row: TeamMailingRow; canSend: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const previewQ = useQuery({ queryKey: ["mailing-preview", row.teamId], queryFn: () => getMailingPreview(row.teamId), staleTime: 0 });
  const [testTo, setTestTo] = useState(user?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const send = async (test: boolean) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await sendMailing(row.teamId, test, test ? testTo.trim() : undefined);
      if (test) {
        setNotice({ tone: "success", text: `Test envoyé à ${res.sentTo.join(", ")}.` });
      } else {
        await queryClient.invalidateQueries({ queryKey: ["mailings"] });
        onClose();
      }
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const p = previewQ.data;
  return (
    <Modal
      open
      title={`Convocation · ${row.quadrigram}`}
      onClose={onClose}
      width="min(60rem, 94vw)"
      footer={
        <>
          {/* A test goes to this address alone, marked [TEST], never recorded */}
          <label className="flex items-center gap-2 mr-auto min-w-0">
            <span className="font-mont text-tiny uppercase tracking-widest shrink-0" style={{ color: "var(--ink-soft)", fontWeight: 800 }}>Adresse du test</span>
            <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} className="min-w-0" style={{ width: "16rem" }} />
          </label>
          <Btn variant="ghost" disabled={busy || !p || !testTo.trim()} onClick={() => send(true)}>Envoyer un test</Btn>
          <Btn disabled={busy || !p || !canSend || row.recipients === 0} onClick={() => send(false)}>
            {row.status === "never" ? "Envoyer à l'équipe" : "Renvoyer à l'équipe"}
          </Btn>
        </>
      }
    >
      {previewQ.isLoading ? (
        <PageLoading variant="section" />
      ) : previewQ.isError || !p ? (
        <Alert>{errorMessage(previewQ.error, "Aperçu indisponible.")}</Alert>
      ) : (
        <div className="space-y-4">
          {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
          <dl className="grid gap-x-4 gap-y-1.5 font-open text-sm" style={{ gridTemplateColumns: "auto 1fr" }}>
            <dt style={{ color: "var(--ink-soft)" }}>À</dt>
            <dd style={{ color: p.to.length ? "var(--ink)" : "var(--clay)" }}>{p.to.length ? p.to.join(", ") : "Aucun membre n'a d'email"}</dd>
            <dt style={{ color: "var(--ink-soft)" }}>Objet</dt>
            <dd className="font-semibold" style={{ color: "var(--forest)" }}>{p.subject}</dd>
            <dt style={{ color: "var(--ink-soft)" }}>Pièces jointes</dt>
            <dd className="flex flex-wrap gap-1.5">
              {p.attachments.length === 0 ? "—" : p.attachments.map((a) => <AttachmentChip key={a.name} a={a} />)}
            </dd>
          </dl>
          {/* The email as the team will see it; sandboxed: no script runs */}
          <iframe
            title={`Email de ${row.quadrigram}`}
            srcDoc={p.html}
            sandbox=""
            className="w-full"
            style={{ height: "60vh", border: "1px solid var(--border)", background: "#faf7ee" }}
          />
        </div>
      )}
    </Modal>
  );
}

function AttachmentChip({ a }: { a: MailingAttachment }) {
  if (a.state === "missing") return <span title="Rapport pas encore déposé : l'email le dit"><Badge tone="danger">{a.name} · non déposé</Badge></span>;
  if (a.state === "tooLarge") return <span title="Au-delà de 10 Mo : non joint, l'email le dit"><Badge tone="saffron">{a.name} · trop lourd</Badge></span>;
  const size = a.size === null ? "taille inconnue" : a.size < 1024 * 1024 ? `${Math.max(1, Math.round(a.size / 1024))} Ko` : `${(a.size / 1024 / 1024).toFixed(1)} Mo`;
  return <span title={a.error ? `Taille illisible : ${a.error}` : undefined}><Badge tone="sage">{a.name} · {size}</Badge></span>;
}

// ─── Cells ───────────────────────────────────────────────────────────

function Problem({ n }: { n: number }) {
  return <span className="font-mont" style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>P{n}</span>;
}

function Against({ role }: { role: MailingRole | null }) {
  if (!role) return <>—</>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Problem n={role.problem} />
      <span className="font-mont text-xs" style={{ color: "var(--ink-soft)", fontWeight: 700 }}>{role.defender}</span>
      {!role.reportFiled && (
        <span title={`${role.defender} n'a pas encore déposé ce rapport : il ne sera pas joint`}>
          <Badge tone="danger">RF ?</Badge>
        </span>
      )}
    </span>
  );
}

function StatusBadge({ row }: { row: TeamMailingRow }) {
  if (!row.inPool) return <Badge tone="neutral">Sans poule</Badge>;
  if (row.status === "never") return <Badge tone="neutral">Non envoyé</Badge>;
  const when = row.sentAt
    ? new Date(row.sentAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";
  if (row.status === "outdated") {
    return <span title={`Envoyé le ${when} ; le tirage a été revalidé depuis`}><Badge tone="saffron">À renvoyer</Badge></span>;
  }
  return <span title={row.sentBy ? `par ${row.sentBy}` : undefined}><Badge tone="sage">Envoyé · {when}</Badge></span>;
}
