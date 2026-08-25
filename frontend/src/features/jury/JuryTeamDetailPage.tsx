import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader, BrutalCard, Badge, DiamondMarker,
  Btn, Textarea, PageMotion,
} from "@/features/shared/primitives";
import { useSession } from "@/features/shared/SessionContext";
import { getTeamById } from "@/lib/repositories/teamRepository";
import { getDocumentsByTeam, downloadDocument } from "@/lib/repositories/documentRepository";
import { getJuryAssignments } from "@/lib/repositories/juryRepository";
import {
  getCriteria,
  filterReportCriteria,
  getReportEvaluations,
  saveReportEvaluation,
  type ReportEvaluationWithGrades,
} from "@/lib/repositories/evaluationRepository";
import { DocPreviewModal, useDocPreview } from "@/features/shared/DocPreview";
import {
  runningNote, CriterionGradingTable, NotePill,
  type GradeDrafts,
} from "./gradingWidgets";
import type { Criterion, Document, ReportType, Team } from "@/types";

// JuryTeamDetailPage — single-team written-report grading view.
//  · Rapport intermédiaire  → one overall grade on a 1..4 scale + remark.
//  · Rapports finaux        → per-problem, criteria-based grading
//    (taux de réussite 0–100 % × coefficient) + per-criterion remarks.
// The criteria are pulled from the backend, so the grids adapt to whatever
// the scientific admin configured.
//
// Saving used to be two calls (upsert the evaluation, then upsert each
// criterion's grade). The backend now does both in one transaction and
// hands back the evaluation with its grades nested (see saveReportEvaluation
// in evaluationRepository.ts), so a save here is a single request.

const PROBLEMS = [1, 2, 3, 4] as const;
type ProblemNum = (typeof PROBLEMS)[number];

export function JuryTeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { session } = useSession();
  const navigate = useNavigate();

  const preview = useDocPreview();
  const juryMemberId = session?.role === "jury" ? session.juryMember.id : undefined;

  const teamQ = useQuery({ queryKey: ["team", teamId], queryFn: () => getTeamById(teamId!), enabled: !!teamId });
  const docsQ = useQuery({ queryKey: ["documents", "team", teamId], queryFn: () => getDocumentsByTeam(teamId!), enabled: !!teamId });
  const assignmentsQ = useQuery({ queryKey: ["jury-assignments"], queryFn: getJuryAssignments });
  const criteriaQ = useQuery({ queryKey: ["criteria"], queryFn: getCriteria });
  const reportEvalsQ = useQuery({
    queryKey: ["report-evaluations", teamId],
    // Note: for a jury caller the backend ignores the teamId filter and
    // always returns just "my own evaluations" (across every team I grade)
    // — see backend/src/routes/report-evaluations.ts — so we still filter
    // by team.id below when reading these back.
    queryFn: () => getReportEvaluations(teamId!),
    enabled: !!teamId,
  });

  const loading = teamQ.isLoading || docsQ.isLoading || assignmentsQ.isLoading || criteriaQ.isLoading || reportEvalsQ.isLoading;

  const scopes = useMemo<ReportType[]>(() => {
    if (!juryMemberId || !teamId || !assignmentsQ.data) return [];
    return assignmentsQ.data
      .filter(a => a.juryMemberId === juryMemberId && a.teamId === teamId)
      .map(a => a.reportType);
  }, [juryMemberId, teamId, assignmentsQ.data]);

  // Unknown team id: bounce back to the list once loading is done.
  useEffect(() => {
    if (!loading && session && session.role === "jury" && teamId && !teamQ.data) {
      navigate("/equipes", { replace: true });
    }
  }, [loading, session, teamId, teamQ.data, navigate]);

  if (!session || session.role !== "jury") return null;

  if (loading) {
    return <div className="py-24 text-center text-foreground/55">Chargement…</div>;
  }

  const team = teamQ.data;
  if (!team) return null;

  if (scopes.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Espace jury"
          title="Accès restreint"
          sub="Vous n'êtes pas assigné à cette équipe."
        />
        <BrutalCard className="p-8 text-center">
          <Link to="/equipes">
            <Btn variant="ghost">Retour à mes équipes</Btn>
          </Link>
        </BrutalCard>
      </div>
    );
  }

  const docs = docsQ.data ?? [];
  const ri = docs.find(d => d.docType === "rapport_intermediaire");
  const rfByProblem = new Map<ProblemNum, Document>();
  for (const n of PROBLEMS) {
    const d = docs.find(d => d.docType === `rapport_final_p${n}`);
    if (d) rfByProblem.set(n, d);
  }

  const criteria = criteriaQ.data ?? [];
  const reportEvals = (reportEvalsQ.data ?? []).filter(e => e.teamId === team.id);

  return (
    <PageMotion className="space-y-8">
      <div>
        <Link to="/equipes"
              className="font-mont text-tiny uppercase tracking-widest inline-flex items-center gap-1.5"
              style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
          Mes équipes
        </Link>
      </div>

      <PageHeader
        eyebrow={`Équipe · ${team.quadrigramme}`}
        title={team.name}
        sub="Téléchargez les documents puis saisissez vos notes par critère et vos remarques. Les notes restent invisibles pour l'équipe."
        right={
          <div className="flex gap-2">
            {scopes.includes("intermediaire") && <Badge tone="sage">RI assigné</Badge>}
            {scopes.includes("final") && <Badge tone="saffron">RF assigné</Badge>}
          </div>
        }
      />

      {scopes.includes("intermediaire") && (
        <Section title="Rapport intermédiaire" subtitle="Note globale unique sur une échelle de 1 à 4.">
          <RiGradingCard
            doc={ri}
            team={team}
            existing={reportEvals.find(e => e.reportType === "intermediaire" && e.problemNumber === 0)}
            onPreview={preview.open}
          />
        </Section>
      )}

      {scopes.includes("final") && (
        <Section title="Rapports finaux">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {PROBLEMS.map(n => (
              <RfGradingCard
                key={`rf-${n}`}
                problemNumber={n}
                doc={rfByProblem.get(n)}
                team={team}
                allCriteria={criteria}
                existing={reportEvals.find(e => e.reportType === "final" && e.problemNumber === n)}
                onPreview={preview.open}
              />
            ))}
          </div>
        </Section>
      )}

      <DocPreviewModal state={preview.state} onClose={preview.close} />
    </PageMotion>
  );
}

