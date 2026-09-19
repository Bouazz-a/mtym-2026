import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Badge, BrutalCard, PageHeader, PageLoading, PageMotion, Segmented } from "@/features/shared/primitives";
import { EmptyState } from "@/features/shared/widgets";
import { useSession } from "@/features/shared/SessionContext";
import { getCriteria } from "@/lib/repositories/criteriaRepository";
import { getPassage } from "@/lib/repositories/poolRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import { centerLabel, formatDay } from "@/utils/labels";
import { OralGrading } from "./OralGrading";
import { ReportGrading } from "./ReportGrading";
import type { PassageData } from "./passageContext";

// A passage the juror's duo judges: its header and info, then two tabs —
// the oral grading (three roles) and the written report.
//
// The tab lives in the query string (?onglet=rapport) and is switched with
// history *replace*, like the center picker of the Tournoi page: switching
// neither reloads the page nor stacks history entries, so Back returns to
// "Mes passages". Both tabs stay mounted (the other one hidden) so grades
// typed but not saved yet survive a switch.

type Tab = "oral" | "rapport";

export function PassagePage() {
  const { passageId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("onglet") === "rapport" ? "rapport" : "oral";
  const setTab = (t: Tab) => setParams(t === "rapport" ? { onglet: "rapport" } : {}, { replace: true });

  const { user } = useSession();
  const queryClient = useQueryClient();
  const passageQ = useQuery({ queryKey: ["passage", passageId], queryFn: () => getPassage(passageId), retry: false });
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => getTeams() });
  const criteriaQ = useQuery({ queryKey: ["criteria"], queryFn: getCriteria });

  if (passageQ.isError) {
    return <EmptyState title="Passage introuvable" sub="Ce passage n'est pas jugé par votre duo." action={<BackLink />} />;
  }
  if (passageQ.isLoading || teamsQ.isLoading || criteriaQ.isLoading) return <PageLoading />;

  const passage = passageQ.data!;
  const teamById = new Map((teamsQ.data ?? []).map((t) => [t.id, t]));
  const coJurors = passage.duo?.members.filter((m) => m.id !== user?.id) ?? [];
  const day = passage.pool.centerDay;
  const data: PassageData = {
    passage,
    teamById,
    criteria: criteriaQ.data ?? [],
    refresh: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ["oral-evaluations"] }),
      queryClient.invalidateQueries({ queryKey: ["report-evaluations"] }),
    ]),
  };

  return (
    <PageMotion className="space-y-8">
      <BackLink />
      <PageHeader
        eyebrow={day ? `${centerLabel(day.center)} · ${formatDay(day.date)} · Poule ${passage.pool.label}` : `Poule ${passage.pool.label}`}
        title={`Passage ${passage.label}`}
        sub="Vos notes ne sont visibles que par l'administration."
        right={<Badge tone="dark">Problème {passage.problemNumber}</Badge>}
      />

      <BrutalCard className="overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px" style={{ background: "var(--border)" }}>
          <InfoCell label="Horaire" value={passage.timeSlot ?? "—"} />
          <InfoCell label="Salle" value={passage.room ?? "—"} />
          <InfoCell label="Avec" value={coJurors.map((j) => `${j.firstName} ${j.lastName}`).join(", ") || "—"} />
          <InfoCell label="Observateur" value={passage.extraTeamId ? teamById.get(passage.extraTeamId)?.quadrigram ?? "—" : "—"} />
        </div>
      </BrutalCard>

      <Segmented
        options={[
          { value: "oral", label: "Oral" },
          { value: "rapport", label: "Rapport écrit" },
        ]}
        value={tab}
        onChange={setTab}
      />

      <div hidden={tab !== "oral"}><OralGrading {...data} /></div>
      <div hidden={tab !== "rapport"}><ReportGrading {...data} /></div>
    </PageMotion>
  );
}

function BackLink() {
  return (
    <Link to="/" className="font-mont text-tiny uppercase tracking-widest inline-flex items-center gap-1.5" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
      ← Mes passages
    </Link>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3" style={{ background: "var(--surface)" }}>
      <div className="font-mont text-micro uppercase tracking-widest mb-1" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
        {label}
      </div>
      <div className="font-mont text-sm" style={{ color: "var(--forest)", fontWeight: 900 }}>{value}</div>
    </div>
  );
}
