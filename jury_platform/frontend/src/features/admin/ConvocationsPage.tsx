import { useEffect, useRef, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  Alert, Badge, Btn, BrutalCard, FadeIn, Field, Input, Modal, PageHeader, PageLoading, PageMotion, SectionHeading, Segmented, Select, Stagger, Textarea,
} from "@/features/shared/primitives";
import { useSession } from "@/features/shared/SessionContext";
import { CalendarIcon } from "@/features/shared/icons";
import { EmptyState, LoadError, Picker, StatCard } from "@/features/shared/widgets";
import { queryState } from "@/features/shared/queryState";
import { getCenterDays } from "@/lib/repositories/centerDayRepository";
import {
  getDraftPreview, getMailingPreview, getMailings, getMailTemplate, resetMailTemplate, saveMailTemplate, sendMailing,
} from "@/lib/repositories/mailingRepository";
import { errorMessage } from "@/lib/services/errors";
import type { Center, CenterDay, MailingAttachment, MailingRole, MailTemplate, MailTemplateInfo, TeamMailingRow } from "@/types";
import { CENTERS, formatDay } from "@/utils/labels";

// ConvocationsPage — one email per team before its day: the date, its
// center, its timetable, the problem it defends (upload the presentation),
// and the ones it opposes and reports on with the defending team's report
// attached (backend: services/convocation.ts). One day at a time, all its
// teams or one pool; the emails only go once the day's draw is validated. A
// test goes to the admin. The subject, title and opening are the admin's
// to write (« Modifier le mail »); the rest is generated.

export function ConvocationsPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const daysQ = useQuery({ queryKey: ["center-days"], queryFn: () => getCenterDays() });
  // Every day's table loads in the background: switching days shows it at once
  useEffect(() => {
    for (const d of daysQ.data ?? []) {
      void queryClient.prefetchQuery({ queryKey: ["mailings", d.id], queryFn: () => getMailings(d.id) });
    }
  }, [daysQ.data, queryClient]);

  if (daysQ.isLoading) return <PageLoading />;
  if (daysQ.isError) return <LoadError onRetry={() => daysQ.refetch()} />;

  const days = daysQ.data ?? [];
  const centers = CENTERS.filter((c) => days.some((d) => d.center === c.value));
  const center = centers.find((c) => c.value === params.get("centre"))?.value ?? centers[0]?.value;
  const centerDays = days.filter((d) => d.center === center);
  const dayIndex = Math.max(0, centerDays.findIndex((d) => d.id === params.get("jour")));
  const day = centerDays[dayIndex];
  const select = (c: Center, dayId?: string, pool?: string | null) =>
    setParams({ centre: c, ...(dayId && { jour: dayId }), ...(pool && { poule: pool }) }, { replace: true });

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
        <DayMailings
          key={day.id}
          day={day}
          dayIndex={dayIndex}
          pool={params.get("poule")}
          onPool={(pool) => select(center, day.id, pool)}
          pickers={
            <>
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
            </>
          }
        />
      )}
    </PageMotion>
  );
}

// ─── One day ─────────────────────────────────────────────────────────

