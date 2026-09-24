import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Badge, BrutalCard, PageHeader, PageLoading, PageMotion, SectionHeading, Stagger } from "@/features/shared/primitives";
import { ColumnFilterMenu, FilterSummary, NoMatchRow } from "@/features/shared/ColumnFilterMenu";
import { useColumnFilters } from "@/features/shared/useColumnFilters";
import { EmptyState, StatCard } from "@/features/shared/widgets";
import { getReportEvaluations } from "@/lib/repositories/evaluationRepository";
import { getCriteria } from "@/lib/repositories/criteriaRepository";
import { getMyReports } from "@/lib/repositories/reportAssignmentRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import type { FilterColumn } from "@/lib/services/columnFilters";
import { fmtNote, reportCriteria, weightedNote } from "@/lib/services/gradingService";
import type { Team } from "@/types";

// MyReportsPage — "Mes rapports": the reports the organizers handed to the
// juror (besides the defenders' reports of their passages, graded from
// "Mon planning"). A row opens the report next to its grading grid.

interface Row {
  reportId: string;
  team: Team | undefined;
  problemNumber: number;
  note: number | null; // out of 20, null until saved
}

const teamText = (r: Row) => (r.team ? `${r.team.quadrigram} · ${r.team.name}` : "");

const FILTER_COLUMNS: FilterColumn<Row>[] = [
  { key: "team", label: "Équipe", value: teamText, text: teamText },
  { key: "report", label: "Rapport", value: (r) => r.problemNumber, text: (r) => `Problème ${r.problemNumber}` },
  {
    key: "note",
    label: "Note",
    value: (r) => r.note,
    text: (r) => (r.note === null ? "" : fmtNote(r.note)),
    range: true,
  },
];

export function MyReportsPage() {
  const navigate = useNavigate();
  const mineQ = useQuery({ queryKey: ["my-reports"], queryFn: getMyReports });
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => getTeams() });
  const criteriaQ = useQuery({ queryKey: ["criteria"], queryFn: getCriteria });
  const evalsQ = useQuery({ queryKey: ["report-evaluations"], queryFn: () => getReportEvaluations() });

  const teamById = new Map((teamsQ.data ?? []).map((t) => [t.id, t]));
  const rows: Row[] = (mineQ.data ?? [])
    .map((m) => {
      const saved = (evalsQ.data ?? []).find((e) => e.teamId === m.teamId && e.problemNumber === m.problemNumber);
      const note = saved && weightedNote(saved.grades, reportCriteria(criteriaQ.data ?? [], m.problemNumber));
      return {
        reportId: m.reportId,
        team: teamById.get(m.teamId),
        problemNumber: m.problemNumber,
        note: note && note.maxTotal > 0 ? (note.total / note.maxTotal) * 20 : null,
      };
    })
    .sort((a, b) => a.problemNumber - b.problemNumber || (a.team?.quadrigram ?? "").localeCompare(b.team?.quadrigram ?? ""));
  const { shown, narrowed, clear, menuProps } = useColumnFilters(rows, FILTER_COLUMNS);

  if ([mineQ, teamsQ, criteriaQ, evalsQ].some((q) => q.isLoading)) return <PageLoading />;

  const done = rows.filter((r) => r.note !== null).length;
  const open = (r: Row) => navigate(`/mes-rapports/${r.reportId}`);

  return (
    <PageMotion className="space-y-10">
      <PageHeader
        eyebrow="Jury"
        title="Mes rapports"
        sub="Les rapports que les organisateurs vous ont confiés. Ouvrez-en un pour le lire à côté de sa grille de notation. Vos notes ne sont visibles que par l'administration."
      />

      {rows.length === 0 ? (
        <EmptyState title="Aucun rapport pour l'instant" sub="Les organisateurs ne vous ont pas encore confié de rapport à corriger." />
      ) : (
        <>
          <Stagger className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <StatCard label="Rapports" value={rows.length} />
            <StatCard label="Corrigés" value={done} denom={rows.length} progressColor="var(--sage)" highlight={done === rows.length} />
          </Stagger>

          <section>
            <SectionHeading
              title="À corriger"
              right={narrowed && <FilterSummary shown={shown.length} total={rows.length} unit="rapports" onClear={clear} />}
            />
            <BrutalCard className="overflow-hidden">
              <div className="table-scroll">
                <table className="brutal-table">
                  <thead>
                    <tr>
                      {FILTER_COLUMNS.map((c, i) => {
                        const last = i === FILTER_COLUMNS.length - 1;
                        return (
                          <th key={c.key} style={last ? { borderRight: "none" } : undefined}>
                            <div className="flex items-center justify-between gap-2">
                              <span>{c.label}</span>
                              <ColumnFilterMenu {...menuProps(c)} emptyLabel="(Non noté)" align={last ? "right" : "left"} sortKind={c.key === "team" ? "text" : "number"} />
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr
                        key={r.reportId}
                        className="row-clickable"
                        tabIndex={0}
                        onClick={() => open(r)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            open(r);
                          }
                        }}
                      >
                        <td>
                          <div className="font-mont text-xs" style={{ color: "var(--forest)", fontWeight: 900, letterSpacing: "0.05em" }}>
                            {r.team?.quadrigram ?? "—"}
                          </div>
                          <div className="font-open text-xs" style={{ color: "var(--ink-soft)" }}>{r.team?.name}</div>
                        </td>
                        <td>
                          <span className="font-mont text-xs" style={{ color: "var(--ink)", fontWeight: 700 }}>
                            Rapport du problème {r.problemNumber}
                          </span>
                        </td>
                        <td style={{ borderRight: "none" }}>
                          {r.note !== null ? (
                            <span className="font-mont text-sm" style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
                              {fmtNote(r.note)}
                              <span className="text-micro" style={{ color: "var(--ink-faint)" }}> /20</span>
                            </span>
                          ) : (
                            <Badge tone="saffron">À noter</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                    {shown.length === 0 && <NoMatchRow colSpan={3} label="Aucun rapport ne correspond aux filtres." onClear={clear} />}
                  </tbody>
                </table>
              </div>
            </BrutalCard>
          </section>
        </>
      )}
    </PageMotion>
  );
}
