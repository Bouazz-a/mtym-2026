import { setState } from "./storage";
import type {
  AppState,
  Participant,
  Team,
  JuryMember,
  Organizer,
  Pool,
  Passage,
  JuryAssignment,
  JuryPassageAssignment,
  Criterion,
  Workshop,
  Announcement,
  Deadline,
} from "@/types";

// ============================================================
// IDs — all hardcoded for cross-reference consistency
// ============================================================

const IDS = {
  // Teams
  t1: "team-0001",
  t2: "team-0002",
  t3: "team-0003",
  t4: "team-0004",
  t5: "team-0005",
  t6: "team-0006",
  t7: "team-0007",
  t8: "team-0008",
  // 11 équipes au total (≢ 0 mod 4) : la génération forme des poules
  // [4, 4, 3] aux deux tours -> exerce le cas des poules de 3.
  t9: "team-0009",
  t10: "team-0010",
  t11: "team-0011",

  // Participants (3 per team)
  p1a: "part-0001",
  p1b: "part-0002",
  p1c: "part-0003",
  p2a: "part-0004",
  p2b: "part-0005",
  p2c: "part-0006",
  p3a: "part-0007",
  p3b: "part-0008",
  p3c: "part-0009",
  p4a: "part-0010",
  p4b: "part-0011",
  p4c: "part-0012",
  p5a: "part-0013",
  p5b: "part-0014",
  p5c: "part-0015",
  p6a: "part-0016",
  p6b: "part-0017",
  p6c: "part-0018",
  p7a: "part-0019",
  p7b: "part-0020",
  p7c: "part-0021",
  p8a: "part-0022",
  p8b: "part-0023",
  p8c: "part-0024",
  p9a: "part-0025",
  p9b: "part-0026",
  p9c: "part-0027",
  p10a: "part-0028",
  p10b: "part-0029",
  p10c: "part-0030",
  p11a: "part-0031",
  p11b: "part-0032",
  p11c: "part-0033",

  // Jury
  j1: "jury-0001",
  j2: "jury-0002",
  j3: "jury-0003",
  j4: "jury-0004",
  j5: "jury-0005",

  // Organizers
  o1: "org-0001",
  o2: "org-0002",

  // NB : pas d'ids de poules/passages ici. Les poules, passages et tours
  // sont produits par tournamentService.generateBothRounds (page Tournoi
  // côté organisateur), seule source de vérité. Le seed ne contient que
  // les entités durables (équipes, participants, jury, etc.).

  // Workshops
  w1: "work-0001",
  w2: "work-0002",
  w3: "work-0003",

  // Criteria
  cr1: "crit-0001",
  cr2: "crit-0002",
  cr3: "crit-0003",
  cr4: "crit-0004",
  cr5: "crit-0005",
  cr6: "crit-0006",
};

// ============================================================
// TEAMS
// ============================================================

