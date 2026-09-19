import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert, Badge, Btn, BrutalCard, PageHeader, PageLoading, PageMotion, SectionHeading, Segmented,
} from "@/features/shared/primitives";
import { ColumnFilterMenu } from "@/features/shared/ColumnFilterMenu";
import { DownloadIcon } from "@/features/shared/icons";
import { EmptyState, ROLE_PALETTE } from "@/features/shared/widgets";
import { getAccounts } from "@/lib/repositories/accountRepository";
import { getCriteria } from "@/lib/repositories/criteriaRepository";
import { getOralEvaluations, getReportEvaluations } from "@/lib/repositories/evaluationRepository";
import { getPools } from "@/lib/repositories/poolRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import {
  distinctValues, filterAndSort, type ColumnFilter, type ColumnSort, type FilterColumn,
} from "@/lib/services/columnFilters";
import { errorMessage } from "@/lib/services/errors";
import { fmtNote } from "@/lib/services/gradingService";
import { GRADED_ROLES, passageResults, type NoteSet, type PassageResult } from "@/lib/services/results";
import { CENTERS, centerLabel, formatDay } from "@/utils/labels";
import { slotTime } from "@/utils/schedule";

// EvaluationsPage — the jury's notes, by center, day and pool: for each
// passage the duo's average per graded role and for the defender's report,
// what is still missing, and each juror's note and remark on demand.

export function EvaluationsPage() {
  const poolsQ = useQuery({ queryKey: ["pools"], queryFn: () => getPools() });
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => getTeams() });
  const criteriaQ = useQuery({ queryKey: ["criteria"], queryFn: getCriteria });
  const oralQ = useQuery({ queryKey: ["oral-evaluations"], queryFn: () => getOralEvaluations() });
  const reportQ = useQuery({ queryKey: ["report-evaluations"], queryFn: () => getReportEvaluations() });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: () => getAccounts() });
  const [center, setCenter] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  if ([poolsQ, teamsQ, criteriaQ, oralQ, reportQ, accountsQ].some((q) => q.isLoading)) return <PageLoading />;

  const pools = poolsQ.data ?? [];
  const results = passageResults(pools, criteriaQ.data ?? [], oralQ.data ?? [], reportQ.data ?? []);
  const quadById = new Map((teamsQ.data ?? []).map((t) => [t.id, t.quadrigram]));
  const nameById = new Map((accountsQ.data ?? []).map((a) => [a.id, `${a.firstName} ${a.lastName}`]));
  const centers = CENTERS.filter((c) => pools.some((p) => p.centerDay?.center === c.value));
  const selected = center ?? centers[0]?.value ?? null;
  const done = results.reduce((s, r) => s + r.done, 0);
  const expected = results.reduce((s, r) => s + r.expected, 0);

  const exportXlsx = async () => {
    setExporting(true);
    setExportError(null);
    try {
      // Loaded on demand: the xlsx writer is heavy and only needed here.
      const { exportGradesXlsx } = await import("@/lib/services/exportService");
      await exportGradesXlsx();
    } catch (err) {
      setExportError(errorMessage(err, "Export impossible."));
    } finally {
      setExporting(false);
    }
  };

  // Day → pools → passage results, for the selected center
  const byDay = new Map<string, PassageResult[]>();
  for (const r of results.filter((r) => r.pool.centerDay?.center === selected)) {
    const key = r.pool.centerDay!.date;
    byDay.set(key, [...(byDay.get(key) ?? []), r]);
  }

  return (
    <PageMotion className="space-y-10">
      <PageHeader
        eyebrow="Administration"
        title="Notes du jury"
        sub={`Moyenne du duo pour chaque rôle et pour le rapport du défenseur. ${done}/${expected} évaluations saisies.`}
        right={
          <Btn onClick={exportXlsx} disabled={exporting}>
            <DownloadIcon size={15} /> {exporting ? "Export…" : "Exporter (xlsx)"}
          </Btn>
        }
      />
      {exportError && <Alert>{exportError}</Alert>}

      {!selected ? (
        <EmptyState title="Aucune poule" sub="Les notes apparaîtront une fois les poules tirées et notées." />
      ) : (
        <>
          <Segmented options={centers.map((c) => ({ value: c.value, label: c.label }))} value={selected} onChange={setCenter} />
          {[...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, dayResults]) => (
            <DayTable
              key={`${selected}-${date}`}
              title={`${centerLabel(dayResults[0].pool.centerDay!.center)} · ${formatDay(date)}`}
              results={dayResults}
              quadById={quadById}
              nameById={nameById}
            />
          ))}
        </>
      )}
    </PageMotion>
  );
}

// ─── One day's table, with spreadsheet-style filters on the notes ─────

const noteText = (set: NoteSet) => (set.average === null ? "" : fmtNote(set.average));

const FILTER_COLUMNS: FilterColumn<PassageResult>[] = [
  ...GRADED_ROLES.map((role) => ({
    key: role,
    label: { defender: "Défense", opponent: "Opposition", reporter: "Rapporteur" }[role],
    value: (r: PassageResult) => r.oral[role].average,
    text: (r: PassageResult) => noteText(r.oral[role]),
    range: true,
  })),
  { key: "report", label: "Rapport écrit", value: (r) => r.report.average, text: (r) => noteText(r.report), range: true },
  { key: "done", label: "Saisies", value: (r) => r.done, text: (r) => `${r.done}/${r.expected}` },
];

