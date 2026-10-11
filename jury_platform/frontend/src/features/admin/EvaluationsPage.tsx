import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Alert, Badge, BrutalCard, FadeIn, PageHeader, PageLoading, PageMotion, SectionHeading, Segmented,
} from "@/features/shared/primitives";
import { ColumnFilterMenu, FilterSummary, NoMatchRow } from "@/features/shared/ColumnFilterMenu";
import { DetailPart, DetailRow, ExpandChevron } from "@/features/shared/DetailRow";
import { useColumnFilters } from "@/features/shared/useColumnFilters";
import { GridIcon } from "@/features/shared/icons";
import { EmptyState, LoadError, Picker, ROLE_PALETTE } from "@/features/shared/widgets";
import { queryState } from "@/features/shared/queryState";
import { getAccounts } from "@/lib/repositories/accountRepository";
import { getReportAssignments } from "@/lib/repositories/reportAssignmentRepository";
import type { FilterColumn } from "@/lib/services/columnFilters";
import { fmtNote, oralCriteria, reportCriteria } from "@/lib/services/gradingService";
import { jurorSheets } from "@/lib/services/jurorNotes";
import {
  centersWithPools, daysOfCenter, FINAL_PART_LABELS, GRADED_ROLES, type NoteSet, type PassageResult,
} from "@/lib/services/results";
import type { Center, Criterion, OralEvaluation, ReportEvaluation } from "@/types";
import { centerLabel, formatDay } from "@/utils/labels";
import { slotTime } from "@/utils/schedule";
import { ExportButton } from "./ExportButton";
import { JurorsView } from "./notes/JurorsView";
import { NoteActions, type EditableNote } from "./notes/NoteEditor";
import { useExport } from "./useExport";
import { useGradedPassages } from "./useGradedPassages";

// EvaluationsPage — the jury's notes, read two ways:
//   · « Par passage »: by center, day and pool, the duo's average per graded
//     role and for the defender's report, what is still missing, and each
//     juror's note and remark on demand;
//   · « Par juré » (notes/JurorsView): what each juror owes and graded.
// Either way an admin can correct or remove a juror's note (notes/NoteEditor).

// What a passage's row needs to hand a note to the editor
interface NoteSource {
  criteria: Criterion[];
  oral: OralEvaluation[];
  report: ReportEvaluation[];
}

const VIEWS = [{ value: "passages", label: "Par passage" }, { value: "jures", label: "Par juré" }] as const;
type View = (typeof VIEWS)[number]["value"];