// poolIdRound1 = "" : tournoi non encore tiré. Les affectations de poules
// sont écrites par tournamentService au moment de la génération.
const teams: Team[] = [
  {
    id: IDS.t1,
    name: "Al-Kindi",
    quadrigramme: "AKND",
    creatorId: IDS.p1a,
    poolIdRound1: "",
  },
  {
    id: IDS.t2,
    name: "Ibn Battuta",
    quadrigramme: "IBBT",
    creatorId: IDS.p2a,
    poolIdRound1: "",
  },
  {
    id: IDS.t3,
    name: "Al-Biruni",
    quadrigramme: "ALBI",
    creatorId: IDS.p3a,
    poolIdRound1: "",
  },
  {
    id: IDS.t4,
    name: "Ibn Rushd",
    quadrigramme: "IBRU",
    creatorId: IDS.p4a,
    poolIdRound1: "",
  },
  {
    id: IDS.t5,
    name: "Al-Jazari",
    quadrigramme: "ALJZ",
    creatorId: IDS.p5a,
    poolIdRound1: "",
  },
  {
    id: IDS.t6,
    name: "Ibn Khaldun",
    quadrigramme: "IBKH",
    creatorId: IDS.p6a,
    poolIdRound1: "",
  },
  {
    id: IDS.t7,
    name: "Al-Farabi",
    quadrigramme: "ALFR",
    creatorId: IDS.p7a,
    poolIdRound1: "",
  },
  {
    id: IDS.t8,
    name: "Ibn Sina",
    quadrigramme: "IBSN",
    creatorId: IDS.p8a,
    poolIdRound1: "",
  },
  {
    id: IDS.t9,
    name: "Al-Khwarizmi",
    quadrigramme: "ALKW",
    creatorId: IDS.p9a,
    poolIdRound1: "",
  },
  {
    id: IDS.t10,
    name: "Ibn al-Haytham",
    quadrigramme: "IBHY",
    creatorId: IDS.p10a,
    poolIdRound1: "",
  },
  {
    id: IDS.t11,
    name: "Al-Razi",
    quadrigramme: "ALRZ",
    creatorId: IDS.p11a,
    poolIdRound1: "",
  },
];

// ============================================================
// PARTICIPANTS
// ============================================================

