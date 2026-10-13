import { useState } from "react";
import { Badge, BrutalCard, SectionHeading } from "@/features/shared/primitives";
import { FINAL_PART_LABELS, type FinalPart } from "@/lib/services/results";
import {
  agreement, correlation, notePoints, partInfluence, topShift, widestGaps, type Agreement, type NoteKey, type Standing,
} from "@/lib/services/standings";
import { frStat, linearFit, stdDev } from "@/lib/services/stats";
import type { Team } from "@/types";
import { centerLabel } from "@/utils/labels";
import { GroupedBars, Meter, Toggle, Widget } from "../dashboard/charts";
import { Figures, ScaleBar, Scatter, SignedBar, type Figure } from "./charts";
import { corrText, linkText, placeText, plural, signedText } from "./text";

// Oral and written, side by side, on the Résultats page: do the teams strong
// at the oral hand in the best reports? The key figures, any two notes as a
// cloud of points, what each part really weighs in the final grade, the teams
// the two halves rank furthest apart, and who would stay among the first were
// one half the only one to count. All teams together, like the statistics
// above.

// A team as a chart or a list names it
type Named = (teamId: string) => { quad: string; center: string; tag: string };

export function OralWritten({
  list,
  weights,
  teamById,
}: {
  list: Standing[];
  weights: Record<FinalPart, number>;
  teamById: Map<string, Team>;
}) {
  const figures = agreement(list);
  const named: Named = (teamId) => {
    const team = teamById.get(teamId);
    if (!team) return { quad: "?", center: "", tag: "?" };
    const center = centerLabel(team.center);
    return { quad: team.quadrigram, center, tag: `${team.quadrigram} (${center})` };
  };

  return (
    <section>
      <SectionHeading
        title="Oral et rapport écrit"
        right={<Badge tone={figures.count === list.length ? "sage" : "saffron"}>{figures.count}/{list.length} équipes avec les deux notes</Badge>}
      />
      {figures.count < 3 ? (
        <BrutalCard withCorners={false} className="p-5">
          <p className="font-open text-sm" style={{ color: "var(--ink-faint)" }}>
            L'oral et l'écrit seront comparés dès que trois équipes auront leurs trois notes d'oral et leur note de rapport écrit.
          </p>
        </BrutalCard>
      ) : (
        <div className="space-y-6">
          <p className="font-open text-sm" style={{ color: "var(--ink-soft)", maxWidth: "62rem" }}>
            L'<strong className="font-mont">oral</strong> d'une équipe réunit ses trois rôles (défense, opposition, rapporteur), pondérés par leurs
            coefficients. L'<strong className="font-mont">écrit</strong> est sa note de rapport écrit. Les équipes fortes à l'oral sont-elles
            celles qui rendent les meilleurs rapports ? Une <strong className="font-mont">corrélation</strong> le mesure de −1 à 1 : proche de 1,
            les deux notes montent ensemble ; proche de 0, l'une ne dit rien de l'autre ; sous 0, elles vont en sens inverse.
          </p>
          <KeyFigures figures={figures} />
          <div className="grid gap-6 xl:grid-cols-12">
            <Correlations list={list} named={named} />
            <Influence list={list} weights={weights} />
            <WidestGaps list={list} named={named} />
            <TopShift list={list} named={named} />
          </div>
        </div>
      )}
    </section>
  );
}

// ─── The oral and the written report, in four figures ────────────────

