import { Badge, BrutalCard, SectionHeading } from "@/features/shared/primitives";
import { ColumnFilterMenu, FilterSummary, NoMatchRow } from "@/features/shared/ColumnFilterMenu";
import { useColumnFilters } from "@/features/shared/useColumnFilters";
import type { FilterColumn } from "@/lib/services/columnFilters";
import { frNote } from "@/lib/services/gradingService";
import type { Standing } from "@/lib/services/standings";
import { quantile } from "@/lib/services/stats";
import type { Team } from "@/types";
import { centerLabel } from "@/utils/labels";
import { SignedBar } from "./charts";
import { signedText } from "./text";

// The three rankings, on the Résultats page: every team's place on its final
// grade, on its oral alone and on its written report alone, all centers
// together, and the places between the last two. In the order of the final
// ranking until a column is sorted. The places are those among every team:
// a filter hides rows, it doesn't rank again.

interface Ranked extends Standing {
  quad: string;
  name: string;
  center: string; // its label
}

const pctText = (p: number) => frNote(Math.round(p * 10) / 10);
const rankText = (rank: number | null) => (rank === null ? "" : String(rank));
const teamText = (r: Ranked) => (r.name ? `${r.quad} (${r.name})` : r.quad);

interface Column extends FilterColumn<Ranked> {
  empty: string; // how a missing value reads in the checklist
  sortKind?: "text";
  rangeLabel?: string;
  align?: "left" | "right";
}

const RANK = "Rang entre";
const COLUMNS: Column[] = [
  { key: "rank", label: "Rang", value: (r) => r.ranks.final, text: (r) => rankText(r.ranks.final), range: true, rangeLabel: RANK, empty: "(Non classée)" },
  { key: "team", label: "Équipe", value: teamText, text: teamText, sortKind: "text", empty: "(Aucune)" },
  { key: "center", label: "Centre", value: (r) => r.center, text: (r) => r.center, sortKind: "text", empty: "(Aucun)" },
  { key: "final", label: "Note finale", value: (r) => r.notes.final, text: (r) => (r.notes.final === null ? "" : pctText(r.notes.final)), range: true, empty: "(Non notée)" },
  { key: "oral", label: "Oral seul", value: (r) => r.ranks.oral, text: (r) => rankText(r.ranks.oral), range: true, rangeLabel: RANK, align: "right", empty: "(Non classée)" },
  { key: "report", label: "Écrit seul", value: (r) => r.ranks.report, text: (r) => rankText(r.ranks.report), range: true, rangeLabel: RANK, align: "right", empty: "(Non classée)" },
  { key: "gap", label: "Écart", value: (r) => r.gap, text: (r) => (r.gap === null ? "" : signedText(r.gap)), range: true, rangeLabel: "Écart entre", align: "right", empty: "(Aucun)" },
];

// The final ranking first; the teams still waiting for their grade after it
const finalPlace = (r: Ranked) => r.ranks.final ?? Number.MAX_SAFE_INTEGER;

