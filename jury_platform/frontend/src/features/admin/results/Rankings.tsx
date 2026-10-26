import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, BrutalCard, SectionHeading, Segmented } from "@/features/shared/primitives";
import { ColumnFilterMenu, FilterSummary, NoMatchRow } from "@/features/shared/ColumnFilterMenu";
import { useColumnFilters } from "@/features/shared/useColumnFilters";
import {
  admissibleCount, cut, drift, missingText, parseSelection, type AdmissibilityRow,
} from "@/lib/services/admissibility";
import type { FilterColumn } from "@/lib/services/columnFilters";
import { frNote } from "@/lib/services/gradingService";
import type { FinalPart, WrittenNote } from "@/lib/services/results";
import type { Standing } from "@/lib/services/standings";
import { quantile, ranking } from "@/lib/services/stats";
import type { AdmissibleList, FinalWeights, Team } from "@/types";
import { centerLabel } from "@/utils/labels";
import { AdmissiblesPanel } from "./Admissibles";
import { SignedBar } from "./charts";
import { placeText, signedText } from "./text";

// The rankings, on the Résultats page: every team's place on its final
// grade, on its oral alone and on its written report alone, all centers
// together, and the places between the last two. Then its place on the
// admissibility note (phase A of the selection: the report graded at the
// oral stands for the written part) and whether it is admissible: the first
// λ × n are, and the list can be fixed from here (results/Admissibles).
// In the order of the final ranking, or of the admissibility ranking with
// its cut line, until a column is sorted. The places are those among every
// team: a filter hides rows, it doesn't rank again.

type Status = "Admissible" | "Non admissible" | "Incomplète";

interface Ranked extends Standing {
  quad: string;
  name: string;
  center: string; // its label
  admRank: number | null;
  admNote: number | null;
  missing: FinalPart[];
  status: Status;
  extendedRank: number | null; // among the fixed admissibles, on the final grade
  reports: WrittenNote | undefined;
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
  { key: "admissibility", label: "Admissibilité", value: (r) => r.admRank, text: (r) => rankText(r.admRank), range: true, rangeLabel: RANK, align: "right", empty: "(Non classée)" },
  { key: "status", label: "Statut", value: (r) => r.status, text: (r) => r.status, sortKind: "text", align: "right", empty: "(Aucun)" },
];

const ORDERS = [{ value: "finale", label: "Note finale" }, { value: "admissibilite", label: "Admissibilité" }] as const;
type Order = (typeof ORDERS)[number]["value"];
const STATUS_TONE = { Admissible: "sage", "Non admissible": "neutral", Incomplète: "saffron" } as const;

const lastPlace = (rank: number | null) => rank ?? Number.MAX_SAFE_INTEGER;
// The committee's procedure: 2n admissibles
const DEFAULT_LAMBDA = "2";

