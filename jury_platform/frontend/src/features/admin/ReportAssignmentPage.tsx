import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Alert, Badge, Btn, BrutalCard, Input, Modal, PageHeader, PageLoading, PageMotion, SectionHeading, Select, Stagger,
} from "@/features/shared/primitives";
import { ColumnFilterMenu, FilterSummary, NoMatchRow } from "@/features/shared/ColumnFilterMenu";
import { ReportViewer } from "@/features/shared/ReportViewer";
import { useColumnFilters } from "@/features/shared/useColumnFilters";
import { EmptyState, StatCard } from "@/features/shared/widgets";
import { getAccounts } from "@/lib/repositories/accountRepository";
import { getCriteria } from "@/lib/repositories/criteriaRepository";
import { getReportEvaluations } from "@/lib/repositories/evaluationRepository";
import {
  assignReport, autoAssignReports, getReportAssignments, type ReportAutoMode,
} from "@/lib/repositories/reportAssignmentRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import type { FilterColumn } from "@/lib/services/columnFilters";
import { fmtNote, reportCriteria, weightedNote } from "@/lib/services/gradingService";
import type { Account, AssignableReport, Team } from "@/types";
import { centerLabel, formatDay } from "@/utils/labels";
import { REPORT_QUERIES, useAction } from "./useAction";

// ReportAssignmentPage — "Affectation des rapports". Besides the report of
// the problem it defends (graded by its passage's duo), every team has
// reports for other problems; each goes to one juror to correct. The
// automatic assignment gives every juror the same number of reports and
// keeps them within the problem of their duo as far as that allows
// (backend/src/algorithms/reportAssignment.ts); the admin can then move
// any report by hand, and "Compléter" hands out only what's left.

interface Row {
  report: AssignableReport;
  team: Team | undefined;
  juror: Account | undefined;
  specialist: boolean; // the juror's duo has this problem
  grade: number | null; // the juror's note out of 20, once saved
}

const STATUS = { open: "Non attribué", todo: "À corriger", done: "Corrigé" } as const;
const statusOf = (r: Row) => (r.grade !== null ? STATUS.done : r.juror ? STATUS.todo : STATUS.open);
const jurorName = (a: Account) => `${a.lastName} ${a.firstName}`;

const FILTER_COLUMNS: FilterColumn<Row>[] = [
  { key: "team", label: "Équipe", value: (r) => r.team?.quadrigram ?? "", text: (r) => r.team?.quadrigram ?? "" },
  { key: "center", label: "Centre", value: (r) => (r.team ? centerLabel(r.team.center) : ""), text: (r) => (r.team ? centerLabel(r.team.center) : "") },
  { key: "problem", label: "Problème", value: (r) => r.report.problemNumber, text: (r) => `P${r.report.problemNumber}` },
  { key: "juror", label: "Juré", value: (r) => (r.juror ? jurorName(r.juror) : null), text: (r) => (r.juror ? jurorName(r.juror) : "") },
  { key: "status", label: "Statut", value: statusOf, text: statusOf },
];

