import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge, Btn, BrutalCard, PageHeader, PageLoading, PageMotion, SectionHeading, Stagger } from "@/features/shared/primitives";
import { EmptyState, RoleChip, StatCard } from "@/features/shared/widgets";
import { useSession } from "@/features/shared/SessionContext";
import { getOralEvaluations, getReportEvaluations } from "@/lib/repositories/evaluationRepository";
import { getPools } from "@/lib/repositories/poolRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import type { PassageDetails, PoolDetails } from "@/types";
import { centerLabel, formatDay } from "@/utils/labels";

// JuryDashboard — the passages the juror's duo judges, by day and pool,
// with what is already graded.

export function JuryDashboard() {
  const { user } = useSession();
  const poolsQ = useQuery({ queryKey: ["pools"], queryFn: () => getPools() });
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => getTeams() });
  const oralQ = useQuery({ queryKey: ["oral-evaluations"], queryFn: () => getOralEvaluations() });
  const reportQ = useQuery({ queryKey: ["report-evaluations"], queryFn: () => getReportEvaluations() });

  if (poolsQ.isLoading || teamsQ.isLoading || oralQ.isLoading || reportQ.isLoading) return <PageLoading />;

  const teamById = new Map((teamsQ.data ?? []).map((t) => [t.id, t]));
  const mine = (p: PassageDetails) => Boolean(p.duo?.members.some((m) => m.id === user?.id));
  const pools = (poolsQ.data ?? [])
    .map((pool) => ({ ...pool, passages: pool.passages.filter(mine) }))
    .filter((pool) => pool.passages.length > 0);
  const passages = pools.flatMap((p) => p.passages);

  const oralDone = (p: PassageDetails) => (oralQ.data ?? []).filter((e) => e.passageId === p.id).length;
  const reportDone = (p: PassageDetails) =>
    (reportQ.data ?? []).some((e) => e.teamId === p.defenderTeamId && e.problemNumber === p.problemNumber);

  // Days in chronological order, each with its pools
  const byDay = new Map<string, PoolDetails[]>();
  for (const pool of pools) {
    const key = pool.centerDay ? `${pool.centerDay.date}|${pool.centerDay.center}` : "|";
    byDay.set(key, [...(byDay.get(key) ?? []), pool]);
  }

  return (
    <PageMotion className="space-y-10">
      <PageHeader
        eyebrow="Jury"
        title={`Bonjour ${user?.firstName ?? ""}`}
        sub="Les passages que votre duo juge : notez l'oral (les trois rôles) et le rapport écrit du défenseur."
      />

      {passages.length === 0 ? (
        <EmptyState title="Aucun passage pour l'instant" sub="Les organisateurs ne vous ont pas encore attribué de passage." />
      ) : (
        <>
          <Stagger className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <StatCard label="Passages" value={passages.length} />
            <StatCard
              label="Oraux notés"
              value={passages.reduce((s, p) => s + oralDone(p), 0)}
              denom={passages.length * 3}
              progressColor="var(--sage)"
            />
            <StatCard
              label="Rapports notés"
              value={passages.filter(reportDone).length}
              denom={passages.length}
              progressColor="var(--forest-soft)"
            />
          </Stagger>

          {[...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, dayPools]) => {
            const day = dayPools[0].centerDay;
            return (
              <section key={key}>
                <SectionHeading title={day ? `${centerLabel(day.center)} · ${formatDay(day.date)}` : "Passages"} />
                <div className="space-y-4">
                  {dayPools.flatMap((pool) =>
                    pool.passages.map((p) => {
                      const quad = (id: string) => teamById.get(id)?.quadrigram ?? "—";
                      const done = oralDone(p);
                      return (
                        <BrutalCard key={p.id} className="p-4">
                          <div className="flex items-center gap-4 flex-wrap">
                            <div style={{ minWidth: 150 }}>
                              <div className="font-mont" style={{ color: "var(--forest)", fontWeight: 900 }}>Poule {pool.label}</div>
                              <div className="font-mont text-micro uppercase tracking-widest" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
                                {p.label}{p.timeSlot ? ` · ${p.timeSlot}` : ""}{p.room ? ` · ${p.room}` : ""}
                              </div>
                            </div>
                            <Badge tone="dark">P{p.problemNumber}</Badge>
                            <div className="flex gap-1.5 flex-wrap">
                              {(["defender", "opponent", "reporter"] as const).map((role) => (
                                <RoleChip key={role} role={role} quad={quad(p[`${role}TeamId`])} />
                              ))}
                            </div>
                            <div className="flex items-center gap-2 ml-auto flex-wrap">
                              <Link to={`/passages/${p.id}`}>
                                <Btn size="sm" variant={done === 3 ? "ghost" : "primary"}>Oral · {done}/3</Btn>
                              </Link>
                              <Link to={`/passages/${p.id}?onglet=rapport`}>
                                <Btn size="sm" variant={reportDone(p) ? "ghost" : "forest"}>Rapport · {reportDone(p) ? "✓" : "à noter"}</Btn>
                              </Link>
                            </div>
                          </div>
                        </BrutalCard>
                      );
                    }),
                  )}
                </div>
              </section>
            );
          })}
        </>
      )}
    </PageMotion>
  );
}
