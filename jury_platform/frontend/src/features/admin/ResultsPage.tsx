import type { ReactNode } from "react";
import { Alert, Badge, BrutalCard, PageHeader, PageLoading, PageMotion, SectionHeading } from "@/features/shared/primitives";
import { ColumnFilterMenu, FilterSummary, NoMatchRow } from "@/features/shared/ColumnFilterMenu";
import { useColumnFilters } from "@/features/shared/useColumnFilters";
import { GridIcon } from "@/features/shared/icons";
import { EmptyState, LoadError } from "@/features/shared/widgets";
import { queryState } from "@/features/shared/queryState";
import type { FilterColumn } from "@/lib/services/columnFilters";
import { frNote } from "@/lib/services/gradingService";
import { FINAL_PART_LABELS, FINAL_PARTS, percent, teamResults, type TeamResult, type WrittenNote } from "@/lib/services/results";
import { standings } from "@/lib/services/standings";
import type { Team } from "@/types";
import { CENTERS, centerLabel } from "@/utils/labels";
import { ExportButton } from "./ExportButton";
import { JurorAgreement } from "./results/JurorAgreement";
import { OralWritten } from "./results/OralWritten";
import { ProblemStats } from "./results/ProblemStats";
import { Rankings } from "./results/Rankings";
import { ResultsStats } from "./results/ResultsStats";
import { useExport } from "./useExport";
import { useGradedPassages } from "./useGradedPassages";

// ResultsPage — the statistics of the final grades (results/ResultsStats)
// and of each problem (results/ProblemStats), the oral against the written
// report (results/OralWritten), how far apart the jurors of a duo grade
// (results/JurorAgreement), the three rankings (results/Rankings), then one
// table of every drawn team, all centers together: its notes as defender,
// opponent and reporter and for its written reports, each as a % of its
// grid, and its final grade (weighted average, weights set on the Critères
// page). Filters per column, the center included. The page is several
// screens long: a row of chips under its title jumps to each part.

const pctText = (p: number | null) => (p === null ? "" : frNote(Math.round(p * 10) / 10));
const centerText = (t: TeamResult) => (t.pool.centerDay ? centerLabel(t.pool.centerDay.center) : "");
const centerRank = (t: TeamResult) => CENTERS.findIndex((c) => c.value === t.pool.centerDay?.center);

const CENTER_COLUMN: FilterColumn<TeamResult> = { key: "center", label: "Centre", value: centerText, text: centerText };

// The page's parts, in order, as the chips name them
const PARTS = {
  finals: "Notes finales",
  problems: "Par problème",
  halves: "Oral et écrit",
  jurors: "Accord entre jurés",
  rankings: "Classements",
  teams: "Toutes les équipes",
};
type PartKey = keyof typeof PARTS;
const partId = (key: PartKey) => `resultats-${key}`;

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
  const { queries, teams, weights, results, written, criteria, report } = useGradedPassages();
  const exporter = useExport(async () => (await import("@/lib/services/exportService")).exportGradesXlsx());

  const load = queryState(...queries);
  if (load.loading) return <PageLoading />;
  if (load.failed) return <LoadError onRetry={load.retry} />;

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const rows = teamResults(results, weights, written);
  const ranked = standings(rows, weights);

  return (
    <PageMotion className="space-y-10">
      <PageHeader eyebrow="Administration" title="Résultats" right={<ExportButton {...exporter} />} />
      {exporter.error && <Alert>{exporter.error}</Alert>}

      {rows.length === 0 ? (
        <EmptyState icon={GridIcon} title="Aucune poule" sub="Les résultats apparaîtront une fois les poules tirées et notées." />
      ) : (
        <>
          <Jumps />
          <Part id="finals"><ResultsStats rows={rows} teamById={teamById} /></Part>
          <Part id="problems"><ProblemStats results={results} teams={teams} criteria={criteria} report={report} /></Part>
          <Part id="halves"><OralWritten list={ranked} weights={weights} teamById={teamById} /></Part>
          <Part id="jurors"><JurorAgreement results={results} teamById={teamById} /></Part>
          <Part id="rankings"><Rankings list={ranked} teamById={teamById} /></Part>
          <Part id="teams"><ResultsTable teams={rows} teamById={teamById} written={written} /></Part>
        </>
      )}
    </PageMotion>
  );
}

// One part of the page, where a chip can jump to: it stops under the top bar,
// and takes the focus so the keyboard goes on from there
function Part({ id, children }: { id: PartKey; children: ReactNode }) {
  return <div id={partId(id)} tabIndex={-1} className="scroll-mt-24" style={{ outline: "none" }}>{children}</div>;
}