export function Rankings({ list, teamById }: { list: Standing[]; teamById: Map<string, Team> }) {
  const rows: Ranked[] = list.map((s) => {
    const team = teamById.get(s.teamId);
    return { ...s, quad: team?.quadrigram ?? "?", name: team?.name ?? "", center: team ? centerLabel(team.center) : "" };
  });
  const ordered = [...rows].sort((a, b) => finalPlace(a) - finalPlace(b) || a.quad.localeCompare(b.quad));
  const { shown, narrowed, clear, menuProps } = useColumnFilters<Ranked>(ordered, COLUMNS);
  const ranked = rows.filter((r) => r.ranks.final !== null).length;
  // Half the bar holds nine gaps in ten at their true length; the few beyond fill it
  const reach = Math.max(1, quantile(rows.flatMap((r) => (r.gap === null ? [] : [Math.abs(r.gap)])), 0.9) ?? 1);

  return (
    <section>
      <SectionHeading
        title="Classements"
        right={narrowed
          ? <FilterSummary shown={shown.length} total={rows.length} unit="équipes" onClear={clear} />
          : <Badge tone={ranked === rows.length ? "sage" : "saffron"}>{ranked}/{rows.length} équipes classées</Badge>}
      />
      <p className="font-open text-sm mb-4" style={{ color: "var(--ink-soft)", maxWidth: "62rem" }}>
        Chaque équipe est classée trois fois parmi toutes les équipes, tous centres confondus : sur sa{" "}
        <strong className="font-mont">note finale</strong>, sur son <strong className="font-mont">oral seul</strong> (ses trois rôles, avec
        leurs coefficients) et sur son <strong className="font-mont">rapport écrit seul</strong>. Deux équipes à égalité partagent leur place.{" "}
        <strong className="font-mont">Écart</strong> : sa place à l'écrit moins sa place à l'oral. Par exemple, +5 veut dire qu'elle est 5
        places plus haut à l'oral qu'à l'écrit, et −5 qu'elle est 5 places plus haut à l'écrit. Les filtres ne changent pas les places.
      </p>
      <BrutalCard className="overflow-hidden">
        <div className="table-scroll">
          <table className="brutal-table">
            <thead>
              <tr>
                {COLUMNS.map((c, i) => {
                  const final = c.key === "final";
                  return (
                    <th
                      key={c.key}
                      className={c.key === "rank" ? "col-tight" : undefined}
                      style={{
                        ...(final && { background: "var(--saffron)", color: "var(--forest)" }),
                        ...(i === COLUMNS.length - 1 && { borderRight: "none" }),
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>{c.label}</span>
                        <ColumnFilterMenu
                          {...menuProps(c)}
                          emptyLabel={c.empty}
                          sortKind={c.sortKind}
                          rangeLabel={c.rangeLabel}
                          align={c.align ?? "left"}
                          tone={final ? "light" : "dark"}
                        />
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.teamId}>
                  <td className="col-tight font-mont tabular-nums">
                    {r.ranks.final === null ? <Pending /> : <span style={{ color: "var(--forest)", fontWeight: 900, fontSize: "0.95rem" }}>{r.ranks.final}</span>}
                  </td>
                  <td>
                    <div className="font-mont" style={{ color: "var(--forest)", fontWeight: 900, letterSpacing: "0.05em" }}>{r.quad}</div>
                    <div className="font-open text-xs" style={{ color: "var(--ink-soft)" }}>{r.name}</div>
                  </td>
                  <td className="font-open text-xs">{r.center}</td>
                  <td className="final-cell font-mont tabular-nums">
                    {r.notes.final === null ? <Pending /> : (
                      <span style={{ color: "var(--forest)", fontWeight: 900, fontSize: "0.95rem" }}>
                        {pctText(r.notes.final)}<span className="text-micro"> %</span>
                      </span>
                    )}
                  </td>
                  <td className="font-mont tabular-nums"><Place rank={r.ranks.oral} note={r.notes.oral} /></td>
                  <td className="font-mont tabular-nums"><Place rank={r.ranks.report} note={r.notes.report} /></td>
                  <td className="font-mont tabular-nums" style={{ borderRight: "none" }}>
                    {r.gap === null ? <Pending /> : (
                      <div className="flex items-center gap-3">
                        <span className="text-right shrink-0" style={{ width: "2.25rem", color: "var(--forest)", fontWeight: 900 }}>{signedText(r.gap)}</span>
                        <span className="flex-1" style={{ minWidth: "4rem", maxWidth: "9rem" }}>
                          <SignedBar value={r.gap} reach={reach} colors={["var(--saffron-dark)", "var(--forest)"]} />
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <NoMatchRow colSpan={COLUMNS.length} label="Aucune équipe ne correspond aux filtres." onClear={clear} />}
            </tbody>
          </table>
        </div>
      </BrutalCard>
    </section>
  );
}

// A team's place in one of the two halves, and the note that earns it
function Place({ rank, note }: { rank: number | null; note: number | null }) {
  if (rank === null || note === null) return <Pending />;
  return (
    <span className="inline-flex items-baseline gap-2.5">
      <span className="text-right" style={{ minWidth: "2rem", color: "var(--forest)", fontWeight: 900 }}>
        {rank}<span className="text-micro" style={{ color: "var(--ink-faint)" }}>{rank === 1 ? "re" : "e"}</span>
      </span>
      <span className="text-xs" style={{ color: "var(--saffron-dark)", fontWeight: 800 }}>
        {pctText(note)}<span className="text-micro" style={{ color: "var(--ink-faint)" }}> %</span>
      </span>
    </span>
  );
}

// A place or a note that isn't there yet
function Pending() {
  return <span className="font-open text-micro" style={{ color: "var(--ink-faint)", fontWeight: 400 }}>en attente</span>;
}
