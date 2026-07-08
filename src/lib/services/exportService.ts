import * as XLSX from "xlsx";
import { getState } from "@/lib/storage/storage";
import {
  getReportGradesByEvaluation,
  getOralGradesByEvaluation,
} from "@/lib/repositories/evaluationRepository";
import { reportCriteria, oralCriteria, weightedNote } from "./gradingService";
import type { AppState } from "@/types";

// exportService — admin-only multi-sheet XLSX dump of the application
// state. Every sheet carries the human-readable keys (quadrigrammes, juror
// names, pool labels, problem numbers) that make cross-sheet joins obvious
// without spelunking through opaque uuids: pools ↔ teams via the pool
// label; jury report assignments ↔ documents via the team quadrigramme;
// jury passage assignments ↔ passages via the passage label; etc.

const docTypeLabel: Record<string, string> = {
  rapport_intermediaire: "Rapport intermédiaire",
  rapport_final_p1: "Rapport final · P1",
  rapport_final_p2: "Rapport final · P2",
  rapport_final_p3: "Rapport final · P3",
  rapport_final_p4: "Rapport final · P4",
  fiche_synthese_opposant_1: "Fiche opposant (1)",
  fiche_synthese_opposant_2: "Fiche opposant (2)",
  fiche_synthese_rapporteur_1: "Fiche rapporteur (1)",
  fiche_synthese_rapporteur_2: "Fiche rapporteur (2)",
  presentation_1: "Présentation (1)",
  presentation_2: "Présentation (2)",
};

