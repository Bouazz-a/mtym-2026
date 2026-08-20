import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import {
  PageHeader, BrutalCard, Badge, Btn, Textarea, PageMotion,
} from "@/features/shared/primitives";
import { useSession } from "@/features/shared/SessionContext";
import { getPassageById, getPools } from "@/lib/repositories/poolRepository";
import { getTeamById } from "@/lib/repositories/teamRepository";
import { getDocumentsByTeam } from "@/lib/repositories/documentRepository";
import {
  getJuryPassageAssignments, getJuryMemberById,
} from "@/lib/repositories/juryRepository";
import {
  getCriteriaForOral,
  getOralEvaluation,
  upsertOralEvaluation,
  getOralGradesByEvaluation,
  upsertOralGrade,
} from "@/lib/repositories/evaluationRepository";
import { createDownloadUrl } from "@/lib/storage/fileStorage";
import {
  runningNote, CriterionGradingTable, NotePill,
  type GradeDrafts,
} from "./gradingWidgets";
import { DocPreviewModal, useDocPreview } from "@/features/shared/DocPreview";
import { getPoolDisplayLabel, getRoundLabel } from "@/utils/naming";
import type {
  Document, DocumentType, OralEvaluation, OralGrade, Passage, PassageRole, Team,
} from "@/types";

// JuryPassageDetailPage — oral grading sheet for one passage. Mirrors the
// historic spreadsheet: a fixed header (jury members, room, slot, problem
// defended) pulled from the Passage, then one criteria-based panel per
// graded role (defender / opponent / reporter).

const GRADED_ROLES: { role: Exclude<PassageRole, "extra">; label: string; tone: "sage" | "saffron" | "dark" }[] = [
  { role: "defender", label: "Défenseur", tone: "sage" },
  { role: "opponent", label: "Opposant", tone: "saffron" },
  { role: "reporter", label: "Rapporteur", tone: "dark" },
];

export function JuryPassageDetailPage() {
  const { passageId } = useParams<{ passageId: string }>();
  const { session } = useSession();
  const navigate = useNavigate();

  const [version, setVersion] = useState(0);
  const preview = useDocPreview();

  const passageData = useMemo(() => {
    if (!session || session.role !== "jury" || !passageId) return null;
    const p = getPassageById(passageId);
    if (!p) return null;
    const passageAssignments = getJuryPassageAssignments().filter(a => a.passageId === p.id);
    return {
      passage: p,
      assigned: passageAssignments.some(a => a.juryMemberId === session.juryMember.id),
      jurorNames: passageAssignments
        .map(a => getJuryMemberById(a.juryMemberId))
        .filter(Boolean)
        .map(j => `${j!.firstName} ${j!.lastName}`),
    };
  }, [session, passageId]);

  // Unknown passage id: bounce back to the list.
  useEffect(() => {
    if (session && session.role === "jury" && passageId && !passageData) {
      navigate("/passages", { replace: true });
    }
  }, [session, passageId, passageData, navigate]);

  if (!session || session.role !== "jury" || !passageData) return null;
  const { passage, assigned, jurorNames } = passageData;

  if (!assigned) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Espace jury"
          title="Accès restreint"
          sub="Vous n'êtes pas assigné à ce passage."
        />
        <BrutalCard className="p-8 text-center">
          <Link to="/passages">
            <Btn variant="ghost">Retour à mes passages</Btn>
          </Link>
        </BrutalCard>
      </div>
    );
  }

  const pool = getPools().find(p => p.id === passage.poolId);
  const teamFor: Record<string, Team | undefined> = {
    defender: getTeamById(passage.defenderTeamId),
    opponent: getTeamById(passage.opponentTeamId),
    reporter: getTeamById(passage.reporterTeamId),
  };

  return (
    <PageMotion className="space-y-8">
      <div>
        <Link to="/passages"
              className="font-mont text-tiny uppercase tracking-widest inline-flex items-center gap-1.5"
              style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
          Mes passages
        </Link>
      </div>

      <PageHeader
        eyebrow={pool ? `${getPoolDisplayLabel(pool)} · ${getRoundLabel(pool.round)}` : "Passage"}
        title={`Passage ${passage.label}`}
        sub="Évaluez chaque équipe selon son rôle. Vos notes ne sont visibles que par l'administration."
        right={<Badge tone="dark">Problème {passage.problemNumber}</Badge>}
      />

      {/* Passage header — fixed info from the Passage entity */}
      <BrutalCard className="overflow-hidden">
        <div className="px-5 py-3"
             style={{ borderBottom: "2px solid var(--forest)", background: "rgba(98,159,115,0.08)" }}>
          <span className="font-mont text-tiny uppercase tracking-widest"
                style={{ color: "var(--forest)", fontWeight: 900 }}>
            Informations du passage
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-px"
             style={{ background: "var(--border)" }}>
          <InfoCell label="Problème défendu" value={`P${passage.problemNumber}`} />
          <InfoCell label="Salle" value={passage.room ?? "—"} />
          <InfoCell label="Jour" value={passage.day ? passage.day.split("-").reverse().join("/") : "—"} />
          <InfoCell label="Horaire" value={passage.timeSlot ?? "—"} />
          <InfoCell
            label={`Membre${jurorNames.length > 1 ? "s" : ""} du jury`}
            value={jurorNames.length ? jurorNames.join(" · ") : "—"}
          />
        </div>
      </BrutalCard>

      {/* One grading panel per role */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {GRADED_ROLES.map(({ role, label, tone }) => (
          <RolePanel
            key={`${role}-${version}`}
            role={role}
            roleLabel={label}
            tone={tone}
            team={teamFor[role]}
            passage={passage}
            juryMemberId={session.juryMember.id}
            onSaved={() => setVersion(v => v + 1)}
            onPreview={preview.open}
          />
        ))}
      </div>

      <DocPreviewModal state={preview.state} onClose={preview.close} />
    </PageMotion>
  );
}