export function ReportAssignmentPage() {
  const boardQ = useQuery({ queryKey: ["report-assignments"], queryFn: getReportAssignments });
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => getTeams() });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: () => getAccounts() });
  const criteriaQ = useQuery({ queryKey: ["criteria"], queryFn: getCriteria });
  const evalsQ = useQuery({ queryKey: ["report-evaluations"], queryFn: () => getReportEvaluations() });

  if ([boardQ, teamsQ, accountsQ, criteriaQ, evalsQ].some((q) => q.isLoading)) return <PageLoading />;
  if (boardQ.isError) return <Alert>Impossible de charger les rapports.</Alert>;

  const board = boardQ.data!;
  const teamById = new Map((teamsQ.data ?? []).map((t) => [t.id, t]));
  const accountById = new Map((accountsQ.data ?? []).map((a) => [a.id, a]));
  const problemsOf = new Map(board.jurors.map((j) => [j.id, j.problems]));
  const criteria = criteriaQ.data ?? [];
  const evals = evalsQ.data ?? [];

  const rows: Row[] = board.reports
    .map((report) => {
      const saved = report.accountId && evals.find(
        (e) => e.juryId === report.accountId && e.teamId === report.teamId && e.problemNumber === report.problemNumber,
      );
      const grid = reportCriteria(criteria, report.problemNumber);
      const note = saved ? weightedNote(saved.grades, grid) : null;
      return {
        report,
        team: teamById.get(report.teamId),
        juror: report.accountId ? accountById.get(report.accountId) : undefined,
        specialist: Boolean(report.accountId && problemsOf.get(report.accountId)?.includes(report.problemNumber)),
        grade: note && note.maxTotal > 0 ? (note.total / note.maxTotal) * 20 : null,
      };
    })
    .sort((a, b) => a.report.problemNumber - b.report.problemNumber || (a.team?.quadrigram ?? "").localeCompare(b.team?.quadrigram ?? ""));

  const jurors = (accountsQ.data ?? []).filter((a) => a.role === "jury").sort((a, b) => jurorName(a).localeCompare(jurorName(b)));
  const specialists = jurors.filter((j) => (problemsOf.get(j.id) ?? []).length > 0);
  const withoutProblem = jurors.filter((j) => (problemsOf.get(j.id) ?? []).length === 0);
  const assigned = rows.filter((r) => r.juror).length;
  const corrected = rows.filter((r) => r.grade !== null).length;
  const offSpecialty = rows.filter((r) => r.juror && !r.specialist).length;
  const target = specialists.length ? rows.length / specialists.length : 0;

  return (
    <PageMotion className="space-y-10">
      <PageHeader
        eyebrow="Administration"
        title="Affectation des rapports"
        sub="Les rapports des problèmes que les équipes ne défendent pas, chacun corrigé par un juré. Le rapport du problème défendu reste noté par le duo du passage."
        right={<AutoAssign rows={rows} disabledReason={specialists.length === 0 ? "Donnez d'abord un problème aux duos" : null} />}
      />

      <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Rapports à corriger" value={rows.length} />
        <StatCard label="Attribués" value={assigned} denom={rows.length || undefined} progressColor="var(--forest-soft)" />
        <StatCard label="Corrigés" value={corrected} denom={rows.length || undefined} progressColor="var(--sage)" highlight={rows.length > 0 && corrected === rows.length} />
        <StatCard label="Hors spécialité" value={offSpecialty} denom={assigned || undefined} progressColor="var(--clay)" />
      </Stagger>

      {(board.pendingDays.length > 0 || withoutProblem.length > 0) && (
        <Alert tone="warning" title="À vérifier">
          <ul className="list-disc pl-5 space-y-1">
            {board.pendingDays.length > 0 && (
              <li>
                Tirage non validé : {board.pendingDays.map((d) => `${centerLabel(d.center)} ${formatDay(d.date)}`).join(", ")}. Les rapports
                de ces jours arriveront ici une fois le tirage validé (page <Link to="/tournoi" className="underline font-semibold">Génération des poules</Link>).
              </li>
            )}
            {withoutProblem.length > 0 && (
              <li>
                Sans problème, donc hors de l'attribution automatique : {withoutProblem.map((j) => `${j.firstName} ${j.lastName}`).join(", ")} (page{" "}
                <Link to="/jury" className="underline font-semibold">Affectation du jury</Link>).
              </li>
            )}
          </ul>
        </Alert>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="Aucun rapport à attribuer"
          sub="Ils apparaissent une fois le tirage d'un jour validé : tous les rapports de ses équipes, sauf celui du problème que chacune défend."
        />
      ) : (
        <>
          <LoadTable jurors={jurors} rows={rows} problemsOf={problemsOf} target={target} />
          <ReportsTable rows={rows} jurors={jurors} problemsOf={problemsOf} />
        </>
      )}
    </PageMotion>
  );
}

// ─── Load per juror ───────────────────────────────────────────────────