// ─── Section ──────────────────────────────────────────────────────────

function Section({
  title, subtitle, children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between pb-3 gap-4"
           style={{ borderBottom: "2px solid var(--forest)" }}>
        <div className="flex items-baseline gap-2">
          <DiamondMarker />
          <h2 className="font-mont uppercase tracking-tight"
              style={{ fontSize: "1.25rem", color: "var(--forest)", fontWeight: 900, letterSpacing: "-0.01em" }}>
            {title}
          </h2>
        </div>
        {subtitle && (
          <span className="font-open text-xs italic max-w-md text-right"
                style={{ color: "var(--ink-soft)" }}>
            {subtitle}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

// ─── Document strip + download ────────────────────────────────────────

async function downloadDoc(doc: Document) {
  try {
    const { url, filename } = await downloadDocument(doc.id, doc.originalName);
    const a = window.document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  } catch {
    alert("Téléchargement impossible.");
  }
}

function DocStrip({
  doc, expectedName, onPreview,
}: {
  doc: Document | undefined;
  expectedName: string;
  onPreview?: (doc: Document) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-3"
         style={{ border: "1px solid var(--border)", background: doc ? "rgba(98,159,115,0.06)" : "var(--paper-2)" }}>
      <div className="min-w-0">
        <div className="font-mont text-xs truncate"
             style={{ color: "var(--forest)", fontWeight: 800 }}
             title={doc?.renamedAs}>
          {doc?.renamedAs ?? expectedName}
        </div>
        <div className="font-open text-micro mt-0.5" style={{ color: "var(--ink-soft)" }}>
          {doc
            ? `${formatBytes(doc.size)} · ${new Date(doc.uploadedAt).toLocaleString("fr-FR")}`
            : "Aucun fichier déposé pour le moment"}
        </div>
      </div>
      {doc && (
        <div className="flex items-center gap-1 shrink-0">
          {onPreview && (
            <Btn variant="ghost" size="sm" onClick={() => onPreview(doc)}>
              Voir
            </Btn>
          )}
          <Btn variant="ghost" size="sm" onClick={() => downloadDoc(doc)}>
            ↓ Télécharger
          </Btn>
        </div>
      )}
    </div>
  );
}

function CardHeader({
  title, badge,
}: {
  title: React.ReactNode;
  badge: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4 flex items-center justify-between gap-3"
         style={{ borderBottom: "2px solid var(--forest)" }}>
      <h3 className="font-mont uppercase tracking-tight flex items-center gap-3"
          style={{ fontSize: "1.05rem", color: "var(--forest)", fontWeight: 900 }}>
        {title}
      </h3>
      {badge}
    </div>
  );
}

function SaveFooter({
  saved, busy, dirty, isUpdate, onSave,
}: {
  saved: string | null;
  busy: boolean;
  dirty: boolean;
  isUpdate: boolean;
  onSave: () => void;
}) {
  return (
    <div className="px-5 py-3 flex items-center justify-between gap-3"
         style={{ borderTop: "1px solid var(--border)", background: "var(--paper-2)" }}>
      <span className="font-mont text-tiny uppercase tracking-widest"
            style={{ color: saved ? "var(--sage-dark)" : "var(--ink-faint)", fontWeight: 800 }}>
        {saved ? `Enregistré · ${saved}` : "Non enregistré"}
      </span>
      <Btn onClick={onSave} disabled={busy || !dirty}
           variant={isUpdate ? "ghost" : "primary"} size="sm">
        {busy ? "Enregistrement…" : isUpdate ? "Mettre à jour" : "Enregistrer"}
      </Btn>
    </div>
  );
}

// ─── RI grading card (overall grade 1..4) ─────────────────────────────

const RI_SCALE = [1, 2, 3, 4] as const;

function RiGradingCard({
  doc, team, existing, onPreview,
}: {
  doc: Document | undefined;
  team: Team;
  existing: ReportEvaluationWithGrades | undefined;
  onPreview: (doc: Document) => void;
}) {
  const queryClient = useQueryClient();

  const [score, setScore] = useState<number | undefined>(existing?.overallScore);
  const [remark, setRemark] = useState(existing?.globalRemark ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(existing ? "déjà enregistré" : null);

  const dirty =
    score !== existing?.overallScore ||
    remark.trim() !== (existing?.globalRemark ?? "");

  const handleSave = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      await saveReportEvaluation({
        teamId: team.id,
        reportType: "intermediaire",
        problemNumber: 0,
        overallScore: score,
        globalRemark: remark.trim() || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["report-evaluations", team.id] });
      setSaved(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    } catch {
      alert("Impossible d'enregistrer l'évaluation.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BrutalCard className="flex flex-col overflow-hidden">
      <CardHeader
        title="Rapport intermédiaire"
        badge={doc ? <Badge tone="sage">Déposé</Badge> : <Badge tone="saffron">En attente</Badge>}
      />
      <div className="p-5 space-y-5 flex-1">
        <DocStrip doc={doc} expectedName={`${team.quadrigramme}_RI_MTYM2026.pdf`} onPreview={onPreview} />

        <div>
          <label className="font-mont text-tiny uppercase tracking-widest block mb-2"
                 style={{ color: "var(--ink-soft)", fontWeight: 800 }}>
            Note globale (1 à 4)
          </label>
          <div className="inline-flex" style={{ border: "2px solid var(--forest)" }}>
            {RI_SCALE.map(n => {
              const active = score === n;
              return (
                <button
                  key={n}
                  disabled={!doc}
                  onClick={() => { setScore(n); setSaved(null); }}
                  className="px-5 py-2 font-mont transition-colors disabled:opacity-40"
                  style={{
                    background: active ? "var(--forest)" : "transparent",
                    color: active ? "var(--saffron)" : "var(--ink-soft)",
                    fontWeight: 900,
                    borderRight: n !== 4 ? "1px solid var(--forest)" : undefined,
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
          {score === undefined && (
            <p className="font-open text-micro mt-1.5 italic" style={{ color: "var(--ink-faint)" }}>
              Aucune note saisie.
            </p>
          )}
        </div>

        <div>
          <label className="font-mont text-tiny uppercase tracking-widest block mb-1.5"
                 style={{ color: "var(--ink-soft)", fontWeight: 800 }}>
            Remarques globales
          </label>
          <Textarea
            value={remark}
            onChange={e => { setRemark(e.target.value); setSaved(null); }}
            placeholder={doc ? "Vos remarques sur le rapport intermédiaire…" : "Disponible une fois le document déposé."}
            rows={4}
            disabled={!doc}
          />
          <p className="font-open text-micro mt-1.5 italic" style={{ color: "var(--ink-faint)" }}>
            Visible uniquement par l'administration — jamais par l'équipe.
          </p>
        </div>
      </div>
      <SaveFooter
        saved={saved} busy={busy} dirty={!!doc && dirty}
        isUpdate={!!existing} onSave={handleSave}
      />
    </BrutalCard>
  );
}

// ─── RF grading card (criteria-based, per problem) ────────────────────

function RfGradingCard({
  problemNumber, doc, team, allCriteria, existing, onPreview,
}: {
  problemNumber: ProblemNum;
  doc: Document | undefined;
  team: Team;
  allCriteria: Criterion[];
  existing: ReportEvaluationWithGrades | undefined;
  onPreview: (doc: Document) => void;
}) {
  const queryClient = useQueryClient();
  const criteria = useMemo(() => filterReportCriteria(allCriteria, problemNumber), [allCriteria, problemNumber]);

  const initialDrafts = useMemo<GradeDrafts>(() => {
    const out: GradeDrafts = {};
    const grades = existing?.grades ?? [];
    for (const c of criteria) {
      const g = grades.find(x => x.criterionId === c.id);
      out[c.id] = { score: g?.score ?? 0, remark: g?.remark ?? "" };
    }
    return out;
  }, [criteria, existing]);

  const [drafts, setDrafts] = useState<GradeDrafts>(initialDrafts);
  const [remark, setRemark] = useState(existing?.globalRemark ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(existing ? "déjà enregistré" : null);

  const note = runningNote(criteria, drafts);

  const patch = (criterionId: string, p: { score?: number; remark?: string }) => {
    setDrafts(prev => ({
      ...prev,
      [criterionId]: { ...(prev[criterionId] ?? { score: 0, remark: "" }), ...p },
    }));
    setSaved(null);
  };

  const handleSave = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      await saveReportEvaluation({
        teamId: team.id,
        reportType: "final",
        problemNumber,
        globalRemark: remark.trim() || undefined,
        grades: criteria.map(c => ({
          criterionId: c.id,
          score: (drafts[c.id] ?? { score: 0 }).score,
          remark: (drafts[c.id]?.remark ?? "").trim() || undefined,
        })),
      });
      await queryClient.invalidateQueries({ queryKey: ["report-evaluations", team.id] });
      setSaved(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    } catch {
      alert("Impossible d'enregistrer l'évaluation.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BrutalCard className="flex flex-col overflow-hidden">
      <CardHeader
        title={
          <>
            <span className="flex items-center justify-center font-mont"
                  style={{
                    width: 28, height: 28,
                    border: "2px solid var(--forest)", color: "var(--forest)",
                    fontWeight: 900, transform: "rotate(45deg)",
                  }}>
              <span style={{ transform: "rotate(-45deg)" }}>{problemNumber}</span>
            </span>
            <span>Rapport final · P{problemNumber}</span>
          </>
        }
        badge={doc ? <Badge tone="sage">Déposé</Badge> : <Badge tone="saffron">En attente</Badge>}
      />

      <div className="p-5 space-y-4 flex-1">
        <DocStrip doc={doc} expectedName={`${team.quadrigramme}_RF_P${problemNumber}.pdf`} onPreview={onPreview} />

        <div className="flex items-center justify-between gap-3">
          <span className="font-mont text-tiny uppercase tracking-widest"
                style={{ color: "var(--ink-soft)", fontWeight: 800 }}>
            Notation par critère
          </span>
          <NotePill note={note} />
        </div>

        <div style={{ opacity: doc ? 1 : 0.5, pointerEvents: doc ? "auto" : "none" }}>
          <CriterionGradingTable
            criteria={criteria}
            drafts={drafts}
            onChange={patch}
            disabled={!doc}
          />
        </div>

        <div>
          <label className="font-mont text-tiny uppercase tracking-widest block mb-1.5"
                 style={{ color: "var(--ink-soft)", fontWeight: 800 }}>
            Remarques globales
          </label>
          <Textarea
            value={remark}
            onChange={e => { setRemark(e.target.value); setSaved(null); }}
            placeholder={doc ? "Synthèse de votre évaluation…" : "Disponible une fois le document déposé."}
            rows={3}
            disabled={!doc}
          />
        </div>
      </div>

      <SaveFooter
        saved={saved} busy={busy} dirty={!!doc}
        isUpdate={!!existing} onSave={handleSave}
      />
    </BrutalCard>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