const participants: Participant[] = [
  // Team Al-Kindi
  {
    id: IDS.p1a,
    teamId: IDS.t1,
    firstName: "Youssef",
    lastName: "El Amrani",
    email: "y.elamrani@gmail.com",
    phone: "0612345678",
    city: "Casablanca",
    region: "Grand Casablanca",
    birthDate: "12-03-2008",
    schoolLevel: "2BAC",
    hoodieSize: "L",
    transportInfo: "train",
  },
  {
    id: IDS.p1b,
    teamId: IDS.t1,
    firstName: "Salma",
    lastName: "Benhaddou",
    email: "s.benhaddou@gmail.com",
    phone: "0623456789",
    city: "Casablanca",
    region: "Grand Casablanca",
    birthDate: "05-07-2008",
    schoolLevel: "2BAC",
    hoodieSize: "S",
    transportInfo: "train",
  },
  {
    id: IDS.p1c,
    teamId: IDS.t1,
    firstName: "Mehdi",
    lastName: "Tahiri",
    email: "m.tahiri@gmail.com",
    phone: "0634567890",
    city: "Mohammedia",
    region: "Grand Casablanca",
    birthDate: "20-11-2007",
    schoolLevel: "2BAC",
    hoodieSize: "M",
    transportInfo: "voiture",
  },
  // Team Ibn Battuta
  {
    id: IDS.p2a,
    teamId: IDS.t2,
    firstName: "Nour",
    lastName: "Benali",
    email: "n.benali@gmail.com",
    phone: "0645678901",
    city: "Rabat",
    region: "Rabat-Salé",
    birthDate: "18-04-2008",
    schoolLevel: "2BAC",
    hoodieSize: "M",
    transportInfo: "train",
  },
  {
    id: IDS.p2b,
    teamId: IDS.t2,
    firstName: "Adam",
    lastName: "Chraibi",
    email: "a.chraibi@gmail.com",
    phone: "0656789012",
    city: "Salé",
    region: "Rabat-Salé",
    birthDate: "09-09-2007",
    schoolLevel: "2BAC",
    hoodieSize: "XL",
    transportInfo: "bus",
  },
  {
    id: IDS.p2c,
    teamId: IDS.t2,
    firstName: "Aya",
    lastName: "Mansouri",
    email: "a.mansouri@gmail.com",
    phone: "0667890123",
    city: "Rabat",
    region: "Rabat-Salé",
    birthDate: "14-01-2008",
    schoolLevel: "1BAC",
    hoodieSize: "S",
    transportInfo: "train",
  },
  // Team Al-Biruni
  {
    id: IDS.p3a,
    teamId: IDS.t3,
    firstName: "Hamza",
    lastName: "Idrissi",
    email: "h.idrissi@gmail.com",
    phone: "0678901234",
    city: "Fès",
    region: "Fès-Meknès",
    birthDate: "22-06-2008",
    schoolLevel: "2BAC",
    hoodieSize: "L",
    transportInfo: "train",
  },
  {
    id: IDS.p3b,
    teamId: IDS.t3,
    firstName: "Zineb",
    lastName: "Alaoui",
    email: "z.alaoui@gmail.com",
    phone: "0689012345",
    city: "Meknès",
    region: "Fès-Meknès",
    birthDate: "30-08-2007",
    schoolLevel: "2BAC",
    hoodieSize: "M",
    transportInfo: "bus",
  },
  {
    id: IDS.p3c,
    teamId: IDS.t3,
    firstName: "Karim",
    lastName: "Berrada",
    email: "k.berrada@gmail.com",
    phone: "0690123456",
    city: "Fès",
    region: "Fès-Meknès",
    birthDate: "11-02-2008",
    schoolLevel: "2BAC",
    hoodieSize: "L",
    transportInfo: "train",
  },
  // Team Ibn Rushd
  {
    id: IDS.p4a,
    teamId: IDS.t4,
    firstName: "Fatima",
    lastName: "Sabiri",
    email: "f.sabiri@gmail.com",
    phone: "0601234567",
    city: "Marrakech",
    region: "Marrakech-Safi",
    birthDate: "03-05-2008",
    schoolLevel: "2BAC",
    hoodieSize: "S",
    transportInfo: "voiture",
  },
  {
    id: IDS.p4b,
    teamId: IDS.t4,
    firstName: "Omar",
    lastName: "Zouaki",
    email: "o.zouaki@gmail.com",
    phone: "0612340000",
    city: "Marrakech",
    region: "Marrakech-Safi",
    birthDate: "25-10-2007",
    schoolLevel: "2BAC",
    hoodieSize: "XL",
    transportInfo: "bus",
  },
  {
    id: IDS.p4c,
    teamId: IDS.t4,
    firstName: "Imane",
    lastName: "Lahlou",
    email: "i.lahlou@gmail.com",
    phone: "0623450000",
    city: "Essaouira",
    region: "Marrakech-Safi",
    birthDate: "17-07-2008",
    schoolLevel: "1BAC",
    hoodieSize: "M",
    transportInfo: "voiture",
  },
  // Team Al-Jazari
  {
    id: IDS.p5a,
    teamId: IDS.t5,
    firstName: "Ilyas",
    lastName: "Chakir",
    email: "i.chakir@gmail.com",
    phone: "0634560000",
    city: "Agadir",
    region: "Souss-Massa",
    birthDate: "08-12-2007",
    schoolLevel: "2BAC",
    hoodieSize: "L",
    transportInfo: "bus",
  },
  {
    id: IDS.p5b,
    teamId: IDS.t5,
    firstName: "Rania",
    lastName: "Moutaouakil",
    email: "r.moutao@gmail.com",
    phone: "0645670000",
    city: "Agadir",
    region: "Souss-Massa",
    birthDate: "19-03-2008",
    schoolLevel: "2BAC",
    hoodieSize: "S",
    transportInfo: "bus",
  },
  {
    id: IDS.p5c,
    teamId: IDS.t5,
    firstName: "Amine",
    lastName: "Hafidi",
    email: "a.hafidi@gmail.com",
    phone: "0656780000",
    city: "Tiznit",
    region: "Souss-Massa",
    birthDate: "28-09-2007",
    schoolLevel: "2BAC",
    hoodieSize: "M",
    transportInfo: "voiture",
  },
  // Team Ibn Khaldun
  {
    id: IDS.p6a,
    teamId: IDS.t6,
    firstName: "Sara",
    lastName: "Ouazzani",
    email: "s.ouazzani@gmail.com",
    phone: "0667890000",
    city: "Tanger",
    region: "Tanger-Tétouan",
    birthDate: "14-06-2008",
    schoolLevel: "2BAC",
    hoodieSize: "M",
    transportInfo: "train",
  },
  {
    id: IDS.p6b,
    teamId: IDS.t6,
    firstName: "Bilal",
    lastName: "Naciri",
    email: "b.naciri@gmail.com",
    phone: "0678900000",
    city: "Tétouan",
    region: "Tanger-Tétouan",
    birthDate: "02-01-2008",
    schoolLevel: "2BAC",
    hoodieSize: "L",
    transportInfo: "train",
  },
  {
    id: IDS.p6c,
    teamId: IDS.t6,
    firstName: "Hajar",
    lastName: "Bakkali",
    email: "h.bakkali@gmail.com",
    phone: "0689010000",
    city: "Tanger",
    region: "Tanger-Tétouan",
    birthDate: "21-04-2007",
    schoolLevel: "2BAC",
    hoodieSize: "S",
    transportInfo: "bus",
  },
  // Team Al-Farabi
  {
    id: IDS.p7a,
    teamId: IDS.t7,
    firstName: "Soufiane",
    lastName: "El Fassi",
    email: "s.elfassi@gmail.com",
    phone: "0690120000",
    city: "Oujda",
    region: "Oriental",
    birthDate: "07-08-2008",
    schoolLevel: "2BAC",
    hoodieSize: "XL",
    transportInfo: "bus",
  },
  {
    id: IDS.p7b,
    teamId: IDS.t7,
    firstName: "Ghita",
    lastName: "Bensouda",
    email: "g.bensouda@gmail.com",
    phone: "0601230000",
    city: "Oujda",
    region: "Oriental",
    birthDate: "16-11-2007",
    schoolLevel: "2BAC",
    hoodieSize: "S",
    transportInfo: "train",
  },
  {
    id: IDS.p7c,
    teamId: IDS.t7,
    firstName: "Zakaria",
    lastName: "Tazi",
    email: "z.tazi@gmail.com",
    phone: "0612340001",
    city: "Berkane",
    region: "Oriental",
    birthDate: "23-05-2008",
    schoolLevel: "1BAC",
    hoodieSize: "M",
    transportInfo: "bus",
  },
  // Team Ibn Sina
  {
    id: IDS.p8a,
    teamId: IDS.t8,
    firstName: "Malak",
    lastName: "Cherkaoui",
    email: "m.cherkaoui@gmail.com",
    phone: "0623450001",
    city: "Laâyoune",
    region: "Laâyoune-Sakia",
    birthDate: "11-02-2008",
    schoolLevel: "2BAC",
    hoodieSize: "S",
    transportInfo: "voiture",
  },
  {
    id: IDS.p8b,
    teamId: IDS.t8,
    firstName: "Yassine",
    lastName: "Badr",
    email: "y.badr@gmail.com",
    phone: "0634560001",
    city: "Dakhla",
    region: "Dakhla-Oued",
    birthDate: "04-07-2007",
    schoolLevel: "2BAC",
    hoodieSize: "L",
    transportInfo: "voiture",
  },
  {
    id: IDS.p8c,
    teamId: IDS.t8,
    firstName: "Houda",
    lastName: "Kettani",
    email: "h.kettani@gmail.com",
    phone: "0645670001",
    city: "Laâyoune",
    region: "Laâyoune-Sakia",
    birthDate: "29-10-2008",
    schoolLevel: "2BAC",
    hoodieSize: "M",
    transportInfo: "voiture",
  },
  // Team Al-Khwarizmi
  {
    id: IDS.p9a,
    teamId: IDS.t9,
    firstName: "Anas",
    lastName: "Belkadi",
    email: "a.belkadi@gmail.com",
    phone: "0656780002",
    city: "Kénitra",
    region: "Rabat-Salé",
    birthDate: "06-03-2008",
    schoolLevel: "2BAC",
    hoodieSize: "L",
    transportInfo: "train",
  },
  {
    id: IDS.p9b,
    teamId: IDS.t9,
    firstName: "Lina",
    lastName: "Saidi",
    email: "l.saidi@gmail.com",
    phone: "0667890002",
    city: "Kénitra",
    region: "Rabat-Salé",
    birthDate: "21-08-2008",
    schoolLevel: "2BAC",
    hoodieSize: "S",
    transportInfo: "train",
  },
  {
    id: IDS.p9c,
    teamId: IDS.t9,
    firstName: "Reda",
    lastName: "Amrani",
    email: "r.amrani@gmail.com",
    phone: "0678900002",
    city: "Sidi Slimane",
    region: "Rabat-Salé",
    birthDate: "13-12-2007",
    schoolLevel: "1BAC",
    hoodieSize: "M",
    transportInfo: "bus",
  },
  // Team Ibn al-Haytham
  {
    id: IDS.p10a,
    teamId: IDS.t10,
    firstName: "Khalil",
    lastName: "Benjelloun",
    email: "k.benjelloun@gmail.com",
    phone: "0689010002",
    city: "Safi",
    region: "Marrakech-Safi",
    birthDate: "27-05-2008",
    schoolLevel: "2BAC",
    hoodieSize: "XL",
    transportInfo: "bus",
  },
  {
    id: IDS.p10b,
    teamId: IDS.t10,
    firstName: "Douaa",
    lastName: "Fassi",
    email: "d.fassi@gmail.com",
    phone: "0690120002",
    city: "El Jadida",
    region: "Casablanca-Settat",
    birthDate: "02-02-2008",
    schoolLevel: "2BAC",
    hoodieSize: "S",
    transportInfo: "voiture",
  },
  {
    id: IDS.p10c,
    teamId: IDS.t10,
    firstName: "Walid",
    lastName: "Cherif",
    email: "w.cherif@gmail.com",
    phone: "0601230002",
    city: "Safi",
    region: "Marrakech-Safi",
    birthDate: "19-09-2007",
    schoolLevel: "2BAC",
    hoodieSize: "M",
    transportInfo: "bus",
  },
  // Team Al-Razi
  {
    id: IDS.p11a,
    teamId: IDS.t11,
    firstName: "Othmane",
    lastName: "Sefrioui",
    email: "o.sefrioui@gmail.com",
    phone: "0612340003",
    city: "Beni Mellal",
    region: "Béni Mellal-Khénifra",
    birthDate: "11-07-2008",
    schoolLevel: "2BAC",
    hoodieSize: "L",
    transportInfo: "bus",
  },
  {
    id: IDS.p11b,
    teamId: IDS.t11,
    firstName: "Yasmine",
    lastName: "Haddad",
    email: "y.haddad@gmail.com",
    phone: "0623450003",
    city: "Khouribga",
    region: "Béni Mellal-Khénifra",
    birthDate: "30-04-2008",
    schoolLevel: "2BAC",
    hoodieSize: "S",
    transportInfo: "bus",
  },
  {
    id: IDS.p11c,
    teamId: IDS.t11,
    firstName: "Ayoub",
    lastName: "Rachidi",
    email: "a.rachidi@gmail.com",
    phone: "0634560003",
    city: "Beni Mellal",
    region: "Béni Mellal-Khénifra",
    birthDate: "24-01-2008",
    schoolLevel: "1BAC",
    hoodieSize: "M",
    transportInfo: "voiture",
  },
];