function Jumps() {
  const jump = (key: PartKey) => {
    const part = document.getElementById(partId(key));
    if (!part) return;
    // At once: gliding past thousands of pixels of charts takes over a second
    part.scrollIntoView({ block: "start" });
    part.focus({ preventScroll: true });
  };
  return (
    <nav aria-label="Parties de la page" className="flex flex-wrap items-center gap-2">
      <span className="font-mont text-micro uppercase tracking-widest mr-1" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>Aller à</span>
      {(Object.keys(PARTS) as PartKey[]).map((key) => (
        <button key={key} type="button" onClick={() => jump(key)} className="jump-chip px-2.5 py-2 sm:py-1.5 font-mont text-micro uppercase tracking-widest" style={{ fontWeight: 800 }}>
          {PARTS[key]}
        </button>
      ))}
    </nav>
  );
}

// Centers in their usual order, then pools, then teams
function ResultsTable({
  teams,
  teamById,
  written,
}: {
  teams: TeamResult[];
  teamById: Map<string, Team>;
  written: Map<string, WrittenNote>;
}) {
  const quad = (t: TeamResult) => teamById.get(t.teamId)?.quadrigram ?? "";
  const teamText = (t: TeamResult) => {
    const team = teamById.get(t.teamId);
    return team ? `${team.quadrigram} (${team.name})` : "";
  };
  const teamColumn: FilterColumn<TeamResult> = { key: "team", label: "Équipe", value: teamText, text: teamText };
  const ordered = [...teams].sort((a, b) =>
    centerRank(a) - centerRank(b)
    || a.pool.label.localeCompare(b.pool.label, "fr", { numeric: true })
    || quad(a).localeCompare(quad(b)));
  const { shown, narrowed, clear, menuProps } = useColumnFilters(ordered, [teamColumn, CENTER_COLUMN, ...COLUMNS]);

  return (
    <section>
      <SectionHeading
        title="Toutes les équipes"
        right={narrowed
          ? <FilterSummary shown={shown.length} total={teams.length} unit="équipes" onClear={clear} />
          : <Badge tone="neutral">{teams.length} équipes</Badge>}
      />
      <BrutalCard className="overflow-hidden">
        <div className="table-scroll">
          <table className="brutal-table">
            <thead>
              <tr>
                <th>
                  <div className="flex items-center justify-between gap-2">
                    <span>{teamColumn.label}</span>
                    <ColumnFilterMenu {...menuProps(teamColumn)} emptyLabel="(Aucune)" align="left" sortKind="text" />
                  </div>
                </th>
                <th>
                  <div className="flex items-center justify-between gap-2">
                    <span>{CENTER_COLUMN.label}</span>
                    <ColumnFilterMenu {...menuProps(CENTER_COLUMN)} emptyLabel="(Aucun)" align="left" sortKind="text" />
                  </div>
                </th>
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
                    <td className="font-open text-xs">{centerText(t)}</td>
                    <td className="font-mont text-xs" style={{ color: "var(--ink-soft)", fontWeight: 800 }}>{t.pool.label}</td>
                    {FINAL_PARTS.map((key) => {
                      const set = t.notes[key];
                      const p = percent(set);
                      return (
                        <td
                          key={key}
                          className="font-mont tabular-nums"
                          title={set?.average != null ? `${frNote(set.average)} / ${set.max}` : undefined}
                        >
                          {p === null ? <Pending /> : (
                            <span style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
                              {pctText(p)}<span className="text-micro" style={{ color: "var(--ink-faint)" }}> %</span>
                            </span>
                          )}
                          {key === "report" && <WrittenProgress note={written.get(t.teamId)} />}
                        </td>
                      );
                    })}
                    <td className="final-cell font-mont tabular-nums" style={{ borderRight: "none" }}>
                      {t.final === null ? <Pending /> : (
                        <span style={{ color: "var(--forest)", fontWeight: 900, fontSize: "0.95rem" }}>
                          {pctText(t.final)}<span className="text-micro"> %</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && <NoMatchRow colSpan={8} label="Aucune équipe ne correspond aux filtres." onClear={clear} />}
            </tbody>
          </table>
        </div>
      </BrutalCard>
    </section>
  );
}

// A note that isn't there yet
function Pending() {
  return <span className="font-open text-micro" style={{ color: "var(--ink-faint)", fontWeight: 400 }}>en attente</span>;
}

// Under the written-report note: once grading has started, how many of the
// team's reports are graded (the note moves until they all are), and which
// ones it never submitted (counted 0)
function WrittenProgress({ note }: { note: WrittenNote | undefined }) {
  if (!note) return null;
  const parts = [
    ...(note.graded > 0 && note.graded < note.submitted ? [`${note.graded}/${note.submitted} rapports notés`] : []),
    ...(note.missing.length > 0 ? [`${note.missing.map((p) => `P${p}`).join(", ")} non déposé${note.missing.length > 1 ? "s" : ""} (0)`] : []),
  ];
  if (parts.length === 0) return null;
  return (
    <div className="font-open text-micro mt-0.5" style={{ color: "var(--ink-faint)" }}>
      {parts.join(", ")}
    </div>
  );
}