// ─── Role-scoped docs ─────────────────────────────────────────────────

interface RoleDoc { label: string; expected: DocumentType }

function docsForRole(
  role: Exclude<PassageRole, "extra">,
  passage: Passage,
  team: Team | undefined,
): RoleDoc[] {
  if (!team) return [];
  const candidates: Record<typeof role, DocumentType[][]> = {
    defender: [
      [`rapport_final_p${passage.problemNumber}` as DocumentType],
      ["presentation_1", "presentation_2"],
    ],
    opponent: [
      ["fiche_synthese_opposant_1", "fiche_synthese_opposant_2"],
    ],
    reporter: [
      ["fiche_synthese_rapporteur_1", "fiche_synthese_rapporteur_2"],
    ],
  };
  const labels: Record<typeof role, string[]> = {
    defender: [`Rapport final · P${passage.problemNumber}`, "Présentation"],
    opponent: ["Fiche de synthèse"],
    reporter: ["Fiche de synthèse"],
  };
  const out: RoleDoc[] = [];
  candidates[role].forEach((group, i) => {
    const found = pickFirstExisting(team, group);
    if (found) out.push({ label: labels[role][i], expected: found });
  });
  return out;
}

function pickFirstExisting(team: Team, candidates: DocumentType[]): DocumentType | null {
  const docs = getDocumentsByTeam(team.id);
  for (const t of candidates) {
    if (docs.some(d => d.docType === t)) return t;
  }
  return null;
}

function downloadDoc(doc: Document) {
  const url = createDownloadUrl(doc.storagePath, doc.mimeType);
  if (!url) return alert("Fichier introuvable.");
  const a = window.document.createElement("a");
  a.href = url; a.download = doc.originalName; a.click();
  URL.revokeObjectURL(url);
}

