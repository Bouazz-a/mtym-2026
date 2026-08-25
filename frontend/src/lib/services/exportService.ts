import * as XLSX from "xlsx";
import { getTeams } from "@/lib/repositories/teamRepository";
import { getParticipants } from "@/lib/repositories/participantRepository";
import { getPools, getPassages } from "@/lib/repositories/poolRepository";
import { getJuryMembers, getJuryAssignments, getJuryPassageAssignments } from "@/lib/repositories/juryRepository";
import { getOrganizers } from "@/lib/repositories/organizerRepository";
import { getDocuments } from "@/lib/repositories/documentRepository";
import {
  getCriteria, getReportEvaluations, getOralEvaluations,
  filterReportCriteria, filterOralCriteria,
} from "@/lib/repositories/evaluationRepository";
import { getAnnouncements, getDeadlines } from "@/lib/repositories/announcementRepository";
import { getWorkshops, getWorkshopPreferences, getWorkshopAssignments } from "@/lib/repositories/workshopRepository";
import { weightedNote } from "./gradingService";

// exportService — admin-only multi-sheet XLSX dump of the application
// state. Every sheet carries the human-readable keys (quadrigrammes, juror
// names, pool labels, problem numbers) that make cross-sheet joins obvious
// without spelunking through opaque uuids: pools ↔ teams via the pool
// label; jury report assignments ↔ documents via the team quadrigramme;
// jury passage assignments ↔ passages via the passage label; etc.
//
// Used to be one synchronous getState() snapshot of the local-storage
// blob; now every collection is its own network call, made in parallel via
// Promise.all so this doesn't turn into 20 sequential round-trips.

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

export async function exportAppDataXlsx(): Promise<void> {
  const [
    teams, participants, pools, passages, juryMembers, organizers, criteria,
    documents, juryAssignments, juryPassageAssignments, reportEvaluations,
    oralEvaluations, announcements, deadlines, workshops, workshopPreferences,
    workshopAssignments,
  ] = await Promise.all([
    getTeams(), getParticipants(), getPools(), getPassages(), getJuryMembers(), getOrganizers(), getCriteria(),
    getDocuments(), getJuryAssignments(), getJuryPassageAssignments(), getReportEvaluations(),
    getOralEvaluations(), getAnnouncements(), getDeadlines(), getWorkshops(), getWorkshopPreferences(),
    getWorkshopAssignments(),
  ]);

  const wb = XLSX.utils.book_new();

  // ── Lookup maps ─────────────────────────────────────────────────────
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const partById = new Map(participants.map((p) => [p.id, p]));
  const poolById = new Map(pools.map((p) => [p.id, p]));
  const passById = new Map(passages.map((p) => [p.id, p]));
  const juryById = new Map(juryMembers.map((j) => [j.id, j]));
  const orgById = new Map(organizers.map((o) => [o.id, o]));
  const critById = new Map(criteria.map((c) => [c.id, c]));
  const wsById = new Map(workshops.map((w) => [w.id, w]));

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
    teams.map((t) => ({
      id: t.id,
      quadrigramme: t.quadrigramme,
      nom: t.name,
      createur: pn(t.creatorId),
      pool_tour1: pl(t.poolIdRound1),
      pool_tour2: pl(t.poolIdRound2),
      membres: participants
        .filter((p) => p.teamId === t.id)
        .map((p) => `${p.firstName} ${p.lastName}`)
        .join(", "),
    })),
  );

  // ── Sheet: Participants ─────────────────────────────────────────────
  append(
    wb,
    "Participants",
    participants.map((p) => ({
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
    pools.map((p) => ({
      id: p.id,
      label: p.label,
      tour: p.round,
      equipes: teams
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
    passages.map((p) => ({
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
    juryMembers.map((j) => ({
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
    organizers.map((o) => ({
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
    juryAssignments.map((a) => {
      const docs = documents.filter((d) => d.teamId === a.teamId);
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
    juryPassageAssignments.map((a) => {
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
    documents.map((d) => ({
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
    criteria
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
  const riEvals = reportEvaluations.filter((e) => e.reportType === "intermediaire");
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
  const rfEvals = reportEvaluations.filter((e) => e.reportType === "final");
  append(
    wb,
    "Notes RF",
    rfEvals.map((e) => {
      const evalCriteria = filterReportCriteria(criteria, e.problemNumber);
      const note = weightedNote(e.grades, evalCriteria);
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
    rfEvals.flatMap((e) =>
      e.grades.map((g) => {
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
      }),
    ),
  );

  // ── Sheet: Notes orales (synthèse) ──────────────────────────────────
  append(
    wb,
    "Notes orales",
    oralEvaluations.map((e) => {
      const evalCriteria = filterOralCriteria(criteria, e.role);
      const note = weightedNote(e.grades, evalCriteria);
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
    oralEvaluations.flatMap((e) => {
      const p = passById.get(e.passageId);
      return e.grades.map((g) => {
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
    announcements.map((a) => ({
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
    deadlines.map((d) => ({
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
    workshops.map((w) => ({
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
    workshopPreferences.map((p) => ({
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
    workshopAssignments.map((a) => ({
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
