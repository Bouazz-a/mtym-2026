import type { ReactNode } from "react";
import { Badge, BrutalCard, SectionHeading } from "@/features/shared/primitives";
import { FINAL_PART_LABELS, FINAL_PARTS, percent, type TeamResult } from "@/lib/services/results";
import { bins, frStat, niceDomain, summarize, type Summary } from "@/lib/services/stats";
import type { Team } from "@/types";
import { CENTERS, centerLabel } from "@/utils/labels";
import { GroupedBars, Meter, Widget } from "../dashboard/charts";
import { BoxLegend, Histogram, ScaleBar, StripPlot, type StripRow } from "./charts";

// The statistics of the final grades, above the Résultats table: the key
// figures, how the teams spread, how each of the four notes went, and the
// centers side by side. All teams together: the table below filters, these
// figures don't.

interface Noted {
  teamId: string;
  quadrigram: string;
  center: string; // its label
  final: number;
}

const teamsText = (n: number) => `${n} équipe${n > 1 ? "s" : ""}`;

export function ResultsStats({ rows, teamById }: { rows: TeamResult[]; teamById: Map<string, Team> }) {
  const noted: Noted[] = rows.flatMap((row) => {
    const team = teamById.get(row.teamId);
    const center = row.pool.centerDay?.center ?? team?.center;
    return row.final === null || !team || !center ? [] : [{ teamId: row.teamId, quadrigram: team.quadrigram, center: centerLabel(center), final: row.final }];
  });
  const finals = noted.map((t) => t.final);
  const national = summarize(finals);

  return (
    <section>
      <SectionHeading
        title="Statistiques des notes finales"
        right={<Badge tone={noted.length === rows.length ? "sage" : "saffron"}>{noted.length}/{rows.length} équipes notées</Badge>}
      />
      {!national ? (
        <BrutalCard withCorners={false} className="p-5">
          <p className="font-open text-sm" style={{ color: "var(--ink-faint)" }}>
            Les statistiques apparaîtront avec les premières notes finales : une équipe a la sienne quand ses quatre notes sont saisies.
          </p>
        </BrutalCard>
      ) : (
        <div className="space-y-6">
          <KeyFigures summary={national} total={rows.length} />
          <div className="grid gap-6 xl:grid-cols-12">
            <Widget title="Répartition" sub="Nombre d'équipes par tranche de 5 points de note finale" className="xl:col-span-7">
              <Histogram
                classes={bins(noted, (t) => t.final, 5)}
                name={(t) => t.quadrigram}
                label="Nombre d'équipes par tranche de note finale"
                idle={`${teamsText(national.count)}, de ${frStat(national.min)} à ${frStat(national.max)} %. Pointez une barre pour voir ses équipes.`}
                lines={[
                  { key: "mean", label: "Moyenne", value: national.mean, color: "var(--saffron-dark)" },
                  { key: "median", label: "Médiane", value: national.median, color: "var(--sage)", style: "dashed" },
                ]}
              />
            </Widget>
            <Widget title="Par épreuve" sub="Chaque note en % de sa grille. La légende masque une série." className="xl:col-span-5">
              <PartsChart rows={rows} />
            </Widget>
            <Widget title="Centres" sub="Les notes finales de chaque centre, sur la même échelle" className="xl:col-span-12">
              <CentersChart noted={noted} />
            </Widget>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── The key figures, each placed on the scale of the notes ──────────

function KeyFigures({ summary: s, total }: { summary: Summary; total: number }) {
  const tiles: { label: string; value: string; unit?: string; sub?: string; bar: ReactNode }[] = [
    { label: "Équipes notées", value: String(s.count), sub: `sur ${total} en poule`, bar: <Meter done={s.count} total={total} label="Équipes notées" height="0.375rem" /> },
    { label: "Moyenne", value: frStat(s.mean), unit: "%", bar: <ScaleBar at={s.mean} /> },
    { label: "Médiane", value: frStat(s.median), unit: "%", sub: "la moitié des équipes au-dessus", bar: <ScaleBar at={s.median} /> },
    { label: "Écart type", value: frStat(s.stdDev), sub: `variance ${frStat(s.variance)}`, bar: <ScaleBar at={s.mean} span={[s.mean - s.stdDev, s.mean + s.stdDev]} /> },
    { label: "MAD", value: frStat(s.mad), sub: "écart médian à la médiane", bar: <ScaleBar at={s.median} span={[s.median - s.mad, s.median + s.mad]} /> },
    { label: "Étendue", value: `${frStat(s.min)} à ${frStat(s.max)}`, sub: `quartiles ${frStat(s.q1)} et ${frStat(s.q3)}`, bar: <ScaleBar span={[s.min, s.max]} /> },
  ];
  return (
    <div>
      <BrutalCard withCorners={false}>
        <dl className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-px" style={{ background: "var(--border)" }}>
          {tiles.map((t) => (
            <div key={t.label} className="px-4 py-3 flex flex-col" style={{ background: "var(--surface)" }}>
              <dt className="font-mont text-micro uppercase tracking-widest" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>{t.label}</dt>
              <dd className="font-mont leading-none tabular-nums mt-2" style={{ fontSize: "1.6rem", color: "var(--forest)", fontWeight: 900, letterSpacing: "-0.02em" }}>
                {t.value}
                {t.unit && <span className="text-xs ml-1" style={{ color: "var(--ink-faint)", letterSpacing: 0 }}>{t.unit}</span>}
              </dd>
              <dd className="font-open text-xs mt-1 mb-3" style={{ color: "var(--ink-faint)", minHeight: "1rem" }}>{t.sub}</dd>
              <dd className="mt-auto">{t.bar}</dd>
            </div>
          ))}
        </dl>
      </BrutalCard>
      <p className="font-open text-xs mt-2" style={{ color: "var(--ink-faint)" }}>
        Sous chaque chiffre, sa place sur l'échelle des notes, de 0 à 100 %. Variance et écart type sont ceux de toutes les équipes notées (diviseur n).
      </p>
    </div>
  );
}

// ─── The four notes, side by side ────────────────────────────────────

const PART_SERIES = [
  { key: "mean", label: "Moyenne", color: "var(--forest)" },
  { key: "median", label: "Médiane", color: "var(--saffron-dark)", hatched: true },
  { key: "stdDev", label: "Écart type", color: "var(--sage)" },
];

function PartsChart({ rows }: { rows: TeamResult[] }) {
  const groups = FINAL_PARTS.map((key) => {
    const s = summarize(rows.flatMap((row) => {
      const p = percent(row.notes[key]);
      return p === null ? [] : [p];
    }));
    return { key, label: FINAL_PART_LABELS[key], values: { mean: Math.round(s?.mean ?? 0), median: Math.round(s?.median ?? 0), stdDev: Math.round(s?.stdDev ?? 0) } };
  });
  return <GroupedBars label="Moyenne, médiane et écart type de chaque note, en % de sa grille" series={PART_SERIES} groups={groups} height="11rem" />;
}

// ─── Every center's teams on one scale ───────────────────────────────

const figure = (s: Summary) => [frStat(s.mean), frStat(s.median), frStat(s.stdDev), frStat(s.variance)];

const spelled = (label: string, s: Summary) =>
  `${label} : ${teamsText(s.count)}, de ${frStat(s.min)} à ${frStat(s.max)} %. Quartiles ${frStat(s.q1)} et ${frStat(s.q3)}, médiane ${frStat(s.median)}, `
  + `moyenne ${frStat(s.mean)}, écart type ${frStat(s.stdDev)}, variance ${frStat(s.variance)}, MAD ${frStat(s.mad)}.`;

function CentersChart({ noted }: { noted: Noted[] }) {
  const row = (key: string, label: string, teams: Noted[], strong = false): StripRow => {
    const s = summarize(teams.map((t) => t.final))!;
    return {
      key,
      label,
      sub: teamsText(s.count),
      dots: teams.map((t) => ({ key: t.teamId, value: t.final, text: `${t.quadrigram} (${t.center}) : ${frStat(t.final)} %` })),
      box: s,
      text: spelled(label, s),
      cells: figure(s),
      strong,
    };
  };
  const centers = CENTERS.map((c) => ({ ...c, teams: noted.filter((t) => t.center === c.label) })).filter((c) => c.teams.length > 0);
  return (
    <StripPlot
      label="Les notes finales de chaque centre"
      domain={niceDomain(noted.map((t) => t.final))}
      columns={["Moyenne", "Médiane", "Écart type", "Variance"]}
      rows={[row("national", "National", noted, true), ...centers.map((c) => row(c.value, c.label, c.teams))]}
      idle="Pointez un centre ou une équipe pour lire ses chiffres exacts."
      legend={<BoxLegend />}
    />
  );
}