// One day, or one of its pools (`pool`): the table, the counts and the
// sends all follow the filter
function DayMailings({
  day,
  dayIndex,
  pool: wantedPool,
  onPool,
  pickers,
}: {
  day: CenterDay;
  dayIndex: number;
  pool: string | null; // from the URL; ignored when the day has no such pool
  onPool: (pool: string | null) => void;
  pickers: ReactNode; // center and day, on the same line as the pool
}) {
  const queryClient = useQueryClient();
  const boardQ = useQuery({ queryKey: ["mailings", day.id], queryFn: () => getMailings(day.id) });
  const [preview, setPreview] = useState<TeamMailingRow | null>(null);
  const [editing, setEditing] = useState(false); // the template editor
  const [confirm, setConfirm] = useState<TeamMailingRow[] | null>(null); // teams about to be sent
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = queryState(boardQ);
  if (load.loading) return <PageLoading variant="section" />;
  if (load.failed) return <LoadError onRetry={load.retry} />;

  const { mailConfigured, drawValidated } = boardQ.data!;
  const pools = [...new Set(boardQ.data!.teams.flatMap((t) => (t.pool ? [t.pool] : [])))].sort();
  const pool = wantedPool && pools.includes(wantedPool) ? wantedPool : null;
  const teams = pool ? boardQ.data!.teams.filter((t) => t.pool === pool) : boardQ.data!.teams;
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
    <>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        {pickers}
        {pools.length > 0 && (
          <Picker label="Poule">
            <Segmented
              options={[{ value: "", label: "Toutes" }, ...pools.map((p) => ({ value: p, label: p }))]}
              value={pool ?? ""}
              onChange={(p) => onPool(p || null)}
            />
          </Picker>
        )}
      </div>
      {/* A pool picked, or the whole day again: the section fades in */}
      <FadeIn key={pool ?? "all"} className="space-y-6">
        <SectionHeading
          title={`Jour ${dayIndex + 1} · ${formatDay(day.date)}${pool ? ` · ${pool}` : ""}`}
          right={
            <div className="flex items-center gap-2 flex-wrap">
              <Btn variant="ghost" size="sm" onClick={() => setEditing(true)}>Modifier le mail</Btn>
              {outdated.length > 0 && (
                <Btn variant="ghost" size="sm" disabled={!canSend} onClick={() => setConfirm(outdated)}>
                  Renvoyer les convocations à renvoyer ({outdated.length})
                </Btn>
              )}
              <Btn size="sm" disabled={!canSend || fresh.length === 0} onClick={() => setConfirm(fresh)}>
                {pool ? `Envoyer à la poule ${pool}` : "Envoyer aux équipes du jour"} ({fresh.length})
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
          <StatCard label={pool ? `Équipes de ${pool}` : "Équipes du jour"} value={teams.length} />
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
                    <th className="col-tight">Poule</th>
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
                      <td className="col-tight font-mont text-xs" style={{ color: "var(--ink-soft)", fontWeight: 700 }}>{t.pool ?? "—"}</td>
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
        {editing && <TemplateModal teams={teams.filter((t) => t.inPool)} onClose={() => setEditing(false)} />}
      </FadeIn>
    </>
  );
}

// ─── The admin's words: subject, title, opening ──────────────────────

function TemplateModal({ teams, onClose }: { teams: TeamMailingRow[]; onClose: () => void }) {
  const infoQ = useQuery({ queryKey: ["mail-template"], queryFn: getMailTemplate });
  if (infoQ.data) return <TemplateEditor info={infoQ.data} teams={teams} onClose={onClose} />;
  return (
    <Modal open title="Modifier le mail" onClose={onClose} width="min(30rem, calc(100vw - 2rem))">
      {infoQ.isError ? <Alert>{errorMessage(infoQ.error, "Texte du mail indisponible.")}</Alert> : <PageLoading variant="section" />}
    </Modal>
  );
}

// The value, once it has stopped changing for `ms`
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

const TEMPLATE_FIELDS = ["subject", "title", "intro"] as const;
const sameTemplate = (a: MailTemplate, b: MailTemplate) => TEMPLATE_FIELDS.every((k) => a[k] === b[k]);

