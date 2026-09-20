import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { BrutalCard, PageLoading } from "@/features/shared/primitives";
import { useSession } from "@/features/shared/SessionContext";
import { getCriteria } from "@/lib/repositories/criteriaRepository";
import type { PassageDetails, PoolDetails, Team } from "@/types";
import { DEFAULT_SCHEDULE } from "@/utils/schedule";
import { useJuryGuide } from "./guide/useJuryGuide";
import { PassageView } from "./PassagePage";
import type { PassageData } from "./passageContext";

// The guide's practice passage: fictional teams, the real grading grids,
// the same screen as a real passage — and nothing is loaded from or sent to
// the API (practice mode of OralGrading / ReportGrading). Part 2 of the
// guided tour runs here (?guide=1).

const DAY = { id: "practice-day", center: "casablanca" as const, date: new Date().toISOString().slice(0, 10), schedule: DEFAULT_SCHEDULE };

const team = (id: string, quadrigram: string, name: string, reports: Team["reports"] = []): Team => ({
  id,
  sourceId: 0,
  name,
  quadrigram,
  center: "casablanca",
  members: [],
  centerDayId: DAY.id,
  reports,
});

const TEAMS = [
  team("practice-alfa", "ALFA", "Équipe Alfa (fictive)", [{ id: "practice-report", problemNumber: 2 }]),
  team("practice-beta", "BETA", "Équipe Beta (fictive)"),
  team("practice-gama", "GAMA", "Équipe Gama (fictive)"),
  team("practice-delt", "DELT", "Équipe Delta (fictive)"),
];

const PARTNER = { id: "practice-partner", firstName: "Votre", lastName: "binôme", email: "" };

export function PracticePage() {
  const { user } = useSession();
  const [params] = useSearchParams();
  const criteriaQ = useQuery({ queryKey: ["criteria"], queryFn: getCriteria });
  useJuryGuide("practice", !criteriaQ.isLoading && params.get("guide") === "1", user?.id);

  if (criteriaQ.isLoading) return <PageLoading />;

  const pool: PoolDetails = { id: "practice-pool", label: "ENTR-A1", round: 1, centerDayId: DAY.id, centerDay: DAY, passages: [] };
  const passage: PassageDetails & { pool: PoolDetails } = {
    id: "practice-passage",
    label: "ENTR-A1P1",
    slot: 1,
    problemNumber: 2,
    poolId: pool.id,
    defenderTeamId: "practice-alfa",
    opponentTeamId: "practice-beta",
    reporterTeamId: "practice-gama",
    extraTeamId: "practice-delt",
    room: "Amphi A",
    duo: { id: "practice-duo", centerDayId: DAY.id, number: 1, members: [PARTNER] },
    pool,
  };
  const data: PassageData = {
    passage,
    teamById: new Map(TEAMS.map((t) => [t.id, t])),
    criteria: criteriaQ.data ?? [],
    refresh: async () => undefined,
    practice: true,
  };

  return (
    <PassageView
      data={data}
      coJurors="Votre binôme"
      banner={
        <BrutalCard withCorners={false} className="px-5 py-3" style={{ borderColor: "var(--saffron-dark)", boxShadow: "2px 2px 0 0 var(--saffron-dark)" }}>
          <span className="font-mont text-tiny uppercase tracking-widest" style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
            Passage d'entraînement
          </span>
          <span className="font-open text-sm ml-2" style={{ color: "var(--ink)" }}>
            Les équipes sont fictives et rien n'est enregistré : essayez librement.
          </span>
        </BrutalCard>
      }
    />
  );
}
