import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert, Badge, Btn, BrutalCard, PageHeader, PageLoading, PageMotion, SectionHeading, Segmented,
} from "@/features/shared/primitives";
import { ColumnFilterMenu } from "@/features/shared/ColumnFilterMenu";
import { DownloadIcon } from "@/features/shared/icons";
import { EmptyState } from "@/features/shared/widgets";
import { getCriteria } from "@/lib/repositories/criteriaRepository";
import { getOralEvaluations, getReportEvaluations } from "@/lib/repositories/evaluationRepository";
import { getFinalWeights } from "@/lib/repositories/finalWeightsRepository";
import { getPools } from "@/lib/repositories/poolRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import {
  distinctValues, filterAndSort, type ColumnFilter, type ColumnSort, type FilterColumn,
} from "@/lib/services/columnFilters";
import { errorMessage } from "@/lib/services/errors";
import { fmtNote } from "@/lib/services/gradingService";
import { passageResults, percent, teamResults, type FinalPart, type TeamResult } from "@/lib/services/results";
import type { Team } from "@/types";
import { CENTERS, centerLabel, formatDay } from "@/utils/labels";

// ResultsPage — one row per team: its notes as defender, opponent and
// reporter and for its written report, each as a % of its grid, and its
// final grade (weighted average, weights set on the Critères page).

const PARTS: { key: FinalPart; label: string }[] = [
  { key: "defender", label: "Défense" },
  { key: "opponent", label: "Opposition" },
  { key: "reporter", label: "Rapporteur" },
  { key: "report", label: "Rapport écrit" },
];

const pctText = (p: number | null) => (p === null ? "" : fmtNote(Math.round(p * 10) / 10));

const COLUMNS: FilterColumn<TeamResult>[] = [
  ...PARTS.map(({ key, label }) => ({
    key,
    label,
    value: (t: TeamResult) => percent(t.notes[key]),
    text: (t: TeamResult) => pctText(percent(t.notes[key])),
    range: true,
  })),
  { key: "final", label: "Note finale", value: (t) => t.final, text: (t) => pctText(t.final), range: true },
];

export function ResultsPage() {
  const poolsQ = useQuery({ queryKey: ["pools"], queryFn: () => getPools() });
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => getTeams() });
  const criteriaQ = useQuery({ queryKey: ["criteria"], queryFn: getCriteria });
  const oralQ = useQuery({ queryKey: ["oral-evaluations"], queryFn: () => getOralEvaluations() });
  const reportQ = useQuery({ queryKey: ["report-evaluations"], queryFn: () => getReportEvaluations() });
  const weightsQ = useQuery({ queryKey: ["final-weights"], queryFn: getFinalWeights });
  const [center, setCenter] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  if ([poolsQ, teamsQ, criteriaQ, oralQ, reportQ, weightsQ].some((q) => q.isLoading)) return <PageLoading />;

  const pools = poolsQ.data ?? [];
  const weights = weightsQ.data ?? { defender: 9, opponent: 3, reporter: 2, report: 5 };
  const teams = teamResults(passageResults(pools, criteriaQ.data ?? [], oralQ.data ?? [], reportQ.data ?? []), weights);
  const teamById = new Map((teamsQ.data ?? []).map((t) => [t.id, t]));
  const centers = CENTERS.filter((c) => pools.some((p) => p.centerDay?.center === c.value));
  const selected = center ?? centers[0]?.value ?? null;

  const byDay = new Map<string, TeamResult[]>();
  for (const t of teams.filter((t) => t.pool.centerDay?.center === selected)) {
    const key = t.pool.centerDay!.date;
    byDay.set(key, [...(byDay.get(key) ?? []), t]);
  }

  const exportXlsx = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const { exportGradesXlsx } = await import("@/lib/services/exportService");
      await exportGradesXlsx();
    } catch (err) {
      setExportError(errorMessage(err, "Export impossible."));
    } finally {
      setExporting(false);
    }
  };

  return (
    <PageMotion className="space-y-10">
      <PageHeader
        eyebrow="Administration"
        title="Résultats"
        sub={`Notes en % de leur grille. Note finale : moyenne pondérée (Défense ${weights.defender}, Opposition ${weights.opponent}, Rapporteur ${weights.reporter}, Rapport écrit ${weights.report}, coefficients réglables dans Critères), calculée quand les quatre notes sont saisies.`}
        right={
          <Btn onClick={exportXlsx} disabled={exporting}>
            <DownloadIcon size={15} /> {exporting ? "Export…" : "Exporter (xlsx)"}
          </Btn>
        }
      />
      {exportError && <Alert>{exportError}</Alert>}

      {!selected ? (
        <EmptyState title="Aucune poule" sub="Les résultats apparaîtront une fois les poules tirées et notées." />
      ) : (
        <>
          <Segmented options={centers.map((c) => ({ value: c.value, label: c.label }))} value={selected} onChange={setCenter} />
          {[...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, dayTeams]) => (
            <DayResults
              key={`${selected}-${date}`}
              title={`${centerLabel(dayTeams[0].pool.centerDay!.center)} · ${formatDay(date)}`}
              teams={dayTeams}
              teamById={teamById}
            />
          ))}
        </>
      )}
    </PageMotion>
  );
}