// The three fields on the left, the email of a team of the day on the
// right, redrawn as the admin types. A {variable} chip goes in at the
// cursor of the last field used.
function TemplateEditor({ info, teams, onClose }: { info: MailTemplateInfo; teams: TeamMailingRow[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(info.template);
  const [sampleId, setSampleId] = useState(teams[0]?.teamId ?? "");
  const [field, setField] = useState<keyof MailTemplate>("intro");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false); // closing with unsaved changes: asked first
  const subjectRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const introRef = useRef<HTMLTextAreaElement>(null);
  const refs = { subject: subjectRef, title: titleRef, intro: introRef };

  const settled = useSettled(draft, 400);
  const previewQ = useQuery({
    queryKey: ["mailing-draft-preview", sampleId, settled],
    queryFn: () => getDraftPreview(sampleId, settled),
    enabled: Boolean(sampleId),
    placeholderData: keepPreviousData,
    retry: false,
  });

  const dirty = !sameTemplate(draft, info.template);
  const set = (key: keyof MailTemplate) => (e: { target: { value: string } }) => setDraft({ ...draft, [key]: e.target.value });

  const insert = (name: string) => {
    const el = refs[field].current;
    const token = `{${name}}`;
    const value = draft[field];
    const [start, end] = [el?.selectionStart ?? value.length, el?.selectionEnd ?? value.length];
    setDraft({ ...draft, [field]: value.slice(0, start) + token + value.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const close = () => (dirty && !leaving ? setLeaving(true) : onClose());

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await (sameTemplate(draft, info.defaults) ? resetMailTemplate() : saveMailTemplate(draft));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mail-template"] }),
        queryClient.invalidateQueries({ queryKey: ["mailing-preview"] }),
      ]);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const p = previewQ.data;
  const updated = info.updatedAt
    ? `Modifié par ${info.updatedBy} le ${new Date(info.updatedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
    : "Texte par défaut";

  return (
    <Modal
      open
      title="Modifier le mail"
      onClose={close}
      width="min(80rem, 96vw)"
      footer={
        leaving ? (
          <>
            <span className="font-open text-sm mr-auto" style={{ color: "var(--ink)" }}>Abandonner les modifications ?</span>
            <Btn variant="ghost" onClick={() => setLeaving(false)}>Continuer à modifier</Btn>
            <Btn variant="danger" onClick={onClose}>Abandonner</Btn>
          </>
        ) : (
          <>
            <Btn
              variant="ghost"
              className="mr-auto"
              disabled={sameTemplate(draft, info.defaults)}
              title="Remet l'objet, le titre et l'ouverture d'origine (appliqué en enregistrant)"
              onClick={() => setDraft(info.defaults)}
            >
              Texte par défaut
            </Btn>
            <Btn variant="ghost" onClick={close}>Annuler</Btn>
            <Btn disabled={busy || !dirty} onClick={save}>{busy ? "Enregistrement…" : "Enregistrer"}</Btn>
          </>
        )
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="space-y-4 min-w-0">
          {error && <Alert>{error}</Alert>}
          <Field label="Objet">
            <Input ref={subjectRef} value={draft.subject} maxLength={200} onChange={set("subject")} onFocus={() => setField("subject")} />
          </Field>
          <Field label="Titre">
            <Input ref={titleRef} value={draft.title} maxLength={200} onChange={set("title")} onFocus={() => setField("title")} />
          </Field>
          <Field label="Ouverture" hint="Jusqu'aux informations du jour. Une ligne vide sépare deux paragraphes.">
            <Textarea ref={introRef} rows={7} value={draft.intro} maxLength={5000} onChange={set("intro")} onFocus={() => setField("intro")} />
          </Field>
          <div>
            <div className="font-mont text-tiny uppercase tracking-widest mb-2" style={{ color: "var(--ink-soft)", fontWeight: 700 }}>
              Variables
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(info.variables).map(([name, meaning]) => (
                <button
                  key={name}
                  type="button"
                  title={`${meaning} · insérer dans le champ « ${{ subject: "Objet", title: "Titre", intro: "Ouverture" }[field]} »`}
                  onMouseDown={(e) => e.preventDefault()} // the field keeps its cursor
                  onClick={() => insert(name)}
                  className="px-2 py-1 font-mono text-xs focus-ring"
                  style={{ border: "1px solid var(--field-border)", background: "var(--paper-2)", color: "var(--forest)" }}
                >
                  {`{${name}}`}
                </button>
              ))}
            </div>
            <p className="font-open text-xs mt-2" style={{ color: "var(--ink-faint)" }}>
              Remplacées pour chaque équipe. Un clic l'insère dans le dernier champ utilisé.
            </p>
          </div>
          <p className="font-open text-xs" style={{ color: "var(--ink-soft)" }}>
            La suite du mail ne se modifie pas : date, centre et poule, encadré IMPORTANT, planning, rôles, rapports joints et
            signature sont générés pour chaque équipe.
          </p>
          <p className="font-open text-xs" style={{ color: "var(--ink-faint)" }}>{updated}. Les convocations déjà envoyées restent telles quelles.</p>
        </div>

        <div className="min-w-0 space-y-3">
          {teams.length === 0 ? (
            <Alert tone="warning">Aucune équipe en poule ce jour : pas d'aperçu possible.</Alert>
          ) : (
            <>
              <label className="flex items-center gap-2">
                <span className="font-mont text-tiny uppercase tracking-widest shrink-0" style={{ color: "var(--ink-soft)", fontWeight: 800 }}>Aperçu pour</span>
                <Select value={sampleId} onChange={(e) => setSampleId(e.target.value)} style={{ width: "16rem" }}>
                  {teams.map((t) => <option key={t.teamId} value={t.teamId}>{t.quadrigram} · {t.name}</option>)}
                </Select>
              </label>
              {previewQ.isError && <Alert>{errorMessage(previewQ.error, "Aperçu indisponible.")}</Alert>}
              {p && (
                <>
                  <div className="font-open text-sm">
                    <span style={{ color: "var(--ink-soft)" }}>Objet : </span>
                    <span className="font-semibold" style={{ color: "var(--forest)" }}>{p.subject}</span>
                  </div>
                  {/* Sandboxed: no script runs */}
                  <iframe
                    title="Aperçu du mail"
                    srcDoc={p.html}
                    sandbox=""
                    className="w-full"
                    style={{ height: "62vh", border: "1px solid var(--border)", background: "#faf7ee", opacity: previewQ.isFetching ? 0.6 : 1 }}
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
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
