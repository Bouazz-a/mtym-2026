import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import {
  PageHeader, BrutalCard, Badge, DiamondMarker,
  Btn, Textarea, PageMotion,
} from "@/features/shared/primitives";
import { useSession } from "@/features/shared/SessionContext";
import { getTeamById } from "@/lib/repositories/teamRepository";
import { getDocumentsByTeam } from "@/lib/repositories/documentRepository";
import {
  getJuryAssignments,
} from "@/lib/repositories/juryRepository";
import {
  getReportEvaluation,
  upsertReportEvaluation,
} from "@/lib/repositories/evaluationRepository";
import { createDownloadUrl } from "@/lib/storage/fileStorage";
import type { Document, DocumentType, ReportEvaluation, ReportType, Team } from "@/types";

// JuryTeamDetailPage — single-team grading view. Shows what the team
// submitted (RI + 4 RFs), filtered by which report types this juror is
// assigned to. Each gradable item exposes a Download button and a
// "remarques" textarea persisted to ReportEvaluation.globalRemark.

const PROBLEMS = [1, 2, 3, 4] as const;
type ProblemNum = (typeof PROBLEMS)[number];

export function JuryTeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { session } = useSession();
  const navigate = useNavigate();

  const [team, setTeam] = useState<Team | null>(null);
  const [scopes, setScopes] = useState<ReportType[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!session || session.role !== "jury" || !teamId) return;
    const t = getTeamById(teamId);
    if (!t) {
      navigate("/equipes", { replace: true });
      return;
    }
    setTeam(t);
    const mine = getJuryAssignments().filter(
      a => a.juryMemberId === session.juryMember.id && a.teamId === teamId,
    );
    setScopes(mine.map(a => a.reportType));
  }, [session, teamId, navigate]);

  if (!session || session.role !== "jury" || !team) return null;

  // Access check — if this juror isn't actually assigned, fail fast.
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
            <Btn variant="ghost">← Retour à mes équipes</Btn>
          </Link>
        </BrutalCard>
      </div>
    );
  }

  const docs = getDocumentsByTeam(team.id);
  const ri = docs.find(d => d.docType === "rapport_intermediaire");
  const rfByProblem = new Map<ProblemNum, Document>();
  for (const n of PROBLEMS) {
    const d = docs.find(d => d.docType === `rapport_final_p${n}`);
    if (d) rfByProblem.set(n, d);
  }

  return (
    <PageMotion className="space-y-8">
      {/* Breadcrumb */}
      <div>
        <Link to="/equipes"
              className="font-mont text-tiny uppercase tracking-widest inline-flex items-center gap-1.5"
              style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
          <span aria-hidden>←</span> Mes équipes
        </Link>
      </div>

      <PageHeader
        eyebrow={`Équipe · ${team.quadrigramme}`}
        title={team.name}
        sub="Documents écrits déposés par l'équipe. Téléchargez le PDF puis saisissez vos remarques. Les notes par critère arriveront dans la prochaine itération."
        right={
          <div className="flex gap-2">
            {scopes.includes("intermediaire") && <Badge tone="sage">RI assigné</Badge>}
            {scopes.includes("final") && <Badge tone="saffron">RF assigné</Badge>}
          </div>
        }
      />

      {/* RI section */}
      {scopes.includes("intermediaire") && (
        <Section title="Rapport intermédiaire" subtitle="Un seul document couvrant l'ensemble des problèmes.">
          <GradingCard
            key={`ri-${version}`}
            scope="ri"
            doc={ri}
            team={team}
            juryMemberId={session.juryMember.id}
            onSaved={() => setVersion(v => v + 1)}
          />
        </Section>
      )}

      {/* RF sections — one per problem */}
      {scopes.includes("final") && (
        <Section
          title="Rapports finaux"
          subtitle="Un document distinct par problème. À évaluer indépendamment."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {PROBLEMS.map(n => (
              <GradingCard
                key={`rf-${n}-${version}`}
                scope="rf"
                problemNumber={n}
                doc={rfByProblem.get(n)}
                team={team}
                juryMemberId={session.juryMember.id}
                onSaved={() => setVersion(v => v + 1)}
              />
            ))}
          </div>
        </Section>
      )}
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
      <div className="flex items-end justify-between pb-3"
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

// ─── Grading card (one per RI or per problem) ─────────────────────────

interface GradingCardProps {
  scope: "ri" | "rf";
  problemNumber?: ProblemNum;
  doc: Document | undefined;
  team: Team;
  juryMemberId: string;
  onSaved: () => void;
}

function GradingCard({ scope, problemNumber, doc, team, juryMemberId, onSaved }: GradingCardProps) {
  const reportType: ReportType = scope === "ri" ? "intermediaire" : "final";
  // RI is "logically one evaluation" — we store it as problemNumber 0
  // (we treat it as a single global slot since the data model requires
  // a number on ReportEvaluation).
  const evalProblemNumber = scope === "ri" ? 0 : (problemNumber ?? 0);

  const existing = useMemo(
    () => getReportEvaluation(juryMemberId, team.id, reportType, evalProblemNumber),
    [juryMemberId, team.id, reportType, evalProblemNumber],
  );

  const [remark, setRemark] = useState(existing?.globalRemark ?? "");
  const [savedAt, setSavedAt] = useState<string | null>(existing ? "déjà enregistré" : null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRemark(existing?.globalRemark ?? "");
    setSavedAt(existing ? "déjà enregistré" : null);
  }, [existing?.id, existing?.globalRemark]);

  const handleSave = () => {
    setBusy(true);
    try {
      const evaluation: ReportEvaluation = {
        id: existing?.id ?? uuidv4(),
        juryMemberId,
        teamId: team.id,
        reportType,
        problemNumber: evalProblemNumber,
        globalRemark: remark.trim() || undefined,
      };
      upsertReportEvaluation(evaluation);
      setSavedAt(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = () => {
    if (!doc) return;
    const url = createDownloadUrl(doc.storagePath, doc.mimeType);
    if (!url) return alert("Fichier introuvable.");
    const a = window.document.createElement("a");
    a.href = url; a.download = doc.originalName; a.click();
    URL.revokeObjectURL(url);
  };

  const title = scope === "ri" ? "Rapport intermédiaire" : `Rapport final · P${problemNumber}`;
  const expectedName = scope === "ri"
    ? `${team.quadrigramme}_RI_MTYM2025.pdf`
    : `${team.quadrigramme}_RF_P${problemNumber}.pdf`;

  return (
    <BrutalCard className="flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between gap-3"
           style={{ borderBottom: "2px solid var(--forest)" }}>
        <div className="flex items-center gap-3 min-w-0">
          {scope === "rf" && (
            <span className="flex items-center justify-center font-mont"
                  style={{
                    width: 28, height: 28,
                    border: "2px solid var(--forest)", color: "var(--forest)",
                    fontWeight: 900, transform: "rotate(45deg)",
                  }}>
              <span style={{ transform: "rotate(-45deg)" }}>{problemNumber}</span>
            </span>
          )}
          <h3 className="font-mont uppercase tracking-tight"
              style={{ fontSize: "1.05rem", color: "var(--forest)", fontWeight: 900 }}>
            {title}
          </h3>
        </div>
        {doc
          ? <Badge tone="sage">Déposé</Badge>
          : <Badge tone="saffron">En attente</Badge>}
      </div>

      {/* Document */}
      <div className="p-5 space-y-4 flex-1">
        <div className="flex items-center justify-between gap-3 px-3 py-3 transition-colors hover-row"
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
            <Btn variant="ghost" size="sm" onClick={handleDownload}>
              ↓ Télécharger
            </Btn>
          )}
        </div>

        {/* Remark editor */}
        <div>
          <label className="font-mont text-tiny uppercase tracking-widest block mb-1.5"
                 style={{ color: "var(--ink-soft)", fontWeight: 800 }}>
            Remarques globales
          </label>
          <Textarea
            value={remark}
            onChange={e => setRemark(e.target.value)}
            placeholder={doc
              ? "Vos remarques apparaitront pour l'équipe après la deadline d'évaluation…"
              : "Vous pourrez saisir vos remarques une fois le document déposé."}
            rows={4}
            disabled={!doc}
          />
          <p className="font-open text-micro mt-1.5 italic" style={{ color: "var(--ink-faint)" }}>
            Visible par {team.quadrigramme} après la deadline jury · les notes par critère arriveront prochainement.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 flex items-center justify-between gap-3"
           style={{ borderTop: "1px solid var(--border)", background: "var(--paper-2)" }}>
        <span className="font-mont text-tiny uppercase tracking-widest"
              style={{ color: savedAt ? "var(--sage-dark)" : "var(--ink-faint)", fontWeight: 800 }}>
          {savedAt ? `Enregistré · ${savedAt}` : "Non enregistré"}
        </span>
        <Btn
          onClick={handleSave}
          disabled={!doc || busy}
          variant={existing ? "ghost" : "primary"}
          size="sm"
        >
          {busy ? "Enregistrement…" : existing ? "Mettre à jour" : "Enregistrer"}
        </Btn>
      </div>
    </BrutalCard>
  );
}

// Suppress unused — DocumentType is referenced indirectly via Document.docType
void function unused(_d: DocumentType) { return _d; };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
