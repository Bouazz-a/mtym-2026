import { Badge, BrutalCard, SectionHeading } from "@/features/shared/primitives";
import { FINAL_PART_LABELS, type PassageResult } from "@/lib/services/results";
import { jurorAgreement } from "@/lib/services/standings";
import { frStat, niceDomain } from "@/lib/services/stats";
import type { Team } from "@/types";
import { Widget } from "../dashboard/charts";
import { BoxLegend, StripPlot, type StripRow } from "./charts";
import { plural } from "./text";

// Do the jurors of a duo agree? On the Résultats page, for every performance
// two jurors or more graded: how far apart their notes are, part by part.
// The Notes page tells it juror by juror (who grades higher than the others);
// here it is the part that is looked at: which one the jurors read most
// differently.

export function JurorAgreement({ results, teamById }: { results: PassageResult[]; teamById: Map<string, Team> }) {
  const parts = jurorAgreement(results);
  const compared = parts.reduce((s, p) => s + p.gaps.length, 0);

  const rows: StripRow[] = parts.map(({ part, gaps, summary }) => {
    const label = FINAL_PART_LABELS[part];
    const counted = summary ? plural(summary.count, part === "report" ? "rapport" : "prestation") : "";
    return {
      key: part,
      label,
      sub: summary ? counted : "rien à comparer",
      dots: gaps.map((g) => ({
        key: g.key,
        value: g.gap,
        text: `${teamById.get(g.teamId)?.quadrigram ?? "?"}, passage ${g.passage} : ${frStat(g.gap)} points d'écart entre ses ${g.jurors} jurés`,
      })),
      box: summary,
      text: summary
        ? `${label} : ${counted}. Écart moyen ${frStat(summary.mean)} points, médian ${frStat(summary.median)}, le plus grand ${frStat(summary.max)}. `
          + `La moitié des écarts vont de ${frStat(summary.q1)} à ${frStat(summary.q3)}.`
        : `${label} : aucune note à comparer pour l'instant.`,
      cells: summary ? [frStat(summary.mean), frStat(summary.median), frStat(summary.max)] : ["", "", ""],
    };
  });

  return (
    <section>
      <SectionHeading
        title="Accord entre jurés"
        right={<Badge tone="neutral">{compared} {compared > 1 ? "prestations comparées" : "prestation comparée"}</Badge>}
      />
      {compared === 0 ? (
        <BrutalCard withCorners={false} className="p-5">
          <p className="font-open text-sm" style={{ color: "var(--ink-faint)" }}>
            L'accord entre jurés apparaîtra dès qu'une prestation aura été notée par deux jurés.
          </p>
        </BrutalCard>
      ) : (
        <div className="space-y-6">
          <p className="font-open text-sm" style={{ color: "var(--ink-soft)", maxWidth: "62rem" }}>
            Chaque passage est noté par un duo de jurés, qui corrige aussi le rapport écrit du problème défendu. Pour chaque prestation (un
            rôle dans un passage, ou ce rapport), l'<strong className="font-mont">écart</strong> est la note la plus haute moins la plus
            basse, chacune ramenée sur 100 : à 0, les jurés ont mis la même note. Les autres rapports écrits, corrigés par un seul juré,
            n'ont rien à comparer.
          </p>
          <Widget title="Écart entre les jurés d'un même duo" sub="Un point par prestation, en points sur 100. Plus il est à gauche, plus ses jurés sont d'accord.">
            <StripPlot
              label="L'écart entre les jurés d'un même duo, épreuve par épreuve"
              domain={[0, niceDomain(parts.flatMap((p) => p.gaps.map((g) => g.gap)))[1]]}
              columns={["Moyenne", "Médiane", "Maximum"]}
              rows={rows}
              idle="Pointez une épreuve ou une prestation pour lire ses chiffres exacts."
              legend={<BoxLegend one="une prestation" half="la moitié des prestations" />}
            />
          </Widget>
        </div>
      )}
    </section>
  );
}