export function EvaluationsPage() {
  const { queries, pools, teams, results, criteria, oral, report } = useGradedPassages();
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: () => getAccounts() });
  const boardQ = useQuery({ queryKey: ["report-assignments"], queryFn: getReportAssignments });
  const [params, setParams] = useSearchParams();
  const view: View = params.get("vue") === "jures" ? "jures" : "passages";
  // The view and the juror unrolled last live in the address, without piling up history
  const show = (next: View, juror: string | null = null) =>
    setParams(next === "jures" ? { vue: "jures", ...(juror ? { jure: juror } : {}) } : {}, { replace: true });
  const [center, setCenter] = useState<Center | null>(null);
  const accounts = accountsQ.data;
  const assigned = boardQ.data?.reports;
  // Every juror's notes, gathered once per change of the data rather than at each render
  const sheets = useMemo(
    () => jurorSheets(accounts ?? [], pools, criteria, oral, report, assigned ?? []),
    [accounts, pools, criteria, oral, report, assigned],
  );
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  // Loaded on demand: the xlsx writer is heavy and only needed here.
  const exporter = useExport(async () => (await import("@/lib/services/exportService")).exportGradesXlsx());

  const load = queryState(...queries, accountsQ, boardQ);
  if (load.loading) return <PageLoading />;
  if (load.failed) return <LoadError onRetry={load.retry} />;

  const source: NoteSource = { criteria, oral, report };
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

      <Picker label="Lecture">
        <Segmented options={[...VIEWS]} value={view} onChange={(v) => show(v)} />
      </Picker>

      {view === "jures" ? (
        <FadeIn key="jures">
          <JurorsView
            sheets={sheets}
            teamById={teamById}
            criteria={criteria}
            linked={params.get("jure")}
            onOpen={(id) => {
              // Told once the row has settled, so a moment late: only if the
              // address still shows this reading. The window's address, not
              // the router's: it changes at the click, before the page follows.
              if (new URLSearchParams(window.location.search).get("vue") === "jures") show("jures", id);
            }}
          />
        </FadeIn>
      ) : !selected ? (
        <EmptyState icon={GridIcon} title="Aucune poule" sub="Les notes apparaîtront une fois les poules tirées et notées." />
      ) : (
        <>
          <Segmented options={centers} value={selected} onChange={setCenter} />
          <FadeIn key={selected} className="space-y-10">
            {daysOfCenter(results, selected).map(([date, dayResults]) => (
              <DayTable
                key={`${selected}-${date}`}
                title={`${centerLabel(selected)} · ${formatDay(date)}`}
                results={dayResults}
                quadById={quadById}
                nameById={nameById}
                source={source}
              />
            ))}
          </FadeIn>
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
  source,
}: {
  title: string;
  results: PassageResult[];
  quadById: Map<string, string>;
  nameById: Map<string, string>;
  source: NoteSource;
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
        <div className="table-scroll">
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
                <ResultRow key={r.passage.id} result={r} alt={i % 2 === 1} quadById={quadById} nameById={nameById} source={source} />
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
  source,
}: {
  result: PassageResult;
  alt: boolean;
  quadById: Map<string, string>;
  nameById: Map<string, string>;
  source: NoteSource;
}) {
  const [open, setOpen] = useState(false);
  const { passage, oral, report, done, expected } = result;
  const sets: [string, NoteSet, (typeof GRADED_ROLES)[number] | null][] = [
    ...GRADED_ROLES.map((role) => [ROLE_PALETTE[role].label, oral[role], role] as [string, NoteSet, typeof role]),
    ["Rapport écrit", report, null],
  ];
  const inDuo = new Set(passage.duo?.members.map((m) => m.id));
  // A juror's note of this passage, as the editor takes it
  const editable = (set: NoteSet, role: (typeof GRADED_ROLES)[number] | null, juryId: string, total: number): EditableNote | null => {
    const evaluation = role
      ? source.oral.find((e) => e.passageId === passage.id && e.teamId === set.teamId && e.juryId === juryId)
      : source.report.find((e) => e.teamId === set.teamId && e.problemNumber === passage.problemNumber && e.juryId === juryId);
    const quad = quadById.get(set.teamId) ?? "?";
    return evaluation
      ? {
        kind: role ? "oral" : "report",
        evaluation,
        juror: nameById.get(juryId) ?? "?",
        subject: role ? `${quad}, ${ROLE_PALETTE[role].label.toLowerCase()} dans ${passage.label}` : `${quad}, rapport du problème ${passage.problemNumber}`,
        criteria: role ? oralCriteria(source.criteria, role) : reportCriteria(source.criteria, passage.problemNumber),
        total,
        max: set.max,
      }
      : null;
  };

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
          <div className="flex items-center gap-2.5">
            <ExpandChevron open={open} />
            <div>
              <div className="font-mont text-xs" style={{ color: "var(--forest)", fontWeight: 900 }}>{passage.label}</div>
              <div className="font-mont text-micro uppercase tracking-widest" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
                P{passage.problemNumber} · {slotTime(result.pool.centerDay, passage.slot)?.start}
              </div>
            </div>
          </div>
        </td>
        <td>
          {passage.duo ? (
            passage.duo.members.map((m) => (
              <div key={m.id} className="font-open text-xs whitespace-nowrap" style={{ color: "var(--ink)" }}>
                {m.firstName} {m.lastName}
              </div>
            ))
          ) : (
            <Badge tone="saffron">Sans duo</Badge>
          )}
        </td>
        {GRADED_ROLES.map((role) => (
          <td key={role}><NoteCell quad={quadById.get(oral[role].teamId)} set={oral[role]} /></td>
        ))}
        <td><NoteCell quad={quadById.get(report.teamId)} set={report} /></td>
        <td style={{ borderRight: "none" }}>
          <Badge tone={done === expected ? "sage" : done > 0 ? "saffron" : "neutral"}>{done}/{expected}</Badge>
        </td>
      </tr>
      <DetailRow open={open} colSpan={7}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 px-3 py-5">
          {sets.map(([label, set, role]) => (
            <DetailPart key={label}>
              <div className="font-mont text-micro uppercase tracking-widest mb-1" style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
                {label} · {quadById.get(set.teamId) ?? "—"}
              </div>
              {set.notes.length === 0 ? (
                <p className="font-open text-xs italic" style={{ color: "var(--ink-faint)" }}>Pas encore noté.</p>
              ) : (
                set.notes.map((n) => {
                  const note = editable(set, role, n.juryId, n.total);
                  return (
                    <div key={n.juryId} className="font-open text-xs mb-2.5" style={{ color: "var(--ink)" }}>
                      <strong className="font-mont">{nameById.get(n.juryId) ?? "?"}</strong> · {fmtNote(n.total)} / {set.max}
                      {passage.duo && !inDuo.has(n.juryId) && (
                        <span className="ml-2" title="Ce juré n'est pas, ou plus, dans le duo qui juge ce passage : sa note compte toujours">
                          <Badge tone="neutral">Hors duo</Badge>
                        </span>
                      )}
                      {n.globalRemark && <span className="block italic" style={{ color: "var(--ink-soft)" }}>« {n.globalRemark} »</span>}
                      {note && <span className="block"><NoteActions note={note} /></span>}
                    </div>
                  );
                })
              )}
            </DetailPart>
          ))}
        </div>
      </DetailRow>
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
