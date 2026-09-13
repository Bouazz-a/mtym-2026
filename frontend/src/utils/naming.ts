import type {
  Audience,
  DocumentType,
  EvaluationType,
  HoodieSize,
  JuryMember,
  Organizer,
  OrganizerRole,
  Participant,
  PassageRole,
  Pool,
  ReportType,
  Round,
  SchoolLevel,
  Team,
  TransportMode,
  UserRole,
} from "@/types";

/*
 * UI display labels
 */

// ================== People ==================

type PersonLike = Participant | JuryMember | Organizer;

// "Amine" + "Kadiri" -> "Amine Kadiri"
export function getPersonDisplayName(person: PersonLike): string {
  return `${person.firstName} ${person.lastName}`;
}

// "Amine Kadiri" -> "AK"
export function getPersonInitials(person: PersonLike): string {
  return `${person.firstName[0] ?? ""}${person.lastName[0] ?? ""}`.toUpperCase();
}

// ================== Teams ==================

// "AKND" + "Al-Kindi" -> P "AKND – Al-Kindi"
export function getTeamDisplayName(team: Team): string {
  return `${team.quadrigramme} – ${team.name}`;
}

// Quadrigramme seul — pour les tableaux et badges
export function getTeamShortName(team: Team): string {
  return team.quadrigramme;
}

// ================== Tournament structure ==================

// { label: "A1" } -> "Poule A1"
export function getPoolDisplayLabel(pool: Pool): string {
  return `Poule ${pool.label}`;
}

// 1 -> "Tour 1" | 2 -> "Tour 2"
export function getRoundLabel(round: Round): string {
  return `Tour ${round}`;
}

// 3 -> "Problème 3"
export function getProblemLabel(problemNumber: number): string {
  return `Problème ${problemNumber}`;
}

// "defender" -> "Défenseur" | "opponent" -> "Opposant" | etc.
export function getPassageRoleLabel(role: PassageRole): string {
  const labels: Record<PassageRole, string> = {
    defender: "Défenseur",
    opponent: "Opposant",
    reporter: "Rapporteur",
    extra: "Équipe supplémentaire",
  };
  return labels[role];
}

// "defender" -> "D" | "opponent" -> "O" | "reporter" -> "R" | "extra" -> "E"
export function getPassageRoleShortLabel(role: PassageRole): string {
  const labels: Record<PassageRole, string> = {
    defender: "D",
    opponent: "O",
    reporter: "R",
    extra: "E",
  };
  return labels[role];
}

// ================== Documents ==================

export function getDocumentTypeLabel(docType: DocumentType): string {
  const labels: Record<DocumentType, string> = {
    rapport_intermediaire: "Rapport intermédiaire",
    rapport_final_p1: "Rapport final - Problème 1",
    rapport_final_p2: "Rapport final - Problème 2",
    rapport_final_p3: "Rapport final - Problème 3",
    rapport_final_p4: "Rapport final - Problème 4",
    fiche_synthese_opposant_1: "Fiche de synthèse - Opposant (Tour 1)",
    fiche_synthese_rapporteur_1: "Fiche de synthèse - Rapporteur (Tour 1)",
    fiche_synthese_opposant_2: "Fiche de synthèse - Opposant (Tour 2)",
    fiche_synthese_rapporteur_2: "Fiche de synthèse - Rapporteur (Tour 2)",
    presentation_1: "Présentation orale (Tour 1)",
    presentation_2: "Présentation orale (Tour 2)",
  };
  return labels[docType];
}

export function getReportTypeLabel(reportType: ReportType): string {
  const labels: Record<ReportType, string> = {
    intermediaire: "Rapport intermédiaire",
    final: "Rapport final",
  };
  return labels[reportType];
}

// ================== Enums ==================

export function getSchoolLevelLabel(level: SchoolLevel): string {
  const labels: Record<SchoolLevel, string> = {
    "3AC": "3ème année collège",
    TC: "Tronc commun",
    "1BAC": "1ère année bac",
    "2BAC": "2ème année bac",
  };
  return labels[level];
}

export function getTransportModeLabel(mode: TransportMode): string {
  const labels: Record<TransportMode, string> = {
    train: "Train",
    voiture: "Voiture",
    bus: "Bus",
    autre: "Autre",
  };
  return labels[mode];
}

// S/M/L/XL/XXL sont déjà lisibles — gardé ici pour cohérence
export function getHoodieSizeLabel(size: HoodieSize): string {
  return size;
}

export function getOrganizerRoleLabel(role: OrganizerRole): string {
  const labels: Record<OrganizerRole, string> = {
    admin: "Administrateur",
    logistics: "Logistique (MOC)",
    scientific: "Scientifique (SOC)",
  };
  return labels[role];
}

export function getUserRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    participant: "Participant",
    jury: "Jury",
    organizer: "Organisateur",
  };
  return labels[role];
}

export function getAudienceLabel(audience: Audience): string {
  const labels: Record<Audience, string> = {
    all: "Tout le monde",
    participants: "Participants",
    jury: "Jury",
  };
  return labels[audience];
}

export function getEvaluationTypeLabel(type: EvaluationType): string {
  const labels: Record<EvaluationType, string> = {
    report: "Évaluation écrite",
    oral: "Évaluation orale",
  };
  return labels[type];
}

// ================== File sizes ==================

// 1536000 -> "1.5 MB"
export function formatFileSize(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}
