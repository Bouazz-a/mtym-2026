import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert, BrutalCard, PageHeader, PageLoading, PageMotion, SectionHeading, Segmented,
} from "@/features/shared/primitives";
import { ColumnFilterMenu, FilterSummary, NoMatchRow } from "@/features/shared/ColumnFilterMenu";
import { useColumnFilters } from "@/features/shared/useColumnFilters";
import { EmptyState } from "@/features/shared/widgets";
import { getFinalWeights } from "@/lib/repositories/finalWeightsRepository";
import type { FilterColumn } from "@/lib/services/columnFilters";
import { fmtNote } from "@/lib/services/gradingService";
import {
  centersWithPools, daysOfCenter, FINAL_PART_LABELS, FINAL_PARTS, percent, teamResults, type TeamResult,
} from "@/lib/services/results";
import type { Center, Team } from "@/types";
import { centerLabel, formatDay } from "@/utils/labels";
import { ExportButton } from "./ExportButton";
import { useExport } from "./useExport";
import { useGradedPassages } from "./useGradedPassages";

// ResultsPage — one row per team: its notes as defender, opponent and
// reporter and for its written report, each as a % of its grid, and its
// final grade (weighted average, weights set on the Critères page).

const pctText = (p: number | null) => (p === null ? "" : fmtNote(Math.round(p * 10) / 10));

const COLUMNS: FilterColumn<TeamResult>[] = [
  ...FINAL_PARTS.map((key) => ({
    key,
    label: FINAL_PART_LABELS[key],
    value: (t: TeamResult) => percent(t.notes[key]),
    text: (t: TeamResult) => pctText(percent(t.notes[key])),
    range: true,
  })),
  { key: "final", label: "Note finale", value: (t) => t.final, text: (t) => pctText(t.final), range: true },
];

export function ResultsPage() {
  const { isLoading, pools, teams, results } = useGradedPassages();
  const weightsQ = useQuery({ queryKey: ["final-weights"], queryFn: getFinalWeights });
  const [center, setCenter] = useState<Center | null>(null);
  const exporter = useExport(async () => (await import("@/lib/services/exportService")).exportGradesXlsx());

  if (isLoading || weightsQ.isLoading) return <PageLoading />;

  const weights = weightsQ.data ?? { defender: 9, opponent: 3, reporter: 2, report: 5 };
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const centers = centersWithPools(pools);
  const selected = center ?? centers[0]?.value ?? null;

  return (
    <PageMotion className="space-y-10">
      <PageHeader
        eyebrow="Administration"
        title="Résultats"
        sub={`Notes en % de leur grille. Note finale : moyenne pondérée (${FINAL_PARTS.map((k) => `${FINAL_PART_LABELS[k]} ${weights[k]}`).join(", ")}, coefficients réglables dans Critères), calculée quand les quatre notes sont saisies.`}
        right={<ExportButton {...exporter} />}
      />
      {exporter.error && <Alert>{exporter.error}</Alert>}

      {!selected ? (
        <EmptyState title="Aucune poule" sub="Les résultats apparaîtront une fois les poules tirées et notées." />
      ) : (
        <>
          <Segmented options={centers} value={selected} onChange={setCenter} />
          {daysOfCenter(teamResults(results, weights), selected).map(([date, dayTeams]) => (
            <DayResults
              key={`${selected}-${date}`}
              title={`${centerLabel(selected)} · ${formatDay(date)}`}
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
  const quad = (t: TeamResult) => teamById.get(t.teamId)?.quadrigram ?? "";
  const ordered = [...teams].sort((a, b) => a.pool.label.localeCompare(b.pool.label, "fr", { numeric: true }) || quad(a).localeCompare(quad(b)));
  const { shown, narrowed, clear, menuProps } = useColumnFilters(ordered, COLUMNS);

  return (
    <section>
      <SectionHeading
        title={title}
        right={narrowed && (
          <div className="flex items-center gap-2">
            <FilterSummary shown={shown.length} total={teams.length} unit="équipes" onClear={clear} />
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
                          {...menuProps(c)}
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
                    {FINAL_PARTS.map((key) => {
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
              {shown.length === 0 && <NoMatchRow colSpan={7} label="Aucune équipe ne correspond aux filtres." onClear={clear} />}
            </tbody>
          </table>
        </div>
      </BrutalCard>
    </section>
  );
}