function RoleDocStrip({
  team, items, onPreview,
}: {
  team: Team | undefined;
  items: RoleDoc[];
  onPreview: (doc: Document) => void;
}) {
  if (!team) return null;
  if (items.length === 0) {
    return (
      <div className="px-5 py-2.5"
           style={{ borderBottom: "1px solid var(--border)", background: "var(--paper-2)" }}>
        <span className="font-mont text-micro uppercase tracking-widest"
              style={{ color: "var(--clay)", fontWeight: 800 }}>
          Aucun dépôt
        </span>
      </div>
    );
  }
  const docs = getDocumentsByTeam(team.id);
  return (
    <div className="px-5 py-2.5 flex flex-col gap-1.5"
         style={{ borderBottom: "1px solid var(--border)", background: "var(--paper-2)" }}>
      {items.map((it, i) => {
        const doc = docs.find(d => d.docType === it.expected);
        if (!doc) return null;
        return (
          <div key={i} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mont text-micro uppercase tracking-widest"
                   style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
                {it.label}
              </div>
              <div className="font-mont text-xs truncate"
                   style={{ color: "var(--forest)", fontWeight: 700 }}
                   title={doc.renamedAs}>
                {doc.renamedAs}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Btn variant="ghost" size="sm" onClick={() => onPreview(doc)}>
                Voir
              </Btn>
              <Btn variant="ghost" size="sm" onClick={() => downloadDoc(doc)}>
                ↓
              </Btn>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3" style={{ background: "var(--surface)" }}>
      <div className="font-mont text-micro uppercase tracking-widest mb-1"
           style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
        {label}
      </div>
      <div className="font-mont text-sm" style={{ color: "var(--forest)", fontWeight: 900 }}>
        {value}
      </div>
    </div>
  );
}

// ─── Per-role grading panel ───────────────────────────────────────────

function RolePanel({
  role, roleLabel, tone, team, passage, juryMemberId, onSaved, onPreview,
}: {
  role: Exclude<PassageRole, "extra">;
  roleLabel: string;
  tone: "sage" | "saffron" | "dark";
  team: Team | undefined;
  passage: Passage;
  juryMemberId: string;
  onSaved: () => void;
  onPreview: (doc: Document) => void;
}) {
  const criteria = useMemo(() => getCriteriaForOral(role), [role]);

  const existing = useMemo(
    () => team ? getOralEvaluation(juryMemberId, passage.id, team.id) : undefined,
    [juryMemberId, passage.id, team],
  );

  const initialDrafts = useMemo<GradeDrafts>(() => {
    const out: GradeDrafts = {};
    const grades = existing ? getOralGradesByEvaluation(existing.id) : [];
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

  const handleSave = () => {
    if (!team) return;
    setBusy(true);
    try {
      const evalId = existing?.id ?? uuidv4();
      const evaluation: OralEvaluation = {
        id: evalId,
        juryMemberId,
        passageId: passage.id,
        teamId: team.id,
        role,
        globalRemark: remark.trim() || undefined,
      };
      upsertOralEvaluation(evaluation);

      const savedGrades = getOralGradesByEvaluation(evalId);
      for (const c of criteria) {
        const d = drafts[c.id] ?? { score: 0, remark: "" };
        const prev = savedGrades.find(g => g.criterionId === c.id);
        const grade: OralGrade = {
          id: prev?.id ?? uuidv4(),
          oralEvaluationId: evalId,
          criterionId: c.id,
          score: d.score,
          remark: d.remark.trim() || undefined,
        };
        upsertOralGrade(grade);
      }
      setSaved(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const docItems = docsForRole(role, passage, team);

  return (
    <BrutalCard className="flex flex-col overflow-hidden">
      <div className="px-5 py-4"
           style={{ borderBottom: "2px solid var(--forest)" }}>
        <div className="flex items-center justify-between gap-2">
          <Badge tone={tone}>{roleLabel}</Badge>
          <NotePill note={note} />
        </div>
        <div className="mt-2 min-w-0">
          <div className="font-mont"
               style={{ color: "var(--saffron)", fontWeight: 900, fontSize: "1.4rem", letterSpacing: "0.06em" }}>
            {team?.quadrigramme ?? "—"}
          </div>
          <div className="font-open text-xs truncate" style={{ color: "var(--ink-soft)" }}>
            {team?.name ?? "Équipe non définie"}
          </div>
        </div>
      </div>

      <RoleDocStrip team={team} items={docItems} onPreview={onPreview} />

      <div className="p-5 space-y-4 flex-1">
        <CriterionGradingTable
          criteria={criteria}
          drafts={drafts}
          onChange={patch}
          disabled={!team}
        />
        <div>
          <label className="font-mont text-tiny uppercase tracking-widest block mb-1.5"
                 style={{ color: "var(--ink-soft)", fontWeight: 800 }}>
            Remarques globales
          </label>
          <Textarea
            value={remark}
            onChange={e => { setRemark(e.target.value); setSaved(null); }}
            placeholder="Synthèse de votre évaluation…"
            rows={3}
            disabled={!team}
          />
        </div>
      </div>

      <div className="px-5 py-3 flex items-center justify-between gap-3"
           style={{ borderTop: "1px solid var(--border)", background: "var(--paper-2)" }}>
        <span className="font-mont text-tiny uppercase tracking-widest"
              style={{ color: saved ? "var(--sage-dark)" : "var(--ink-faint)", fontWeight: 800 }}>
          {saved ? `Enregistré · ${saved}` : "Non enregistré"}
        </span>
        <Btn onClick={handleSave} disabled={busy || !team}
             variant={existing ? "ghost" : "primary"} size="sm">
          {busy ? "Enregistrement…" : existing ? "Mettre à jour" : "Enregistrer"}
        </Btn>
      </div>
    </BrutalCard>
  );
}