function DayResults({ title, teams, teamById }: { title: string; teams: TeamResult[]; teamById: Map<string, Team> }) {
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({});
  const [sort, setSort] = useState<ColumnSort>(null);
  const quad = (t: TeamResult) => teamById.get(t.teamId)?.quadrigram ?? "";
  const ordered = [...teams].sort((a, b) => a.pool.label.localeCompare(b.pool.label, "fr", { numeric: true }) || quad(a).localeCompare(quad(b)));
  const shown = filterAndSort(ordered, COLUMNS, filters, sort);
  const narrowed = shown.length < teams.length || sort !== null;
  const clear = () => { setFilters({}); setSort(null); };

  return (
    <section>
      <SectionHeading
        title={title}
        right={narrowed && (
          <div className="flex items-center gap-2">
            <Badge tone="saffron">{shown.length}/{teams.length} équipes</Badge>
            <Btn variant="ghost" size="sm" onClick={clear}>Effacer les filtres</Btn>
          </div>
        )}
      />
      <BrutalCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="brutal-table">
            <thead>
              <tr>
                <th>Équipe</th>
                <th>Poule</th>
                {COLUMNS.map((c) => {
                  const final = c.key === "final";
                  return (
                    <th
                      key={c.key}
                      style={final ? { background: "var(--saffron)", color: "var(--forest)", borderRight: "none" } : undefined}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>{c.label}</span>
                        <ColumnFilterMenu
                          label={c.label}
                          values={distinctValues(teams, c)}
                          filter={filters[c.key]}
                          onFilter={(f) => setFilters((all) => ({ ...all, [c.key]: f }))}
                          sort={sort?.key === c.key ? sort.dir : null}
                          onSort={(dir) => setSort(dir ? { key: c.key, dir } : null)}
                          range
                          emptyLabel="(Non noté)"
                          align={c.key === "report" || final ? "right" : "left"}
                          tone={final ? "light" : "dark"}
                        />
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => {
                const team = teamById.get(t.teamId);
                return (
                  <tr key={t.teamId}>
                    <td>
                      <div className="font-mont" style={{ color: "var(--forest)", fontWeight: 900, letterSpacing: "0.05em" }}>{team?.quadrigram ?? "?"}</div>
                      <div className="font-open text-xs" style={{ color: "var(--ink-soft)" }}>{team?.name}</div>
                    </td>
                    <td className="font-mont text-xs" style={{ color: "var(--ink-soft)", fontWeight: 800 }}>{t.pool.label}</td>
                    {PARTS.map(({ key }) => {
                      const set = t.notes[key];
                      const p = percent(set);
                      return (
                        <td
                          key={key}
                          className="font-mont tabular-nums"
                          title={set?.average != null ? `${fmtNote(set.average)} / ${set.max}` : undefined}
                        >
                          {p === null ? <span style={{ color: "var(--ink-faint)" }}>—</span> : (
                            <span style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
                              {pctText(p)}<span className="text-micro" style={{ color: "var(--ink-faint)" }}> %</span>
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="final-cell font-mont tabular-nums" style={{ borderRight: "none" }}>
                      {t.final === null ? <span style={{ color: "var(--ink-faint)" }}>—</span> : (
                        <span style={{ color: "var(--forest)", fontWeight: 900, fontSize: "0.95rem" }}>
                          {pctText(t.final)}<span className="text-micro"> %</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ borderRight: "none" }}>
                    <div className="py-4 flex items-center justify-center gap-3 flex-wrap">
                      <span className="font-open text-sm italic" style={{ color: "var(--ink-faint)" }}>
                        Aucune équipe ne correspond aux filtres.
                      </span>
                      <Btn variant="ghost" size="sm" onClick={clear}>Effacer les filtres</Btn>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </BrutalCard>
    </section>
  );
}
