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

  // Jury
  j1: "jury-0001",
  j2: "jury-0002",
  j3: "jury-0003",
  j4: "jury-0004",
  j5: "jury-0005",

  // Organizers
  o1: "org-0001",
  o2: "org-0002",

  // Pools
  pool_A1: "pool-A1",
  pool_B1: "pool-B1",
  pool_A2: "pool-A2",
  pool_B2: "pool-B2",

  // Passages round 1 — pool A1 (teams 1, 2, 3, 4)
  pass_A1_1: "pass-A1-1",
  pass_A1_2: "pass-A1-2",
  pass_A1_3: "pass-A1-3",
  pass_A1_4: "pass-A1-4",
  // Passages round 1 — pool B1 (teams 5, 6, 7, 8)
  pass_B1_1: "pass-B1-1",
  pass_B1_2: "pass-B1-2",
  pass_B1_3: "pass-B1-3",
  pass_B1_4: "pass-B1-4",

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

const teams: Team[] = [
  {
    id: IDS.t1,
    name: "Al-Kindi",
    quadrigramme: "AKND",
    creatorId: IDS.p1a,
    poolIdRound1: IDS.pool_A1,
  },
  {
    id: IDS.t2,
    name: "Ibn Battuta",
    quadrigramme: "IBBT",
    creatorId: IDS.p2a,
    poolIdRound1: IDS.pool_A1,
  },
  {
    id: IDS.t3,
    name: "Al-Biruni",
    quadrigramme: "ALBI",
    creatorId: IDS.p3a,
    poolIdRound1: IDS.pool_A1,
  },
  {
    id: IDS.t4,
    name: "Ibn Rushd",
    quadrigramme: "IBRU",
    creatorId: IDS.p4a,
    poolIdRound1: IDS.pool_A1,
  },
  {
    id: IDS.t5,
    name: "Al-Jazari",
    quadrigramme: "ALJZ",
    creatorId: IDS.p5a,
    poolIdRound1: IDS.pool_B1,
  },
  {
    id: IDS.t6,
    name: "Ibn Khaldun",
    quadrigramme: "IBKH",
    creatorId: IDS.p6a,
    poolIdRound1: IDS.pool_B1,
  },
  {
    id: IDS.t7,
    name: "Al-Farabi",
    quadrigramme: "ALFR",
    creatorId: IDS.p7a,
    poolIdRound1: IDS.pool_B1,
  },
  {
    id: IDS.t8,
    name: "Ibn Sina",
    quadrigramme: "IBSN",
    creatorId: IDS.p8a,
    poolIdRound1: IDS.pool_B1,
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
// POOLS
// ============================================================

const pools: Pool[] = [
  { id: IDS.pool_A1, label: "A1", round: 1 },
  { id: IDS.pool_B1, label: "B1", round: 1 },
  { id: IDS.pool_A2, label: "A2", round: 2 },
  { id: IDS.pool_B2, label: "B2", round: 2 },
];

// ============================================================
// PASSAGES — Round 1
// Pool A1: t1=AKND, t2=IBBT, t3=ALBI, t4=IBRU (4 teams → 4 passages)
// ============================================================

const passages: Passage[] = [
  // Pool A1
  {
    id: IDS.pass_A1_1,
    label: "A1P1",
    problemNumber: 1,
    poolId: IDS.pool_A1,
    defenderTeamId: IDS.t1,
    opponentTeamId: IDS.t2,
    reporterTeamId: IDS.t3,
    extraTeamId: IDS.t4,
    day: "14-06-2025",
    timeSlot: "09:00",
    room: "Salle 101",
  },
  {
    id: IDS.pass_A1_2,
    label: "A1P2",
    problemNumber: 2,
    poolId: IDS.pool_A1,
    defenderTeamId: IDS.t2,
    opponentTeamId: IDS.t3,
    reporterTeamId: IDS.t4,
    extraTeamId: IDS.t1,
    day: "14-06-2025",
    timeSlot: "11:00",
    room: "Salle 101",
  },
  {
    id: IDS.pass_A1_3,
    label: "A1P3",
    problemNumber: 3,
    poolId: IDS.pool_A1,
    defenderTeamId: IDS.t3,
    opponentTeamId: IDS.t4,
    reporterTeamId: IDS.t1,
    extraTeamId: IDS.t2,
    day: "14-06-2025",
    timeSlot: "14:00",
    room: "Salle 101",
  },
  {
    id: IDS.pass_A1_4,
    label: "A1P4",
    problemNumber: 4,
    poolId: IDS.pool_A1,
    defenderTeamId: IDS.t4,
    opponentTeamId: IDS.t1,
    reporterTeamId: IDS.t2,
    extraTeamId: IDS.t3,
    day: "14-06-2025",
    timeSlot: "16:00",
    room: "Salle 101",
  },
  // Pool B1
  {
    id: IDS.pass_B1_1,
    label: "B1P1",
    problemNumber: 1,
    poolId: IDS.pool_B1,
    defenderTeamId: IDS.t5,
    opponentTeamId: IDS.t6,
    reporterTeamId: IDS.t7,
    extraTeamId: IDS.t8,
    day: "14-06-2025",
    timeSlot: "09:00",
    room: "Salle 102",
  },
  {
    id: IDS.pass_B1_2,
    label: "B1P2",
    problemNumber: 2,
    poolId: IDS.pool_B1,
    defenderTeamId: IDS.t6,
    opponentTeamId: IDS.t7,
    reporterTeamId: IDS.t8,
    extraTeamId: IDS.t5,
    day: "14-06-2025",
    timeSlot: "11:00",
    room: "Salle 102",
  },
  {
    id: IDS.pass_B1_3,
    label: "B1P3",
    problemNumber: 3,
    poolId: IDS.pool_B1,
    defenderTeamId: IDS.t7,
    opponentTeamId: IDS.t8,
    reporterTeamId: IDS.t5,
    extraTeamId: IDS.t6,
    day: "14-06-2025",
    timeSlot: "14:00",
    room: "Salle 102",
  },
  {
    id: IDS.pass_B1_4,
    label: "B1P4",
    problemNumber: 4,
    poolId: IDS.pool_B1,
    defenderTeamId: IDS.t8,
    opponentTeamId: IDS.t5,
    reporterTeamId: IDS.t6,
    extraTeamId: IDS.t7,
    day: "14-06-2025",
    timeSlot: "16:00",
    room: "Salle 102",
  },
];

// ============================================================
// JURY ASSIGNMENTS
// ============================================================

const juryAssignments: JuryAssignment[] = [
  // j1 & j2 → pool A1 report intermediaire
  { juryMemberId: IDS.j1, teamId: IDS.t1, reportType: "intermediaire" },
  { juryMemberId: IDS.j1, teamId: IDS.t2, reportType: "intermediaire" },
  { juryMemberId: IDS.j2, teamId: IDS.t3, reportType: "intermediaire" },
  { juryMemberId: IDS.j2, teamId: IDS.t4, reportType: "intermediaire" },
  // j3 & j4 → pool B1 report intermediaire
  { juryMemberId: IDS.j3, teamId: IDS.t5, reportType: "intermediaire" },
  { juryMemberId: IDS.j3, teamId: IDS.t6, reportType: "intermediaire" },
  { juryMemberId: IDS.j4, teamId: IDS.t7, reportType: "intermediaire" },
  { juryMemberId: IDS.j4, teamId: IDS.t8, reportType: "intermediaire" },
];

const juryPassageAssignments: JuryPassageAssignment[] = [
  // j1 & j2 → pool A1 passages
  { juryMemberId: IDS.j1, passageId: IDS.pass_A1_1 },
  { juryMemberId: IDS.j1, passageId: IDS.pass_A1_2 },
  { juryMemberId: IDS.j2, passageId: IDS.pass_A1_3 },
  { juryMemberId: IDS.j2, passageId: IDS.pass_A1_4 },
  // j3 & j4 → pool B1 passages
  { juryMemberId: IDS.j3, passageId: IDS.pass_B1_1 },
  { juryMemberId: IDS.j3, passageId: IDS.pass_B1_2 },
  { juryMemberId: IDS.j4, passageId: IDS.pass_B1_3 },
  { juryMemberId: IDS.j4, passageId: IDS.pass_B1_4 },
];

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
    " Demo data seeded — 8 teams, 24 participants, 5 jury, 8 passages",
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