// ============================================================
// JURY & ORGANIZERS
// ============================================================

const juryMembers: JuryMember[] = [
  {
    id: IDS.j1,
    firstName: "Pr. Kamal",
    lastName: "Idrissi",
    email: "k.idrissi@um5.ac.ma",
    city: "Rabat",
    transportInfo: "train",
  },
  {
    id: IDS.j2,
    firstName: "Pr. Amina",
    lastName: "Benkirane",
    email: "a.benkirane@uca.ac.ma",
    city: "Marrakech",
    transportInfo: "train",
  },
  {
    id: IDS.j3,
    firstName: "Pr. Hassan",
    lastName: "Tahir",
    email: "h.tahir@uae.ac.ma",
    city: "Tétouan",
    transportInfo: "voiture",
  },
  {
    id: IDS.j4,
    firstName: "Pr. Leila",
    lastName: "Ziani",
    email: "l.ziani@uh2c.ac.ma",
    city: "Casablanca",
    transportInfo: "train",
  },
  {
    id: IDS.j5,
    firstName: "Pr. Youssef",
    lastName: "Ouali",
    email: "y.ouali@fsdm.ac.ma",
    city: "Fès",
    transportInfo: "bus",
  },
];

const organizers: Organizer[] = [
  {
    id: IDS.o1,
    firstName: "Mehdi",
    lastName: "Lahlou",
    email: "mehdi.lahlou@mtym.ma",
    role: "admin",
  },
  {
    id: IDS.o2,
    firstName: "Yasmine",
    lastName: "Chraibi",
    email: "yasmine.chraibi@mtym.ma",
    role: "scientific",
  },
];