function KeyFigures({ figures: f }: { figures: Agreement }) {
  const link = (label: string, r: number | null, method: string): Figure => ({
    label,
    value: r === null ? "?" : corrText(r),
    sub: r === null ? `${method} : une des deux notes ne varie pas` : `${method} : ${linkText(r)}`,
    bar: r !== null && <SignedBar value={r} grow />,
  });
  const tiles: Figure[] = [
    link("Corrélation des notes", f.pearson, "Pearson"),
    link("Corrélation des rangs", f.spearman, "Spearman"),
    {
      label: "Classements en accord",
      value: f.concordance === null ? "?" : frStat(f.concordance * 100, 0),
      unit: f.concordance === null ? undefined : "%",
      sub: "des paires d'équipes dans le même ordre",
      bar: f.concordance !== null && <ScaleBar at={f.concordance * 100} />,
    },
    {
      label: "Écart médian",
      value: f.medianGap === null ? "?" : frStat(f.medianGap, Number.isInteger(f.medianGap) ? 0 : 1),
      unit: f.medianGap === null ? undefined : f.medianGap > 1 ? "places" : "place",
      sub: "entre les rangs à l'oral et à l'écrit",
      bar: f.medianGap !== null && <ScaleBar domain={[0, Math.max(1, f.count - 1)]} at={f.medianGap} />,
    },
  ];
  return (
    <div>
      <Figures tiles={tiles} className="grid-cols-2 xl:grid-cols-4" />
      <p className="font-open text-xs mt-2" style={{ color: "var(--ink-faint)" }}>
        La barre d'une corrélation part du milieu (0), vers la droite jusqu'à 1 ou vers la gauche jusqu'à −1. Les rangs sont ceux des deux
        classements, l'oral seul et l'écrit seul : avec 50 % de paires d'équipes dans le même ordre ils n'ont rien à voir, avec 100 % ils
        sont identiques.
      </p>
    </div>
  );
}

// ─── Two notes, one point per team ───────────────────────────────────

interface Pairing {
  key: string;
  x: NoteKey; // along the bottom
  y: NoteKey; // up the side
  label: string;
}

// The pairs offered: the written report against the oral and each of its
// roles, then the roles between themselves
const PAIRINGS: { title: string; pairs: Pairing[] }[] = [
  {
    title: "Avec le rapport écrit",
    pairs: [
      { key: "oral", x: "report", y: "oral", label: "Oral (les trois rôles)" },
      { key: "defender", x: "report", y: "defender", label: "Défense" },
      { key: "opponent", x: "report", y: "opponent", label: "Opposition" },
      { key: "reporter", x: "report", y: "reporter", label: "Rapporteur" },
    ],
  },
  {
    title: "Entre les rôles de l'oral",
    pairs: [
      { key: "defender-opponent", x: "defender", y: "opponent", label: "Défense et opposition" },
      { key: "defender-reporter", x: "defender", y: "reporter", label: "Défense et rapporteur" },
      { key: "opponent-reporter", x: "opponent", y: "reporter", label: "Opposition et rapporteur" },
    ],
  },
];

// What a note is called along an axis, and in a sentence
const NOTE_NAMES: Record<NoteKey, string> = { ...FINAL_PART_LABELS, oral: "Oral", final: "Note finale" };
const inSentence = (key: NoteKey) => NOTE_NAMES[key].toLowerCase();
// "de défense", "d'oral"
const of = (word: string) => (/^[aeiouyéèê]/.test(word) ? `d'${word}` : `de ${word}`);

