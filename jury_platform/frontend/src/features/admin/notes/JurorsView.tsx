import { Fragment, memo, useCallback, useEffect, useRef, useState } from "react";
import { Badge, BrutalCard, SectionHeading } from "@/features/shared/primitives";
import { ColumnFilterMenu, FilterSummary, NoMatchRow } from "@/features/shared/ColumnFilterMenu";
import { DetailPart, DetailRow, ExpandChevron } from "@/features/shared/DetailRow";
import { useColumnFilters } from "@/features/shared/useColumnFilters";
import { InboxIcon } from "@/features/shared/icons";
import { EmptyState, ROLE_PALETTE } from "@/features/shared/widgets";
import type { FilterColumn } from "@/lib/services/columnFilters";
import { frNote, oralCriteria, reportCriteria } from "@/lib/services/gradingService";
import type { JurorSheet, JurorTask, Tally } from "@/lib/services/jurorNotes";
import { frStat } from "@/lib/services/stats";
import type { Criterion, Team } from "@/types";
import { centerLabel, formatDay } from "@/utils/labels";
import { slotTime } from "@/utils/schedule";
import { NoteActions, type EditableNote } from "./NoteEditor";

// « Par juré », on the Notes page: every juror with what they owe and what
// they graded, how their notes compare with the other jurors', and, on
// demand, each of their notes with the means to correct or remove it.
//
// « Écart aux autres »: for every note of the juror that another juror also
// gave (the same team in the same passage, or the same report), their note
// minus the others' average, both out of 100; the column is the average of
// those differences. Above 0, they grade higher than their colleagues.

const SETTLED_MS = 700; // a detail has finished unrolling (shared/motion.ts), with some margin

const tallyText = (t: Tally) => (t.expected > 0 ? `${t.done}/${t.expected}` : "");
const left = (t: Tally) => t.expected - t.done;
// "+3,2" or "−4,1": points out of 100 above or under the other jurors
const gapText = (gap: number | null) => (gap === null ? "" : `${gap > 0 ? "+" : gap < 0 ? "−" : ""}${frStat(Math.abs(gap))}`);
const centersText = (s: JurorSheet) => s.centers.map(centerLabel).join(", ");

const COLUMNS: (FilterColumn<JurorSheet> & { sortKind?: "text"; align?: "left" | "right" })[] = [
  { key: "name", label: "Juré", value: (s) => s.name, text: (s) => s.name, sortKind: "text" },
  { key: "centers", label: "Centres", value: centersText, text: centersText, sortKind: "text" },
  { key: "orals", label: "Oraux", value: (s) => left(s.orals), text: (s) => tallyText(s.orals) },
  { key: "reports", label: "Rapports", value: (s) => left(s.reports), text: (s) => tallyText(s.reports) },
  { key: "mean", label: "Note moyenne", value: (s) => s.meanPercent, text: (s) => (s.meanPercent === null ? "" : frStat(s.meanPercent)), range: true, align: "right" },
  { key: "gap", label: "Écart aux autres", value: (s) => s.gap, text: (s) => gapText(s.gap), range: true, align: "right" },
  { key: "left", label: "Reste à noter", value: (s) => left(s.all), text: (s) => String(left(s.all)), range: true, align: "right" },
];