export function exportAppDataXlsx(): void {
  const s: AppState = getState();
  const wb = XLSX.utils.book_new();

  // ── Lookup maps ─────────────────────────────────────────────────────
  const teamById = new Map(s.teams.map((t) => [t.id, t]));
  const partById = new Map(s.participants.map((p) => [p.id, p]));
  const poolById = new Map(s.pools.map((p) => [p.id, p]));
  const passById = new Map(s.passages.map((p) => [p.id, p]));
  const juryById = new Map(s.juryMembers.map((j) => [j.id, j]));
  const orgById = new Map(s.organizers.map((o) => [o.id, o]));
  const critById = new Map(s.criteria.map((c) => [c.id, c]));
  const wsById = new Map(s.workshops.map((w) => [w.id, w]));

  const tq = (id: string | undefined) =>
    id ? (teamById.get(id)?.quadrigramme ?? "—") : "";
  const tn = (id: string | undefined) =>
    id ? (teamById.get(id)?.name ?? "—") : "";
  const jn = (id: string) => {
    const j = juryById.get(id);
    return j ? `${j.firstName} ${j.lastName}` : "—";
  };
  const pn = (id: string) => {
    const p = partById.get(id);
    return p ? `${p.firstName} ${p.lastName}` : "—";
  };
  const on = (id: string) => {
    const o = orgById.get(id);
    return o ? `${o.firstName} ${o.lastName}` : "—";
  };
  const pl = (id: string | undefined) =>
    id ? (poolById.get(id)?.label ?? "—") : "";

  // ── Sheet: Équipes ──────────────────────────────────────────────────
  append(
    wb,
    "Équipes",
    s.teams.map((t) => ({
      id: t.id,
      quadrigramme: t.quadrigramme,
      nom: t.name,
      createur: pn(t.creatorId),
      pool_tour1: pl(t.poolIdRound1),
      pool_tour2: pl(t.poolIdRound2),
      membres: s.participants
        .filter((p) => p.teamId === t.id)
        .map((p) => `${p.firstName} ${p.lastName}`)
        .join(", "),
    })),
  );

  // ── Sheet: Participants ─────────────────────────────────────────────
  append(
    wb,
    "Participants",
    s.participants.map((p) => ({
      id: p.id,
      prenom: p.firstName,
      nom: p.lastName,
      email: p.email,
      telephone: p.phone ?? "",
      ville: p.city ?? "",
      region: p.region ?? "",
      naissance: p.birthDate ?? "",
      niveau: p.schoolLevel ?? "",
      hoodie: p.hoodieSize ?? "",
      transport: p.transportInfo ?? "",
      coloc: p.roommatePrefs ? pn(p.roommatePrefs) : "",
      equipe_quadrigramme: tq(p.teamId),
      equipe_nom: tn(p.teamId),
    })),
  );

  // ── Sheet: Pools ────────────────────────────────────────────────────
  append(
    wb,
    "Poules",
    s.pools.map((p) => ({
      id: p.id,
      label: p.label,
      tour: p.round,
      equipes: s.teams
        .filter(
          (t) => t.poolIdRound1 === p.id || t.poolIdRound2 === p.id,
        )
        .map((t) => t.quadrigramme)
        .join(", "),
    })),
  );

  // ── Sheet: Passages ─────────────────────────────────────────────────
  append(
    wb,
    "Passages",
    s.passages.map((p) => ({
      id: p.id,
      label: p.label,
      pool_label: pl(p.poolId),
      tour: poolById.get(p.poolId)?.round ?? "",
      probleme: p.problemNumber,
      defenseur: tq(p.defenderTeamId),
      opposant: tq(p.opponentTeamId),
      rapporteur: tq(p.reporterTeamId),
      extra: tq(p.extraTeamId),
      jour: p.day ?? "",
      horaire: p.timeSlot ?? "",
      salle: p.room ?? "",
    })),
  );

  // ── Sheet: Jury ─────────────────────────────────────────────────────
  append(
    wb,
    "Jury",
    s.juryMembers.map((j) => ({
      id: j.id,
      prenom: j.firstName,
      nom: j.lastName,
      email: j.email,
      telephone: j.phone ?? "",
      ville: j.city ?? "",
      region: j.region ?? "",
      transport: j.transportInfo ?? "",
    })),
  );

  // ── Sheet: Organisateurs ────────────────────────────────────────────
  append(
    wb,
    "Organisateurs",
    s.organizers.map((o) => ({
      id: o.id,
      prenom: o.firstName,
      nom: o.lastName,
      email: o.email,
      telephone: o.phone ?? "",
      role: o.role,
    })),
  );

  // ── Sheet: Affectations rapports (jury ↔ team ↔ déposés) ────────────
  append(
    wb,
    "Affectations rapports",
    s.juryAssignments.map((a) => {
      const docs = s.documents.filter((d) => d.teamId === a.teamId);
      return {
        juree: jn(a.juryMemberId),
        equipe_quadrigramme: tq(a.teamId),
        equipe_nom: tn(a.teamId),
        type_rapport: a.reportType,
        RI_depose: docs.some((d) => d.docType === "rapport_intermediaire") ? "oui" : "non",
        RF1_depose: docs.some((d) => d.docType === "rapport_final_p1") ? "oui" : "non",
        RF2_depose: docs.some((d) => d.docType === "rapport_final_p2") ? "oui" : "non",
        RF3_depose: docs.some((d) => d.docType === "rapport_final_p3") ? "oui" : "non",
        RF4_depose: docs.some((d) => d.docType === "rapport_final_p4") ? "oui" : "non",
      };
    }),
  );

  // ── Sheet: Affectations passages (jury ↔ passage) ───────────────────
  append(
    wb,
    "Affectations passages",
    s.juryPassageAssignments.map((a) => {
      const p = passById.get(a.passageId);
      return {
        juree: jn(a.juryMemberId),
        passage_label: p?.label ?? "—",
        pool_label: p ? pl(p.poolId) : "",
        tour: p ? (poolById.get(p.poolId)?.round ?? "") : "",
        probleme: p?.problemNumber ?? "",
        defenseur: tq(p?.defenderTeamId),
        opposant: tq(p?.opponentTeamId),
        rapporteur: tq(p?.reporterTeamId),
        jour: p?.day ?? "",
        horaire: p?.timeSlot ?? "",
        salle: p?.room ?? "",
      };
    }),
  );

  // ── Sheet: Documents ────────────────────────────────────────────────
  append(
    wb,
    "Documents",
    s.documents.map((d) => ({
      id: d.id,
      equipe_quadrigramme: tq(d.teamId),
      equipe_nom: tn(d.teamId),
      type: docTypeLabel[d.docType] ?? d.docType,
      type_code: d.docType,
      depose_par: pn(d.uploadedById),
      nom_original: d.originalName,
      nom_stocke: d.renamedAs,
      taille_ko: Math.round(d.size / 1024),
      mime: d.mimeType,
      depose_le: d.uploadedAt,
      verrouille: d.isLocked ? "oui" : "non",
    })),
  );

  // ── Sheet: Critères ─────────────────────────────────────────────────
  append(
    wb,
    "Critères",
    s.criteria
      .slice()
      .sort((a, b) => {
        const k = a.type.localeCompare(b.type);
        if (k) return k;
        const r = (a.role ?? "").localeCompare(b.role ?? "");
        if (r) return r;
        const p = (a.problemNumber ?? 0) - (b.problemNumber ?? 0);
        if (p) return p;
        return a.order - b.order;
      })
      .map((c) => ({
        id: c.id,
        type: c.type,
        role: c.role ?? "",
        probleme: c.problemNumber ?? "",
        theme: c.theme ?? "",
        intitule: c.label,
        coefficient: c.coefficient,
        ordre: c.order,
      })),
  );

  // ── Sheet: Notes RI (synthèse) ──────────────────────────────────────
  const riEvals = s.reportEvaluations.filter((e) => e.reportType === "intermediaire");
  append(
    wb,
    "Notes RI",
    riEvals.map((e) => ({
      juree: jn(e.juryMemberId),
      equipe_quadrigramme: tq(e.teamId),
      equipe_nom: tn(e.teamId),
      note_sur_4: e.overallScore ?? "",
      remarque_globale: e.globalRemark ?? "",
    })),
  );

  // ── Sheet: Notes RF (synthèse pondérée par évaluation) ──────────────
  const rfEvals = s.reportEvaluations.filter((e) => e.reportType === "final");
  append(
    wb,
    "Notes RF",
    rfEvals.map((e) => {
      const criteria = reportCriteria(e.problemNumber);
      const grades = getReportGradesByEvaluation(e.id);
      const note = weightedNote(grades, criteria);
      return {
        juree: jn(e.juryMemberId),
        equipe_quadrigramme: tq(e.teamId),
        equipe_nom: tn(e.teamId),
        probleme: e.problemNumber,
        note_ponderee: round2(note.total),
        max_theorique: round2(note.maxTotal),
        criteres_notes: `${note.gradedCount}/${note.criterionCount}`,
        remarque_globale: e.globalRemark ?? "",
      };
    }),
  );

  // ── Sheet: Détails RF (par critère) ─────────────────────────────────
  append(
    wb,
    "Détails RF",
    rfEvals.flatMap((e) => {
      const grades = getReportGradesByEvaluation(e.id);
      return grades.map((g) => {
        const c = critById.get(g.criterionId);
        return {
          juree: jn(e.juryMemberId),
          equipe_quadrigramme: tq(e.teamId),
          probleme: e.problemNumber,
          critere: c?.label ?? "—",
          coefficient: c?.coefficient ?? "",
          taux_pct: Math.round(g.score * 100),
          note: c ? round2(g.score * c.coefficient) : "",
          remarque: g.remark ?? "",
        };
      });
    }),
  );

  // ── Sheet: Notes orales (synthèse) ──────────────────────────────────
  append(
    wb,
    "Notes orales",
    s.oralEvaluations.map((e) => {
      const criteria = oralCriteria(e.role);
      const grades = getOralGradesByEvaluation(e.id);
      const note = weightedNote(grades, criteria);
      const p = passById.get(e.passageId);
      return {
        juree: jn(e.juryMemberId),
        passage_label: p?.label ?? "—",
        probleme: p?.problemNumber ?? "",
        equipe_quadrigramme: tq(e.teamId),
        role: e.role,
        note_ponderee: round2(note.total),
        max_theorique: round2(note.maxTotal),
        criteres_notes: `${note.gradedCount}/${note.criterionCount}`,
        remarque_globale: e.globalRemark ?? "",
      };
    }),
  );

  // ── Sheet: Détails oraux (par critère) ──────────────────────────────
  append(
    wb,
    "Détails oraux",
    s.oralEvaluations.flatMap((e) => {
      const grades = getOralGradesByEvaluation(e.id);
      const p = passById.get(e.passageId);
      return grades.map((g) => {
        const c = critById.get(g.criterionId);
        return {
          juree: jn(e.juryMemberId),
          passage_label: p?.label ?? "—",
          equipe_quadrigramme: tq(e.teamId),
          role: e.role,
          critere: c?.label ?? "—",
          theme: c?.theme ?? "",
          coefficient: c?.coefficient ?? "",
          taux_pct: Math.round(g.score * 100),
          note: c ? round2(g.score * c.coefficient) : "",
          remarque: g.remark ?? "",
        };
      });
    }),
  );

  // ── Sheet: Annonces ─────────────────────────────────────────────────
  append(
    wb,
    "Annonces",
    s.announcements.map((a) => ({
      id: a.id,
      titre: a.title,
      audience: a.audience,
      auteur: on(a.createdBy),
      cree_le: a.createdAt,
      pieces_jointes: a.attachments.join(", "),
      contenu: a.body,
    })),
  );

  // ── Sheet: Deadlines ────────────────────────────────────────────────
  append(
    wb,
    "Deadlines",
    s.deadlines.map((d) => ({
      id: d.id,
      label: d.label,
      date: d.date,
      cible: d.targetRole,
    })),
  );

  // ── Sheet: Ateliers ─────────────────────────────────────────────────
  append(
    wb,
    "Ateliers",
    s.workshops.map((w) => ({
      id: w.id,
      nom: w.name,
      intervenant: w.instructor,
      capacite: w.capacity,
      creneau: w.slot,
      tags: w.tags.join(", "),
    })),
  );

  // ── Sheet: Préférences ateliers ─────────────────────────────────────
  append(
    wb,
    "Préférences ateliers",
    s.workshopPreferences.map((p) => ({
      participant: pn(p.participantId),
      equipe: tq(partById.get(p.participantId)?.teamId ?? ""),
      choix_1: wsById.get(p.choice1Id)?.name ?? "",
      choix_2: wsById.get(p.choice2Id)?.name ?? "",
      choix_3: wsById.get(p.choice3Id)?.name ?? "",
    })),
  );

  // ── Sheet: Affectations ateliers ────────────────────────────────────
  append(
    wb,
    "Affectations ateliers",
    s.workshopAssignments.map((a) => ({
      participant: pn(a.participantId),
      equipe: tq(partById.get(a.participantId)?.teamId ?? ""),
      atelier: wsById.get(a.workshopId)?.name ?? "",
      creneau: wsById.get(a.workshopId)?.slot ?? "",
    })),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `mtym-2026-export-${stamp}.xlsx`);
}

// ─── helpers ──────────────────────────────────────────────────────────

function append(
  wb: XLSX.WorkBook,
  name: string,
  rows: Record<string, unknown>[],
): void {
  const ws =
    rows.length === 0
      ? XLSX.utils.aoa_to_sheet([["(aucune donnée)"]])
      : XLSX.utils.json_to_sheet(rows);
  // Sheet names cap at 31 chars and may not contain : \ / ? * [ ].
  const safe = name.replace(/[:\\/?*[\]]/g, "-").slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, safe);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
