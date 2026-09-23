import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert, Badge, BrutalCard, PageHeader, PageLoading, PageMotion, SectionHeading, Segmented,
} from "@/features/shared/primitives";
import { ColumnFilterMenu, FilterSummary, NoMatchRow } from "@/features/shared/ColumnFilterMenu";
import { useColumnFilters } from "@/features/shared/useColumnFilters";
import { EmptyState, ROLE_PALETTE } from "@/features/shared/widgets";
import { getAccounts } from "@/lib/repositories/accountRepository";
import type { FilterColumn } from "@/lib/services/columnFilters";
import { fmtNote } from "@/lib/services/gradingService";
import {
  centersWithPools, daysOfCenter, FINAL_PART_LABELS, GRADED_ROLES, type NoteSet, type PassageResult,
} from "@/lib/services/results";
import type { Center } from "@/types";
import { centerLabel, formatDay } from "@/utils/labels";
import { slotTime } from "@/utils/schedule";
import { ExportButton } from "./ExportButton";
import { useExport } from "./useExport";
import { useGradedPassages } from "./useGradedPassages";

// EvaluationsPage — the jury's notes, by center, day and pool: for each
// passage the duo's average per graded role and for the defender's report,
// what is still missing, and each juror's note and remark on demand.

export function EvaluationsPage() {
  const { isLoading, pools, teams, results } = useGradedPassages();
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: () => getAccounts() });
  const [center, setCenter] = useState<Center | null>(null);
  // Loaded on demand: the xlsx writer is heavy and only needed here.
  const exporter = useExport(async () => (await import("@/lib/services/exportService")).exportGradesXlsx());

  if (isLoading || accountsQ.isLoading) return <PageLoading />;

  const quadById = new Map(teams.map((t) => [t.id, t.quadrigram]));
  const nameById = new Map((accountsQ.data ?? []).map((a) => [a.id, `${a.firstName} ${a.lastName}`]));
  const centers = centersWithPools(pools);
  const selected = center ?? centers[0]?.value ?? null;
  const done = results.reduce((s, r) => s + r.done, 0);
  const expected = results.reduce((s, r) => s + r.expected, 0);

  return (
    <PageMotion className="space-y-10">
      <PageHeader
        eyebrow="Administration"
        title="Notes du jury"
        sub={`Moyenne du duo pour chaque rôle et pour le rapport du défenseur. ${done}/${expected} évaluations saisies.`}
        right={<ExportButton {...exporter} />}
      />
      {exporter.error && <Alert>{exporter.error}</Alert>}

      {!selected ? (
        <EmptyState title="Aucune poule" sub="Les notes apparaîtront une fois les poules tirées et notées." />
      ) : (
        <>
          <Segmented options={centers} value={selected} onChange={setCenter} />
          {daysOfCenter(results, selected).map(([date, dayResults]) => (
            <DayTable
              key={`${selected}-${date}`}
              title={`${centerLabel(selected)} · ${formatDay(date)}`}
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
    label: FINAL_PART_LABELS[role],
    value: (r: PassageResult) => r.oral[role].average,
    text: (r: PassageResult) => noteText(r.oral[role]),
    range: true,
  })),
  { key: "report", label: FINAL_PART_LABELS.report, value: (r) => r.report.average, text: (r) => noteText(r.report), range: true },
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
  const { shown, narrowed, clear, menuProps } = useColumnFilters(results, FILTER_COLUMNS);

  return (
    <section>
      <SectionHeading
        title={title}
        right={narrowed && (
          <div className="flex items-center gap-2">
            <FilterSummary shown={shown.length} total={results.length} unit="passages" onClear={clear} />
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
                        {...menuProps(c)}
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
              {shown.length === 0 && <NoMatchRow colSpan={7} label="Aucun passage ne correspond aux filtres." onClear={clear} />}
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