export function Rankings({
  list,
  teamById,
  admissibility,
  admissibles,
  written,
  weights,
}: {
  list: Standing[];
  teamById: Map<string, Team>;
  admissibility: AdmissibilityRow[];
  admissibles: AdmissibleList | null;
  written: Map<string, WrittenNote>;
  weights: FinalWeights;
}) {
  const [params, setParams] = useSearchParams();
  const order: Order = params.get("ordre") === "admissibilite" ? "admissibilite" : "finale";
  // n and λ, typed as text (λ takes a decimal comma). The address follows a
  // moment later, without piling up history.
  const [placesText, setPlacesText] = useState(() => params.get("n") ?? "35");
  const [lambdaText, setLambdaText] = useState(() => params.get("lambda") ?? DEFAULT_LAMBDA);
  useEffect(() => {
    const id = window.setTimeout(() => setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("n", placesText.trim());
      next.set("lambda", lambdaText.trim());
      return next;
    }, { replace: true }), 400);
    return () => window.clearTimeout(id);
  }, [placesText, lambdaText, setParams]);
  const pickOrder = (next: Order) => setParams((prev) => {
    const kept = new URLSearchParams(prev);
    if (next === "finale") kept.delete("ordre");
    else kept.set("ordre", next);
    return kept;
  }, { replace: true });

  // Who is admissible: the fixed list, or what the ranking gives for n and λ as typed
  const typed = parseSelection(placesText, lambdaText, list.length);
  const count = typed.error ? 0 : admissibleCount(typed.places, typed.lambda);
  const byAdmissibility = [...admissibility].sort((a, b) => lastPlace(a.rank) - lastPlace(b.rank));
  const live = cut(admissibility, count);
  const admissible = admissibles ? new Set(admissibles.teamIds) : live;
  const moved = admissibles ? drift(admissibles.teamIds, cut(admissibility, admissibleCount(admissibles.places, admissibles.lambda))) : null;
  const rowOf = new Map(admissibility.map((r) => [r.teamId, r]));
  // Once fixed, the admissibles ranked among themselves on the final grade, all their reports counted
  const extended = new Map<string, number>();
  if (admissibles) {
    const graded = list.filter((s) => admissible.has(s.teamId) && s.notes.final !== null);
    ranking(graded.map((s) => s.notes.final!)).forEach((place, i) => extended.set(graded[i].teamId, place));
  }

  const rows: Ranked[] = list.map((s) => {
    const team = teamById.get(s.teamId);
    const adm = rowOf.get(s.teamId);
    return {
      ...s,
      quad: team?.quadrigram ?? "?",
      name: team?.name ?? "",
      center: team ? centerLabel(team.center) : "",
      admRank: adm?.rank ?? null,
      admNote: adm?.note ?? null,
      missing: adm?.missing ?? [],
      status: admissible.has(s.teamId) ? "Admissible" : adm?.rank == null ? "Incomplète" : "Non admissible",
      extendedRank: extended.get(s.teamId) ?? null,
      reports: written.get(s.teamId),
    };
  });
  const place = (r: Ranked) => lastPlace(order === "admissibilite" ? r.admRank : r.ranks.final);
  const ordered = [...rows].sort((a, b) => place(a) - place(b) || a.quad.localeCompare(b.quad));
  const { shown, narrowed, clear, menuProps } = useColumnFilters<Ranked>(ordered, COLUMNS);
  const ranked = rows.filter((r) => r.ranks.final !== null).length;
  // Half the bar holds nine gaps in ten at their true length; the few beyond fill it
  const reach = Math.max(1, quantile(rows.flatMap((r) => (r.gap === null ? [] : [Math.abs(r.gap)])), 0.9) ?? 1);
  // The cut line: in the admissibility order, under the last admissible, when they all come first
  const lastIn = shown.findLastIndex((r) => r.status === "Admissible");
  const cutAt = order === "admissibilite" && !narrowed && lastIn >= 0 && lastIn < shown.length - 1
    && shown.slice(0, lastIn + 1).every((r) => r.status === "Admissible") ? lastIn : -1;

  return (
    <section>
      <SectionHeading
        title="Classements"
        right={narrowed
          ? <FilterSummary shown={shown.length} total={rows.length} unit="équipes" onClear={clear} />
          : <Badge tone={ranked === rows.length ? "sage" : "saffron"}>{ranked}/{rows.length} équipes classées</Badge>}
      />
      <p className="font-open text-sm mb-4" style={{ color: "var(--ink-soft)", maxWidth: "62rem" }}>
        Chaque équipe est classée parmi toutes les équipes, tous centres confondus : sur sa{" "}
        <strong className="font-mont">note finale</strong>, sur son <strong className="font-mont">oral seul</strong> (ses trois rôles, avec
        leurs coefficients), sur son <strong className="font-mont">rapport écrit seul</strong> et sur sa{" "}
        <strong className="font-mont">note d'admissibilité</strong>, où le rapport noté à l'oral tient lieu d'écrit. Deux équipes à égalité
        partagent leur place. <strong className="font-mont">Écart</strong> : sa place à l'écrit moins sa place à l'oral. Par exemple, +5 veut
        dire qu'elle est 5 places plus haut à l'oral qu'à l'écrit, et −5 qu'elle est 5 places plus haut à l'écrit. Les filtres ne changent pas
        les places.
      </p>

      <AdmissiblesPanel
        list={admissibles}
        weights={weights}
        placesText={placesText}
        lambdaText={lambdaText}
        onPlaces={setPlacesText}
        onLambda={setLambdaText}
        typed={typed}
        count={count}
        chosen={byAdmissibility.filter((r) => live.has(r.teamId)).map((r) => r.teamId)}
        incomplete={admissibility.filter((r) => r.rank === null)}
        moved={moved}
        teamById={teamById}
        played={list.length}
      />

      <div className="flex flex-wrap items-center justify-end gap-3 mb-3">
        <span className="font-mont text-micro uppercase tracking-widest" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>Ordre</span>
        <Segmented options={[...ORDERS]} value={order} onChange={pickOrder} />
      </div>

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
              {shown.map((r, i) => (
                <RankRow key={r.teamId} row={r} reach={reach} cut={i === cutAt ? admissible.size : null} fixed={Boolean(admissibles)} />
              ))}
              {shown.length === 0 && <NoMatchRow colSpan={COLUMNS.length} label="Aucune équipe ne correspond aux filtres." onClear={clear} />}
            </tbody>
          </table>
        </div>
      </BrutalCard>
    </section>
  );
}

function RankRow({ row: r, reach, cut, fixed }: { row: Ranked; reach: number; cut: number | null; fixed: boolean }) {
  return (
    <>
      <tr>
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
        <td className="font-mont tabular-nums">
          {r.gap === null ? <Pending /> : (
            <div className="flex items-center gap-3">
              <span className="text-right shrink-0" style={{ width: "2.25rem", color: "var(--forest)", fontWeight: 900 }}>{signedText(r.gap)}</span>
              <span className="flex-1" style={{ minWidth: "4rem", maxWidth: "9rem" }}>
                <SignedBar value={r.gap} reach={reach} colors={["var(--saffron-dark)", "var(--forest)"]} />
              </span>
            </div>
          )}
        </td>
        <td className="font-mont tabular-nums"><Place rank={r.admRank} note={r.admNote} /></td>
        <td className="text-right" style={{ borderRight: "none" }}>
          <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
          <StatusDetail row={r} fixed={fixed} />
        </td>
      </tr>
      {cut !== null && (
        <tr className="admissible-cut">
          <td colSpan={COLUMNS.length} style={{ borderRight: "none" }}>
            <span>Coupure : les {cut} premières sont admissibles</span>
          </td>
        </tr>
      )}
    </>
  );
}

// Under the status: what an incomplete team misses, and once the list is
// fixed, an admissible's place among the admissibles and its reports graded
function StatusDetail({ row: r, fixed }: { row: Ranked; fixed: boolean }) {
  const line = r.status === "Incomplète"
    ? `manque : ${missingText(r.missing)}`
    : fixed && r.status === "Admissible"
      ? [r.extendedRank !== null && `${placeText(r.extendedRank)} des admissibles`, r.reports && `${r.reports.graded}/${r.reports.submitted} rapports notés`].filter(Boolean).join(", ")
      : fixed && r.reports && r.reports.zeroed.length > 0
        ? "autres rapports comptés 0"
        : "";
  if (!line) return null;
  return <div className="font-open text-micro mt-0.5 whitespace-nowrap" style={{ color: "var(--ink-faint)" }}>{line}</div>;
}

// A team's place in one of the rankings, and the note that earns it
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
