import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge, Btn, BrutalCard, FadeIn, PageHeader, PageLoading, PageMotion, SectionHeading, Segmented,
} from "@/features/shared/primitives";
import { LoadError, Picker } from "@/features/shared/widgets";
import { queryState } from "@/features/shared/queryState";
import { getAccounts } from "@/lib/repositories/accountRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import { getCenterDays } from "@/lib/repositories/centerDayRepository";
import { getOralEvaluations } from "@/lib/repositories/evaluationRepository";
import { getPools } from "@/lib/repositories/poolRepository";
import { getReportAssignments } from "@/lib/repositories/reportAssignmentRepository";
import { localDate, scoped, stages } from "@/lib/services/dashboard";
import type { Center } from "@/types";
import { CENTERS } from "@/utils/labels";
import { ActivityWidget, ChoicesWidget, DayReadiness, JurorsWidget, ProblemsWidget, StagesWidget } from "./dashboard/widgets";

// AdminDashboard — where the qualifications stand, all centers or one
// (?centre=): the next day and what it still needs, every stage's progress,
// the problems and choices of the draw, the jurors' workload
// and the latest changes, then each center in a table. The figures come from
// lib/services/dashboard.ts; the widgets from ./dashboard.

// Everything the dashboard reads, refreshed together by « Actualiser »
const DASHBOARD_QUERIES = [["teams"], ["center-days"], ["pools"], ["report-assignments"], ["oral-evaluations"], ["accounts"], ["audit-log"], ["mailings"]];

export function AdminDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => getTeams() });
  const daysQ = useQuery({ queryKey: ["center-days"], queryFn: () => getCenterDays() });
  const poolsQ = useQuery({ queryKey: ["pools"], queryFn: () => getPools() });
  // Not waited for: their widgets show a placeholder until they arrive
  const boardQ = useQuery({ queryKey: ["report-assignments"], queryFn: getReportAssignments });
  const oralQ = useQuery({ queryKey: ["oral-evaluations"], queryFn: () => getOralEvaluations() });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: () => getAccounts() });

  if (teamsQ.isLoading || daysQ.isLoading || poolsQ.isLoading) {
    return <PageLoading />;
  }
  const load = queryState(teamsQ, daysQ, poolsQ);
  if (load.failed) return <LoadError onRetry={load.retry} />;

  const teams = teamsQ.data ?? [];
  const days = daysQ.data ?? [];
  const pools = poolsQ.data ?? [];
  const centers = CENTERS.filter((c) => teams.some((t) => t.center === c.value));
  const center = centers.find((c) => c.value === params.get("centre"))?.value ?? null;
  const pick = (c: Center | "") => setParams(c ? { centre: c } : {}, { replace: true });
  const data = scoped({ teams, days, pools, board: boardQ.data, orals: oralQ.data }, center);
  const today = localDate(new Date());
  const updatedAt = new Date(Math.max(teamsQ.dataUpdatedAt, daysQ.dataUpdatedAt, poolsQ.dataUpdatedAt));
  const refreshing = [teamsQ, daysQ, poolsQ, boardQ, oralQ, accountsQ].some((q) => q.isFetching);
  const refresh = () => Promise.all(DASHBOARD_QUERIES.map((queryKey) => queryClient.invalidateQueries({ queryKey })));

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
    <PageMotion className="space-y-8">
      <PageHeader
        eyebrow="Tableau de bord"
        title="Vue d'ensemble"
        sub="Qualifications MTYM 2026 : où en est chaque centre, et ce qu'il reste à faire."
        right={
          <div className="flex gap-2">
            <Link to="/tournoi"><Btn>Gérer le tournoi</Btn></Link>
            <Link to="/jury"><Btn variant="ghost">Jury et duos</Btn></Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <Picker label="Centre">
          <Segmented
            options={[{ value: "" as Center | "", label: "Tous" }, ...centers.map((c) => ({ value: c.value as Center | "", label: c.label }))]}
            value={center ?? ""}
            onChange={pick}
          />
        </Picker>
        <div className="flex items-center gap-3 font-open text-xs" style={{ color: "var(--ink-faint)" }}>
          <span aria-live="polite">
            {refreshing ? "Mise à jour…" : `Mis à jour à ${updatedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`}
          </span>
          <Btn variant="ghost" size="sm" disabled={refreshing} onClick={refresh}>Actualiser</Btn>
        </div>
      </div>

      {/* Keyed by the filter: the widgets fade in again, and the day stepper
          starts again from the next day */}
      <FadeIn key={center ?? "all"} className="grid gap-6 xl:grid-cols-12">
        <DayReadiness data={data} today={today} className="xl:col-span-7" />
        <StagesWidget stages={stages(data, center ? `?centre=${center}` : "")} className="xl:col-span-5" />
        <ProblemsWidget data={data} className="xl:col-span-7" />
        <ChoicesWidget data={data} className="xl:col-span-5" />
        <JurorsWidget data={data} accounts={accountsQ.data} className="xl:col-span-7" />
        <ActivityWidget className="xl:col-span-5" />
      </FadeIn>

      {!center && (
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
      )}
    </PageMotion>
  );
}