// ============================================================
// POOLS — vides au seed.
// Poules/tours produits par tournamentService.generateBothRounds
// (page Tournoi, organisateur). Convention des libellés : A = tour 1,
// B = tour 2 (A1 = poule 1 du tour 1, B2 = poule 2 du tour 2).
// ============================================================

const pools: Pool[] = [];

// ============================================================
// PASSAGES — vides au seed (générés par tournamentService).
// ============================================================

const passages: Passage[] = [];

// ============================================================
// JURY ASSIGNMENTS
// ============================================================

// Répartition des rapports intermédiaires (par équipe — indépendante des
// poules). Couvre t1..t8 ; t9..t11 seront affectées côté organisateur.
const juryAssignments: JuryAssignment[] = [
  { juryMemberId: IDS.j1, teamId: IDS.t1, reportType: "intermediaire" },
  { juryMemberId: IDS.j1, teamId: IDS.t2, reportType: "intermediaire" },
  { juryMemberId: IDS.j2, teamId: IDS.t3, reportType: "intermediaire" },
  { juryMemberId: IDS.j2, teamId: IDS.t4, reportType: "intermediaire" },
  { juryMemberId: IDS.j3, teamId: IDS.t5, reportType: "intermediaire" },
  { juryMemberId: IDS.j3, teamId: IDS.t6, reportType: "intermediaire" },
  { juryMemberId: IDS.j4, teamId: IDS.t7, reportType: "intermediaire" },
  { juryMemberId: IDS.j4, teamId: IDS.t8, reportType: "intermediaire" },
];

