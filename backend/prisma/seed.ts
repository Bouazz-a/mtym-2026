import { PrismaClient, Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

const db = new PrismaClient();

// Ported from frontend/src/lib/storage/seed.ts — same fixture data. Ids are
// real UUIDs (not the frontend seed's cosmetic "team-0001" strings) since
// several backend routes validate id fields with Zod's z.string().uuid()
// (e.g. documents.ts, report-evaluations.ts). Unlike the frontend's
// local-storage seed, poolIdRound1/poolIdRound2 are left unset (null)
// rather than "" — they're a real nullable foreign key here, not a string
// sentinel.

const IDS = {
  t: Object.fromEntries(
    Array.from({ length: 11 }, (_, i) => [i + 1, randomUUID()]),
  ) as Record<number, string>,
  p: Object.fromEntries(
    Array.from({ length: 33 }, (_, i) => [i + 1, randomUUID()]),
  ) as Record<number, string>,
  j: Object.fromEntries(
    Array.from({ length: 5 }, (_, i) => [i + 1, randomUUID()]),
  ) as Record<number, string>,
  o1: randomUUID(),
  o2: randomUUID(),
  w1: randomUUID(),
  w2: randomUUID(),
  w3: randomUUID(),
};

const teamDefs = [
  { n: "Al-Kindi", q: "AKND" },
  { n: "Ibn Battuta", q: "IBBT" },
  { n: "Al-Biruni", q: "ALBI" },
  { n: "Ibn Rushd", q: "IBRU" },
  { n: "Al-Jazari", q: "ALJZ" },
  { n: "Ibn Khaldun", q: "IBKH" },
  { n: "Al-Farabi", q: "ALFR" },
  { n: "Ibn Sina", q: "IBSN" },
  { n: "Al-Khwarizmi", q: "ALKW" },
  { n: "Ibn al-Haytham", q: "IBHY" },
  { n: "Al-Razi", q: "ALRZ" },
];

const participantDefs: Array<{
  firstName: string; lastName: string; email: string; phone: string; city: string;
  region: string; birthDate: string; schoolLevel: string; hoodieSize: string;
  transportInfo: "train" | "voiture" | "bus" | "autre";
}> = [
  { firstName: "Youssef", lastName: "El Amrani", email: "y.elamrani@gmail.com", phone: "0612345678", city: "Casablanca", region: "Grand Casablanca", birthDate: "12-03-2008", schoolLevel: "2BAC", hoodieSize: "L", transportInfo: "train" },
  { firstName: "Salma", lastName: "Benhaddou", email: "s.benhaddou@gmail.com", phone: "0623456789", city: "Casablanca", region: "Grand Casablanca", birthDate: "05-07-2008", schoolLevel: "2BAC", hoodieSize: "S", transportInfo: "train" },
  { firstName: "Mehdi", lastName: "Tahiri", email: "m.tahiri@gmail.com", phone: "0634567890", city: "Mohammedia", region: "Grand Casablanca", birthDate: "20-11-2007", schoolLevel: "2BAC", hoodieSize: "M", transportInfo: "voiture" },
  { firstName: "Nour", lastName: "Benali", email: "n.benali@gmail.com", phone: "0645678901", city: "Rabat", region: "Rabat-Salé", birthDate: "18-04-2008", schoolLevel: "2BAC", hoodieSize: "M", transportInfo: "train" },
  { firstName: "Adam", lastName: "Chraibi", email: "a.chraibi@gmail.com", phone: "0656789012", city: "Salé", region: "Rabat-Salé", birthDate: "09-09-2007", schoolLevel: "2BAC", hoodieSize: "XL", transportInfo: "bus" },
  { firstName: "Aya", lastName: "Mansouri", email: "a.mansouri@gmail.com", phone: "0667890123", city: "Rabat", region: "Rabat-Salé", birthDate: "14-01-2008", schoolLevel: "1BAC", hoodieSize: "S", transportInfo: "train" },
  { firstName: "Hamza", lastName: "Idrissi", email: "h.idrissi@gmail.com", phone: "0678901234", city: "Fès", region: "Fès-Meknès", birthDate: "22-06-2008", schoolLevel: "2BAC", hoodieSize: "L", transportInfo: "train" },
  { firstName: "Zineb", lastName: "Alaoui", email: "z.alaoui@gmail.com", phone: "0689012345", city: "Meknès", region: "Fès-Meknès", birthDate: "30-08-2007", schoolLevel: "2BAC", hoodieSize: "M", transportInfo: "bus" },
  { firstName: "Karim", lastName: "Berrada", email: "k.berrada@gmail.com", phone: "0690123456", city: "Fès", region: "Fès-Meknès", birthDate: "11-02-2008", schoolLevel: "2BAC", hoodieSize: "L", transportInfo: "train" },
  { firstName: "Fatima", lastName: "Sabiri", email: "f.sabiri@gmail.com", phone: "0601234567", city: "Marrakech", region: "Marrakech-Safi", birthDate: "03-05-2008", schoolLevel: "2BAC", hoodieSize: "S", transportInfo: "voiture" },
  { firstName: "Omar", lastName: "Zouaki", email: "o.zouaki@gmail.com", phone: "0612340000", city: "Marrakech", region: "Marrakech-Safi", birthDate: "25-10-2007", schoolLevel: "2BAC", hoodieSize: "XL", transportInfo: "bus" },
  { firstName: "Imane", lastName: "Lahlou", email: "i.lahlou@gmail.com", phone: "0623450000", city: "Essaouira", region: "Marrakech-Safi", birthDate: "17-07-2008", schoolLevel: "1BAC", hoodieSize: "M", transportInfo: "voiture" },
  { firstName: "Ilyas", lastName: "Chakir", email: "i.chakir@gmail.com", phone: "0634560000", city: "Agadir", region: "Souss-Massa", birthDate: "08-12-2007", schoolLevel: "2BAC", hoodieSize: "L", transportInfo: "bus" },
  { firstName: "Rania", lastName: "Moutaouakil", email: "r.moutao@gmail.com", phone: "0645670000", city: "Agadir", region: "Souss-Massa", birthDate: "19-03-2008", schoolLevel: "2BAC", hoodieSize: "S", transportInfo: "bus" },
  { firstName: "Amine", lastName: "Hafidi", email: "a.hafidi@gmail.com", phone: "0656780000", city: "Tiznit", region: "Souss-Massa", birthDate: "28-09-2007", schoolLevel: "2BAC", hoodieSize: "M", transportInfo: "voiture" },
  { firstName: "Sara", lastName: "Ouazzani", email: "s.ouazzani@gmail.com", phone: "0667890000", city: "Tanger", region: "Tanger-Tétouan", birthDate: "14-06-2008", schoolLevel: "2BAC", hoodieSize: "M", transportInfo: "train" },
  { firstName: "Bilal", lastName: "Naciri", email: "b.naciri@gmail.com", phone: "0678900000", city: "Tétouan", region: "Tanger-Tétouan", birthDate: "02-01-2008", schoolLevel: "2BAC", hoodieSize: "L", transportInfo: "train" },
  { firstName: "Hajar", lastName: "Bakkali", email: "h.bakkali@gmail.com", phone: "0689010000", city: "Tanger", region: "Tanger-Tétouan", birthDate: "21-04-2007", schoolLevel: "2BAC", hoodieSize: "S", transportInfo: "bus" },
  { firstName: "Soufiane", lastName: "El Fassi", email: "s.elfassi@gmail.com", phone: "0690120000", city: "Oujda", region: "Oriental", birthDate: "07-08-2008", schoolLevel: "2BAC", hoodieSize: "XL", transportInfo: "bus" },
  { firstName: "Ghita", lastName: "Bensouda", email: "g.bensouda@gmail.com", phone: "0601230000", city: "Oujda", region: "Oriental", birthDate: "16-11-2007", schoolLevel: "2BAC", hoodieSize: "S", transportInfo: "train" },
  { firstName: "Zakaria", lastName: "Tazi", email: "z.tazi@gmail.com", phone: "0612340001", city: "Berkane", region: "Oriental", birthDate: "23-05-2008", schoolLevel: "1BAC", hoodieSize: "M", transportInfo: "bus" },
  { firstName: "Malak", lastName: "Cherkaoui", email: "m.cherkaoui@gmail.com", phone: "0623450001", city: "Laâyoune", region: "Laâyoune-Sakia", birthDate: "11-02-2008", schoolLevel: "2BAC", hoodieSize: "S", transportInfo: "voiture" },
  { firstName: "Yassine", lastName: "Badr", email: "y.badr@gmail.com", phone: "0634560001", city: "Dakhla", region: "Dakhla-Oued", birthDate: "04-07-2007", schoolLevel: "2BAC", hoodieSize: "L", transportInfo: "voiture" },
  { firstName: "Houda", lastName: "Kettani", email: "h.kettani@gmail.com", phone: "0645670001", city: "Laâyoune", region: "Laâyoune-Sakia", birthDate: "29-10-2008", schoolLevel: "2BAC", hoodieSize: "M", transportInfo: "voiture" },
  { firstName: "Anas", lastName: "Belkadi", email: "a.belkadi@gmail.com", phone: "0656780002", city: "Kénitra", region: "Rabat-Salé", birthDate: "06-03-2008", schoolLevel: "2BAC", hoodieSize: "L", transportInfo: "train" },
  { firstName: "Lina", lastName: "Saidi", email: "l.saidi@gmail.com", phone: "0667890002", city: "Kénitra", region: "Rabat-Salé", birthDate: "21-08-2008", schoolLevel: "2BAC", hoodieSize: "S", transportInfo: "train" },
  { firstName: "Reda", lastName: "Amrani", email: "r.amrani@gmail.com", phone: "0678900002", city: "Sidi Slimane", region: "Rabat-Salé", birthDate: "13-12-2007", schoolLevel: "1BAC", hoodieSize: "M", transportInfo: "bus" },
  { firstName: "Khalil", lastName: "Benjelloun", email: "k.benjelloun@gmail.com", phone: "0689010002", city: "Safi", region: "Marrakech-Safi", birthDate: "27-05-2008", schoolLevel: "2BAC", hoodieSize: "XL", transportInfo: "bus" },
  { firstName: "Douaa", lastName: "Fassi", email: "d.fassi@gmail.com", phone: "0690120002", city: "El Jadida", region: "Casablanca-Settat", birthDate: "02-02-2008", schoolLevel: "2BAC", hoodieSize: "S", transportInfo: "voiture" },
  { firstName: "Walid", lastName: "Cherif", email: "w.cherif@gmail.com", phone: "0601230002", city: "Safi", region: "Marrakech-Safi", birthDate: "19-09-2007", schoolLevel: "2BAC", hoodieSize: "M", transportInfo: "bus" },
  { firstName: "Othmane", lastName: "Sefrioui", email: "o.sefrioui@gmail.com", phone: "0612340003", city: "Beni Mellal", region: "Béni Mellal-Khénifra", birthDate: "11-07-2008", schoolLevel: "2BAC", hoodieSize: "L", transportInfo: "bus" },
  { firstName: "Yasmine", lastName: "Haddad", email: "y.haddad@gmail.com", phone: "0623450003", city: "Khouribga", region: "Béni Mellal-Khénifra", birthDate: "30-04-2008", schoolLevel: "2BAC", hoodieSize: "S", transportInfo: "bus" },
  { firstName: "Ayoub", lastName: "Rachidi", email: "a.rachidi@gmail.com", phone: "0634560003", city: "Beni Mellal", region: "Béni Mellal-Khénifra", birthDate: "24-01-2008", schoolLevel: "1BAC", hoodieSize: "M", transportInfo: "voiture" },
];

const juryDefs = [
  { firstName: "Pr. Kamal", lastName: "Idrissi", email: "k.idrissi@um5.ac.ma", city: "Rabat", transportInfo: "train" as const },
  { firstName: "Pr. Amina", lastName: "Benkirane", email: "a.benkirane@uca.ac.ma", city: "Marrakech", transportInfo: "train" as const },
  { firstName: "Pr. Hassan", lastName: "Tahir", email: "h.tahir@uae.ac.ma", city: "Tétouan", transportInfo: "voiture" as const },
  { firstName: "Pr. Leila", lastName: "Ziani", email: "l.ziani@uh2c.ac.ma", city: "Casablanca", transportInfo: "train" as const },
  { firstName: "Pr. Youssef", lastName: "Ouali", email: "y.ouali@fsdm.ac.ma", city: "Fès", transportInfo: "bus" as const },
];

function buildCriteria(): Prisma.CriterionCreateManyInput[] {
  const out: Prisma.CriterionCreateManyInput[] = [];

  const reportTemplate = [
    { label: "Rigueur mathématique", coefficient: 3 },
    { label: "Clarté de la rédaction", coefficient: 2 },
    { label: "Originalité de l'approche", coefficient: 2 },
    { label: "Structure du document", coefficient: 1 },
    { label: "Pistes de recherche", coefficient: 1 },
  ];
  for (const problemNumber of [1, 2, 3, 4]) {
    reportTemplate.forEach((c, i) => {
      out.push({
        id: randomUUID(),
        label: c.label,
        coefficient: c.coefficient,
        type: "report",
        problemNumber,
        order: i + 1,
      });
    });
  }

  const oralTemplate: Array<{
    role: "defender" | "opponent" | "reporter"; theme: string; label: string; coefficient: number;
  }> = [
    { role: "defender", theme: "Présentation orale", label: "Maîtrise du contenu", coefficient: 3 },
    { role: "defender", theme: "Présentation orale", label: "Clarté et pédagogie", coefficient: 2 },
    { role: "defender", theme: "Présentation orale", label: "Organisation et gestion du temps", coefficient: 2 },
    { role: "defender", theme: "Débat", label: "Réponses aux questions posées", coefficient: 3 },
    { role: "defender", theme: "Malus", label: "Non-conformité / comportement", coefficient: -5 },
    { role: "opponent", theme: "Débat", label: "Pertinence et profondeur des questions", coefficient: 5 },
    { role: "opponent", theme: "Débat", label: "Analyse critique du débat", coefficient: 3 },
    { role: "opponent", theme: "Débat", label: "Contribution au débat global", coefficient: 2 },
    { role: "opponent", theme: "Malus", label: "Non-conformité / comportement", coefficient: -5 },
    { role: "reporter", theme: "Débat", label: "Analyse critique du débat", coefficient: 4 },
    { role: "reporter", theme: "Débat", label: "Pertinence des interventions", coefficient: 3 },
    { role: "reporter", theme: "Débat", label: "Enrichissement du débat", coefficient: 2 },
    { role: "reporter", theme: "Malus", label: "Non-conformité / comportement", coefficient: -5 },
  ];
  const perRoleOrder: Record<string, number> = {};
  oralTemplate.forEach((c) => {
    perRoleOrder[c.role] = (perRoleOrder[c.role] ?? 0) + 1;
    out.push({
      id: randomUUID(),
      label: c.label,
      coefficient: c.coefficient,
      type: "oral",
      role: c.role,
      theme: c.theme,
      order: perRoleOrder[c.role],
    });
  });

  return out;
}

async function main() {
  // Clear only what this script seeds, in FK-safe order.
  await db.juryAssignment.deleteMany();
  await db.criterion.deleteMany();
  await db.workshop.deleteMany();
  await db.announcement.deleteMany();
  await db.deadline.deleteMany();
  await db.participant.deleteMany();
  await db.team.deleteMany();
  await db.juryMember.deleteMany();
  await db.organizer.deleteMany();

  await db.team.createMany({
    data: teamDefs.map((t, i) => ({
      id: IDS.t[i + 1],
      name: t.n,
      quadrigramme: t.q,
      creatorId: IDS.p[i * 3 + 1],
    })),
  });

  await db.participant.createMany({
    data: participantDefs.map((p, i) => ({
      id: IDS.p[i + 1],
      teamId: IDS.t[Math.floor(i / 3) + 1],
      ...p,
    })),
  });

  await db.juryMember.createMany({
    data: juryDefs.map((j, i) => ({ id: IDS.j[i + 1], ...j })),
  });

  await db.organizer.createMany({
    data: [
      { id: IDS.o1, firstName: "Bou3azwa", lastName: ">:)", email: "bou3azwa@mtym.ma", role: "admin" },
      { id: IDS.o2, firstName: "Yasmine", lastName: "Chraibi", email: "yasmine.chraibi@mtym.ma", role: "scientific" },
    ],
  });

  await db.juryAssignment.createMany({
    data: [
      { juryMemberId: IDS.j[1], teamId: IDS.t[1], reportType: "intermediaire" },
      { juryMemberId: IDS.j[1], teamId: IDS.t[2], reportType: "intermediaire" },
      { juryMemberId: IDS.j[2], teamId: IDS.t[3], reportType: "intermediaire" },
      { juryMemberId: IDS.j[2], teamId: IDS.t[4], reportType: "intermediaire" },
      { juryMemberId: IDS.j[3], teamId: IDS.t[5], reportType: "intermediaire" },
      { juryMemberId: IDS.j[3], teamId: IDS.t[6], reportType: "intermediaire" },
      { juryMemberId: IDS.j[4], teamId: IDS.t[7], reportType: "intermediaire" },
      { juryMemberId: IDS.j[4], teamId: IDS.t[8], reportType: "intermediaire" },
    ],
  });

  await db.criterion.createMany({ data: buildCriteria() });

  await db.workshop.createMany({
    data: [
      { id: IDS.w1, name: "Introduction à la théorie des graphes", instructor: "Pr. Amina Benkirane", capacity: 20, slot: "Samedi 10:00", tags: ["graphes", "algorithmique"] },
      { id: IDS.w2, name: "Cryptographie et sécurité", instructor: "Pr. Kamal Idrissi", capacity: 20, slot: "Samedi 14:00", tags: ["crypto", "sécurité"] },
      { id: IDS.w3, name: "Probabilités et dénombrement", instructor: "Pr. Leila Ziani", capacity: 20, slot: "Dimanche 10:00", tags: ["probas", "combinatoire"] },
    ],
  });

  await db.announcement.createMany({
    data: [
      { id: "ann-0001", title: "Bienvenue à MTYM 2026 !", body: "Nous sommes ravis de vous accueillir pour cette édition. Consultez le programme sur cette plateforme.", audience: "all", attachments: [], createdBy: IDS.o1, createdAt: "2026-05-01T09:00:00Z" },
      { id: "ann-0002", title: "Dépôt des rapports intermédiaires", body: "Le dépôt des rapports intermédiaires est ouvert. Date limite : 1er juin 2026.", audience: "participants", attachments: [], createdBy: IDS.o2, createdAt: "2026-05-05T10:00:00Z" },
    ],
  });

  await db.deadline.createMany({
    data: [
      { id: "dead-0001", label: "Rapport intermédiaire", date: "2026-06-01", targetRole: "participants" },
      { id: "dead-0002", label: "Rapport final", date: "2026-06-10", targetRole: "participants" },
      { id: "dead-0003", label: "Fiches jury", date: "2026-06-12", targetRole: "jury" },
    ],
  });

  console.log(
    "Seeded 11 teams, 33 participants, 5 jury, 2 organizers. " +
      "Pools/passages left empty — generate via the tournament optimizer.",
  );
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