function DayTable({
  title,
  results,
  quadById,
  nameById,
}: {
  title: string;
  results: PassageResult[];
  quadById: Map<string, string>;
  nameById: Map<string, string>;
}) {
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({});
  const [sort, setSort] = useState<ColumnSort>(null);
  const shown = filterAndSort(results, FILTER_COLUMNS, filters, sort);
  const narrowed = shown.length < results.length || sort !== null;
  const clear = () => { setFilters({}); setSort(null); };

  return (
    <section>
      <SectionHeading
        title={title}
        right={narrowed && (
          <div className="flex items-center gap-2">
            <Badge tone="saffron">{shown.length}/{results.length} passages</Badge>
            <Btn variant="ghost" size="sm" onClick={clear}>Effacer les filtres</Btn>
          </div>
        )}
      />
      <BrutalCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="brutal-table brutal-table--manual-stripes">
            <thead>
              <tr>
                <th>Passage</th>
                <th>Duo</th>
                {FILTER_COLUMNS.map((c, i) => (
                  <th key={c.key} style={i === FILTER_COLUMNS.length - 1 ? { borderRight: "none" } : undefined}>
                    <div className="flex items-center justify-between gap-2">
                      <span>{c.label}</span>
                      <ColumnFilterMenu
                        label={c.label}
                        values={distinctValues(results, c)}
                        filter={filters[c.key]}
                        onFilter={(f) => setFilters((all) => ({ ...all, [c.key]: f }))}
                        sort={sort?.key === c.key ? sort.dir : null}
                        onSort={(dir) => setSort(dir ? { key: c.key, dir } : null)}
                        range={c.range}
                        emptyLabel="(Non noté)"
                        align={i >= FILTER_COLUMNS.length - 2 ? "right" : "left"}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <ResultRow key={r.passage.id} result={r} alt={i % 2 === 1} quadById={quadById} nameById={nameById} />
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ borderRight: "none" }}>
                    <div className="py-4 flex items-center justify-center gap-3 flex-wrap">
                      <span className="font-open text-sm italic" style={{ color: "var(--ink-faint)" }}>
                        Aucun passage ne correspond aux filtres.
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

// `alt` = grey stripe. It follows the passage, not the DOM row, so an
// expanded detail row doesn't shift the stripes below it.
function ResultRow({
  result,
  alt,
  quadById,
  nameById,
}: {
  result: PassageResult;
  alt: boolean;
  quadById: Map<string, string>;
  nameById: Map<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const { passage, oral, report, done, expected } = result;
  const sets: [string, NoteSet][] = [
    ...GRADED_ROLES.map((role) => [ROLE_PALETTE[role].label, oral[role]] as [string, NoteSet]),
    ["Rapport écrit", report],
  ];

  return (
    <>
      <tr
        className={`row-clickable${alt ? " row-alt" : ""}`}
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        <td>
          <div className="font-mont text-xs" style={{ color: "var(--forest)", fontWeight: 900 }}>{passage.label}</div>
          <div className="font-mont text-micro uppercase tracking-widest" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
            P{passage.problemNumber} · {slotTime(result.pool.centerDay, passage.slot)?.start}
          </div>
        </td>
        <td>{passage.duo ? <Badge tone="dark">Duo {passage.duo.number}</Badge> : <Badge tone="saffron">Sans duo</Badge>}</td>
        {GRADED_ROLES.map((role) => (
          <td key={role}><NoteCell quad={quadById.get(oral[role].teamId)} set={oral[role]} /></td>
        ))}
        <td><NoteCell quad={quadById.get(report.teamId)} set={report} /></td>
        <td style={{ borderRight: "none" }}>
          <Badge tone={done === expected ? "sage" : done > 0 ? "saffron" : "neutral"}>{done}/{expected}</Badge>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} style={{ borderRight: "none", background: "var(--paper-2)" }}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 py-2">
              {sets.map(([label, set]) => (
                <div key={label}>
                  <div className="font-mont text-micro uppercase tracking-widest mb-1" style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
                    {label} · {quadById.get(set.teamId) ?? "—"}
                  </div>
                  {set.notes.length === 0 ? (
                    <p className="font-open text-xs italic" style={{ color: "var(--ink-faint)" }}>Pas encore noté.</p>
                  ) : (
                    set.notes.map((n) => (
                      <div key={n.juryId} className="font-open text-xs mb-1.5" style={{ color: "var(--ink)" }}>
                        <strong className="font-mont">{nameById.get(n.juryId) ?? "?"}</strong> · {fmtNote(n.total)} / {set.max}
                        {n.globalRemark && <span className="block italic" style={{ color: "var(--ink-soft)" }}>« {n.globalRemark} »</span>}
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function NoteCell({ quad, set }: { quad: string | undefined; set: NoteSet }) {
  return (
    <div className="flex items-baseline gap-2 whitespace-nowrap">
      <span className="font-mont text-xs" style={{ color: "var(--forest)", fontWeight: 900, letterSpacing: "0.05em" }}>{quad ?? "—"}</span>
      {set.average === null ? (
        <span className="font-mont text-xs" style={{ color: "var(--ink-faint)" }}>—</span>
      ) : (
        <span className="font-mont text-sm" style={{ color: "var(--saffron-dark)", fontWeight: 900 }} title={`${set.notes.length} juré(s) · max ${set.max}`}>
          {fmtNote(set.average)}
          <span className="text-micro" style={{ color: "var(--ink-faint)" }}> /{set.max}</span>
        </span>
      )}
    </div>
  );
}