export function JurorsView({
  sheets,
  teamById,
  criteria,
  linked,
  onOpen,
}: {
  sheets: JurorSheet[];
  teamById: Map<string, Team>;
  criteria: Criterion[];
  linked: string | null; // the juror the address names: unrolled when the page opens
  onOpen: (id: string | null) => void; // told which juror was unrolled last, so the address follows
}) {
  // Each row keeps to itself whether it is unrolled, so a click only renders
  // that row and answers at once. The address follows once the row has
  // settled: changing it renders the page again, which would make the
  // unrolling stutter. The rows sit that render out (memo), given the same
  // props each time.
  const [first] = useState(linked);
  const latest = useRef(onOpen);
  useEffect(() => {
    latest.current = onOpen;
  });
  // The address names the juror unrolled last, until that one is rolled back up
  const named = useRef(linked);
  const settling = useRef<number | undefined>(undefined);
  const tell = useCallback((id: string, unrolled: boolean) => {
    if (!unrolled && named.current !== id) return; // another juror is named: nothing to change
    named.current = unrolled ? id : null;
    window.clearTimeout(settling.current);
    settling.current = window.setTimeout(() => latest.current(named.current), SETTLED_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(settling.current), []);
  const { shown, narrowed, clear, menuProps } = useColumnFilters(sheets, COLUMNS);
  if (sheets.length === 0) {
    return <EmptyState icon={InboxIcon} title="Aucun juré à l'œuvre" sub="Les jurés apparaîtront ici quand des duos jugeront des passages ou que des rapports leur seront attribués." />;
  }
  const done = sheets.reduce((s, j) => s + j.all.done, 0);
  const expected = sheets.reduce((s, j) => s + j.all.expected, 0);

  return (
    <section>
      <SectionHeading
        title="Jurés"
        right={narrowed
          ? <FilterSummary shown={shown.length} total={sheets.length} unit="jurés" onClear={clear} />
          : <Badge tone={done === expected ? "sage" : "saffron"}>{done}/{expected} évaluations saisies</Badge>}
      />
      <p className="font-open text-sm mb-4" style={{ color: "var(--ink-soft)", maxWidth: "62rem" }}>
        Chaque note est ramenée sur 100 pour être comparée. <strong className="font-mont">Note moyenne</strong> : la moyenne de celles que
        le juré a données. <strong className="font-mont">Écart aux autres</strong> : ce qu'il met de plus ou de moins que les autres jurés
        quand ils notent la même prestation ou le même rapport. Par exemple, +5 veut dire qu'il met en moyenne 5 points sur 100 de plus
        qu'eux, et −5 qu'il en met 5 de moins. Cliquez sur un juré pour voir ses notes.
      </p>
      <BrutalCard className="overflow-hidden">
        <div className="table-scroll">
          <table className="brutal-table brutal-table--manual-stripes">
            <thead>
              <tr>
                {COLUMNS.map((c, i) => (
                  <th key={c.key} style={i === COLUMNS.length - 1 ? { borderRight: "none" } : undefined}>
                    <div className="flex items-center justify-between gap-2">
                      <span>{c.label}</span>
                      <ColumnFilterMenu {...menuProps(c)} emptyLabel="(Aucun)" sortKind={c.sortKind} align={c.align ?? "left"} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((sheet, i) => (
                <JurorRow
                  key={sheet.id}
                  sheet={sheet}
                  alt={i % 2 === 1}
                  startOpen={first === sheet.id}
                  onToggled={tell}
                  teamById={teamById}
                  criteria={criteria}
                />
              ))}
              {shown.length === 0 && <NoMatchRow colSpan={COLUMNS.length} label="Aucun juré ne correspond aux filtres." onClear={clear} />}
            </tbody>
          </table>
        </div>
      </BrutalCard>
    </section>
  );
}

// ─── One juror ───────────────────────────────────────────────────────

function Progress({ tally }: { tally: Tally }) {
  if (tally.expected === 0) return <span className="font-open text-micro" style={{ color: "var(--ink-faint)" }}>aucun</span>;
  return <Badge tone={tally.done === tally.expected ? "sage" : tally.done > 0 ? "saffron" : "neutral"}>{tally.done}/{tally.expected}</Badge>;
}

const JurorRow = memo(function JurorRow({
  sheet,
  alt,
  startOpen,
  onToggled,
  teamById,
  criteria,
}: {
  sheet: JurorSheet;
  alt: boolean;
  startOpen: boolean;
  onToggled: (id: string, unrolled: boolean) => void;
  teamById: Map<string, Team>;
  criteria: Criterion[];
}) {
  const [open, setOpen] = useState(startOpen);
  const onToggle = () => {
    setOpen(!open);
    onToggled(sheet.id, !open);
  };
  const rest = left(sheet.all);
  return (
    <>
      <tr
        className={`row-clickable${alt ? " row-alt" : ""}`}
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <td>
          <div className="flex items-center gap-2.5">
            <ExpandChevron open={open} />
            <div className="min-w-0">
              <div className="font-mont text-xs" style={{ color: "var(--forest)", fontWeight: 900 }}>{sheet.name}</div>
              <div className="font-open text-micro" style={{ color: "var(--ink-faint)" }}>
                {sheet.passages} passage{sheet.passages > 1 ? "s" : ""}
                {sheet.strays > 0 && `, ${sheet.strays} note${sheet.strays > 1 ? "s" : ""} hors affectation`}
              </div>
            </div>
          </div>
        </td>
        <td className="font-open text-xs">{centersText(sheet)}</td>
        <td><Progress tally={sheet.orals} /></td>
        <td><Progress tally={sheet.reports} /></td>
        <td className="font-mont tabular-nums text-right">
          {sheet.meanPercent === null ? <Waiting /> : (
            <span style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
              {frStat(sheet.meanPercent)}<span className="text-micro" style={{ color: "var(--ink-faint)" }}> %</span>
            </span>
          )}
        </td>
        <td className="font-mont tabular-nums text-right">
          {sheet.gap === null ? <Waiting /> : (
            <span style={{ color: "var(--forest)", fontWeight: 800 }}>
              {gapText(sheet.gap)}<span className="text-micro" style={{ color: "var(--ink-faint)" }}> pts</span>
            </span>
          )}
        </td>
        <td className="text-right" style={{ borderRight: "none" }}>
          {rest === 0 ? <Badge tone="sage">Tout est noté</Badge> : <Badge tone="saffron">{rest} à noter</Badge>}
        </td>
      </tr>
      <DetailRow open={open} colSpan={COLUMNS.length}>
        <JurorNotes sheet={sheet} teamById={teamById} criteria={criteria} />
      </DetailRow>
    </>
  );
});

function Waiting() {
  return <span className="font-open text-micro" style={{ color: "var(--ink-faint)", fontWeight: 400 }}>en attente</span>;
}

// ─── Their notes, passage by passage ─────────────────────────────────

interface Group {
  key: string;
  title: string;
  sub?: string;
  tasks: JurorTask[];
}

function groupsOf(sheet: JurorSheet): Group[] {
  const groups: Group[] = [];
  const owed = sheet.tasks.filter((t) => t.origin === "passage");
  for (const task of owed) {
    const { passage, pool } = task as { passage: NonNullable<JurorTask["passage"]>; pool: NonNullable<JurorTask["pool"]> };
    let group = groups.find((g) => g.key === passage.id);
    if (!group) {
      const day = pool.centerDay;
      const when = [day && centerLabel(day.center), day && formatDay(day.date), slotTime(day, passage.slot)?.start].filter(Boolean).join(", ");
      group = { key: passage.id, title: `${passage.label}, problème ${passage.problemNumber}`, sub: when, tasks: [] };
      groups.push(group);
    }
    group.tasks.push(task);
  }
  const assigned = sheet.tasks.filter((t) => t.origin === "assigned");
  if (assigned.length > 0) groups.push({ key: "assigned", title: "Rapports attribués", sub: "Les rapports des problèmes que leur équipe ne défend pas", tasks: assigned });
  const strays = sheet.tasks.filter((t) => t.origin === "stray");
  if (strays.length > 0) {
    groups.push({
      key: "strays",
      title: "Hors affectation",
      sub: "Des notes données pour un passage ou un rapport que ce juré ne juge plus : elles comptent toujours",
      tasks: strays,
    });
  }
  return groups;
}

function JurorNotes({ sheet, teamById, criteria }: { sheet: JurorSheet; teamById: Map<string, Team>; criteria: Criterion[] }) {
  const quad = (id: string) => teamById.get(id)?.quadrigram ?? "?";
  const subject = (t: JurorTask) =>
    t.kind === "oral"
      ? `${quad(t.teamId)}, ${ROLE_PALETTE[t.role].label.toLowerCase()} dans ${t.passage.label}`
      : `${quad(t.teamId)}, rapport du problème ${t.problemNumber}`;
  const editable = (t: JurorTask): EditableNote | null =>
    t.evaluation && t.total !== null
      ? {
        kind: t.kind,
        evaluation: t.evaluation,
        juror: sheet.name,
        subject: subject(t),
        criteria: t.kind === "oral" ? oralCriteria(criteria, t.role) : reportCriteria(criteria, t.problemNumber),
        total: t.total,
        max: t.max,
      }
      : null;

  return (
    <div className="px-5 py-4 grid gap-x-8 gap-y-5 lg:grid-cols-2">
      {groupsOf(sheet).map((group) => (
        <DetailPart key={group.key} className="min-w-0">
          <div className="font-mont text-micro uppercase tracking-widest" style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>{group.title}</div>
          {group.sub && <div className="font-open text-micro mb-1.5" style={{ color: "var(--ink-faint)" }}>{group.sub}</div>}
          <dl className="grid items-baseline gap-x-3 gap-y-1.5" style={{ gridTemplateColumns: "minmax(0, 1fr) auto auto" }}>
            {group.tasks.map((task) => {
              const note = editable(task);
              return (
                <Fragment key={task.key}>
                  <dt className="font-open text-xs min-w-0" style={{ color: "var(--ink)" }}>
                    <span className="font-mont" style={{ color: "var(--forest)", fontWeight: 900, letterSpacing: "0.05em" }}>{quad(task.teamId)}</span>{" "}
                    {task.kind === "oral" ? ROLE_PALETTE[task.role].label.toLowerCase() : `rapport écrit, problème ${task.problemNumber}`}
                    {task.remark && <span className="block italic" style={{ color: "var(--ink-soft)", overflowWrap: "anywhere" }}>« {task.remark} »</span>}
                  </dt>
                  <dd className="font-mont text-sm tabular-nums whitespace-nowrap text-right">
                    {task.total === null ? <span className="font-open text-micro" style={{ color: "var(--ink-faint)" }}>à noter</span> : (
                      <>
                        <span style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>{frNote(task.total)}</span>
                        <span className="text-micro" style={{ color: "var(--ink-faint)" }}> / {frNote(task.max)}</span>
                        {task.others !== null && task.percent !== null && (
                          // What the other jurors gave on the same thing, in the note's own unit
                          <span
                            className="block font-open text-micro"
                            style={{ color: "var(--ink-faint)", fontWeight: 400 }}
                            title={`Sur 100 : ${frStat(task.percent)} pour ce juré, ${frStat(task.others)} en moyenne pour les autres, soit un écart de ${gapText(task.percent - task.others)}.`}
                          >
                            autres jurés : {frNote((task.others / 100) * task.max)} / {frNote(task.max)}
                          </span>
                        )}
                        {task.countsZero && (
                          <span
                            className="block font-open text-micro"
                            style={{ color: "var(--clay)", fontWeight: 400 }}
                            title="Corrigé avant que la liste des admissibles soit arrêtée : l'équipe n'en fait pas partie, ce rapport compte 0"
                          >
                            compté 0, équipe non admissible
                          </span>
                        )}
                      </>
                    )}
                  </dd>
                  <dd className="whitespace-nowrap">{note && <NoteActions note={note} />}</dd>
                </Fragment>
              );
            })}
          </dl>
        </DetailPart>
      ))}
    </div>
  );
}