// Vide au seed : dépend des passages, eux-mêmes générés par
// tournamentService. Réparti côté organisateur après le tirage.
const juryPassageAssignments: JuryPassageAssignment[] = [];

// ============================================================
// CRITERIA
// ============================================================

const criteria: Criterion[] = [
  // Report criteria (problem-agnostic, apply to all problems)
  {
    id: IDS.cr1,
    label: "Rigueur mathématique",
    coefficient: 3,
    type: "report",
    problemNumber: 1,
    order: 1,
  },
  {
    id: IDS.cr2,
    label: "Clarté de la rédaction",
    coefficient: 2,
    type: "report",
    problemNumber: 1,
    order: 2,
  },
  {
    id: IDS.cr3,
    label: "Originalité de l'approche",
    coefficient: 2,
    type: "report",
    problemNumber: 1,
    order: 3,
  },
  // Oral criteria
  {
    id: IDS.cr4,
    label: "Maîtrise du contenu",
    coefficient: 3,
    type: "oral",
    role: "defender",
    order: 1,
  },
  {
    id: IDS.cr5,
    label: "Qualité des questions",
    coefficient: 2,
    type: "oral",
    role: "opponent",
    order: 1,
  },
  {
    id: IDS.cr6,
    label: "Qualité du rapport oral",
    coefficient: 2,
    type: "oral",
    role: "reporter",
    order: 1,
  },
];