// The picked pair stays here, not in the address: only this widget renders
// again, and the points glide at once
function Correlations({ list, named }: { list: Standing[]; named: Named }) {
  const [picked, setPicked] = useState(PAIRINGS[0].pairs[0].key);
  const groups = PAIRINGS.map((group) => ({
    title: group.title,
    pairs: group.pairs.map((pair) => {
      const points = notePoints(list, pair.x, pair.y);
      return { ...pair, points, r: correlation(points) };
    }),
  }));
  const shown = groups.flatMap((g) => g.pairs).find((p) => p.key === picked)!;
  const [x, y] = [inSentence(shown.x), inSentence(shown.y)];
  const fit = linearFit(shown.points.map((p) => [p.x, p.y]));
  const teams = plural(shown.points.length, "équipe");

  return (
    <Widget title="Corrélations" sub="Choisissez deux notes : chaque point du nuage est une équipe" className="xl:col-span-7">
      {/* Side by side from a tablet up. On a phone the cloud comes first, the pairs to pick right under it */}
      <div className="grid gap-x-6 gap-y-5 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        <div className="order-2 md:order-none">
          {groups.map((group) => (
            <div key={group.title} className="mb-4">
              <h3 className="font-mont text-micro uppercase tracking-widest mb-1.5" style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
                {group.title}
              </h3>
              <ul>
                {group.pairs.map((pair) => (
                  <li key={pair.key}>
                    <button
                      type="button"
                      aria-pressed={pair.key === picked}
                      onClick={() => setPicked(pair.key)}
                      className="pick-row block w-full text-left px-3 py-2"
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="font-mont text-xs" style={{ color: "var(--forest)", fontWeight: 900 }}>{pair.label}</span>
                        <span className="font-mont text-sm tabular-nums" style={{ color: "var(--forest)", fontWeight: 900 }}>
                          {pair.r === null ? "?" : corrText(pair.r)}
                        </span>
                      </span>
                      <span className="flex items-center gap-3 mt-1.5">
                        <span className="flex-1 min-w-0">{pair.r !== null && <SignedBar value={pair.r} grow />}</span>
                        <span className="font-open text-micro text-right shrink-0" style={{ color: "var(--ink-soft)", width: "7.5rem" }}>
                          {pair.r === null ? "trop peu de notes" : linkText(pair.r)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="font-open text-xs" style={{ color: "var(--ink-faint)" }}>
            Le rapport du problème défendu et la défense sont notés par le même duo de jurés : une part de leur lien vient de là.
          </p>
        </div>
        {/* Never much wider than tall: a flat cloud makes every link look weak */}
        <div className="order-1 md:order-none min-w-0" style={{ maxWidth: "36rem" }}>
          <Scatter
            points={shown.points.map((p) => ({
              key: p.teamId,
              x: p.x,
              y: p.y,
              text: `${named(p.teamId).tag} : ${x} ${frStat(p.x)} %, ${y} ${frStat(p.y)} %`,
            }))}
            xLabel={`${NOTE_NAMES[shown.x]}, en %`}
            yLabel={`${NOTE_NAMES[shown.y]}, en %`}
            fit={fit}
            trend={fit ? `tendance : ${fit.slope < 0 ? "−" : "+"}${frStat(Math.abs(fit.slope * 10))} points ${of(y)} pour 10 ${of(x)}` : undefined}
            label={`Nuage de points, ${y} selon ${x} : ${teams}${shown.r === null ? "" : `, corrélation ${corrText(shown.r)} (${linkText(shown.r)})`}`}
            idle={`${teams}${shown.r === null ? "" : `, corrélation ${corrText(shown.r)} (${linkText(shown.r)})`}. Pointez une équipe pour lire ses deux notes.`}
          />
        </div>
      </div>
    </Widget>
  );
}

// ─── What each part weighs on paper, and in the ranking ──────────────

const INFLUENCE_SERIES = [
  { key: "weight", label: "Coefficient", color: "var(--forest)" },
  { key: "share", label: "Part des écarts", color: "var(--saffron-dark)", hatched: true },
];

// The exact figures under the bars: narrow columns of numbers, the two the
// bars already show left out on a phone
const FIGURE_HEAD = "font-mont text-micro uppercase px-2 pb-1.5 align-bottom";
const FIGURE_CELL = "font-mont text-xs tabular-nums text-right px-2 py-1.5";
const pct = (share: number) => `${frStat(share * 100)} %`;

function Influence({ list, weights }: { list: Standing[]; weights: Record<FinalPart, number> }) {
  const parts = partInfluence(list, weights);
  const finalSpread = stdDev(list.flatMap((s) => (s.notes.final === null ? [] : [s.notes.final])));
  const head = { color: "var(--ink-faint)", fontWeight: 800, letterSpacing: "0.06em" };
  const cell = { color: "var(--forest)", fontWeight: 700 };
  return (
    <Widget title="Ce que pèse chaque épreuve" sub="Son coefficient, et sa part des écarts entre les notes finales, en %" className="xl:col-span-5">
      {parts.some((p) => p.share === null) ? (
        <p className="font-open text-sm" style={{ color: "var(--ink-faint)" }}>
          Il faut trois équipes avec leur note finale pour mesurer ce que chaque épreuve y pèse.
        </p>
      ) : (
        <>
          <GroupedBars
            label="Le coefficient de chaque épreuve et sa part des écarts entre les notes finales, en %"
            series={INFLUENCE_SERIES}
            groups={parts.map((p) => ({
              key: p.part,
              label: FINAL_PART_LABELS[p.part],
              values: { weight: Math.round(p.weight * 100), share: Math.round(p.share! * 100) },
            }))}
            height="11rem"
          />
          <table className="w-full mt-5" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th scope="col" className={`${FIGURE_HEAD} text-left w-[40%] sm:w-[30%]`} style={head}>Épreuve</th>
                <th scope="col" className={`${FIGURE_HEAD} text-right hidden sm:table-cell`} style={head}>Coefficient</th>
                <th scope="col" className={`${FIGURE_HEAD} text-right`} style={head}>Écart type</th>
                <th scope="col" className={`${FIGURE_HEAD} text-right sm:w-[13%]`} style={head}>Lien</th>
                <th scope="col" className={`${FIGURE_HEAD} text-right hidden sm:table-cell sm:w-[24%]`} style={head}>Part des écarts</th>
              </tr>
            </thead>
            <tbody className="striped-rows">
              {parts.map((p) => (
                <tr key={p.part}>
                  <th scope="row" className="font-mont text-xs text-left px-2 py-1.5" style={{ color: "var(--forest)", fontWeight: 900 }}>{FINAL_PART_LABELS[p.part]}</th>
                  <td className={`${FIGURE_CELL} hidden sm:table-cell`} style={cell}>{pct(p.weight)}</td>
                  <td className={FIGURE_CELL} style={cell}>{p.spread === null ? "" : frStat(p.spread)}</td>
                  <td className={FIGURE_CELL} style={cell}>{p.link === null ? "" : corrText(p.link)}</td>
                  <td className={`${FIGURE_CELL} hidden sm:table-cell`} style={{ ...cell, fontWeight: 900 }}>{pct(p.share!)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="font-open text-xs mt-3" style={{ color: "var(--ink-faint)" }}>
            Une épreuve départage d'autant plus les équipes que ses notes sont dispersées (écart type, en points) et vont dans le sens de la
            note finale (lien : leur corrélation). Sa part des écarts est son coefficient multiplié par ces deux chiffres, puis divisé par
            l'écart type des notes finales{finalSpread === null ? "" : ` (${frStat(finalSpread)})`} : les quatre parts font 100 %.
          </p>
        </>
      )}
    </Widget>
  );
}

// ─── The teams the oral and the written report rank furthest apart ───

const WIDEST = 5;

function WidestGaps({ list, named }: { list: Standing[]; named: Named }) {
  const { oral, written } = widestGaps(list, WIDEST);
  const sides = [
    { key: "oral", title: "Bien mieux classées à l'oral", teams: oral },
    { key: "written", title: "Bien mieux classées à l'écrit", teams: written },
  ];
  return (
    <Widget
      title="Plus grands écarts de classement"
      sub="Les équipes que l'oral seul et l'écrit seul classent le plus loin l'un de l'autre"
      className="xl:col-span-7"
    >
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {sides.map((side) => (
          <div key={side.key} className="min-w-0">
            <h3 className="font-mont text-micro uppercase tracking-widest mb-1.5" style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
              {side.title}
            </h3>
            {side.teams.length === 0 ? (
              <p className="font-open text-xs italic" style={{ color: "var(--ink-faint)" }}>Aucune équipe.</p>
            ) : (
              <ol className="space-y-2">
                {side.teams.map((s) => {
                  const { quad, center } = named(s.teamId);
                  return (
                    <li key={s.teamId}>
                      <div className="flex items-baseline gap-2">
                        <span className="font-mont text-xs" style={{ color: "var(--forest)", fontWeight: 900, letterSpacing: "0.05em" }}>{quad}</span>
                        <span className="font-open text-micro truncate" style={{ color: "var(--ink-faint)" }}>{center}</span>
                        <span className="font-mont text-sm tabular-nums ml-auto whitespace-nowrap" style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
                          {signedText(s.gap!)}<span className="text-micro" style={{ color: "var(--ink-faint)" }}> {Math.abs(s.gap!) > 1 ? "places" : "place"}</span>
                        </span>
                      </div>
                      <div className="font-open text-xs" style={{ color: "var(--ink-soft)" }}>
                        {placeText(s.ranks.oral!)} à l'oral, {placeText(s.ranks.report!)} à l'écrit
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        ))}
      </div>
    </Widget>
  );
}

// ─── Were one half the only one to count ─────────────────────────────

const TOP_SIZES = [10, 20, 30, 50];
const NAMED = 8; // teams named in a line before "et n autres"

function TopShift({ list, named }: { list: Standing[]; named: Named }) {
  const ranked = list.filter((s) => s.ranks.final !== null).length;
  // The sizes that leave teams outside: a top holding everyone tells nothing
  const sizes = TOP_SIZES.filter((size) => size < ranked);
  const [wanted, setWanted] = useState(TOP_SIZES[0]);
  const size: number | undefined = sizes.includes(wanted) ? wanted : sizes[0];
  const names = (ids: string[]) => {
    const shown = ids.slice(0, NAMED).map((id) => named(id).quad).join(", ");
    return ids.length > NAMED ? `${shown} et ${plural(ids.length - NAMED, "autre")}` : shown;
  };

  return (
    <Widget
      title="Si une seule moitié comptait"
      sub="Qui resterait parmi les premières ?"
      right={sizes.length > 1 && (
        <Toggle
          label="Nombre de premières équipes"
          options={sizes.map((s) => ({ value: String(s), label: String(s) }))}
          value={String(size)}
          onChange={(v) => setWanted(Number(v))}
        />
      )}
      className="xl:col-span-5"
    >
      {size === undefined ? (
        <p className="font-open text-sm" style={{ color: "var(--ink-faint)" }}>
          Il faut plus de {TOP_SIZES[0]} équipes avec leur note finale pour comparer leurs premières.
        </p>
      ) : (
        <div className="space-y-5">
          {([["oral", "L'oral seul"], ["report", "L'écrit seul"]] as const).map(([by, title]) => {
            const shift = topShift(list, size, by);
            return (
              <div key={by}>
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <h3 className="font-mont text-micro uppercase tracking-widest" style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>{title}</h3>
                  <span className="font-mont text-sm tabular-nums" style={{ color: "var(--forest)", fontWeight: 900 }}>
                    {shift.kept.length}<span className="text-micro" style={{ color: "var(--ink-faint)" }}> / {shift.top.length}</span>
                  </span>
                </div>
                <Meter done={shift.kept.length} total={shift.top.length} label={`${title} : équipes qui resteraient parmi les ${shift.top.length} premières`} />
                <p className="font-open text-xs mt-2" style={{ color: "var(--ink-soft)" }}>
                  {shift.out.length === 0
                    ? `Les ${shift.top.length} premières resteraient les mêmes.`
                    : (
                      <>
                        {plural(shift.kept.length, "équipe")} sur {shift.top.length} {shift.kept.length > 1 ? "resteraient" : "resterait"} parmi les premières.{" "}
                        <strong className="font-mont" style={{ color: "var(--forest)" }}>{shift.out.length > 1 ? "Sortiraient" : "Sortirait"} :</strong> {names(shift.out)}.
                        {shift.in.length > 0 && (
                          <>
                            {" "}<strong className="font-mont" style={{ color: "var(--forest)" }}>{shift.in.length > 1 ? "Entreraient" : "Entrerait"} :</strong> {names(shift.in)}.
                          </>
                        )}
                      </>
                    )}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Widget>
  );
}