function LoadTable({
  jurors,
  rows,
  problemsOf,
  target,
}: {
  jurors: Account[];
  rows: Row[];
  problemsOf: Map<string, number[]>;
  target: number; // reports per juror, if spread evenly
}) {
  // Every juror with a problem, plus anyone holding reports without one
  const shown = jurors.filter((j) => (problemsOf.get(j.id) ?? []).length > 0 || rows.some((r) => r.juror?.id === j.id));
  const [low, high] = [Math.floor(target), Math.ceil(target)];

  return (
    <section>
      <SectionHeading
        title="Charge par juré"
        right={target > 0 && <Badge tone="neutral">{low === high ? `${low}` : `${low} à ${high}`} rapports chacun</Badge>}
      />
      <BrutalCard className="overflow-hidden">
        <div className="table-scroll">
          <table className="brutal-table">
            <thead>
              <tr>
                <th>Juré</th>
                <th>Spécialité</th>
                <th>Rapports</th>
                <th>Hors spécialité</th>
                <th style={{ borderRight: "none" }}>Corrigés</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((juror) => {
                const mine = rows.filter((r) => r.juror?.id === juror.id);
                const off = mine.filter((r) => !r.specialist).length;
                const done = mine.filter((r) => r.grade !== null).length;
                const balanced = target === 0 || (mine.length >= low && mine.length <= high);
                return (
                  <tr key={juror.id}>
                    <td className="font-mont text-xs" style={{ color: "var(--forest)", fontWeight: 800 }}>
                      {juror.firstName} {juror.lastName}
                    </td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        {(problemsOf.get(juror.id) ?? []).map((p) => <Badge key={p} tone="dark">P{p}</Badge>)}
                        {(problemsOf.get(juror.id) ?? []).length === 0 && <Badge tone="saffron">Aucune</Badge>}
                      </div>
                    </td>
                    <td>
                      <Badge tone={balanced ? "sage" : "saffron"}>{mine.length}</Badge>
                    </td>
                    <td className="font-mont text-xs" style={{ color: off > 0 ? "var(--clay)" : "var(--ink-faint)", fontWeight: 800 }}>
                      {off}
                    </td>
                    <td className="font-mont text-xs" style={{ borderRight: "none", color: "var(--ink-soft)", fontWeight: 800 }}>
                      {done}/{mine.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </BrutalCard>
    </section>
  );
}

// ─── Every report, with its juror ─────────────────────────────────────

function ReportsTable({ rows, jurors, problemsOf }: { rows: Row[]; jurors: Account[]; problemsOf: Map<string, number[]> }) {
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim().toLowerCase());
  const searched = rows.filter(
    (r) => !query || `${r.team?.quadrigram ?? ""} ${r.team?.name ?? ""}`.toLowerCase().includes(query),
  );
  const { shown, narrowed, clear, menuProps } = useColumnFilters(searched, FILTER_COLUMNS);
  const { run, busy, error } = useAction(REPORT_QUERIES);
  const load = new Map<string, number>();
  for (const r of rows) if (r.juror) load.set(r.juror.id, (load.get(r.juror.id) ?? 0) + 1);

  return (
    <section>
      <SectionHeading
        title="Rapports"
        right={
          <div className="flex items-center gap-3 flex-wrap">
            {(narrowed || query) && (
              <FilterSummary shown={shown.length} total={rows.length} unit="rapports" onClear={() => { clear(); setSearch(""); }} />
            )}
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une équipe…"
              aria-label="Rechercher une équipe"
              style={{ width: "15rem" }}
            />
          </div>
        }
      />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      <BrutalCard className="overflow-hidden">
        <div className="table-scroll">
          <table className="brutal-table">
            <thead>
              <tr>
                {FILTER_COLUMNS.slice(0, 3).map((c) => <FilterHead key={c.key} column={c} menuProps={menuProps} />)}
                <th>Rapport</th>
                {FILTER_COLUMNS.slice(3).map((c, i) => <FilterHead key={c.key} column={c} menuProps={menuProps} last={i === 1} />)}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.report.id}>
                  <td>
                    <div className="font-mont text-xs" style={{ color: "var(--forest)", fontWeight: 900, letterSpacing: "0.05em" }}>
                      {row.team?.quadrigram ?? "—"}
                    </div>
                    <div className="font-open text-xs truncate" style={{ color: "var(--ink-soft)", maxWidth: "14rem" }}>{row.team?.name}</div>
                  </td>
                  <td className="font-open text-xs">{row.team ? centerLabel(row.team.center) : "—"}</td>
                  <td><Badge tone="dark">P{row.report.problemNumber}</Badge></td>
                  <td>
                    <ReportViewer
                      reportId={row.report.id}
                      title={`${row.team?.quadrigram ?? ""} · Rapport du problème ${row.report.problemNumber}`}
                      label="Voir"
                    />
                  </td>
                  <td>
                    <JurorPicker
                      row={row}
                      jurors={jurors}
                      problemsOf={problemsOf}
                      load={load}
                      disabled={busy}
                      onChange={(accountId) => run(() => assignReport(row.report.id, accountId))}
                    />
                  </td>
                  <td style={{ borderRight: "none" }}>
                    {row.grade !== null ? (
                      <Badge tone="sage">{STATUS.done} · {fmtNote(row.grade)}/20</Badge>
                    ) : row.juror ? (
                      <Badge tone="neutral">{STATUS.todo}</Badge>
                    ) : (
                      <Badge tone="saffron">{STATUS.open}</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <NoMatchRow colSpan={6} label="Aucun rapport ne correspond aux filtres." onClear={() => { clear(); setSearch(""); }} />
              )}
            </tbody>
          </table>
        </div>
      </BrutalCard>
    </section>
  );
}

function FilterHead({
  column,
  menuProps,
  last = false,
}: {
  column: FilterColumn<Row>;
  menuProps: ReturnType<typeof useColumnFilters<Row>>["menuProps"];
  last?: boolean;
}) {
  return (
    <th style={last ? { borderRight: "none" } : undefined}>
      <div className="flex items-center justify-between gap-2">
        <span>{column.label}</span>
        <ColumnFilterMenu
          {...menuProps(column)}
          emptyLabel="(Non attribué)"
          align={last ? "right" : "left"}
          sortKind={column.key === "problem" ? "number" : "text"}
        />
      </div>
    </th>
  );
}

// The report's juror: its problem's specialists first, then everyone else,
// each with the number of reports they hold. A corrected report keeps its
// juror (the server refuses the move).
function JurorPicker({
  row,
  jurors,
  problemsOf,
  load,
  disabled,
  onChange,
}: {
  row: Row;
  jurors: Account[];
  problemsOf: Map<string, number[]>;
  load: Map<string, number>;
  disabled: boolean;
  onChange: (accountId: string | null) => void;
}) {
  const problem = row.report.problemNumber;
  const isSpecialist = (j: Account) => (problemsOf.get(j.id) ?? []).includes(problem);
  const option = (j: Account) => (
    <option key={j.id} value={j.id}>
      {jurorName(j)} · {load.get(j.id) ?? 0}
    </option>
  );

  return (
    <Select
      value={row.juror?.id ?? ""}
      disabled={disabled || row.grade !== null}
      title={row.grade !== null ? "Déjà corrigé : le rapport garde son juré" : undefined}
      aria-label={`Juré du rapport ${row.team?.quadrigram ?? ""} P${problem}`}
      onChange={(e) => onChange(e.target.value || null)}
      style={{
        width: "15rem",
        ...(row.juror && !row.specialist && { borderColor: "var(--clay)" }),
      }}
    >
      <option value="">— Non attribué —</option>
      <optgroup label={`Spécialistes du P${problem}`}>{jurors.filter(isSpecialist).map(option)}</optgroup>
      <optgroup label="Autres jurés">{jurors.filter((j) => !isSpecialist(j)).map(option)}</optgroup>
    </Select>
  );
}

// ─── Automatic assignment ─────────────────────────────────────────────

// Same two choices as the duo assignment: "Compléter" hands out only the
// reports without a juror, "Tout refaire" starts over (corrected reports
// always keep theirs). Everything stays editable by hand afterwards.
function AutoAssign({ rows, disabledReason }: { rows: Row[]; disabledReason: string | null }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const { run, busy, error } = useAction(REPORT_QUERIES);
  const free = rows.filter((r) => !r.juror).length;

  const apply = async (mode: ReportAutoMode) => {
    setOpen(false);
    const res = await run(() => autoAssignReports(mode));
    if (!res) return;
    const parts = [`${res.changed} rapport${res.changed > 1 ? "s" : ""} attribué${res.changed > 1 ? "s" : ""}`];
    if (res.offSpecialty > 0) parts.push(`${res.offSpecialty} hors spécialité`);
    if (res.unassigned > 0) parts.push(`${res.unassigned} sans juré`);
    setSummary(parts.join(" · "));
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Btn disabled={busy || disabledReason !== null} title={disabledReason ?? "Répartit les rapports entre les jurés"} onClick={() => setOpen(true)}>
        {busy ? "Attribution…" : "Attribuer automatiquement"}
      </Btn>
      {summary && (
        <span className="font-mont text-micro uppercase tracking-widest" style={{ color: "var(--ink-soft)", fontWeight: 800 }}>
          {summary}
        </span>
      )}
      {error && <Alert>{error}</Alert>}

      <Modal
        open={open}
        title="Attribution automatique des rapports"
        onClose={() => setOpen(false)}
        footer={<Btn variant="ghost" onClick={() => setOpen(false)}>Annuler</Btn>}
      >
        <div className="px-5 py-4 space-y-4">
          <p className="font-open text-sm" style={{ color: "var(--ink)" }}>
            {rows.length} rapport{rows.length > 1 ? "s" : ""}
            {free === 0 ? ", tous déjà attribués" : free === rows.length ? ", aucun attribué pour l'instant" : `, dont ${free} sans juré`}
            . Chaque juré en reçoit autant que les autres (à un près), en priorité du problème de son duo.
          </p>
          <div className="flex flex-wrap gap-3">
            <Btn disabled={free === 0} onClick={() => apply("fill")}>
              Compléter {free > 0 ? `(${free})` : ""}
            </Btn>
            <Btn variant="ghost" onClick={() => apply("replace")}>Tout refaire</Btn>
          </div>
          <p className="font-open text-xs" style={{ color: "var(--ink-soft)" }}>
            « Compléter » ne touche pas aux rapports déjà attribués à la main. « Tout refaire » répartit tout à nouveau ;
            les rapports déjà corrigés gardent leur juré. Tout reste modifiable à la main ensuite.
          </p>
        </div>
      </Modal>
    </div>
  );
}
