import { useSearchParams } from "react-router-dom";
import { Badge, BrutalCard, SectionHeading, Segmented } from "@/features/shared/primitives";
import { easiestProblem, problemStats, type ProblemEntry, type ProblemStat } from "@/lib/services/problemStats";
import { FINAL_PART_LABELS, FINAL_PARTS, type FinalPart, type PassageResult } from "@/lib/services/results";
import { frStat, niceDomain } from "@/lib/services/stats";
import type { Criterion, ReportEvaluation, Team } from "@/types";
import { centerLabel } from "@/utils/labels";
import { Widget } from "../dashboard/charts";
import { BoxLegend, StripPlot, type StripRow } from "./charts";

// Problem by problem, on the Résultats page: for the part picked (a defense,
// an opposition, an oral report or a written report), how the teams spread
// on each problem, its figures, and the best of each.

const PODIUM = 3;

// What a part's note is called in a sentence
const PART_NAMES: Record<FinalPart, string> = {
  defender: "défenses",
  opponent: "oppositions",
  reporter: "rapports oraux",
  report: "rapports écrits",
};

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

export function ProblemStats({
  results,
  teams,
  criteria,
  report,
}: {
  results: PassageResult[];
  teams: Team[];
  criteria: Criterion[];
  report: ReportEvaluation[];
}) {
  const [params, setParams] = useSearchParams();
  const part = FINAL_PARTS.find((p) => p === params.get("epreuve")) ?? "defender";
  const pick = (next: FinalPart) => {
    const kept = new URLSearchParams(params);
    if (next === "defender") kept.delete("epreuve");
    else kept.set("epreuve", next);
    setParams(kept, { replace: true });
  };

  const stats = problemStats(part, results, teams, criteria, report);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const named = (e: ProblemEntry) => {
    const team = teamById.get(e.teamId);
    return { quad: team?.quadrigram ?? "?", center: team ? centerLabel(team.center) : "" };
  };
  const graded = stats.reduce((s, p) => s + p.entries.length, 0);
  const easiest = easiestProblem(stats);

  const row = (s: ProblemStat): StripRow => {
    const label = `Problème ${s.problem}`;
    const best = s.entries[0];
    return {
      key: String(s.problem),
      label,
      sub: s.summary ? plural(s.summary.count, "note") : "pas encore noté",
      dots: s.entries.map((e) => {
        const { quad, center } = named(e);
        return { key: `${e.teamId}:${e.passage ?? ""}`, value: e.value, text: `${quad} (${center}) : ${frStat(e.value)} %, problème ${s.problem}` };
      }),
      box: s.summary,
      text: s.summary
        ? `${label} : ${plural(s.summary.count, "note")}, de ${frStat(s.summary.min)} à ${frStat(s.summary.max)} %. Moyenne ${frStat(s.summary.mean)}, médiane ${frStat(s.summary.median)}, `
          + `écart type ${frStat(s.summary.stdDev)}. Meilleure : ${best ? `${named(best).quad}, ${frStat(best.value)} %` : ""}.`
        : `${label} : pas encore noté.`,
      cells: s.summary ? [frStat(s.summary.mean), frStat(s.summary.median), frStat(s.summary.stdDev), frStat(s.summary.max)] : ["", "", "", ""],
    };
  };

  return (
    <section>
      <SectionHeading
        title="Statistiques par problème"
        right={<Segmented options={FINAL_PARTS.map((p) => ({ value: p, label: FINAL_PART_LABELS[p] }))} value={part} onChange={pick} />}
      />
      {graded === 0 ? (
        <BrutalCard withCorners={false} className="p-5">
          <p className="font-open text-sm" style={{ color: "var(--ink-faint)" }}>
            Aucune note pour les {PART_NAMES[part]} pour l'instant.
          </p>
        </BrutalCard>
      ) : (
        <div className="grid gap-6 xl:grid-cols-12">
          <Widget
            title={`${FINAL_PART_LABELS[part]} : les notes de chaque problème`}
            sub={part === "report"
              ? "Tous les rapports écrits du problème, en % de leur grille : celui que l'équipe défend et les autres"
              : "En % de la grille. Opposant et rapporteur sont notés sur le problème du défenseur."}
            right={easiest && <Badge tone="sage">Le mieux réussi : problème {easiest.problem}</Badge>}
            className="xl:col-span-7"
          >
            <StripPlot
              label={`Les notes des ${PART_NAMES[part]}, problème par problème`}
              domain={niceDomain(stats.flatMap((s) => s.entries.map((e) => e.value)))}
              columns={["Moyenne", "Médiane", "Écart type", "Meilleure"]}
              rows={stats.map(row)}
              idle="Pointez un problème ou une équipe pour lire ses chiffres exacts."
              legend={<BoxLegend />}
              compact
            />
          </Widget>
          <Widget
            title="Meilleures prestations"
            sub={`Les ${PODIUM} meilleures notes de chaque problème`}
            className="xl:col-span-5"
          >
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              {stats.map((s) => (
                <div key={s.problem} className="min-w-0">
                  <h3 className="font-mont text-micro uppercase tracking-widest mb-1.5" style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
                    Problème {s.problem}
                  </h3>
                  {s.entries.length === 0 ? (
                    <p className="font-open text-xs italic" style={{ color: "var(--ink-faint)" }}>Pas encore noté.</p>
                  ) : (
                    <ol className="space-y-1.5">
                      {s.entries.slice(0, PODIUM).map((e, i) => {
                        const { quad, center } = named(e);
                        return (
                          <li key={`${e.teamId}:${e.passage ?? ""}`} className="flex items-baseline gap-2">
                            <span
                              className="font-mont text-micro tabular-nums shrink-0 text-center"
                              style={{
                                width: "1.25rem",
                                background: i === 0 ? "var(--forest)" : "transparent",
                                color: i === 0 ? "var(--saffron)" : "var(--ink-soft)",
                                border: "1px solid var(--forest)",
                                fontWeight: 900,
                              }}
                            >
                              {i + 1}
                            </span>
                            <span className="font-mont text-xs" style={{ color: "var(--forest)", fontWeight: 900, letterSpacing: "0.05em" }}>{quad}</span>
                            <span className="font-open text-micro truncate" style={{ color: "var(--ink-faint)" }}>{center}</span>
                            <span className="font-mont text-sm tabular-nums ml-auto whitespace-nowrap" style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
                              {frStat(e.value)}<span className="text-micro" style={{ color: "var(--ink-faint)" }}> %</span>
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          </Widget>
        </div>
      )}
    </section>
  );
}
