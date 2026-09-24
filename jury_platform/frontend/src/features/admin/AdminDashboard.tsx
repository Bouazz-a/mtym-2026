import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Badge, Btn, BrutalCard, PageHeader, PageLoading, PageMotion, SectionHeading, Stagger,
} from "@/features/shared/primitives";
import { StatCard } from "@/features/shared/widgets";
import { getTeams } from "@/lib/repositories/teamRepository";
import { getCenterDays } from "@/lib/repositories/centerDayRepository";
import { getPools } from "@/lib/repositories/poolRepository";
import { CENTERS } from "@/utils/labels";

// AdminDashboard — where every center stands: days, team placement, draws,
// jurors, and the final reports received so far.

export function AdminDashboard() {
  const navigate = useNavigate();
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => getTeams() });
  const daysQ = useQuery({ queryKey: ["center-days"], queryFn: () => getCenterDays() });
  const poolsQ = useQuery({ queryKey: ["pools"], queryFn: () => getPools() });

  if (teamsQ.isLoading || daysQ.isLoading || poolsQ.isLoading) {
    return <PageLoading />;
  }

  const teams = teamsQ.data ?? [];
  const days = daysQ.data ?? [];
  const pools = poolsQ.data ?? [];
  const placed = teams.filter((t) => t.centerDayId).length;
  const passages = pools.flatMap((p) => p.passages);
  const withDuo = passages.filter((p) => p.duo).length;

  const rows = CENTERS.map((c) => {
    const centerTeams = teams.filter((t) => t.center === c.value);
    const centerPools = pools.filter((p) => p.centerDay?.center === c.value);
    const centerPassages = centerPools.flatMap((p) => p.passages);
    return {
      ...c,
      teams: centerTeams.length,
      days: days.filter((d) => d.center === c.value).length,
      withoutDay: centerTeams.filter((t) => !t.centerDayId).length,
      pools: centerPools.length,
      passages: centerPassages.length,
      withDuo: centerPassages.filter((p) => p.duo).length,
      withReport: centerTeams.filter((t) => t.reports.length > 0).length,
    };
  }).filter((r) => r.teams > 0);

  return (
    <PageMotion className="space-y-10">
      <PageHeader
        eyebrow="Tableau de bord"
        title="Vue d'ensemble"
        sub="Qualifications MTYM 2026 : état de chaque centre."
        right={
          <div className="flex gap-2">
            <Link to="/tournoi"><Btn>Gérer le tournoi</Btn></Link>
            <Link to="/jury"><Btn variant="ghost">Jury et duos</Btn></Link>
          </div>
        }
      />

      <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Équipes qualifiées" value={teams.length} />
        <StatCard label="Équipes placées" value={placed} denom={teams.length || undefined} progressColor="var(--sage)" />
        <StatCard label="Poules" value={pools.length} progressColor="var(--forest-soft)" />
        <StatCard
          label="Passages avec un duo"
          value={withDuo}
          denom={passages.length || undefined}
          highlight={passages.length > 0 && withDuo === passages.length}
        />
      </Stagger>

      <section>
        <SectionHeading title="Centres" />
        <BrutalCard className="overflow-hidden">
          <div className="table-scroll">
            <table className="brutal-table">
              <thead>
                <tr>
                  <th>Centre</th>
                  <th style={{ textAlign: "center" }}>Équipes</th>
                  <th style={{ textAlign: "center" }}>Jours</th>
                  <th>Placement</th>
                  <th style={{ textAlign: "center" }}>Poules</th>
                  <th>Duos</th>
                  <th style={{ borderRight: "none" }}>Rapports finaux</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.value}
                    className="row-clickable"
                    tabIndex={0}
                    onClick={() => navigate(`/tournoi?centre=${r.value}`)}
                    onKeyDown={(e) => { if (e.key === "Enter") navigate(`/tournoi?centre=${r.value}`); }}
                  >
                    <td className="font-mont" style={{ color: "var(--forest)", fontWeight: 900 }}>{r.label}</td>
                    <td style={{ textAlign: "center" }} className="font-mont">{r.teams}</td>
                    <td style={{ textAlign: "center" }} className="font-mont">{r.days || "—"}</td>
                    <td>
                      {r.withoutDay === 0
                        ? <Badge tone="sage">Toutes placées</Badge>
                        : <Badge tone="saffron">{r.withoutDay} sans jour</Badge>}
                    </td>
                    <td style={{ textAlign: "center" }} className="font-mont">{r.pools || "—"}</td>
                    <td>
                      {r.passages === 0
                        ? <span style={{ color: "var(--ink-faint)" }}>—</span>
                        : <Badge tone={r.withDuo === r.passages ? "sage" : "saffron"}>{r.withDuo}/{r.passages} passages</Badge>}
                    </td>
                    <td style={{ borderRight: "none" }}>
                      <Badge tone={r.withReport === r.teams ? "sage" : "neutral"}>{r.withReport}/{r.teams} équipes</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </BrutalCard>
      </section>
    </PageMotion>
  );
}