// ============================================================
// WORKSHOPS
// ============================================================

const workshops: Workshop[] = [
  {
    id: IDS.w1,
    name: "Introduction à la théorie des graphes",
    instructor: "Pr. Amina Benkirane",
    capacity: 20,
    slot: "Samedi 10:00",
    tags: ["graphes", "algorithmique"],
  },
  {
    id: IDS.w2,
    name: "Cryptographie et sécurité",
    instructor: "Pr. Kamal Idrissi",
    capacity: 20,
    slot: "Samedi 14:00",
    tags: ["crypto", "sécurité"],
  },
  {
    id: IDS.w3,
    name: "Probabilités et dénombrement",
    instructor: "Pr. Leila Ziani",
    capacity: 20,
    slot: "Dimanche 10:00",
    tags: ["probas", "combinatoire"],
  },
];

// ============================================================
// ANNOUNCEMENTS & DEADLINES
// ============================================================

const announcements: Announcement[] = [
  {
    id: "ann-0001",
    title: "Bienvenue à MTYM 2026 !",
    body: "Nous sommes ravis de vous accueillir pour cette édition. Consultez le programme sur cette plateforme.",
    audience: "all",
    attachments: [],
    createdBy: IDS.o1,
    createdAt: "2026-05-01T09:00:00Z",
  },
  {
    id: "ann-0002",
    title: "Dépôt des rapports intermédiaires",
    body: "Le dépôt des rapports intermédiaires est ouvert. Date limite : 1er juin 2026.",
    audience: "participants",
    attachments: [],
    createdBy: IDS.o2,
    createdAt: "2026-05-05T10:00:00Z",
  },
];

const deadlines: Deadline[] = [
  {
    id: "dead-0001",
    label: "Rapport intermédiaire",
    date: "2026-06-01",
    targetRole: "participants",
  },
  {
    id: "dead-0002",
    label: "Rapport final",
    date: "2026-06-10",
    targetRole: "participants",
  },
  {
    id: "dead-0003",
    label: "Fiches jury",
    date: "2026-06-12",
    targetRole: "jury",
  },
];

// ============================================================
// SEED FUNCTION
// ============================================================

export function seedDemoData(): void {
  const state: AppState = {
    participants,
    teams,
    juryMembers,
    organizers,
    pools,
    passages,
    documents: [],
    juryAssignments,
    juryPassageAssignments,
    criteria,
    reportEvaluations: [],
    reportGrades: [],
    oralEvaluations: [],
    oralGrades: [],
    workshops,
    workshopPreferences: [],
    workshopAssignments: [],
    announcements,
    deadlines,
    currentUserId: IDS.p1a, // connecté en tant que Youssef (participant)
    currentUserRole: "participant",
  };

  setState(state);
  console.log(
    " Demo data seeded — 11 équipes, 33 participants, 5 jury. " +
      "Poules/passages non tirés (à générer via la page Tournoi).",
  );
}

// Helper to quickly switch the current user for testing different roles
export function loginAs(role: "participant" | "jury" | "organizer"): void {
  const map = {
    participant: { id: IDS.p1a, role: "participant" as const },
    jury: { id: IDS.j1, role: "jury" as const },
    organizer: { id: IDS.o1, role: "organizer" as const },
  };
  const { id, role: r } = map[role];
  const s = { ...JSON.parse(localStorage.getItem("mtym_app_state") || "{}") };
  s.currentUserId = id;
  s.currentUserRole = r;
  localStorage.setItem("mtym_app_state", JSON.stringify(s));
  console.log(`Logged in as ${role} (${id})`);
}
