import { PrismaClient, Prisma } from "@prisma/client";

const db = new PrismaClient();

// Default grading grid: one report grid per problem (1..4) and one oral grid
// per graded role. Admins edit it from the criteria page afterwards.
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

// Idempotent: never touches an existing grid, since grades reference
// criterion ids and wiping them would orphan every saved grade.
async function main() {
  const existing = await db.criterion.count();
  if (existing > 0) {
    console.log(`Criteria already present (${existing}) — nothing seeded.`);
    return;
  }
  const { count } = await db.criterion.createMany({ data: buildCriteria() });
  console.log(`Seeded ${count} criteria.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
