import { useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { BrutalCard } from "@/features/shared/primitives";
import { useMediaQuery } from "@/features/shared/useMediaQuery";
import { frStat, mean, niceDomain, niceMax, type Bin, type Summary } from "@/lib/services/stats";

// The charts of the Résultats page's statistics, drawn like the dashboard's:
// CSS in the app's colors, no chart library. What is pointed at (mouse,
// finger or Tab key) is spelled out in a line under the chart, so every
// figure can be read exactly and nothing covers the drawing. Shapes and
// line styles carry the meaning along with the colors.

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

// ─── Shared pieces ───────────────────────────────────────────────────

// The line under a chart: what is pointed at, or what the chart shows at rest
export function Readout({ children }: { children: ReactNode }) {
  return (
    <p className="font-open text-xs mt-3 px-3 py-2" style={{ background: "var(--paper-2)", color: "var(--ink-soft)", minHeight: "3.25rem" }}>
      {children}
    </p>
  );
}

// A statistic or a threshold drawn across a chart
export interface ChartLine {
  key: string;
  label: string;
  value: number;
  color: string;
  style?: "solid" | "dashed" | "dotted";
}

export function LineLegend({ lines }: { lines: ChartLine[] }) {
  return (
    <>
      {lines.map((line) => (
        <li key={line.key} className="inline-flex items-center gap-2">
          <span aria-hidden className="inline-block" style={{ width: "1.25rem", borderTop: `2px ${line.style ?? "solid"} ${line.color}` }} />
          {line.label}
          <strong className="font-mont tabular-nums" style={{ color: "var(--forest)" }}>{frStat(line.value)}</strong>
        </li>
      ))}
    </>
  );
}

// A legend's list: marks, lines, whatever the chart is made of
export function Legend({ children }: { children: ReactNode }) {
  return <ul className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 font-open text-xs" style={{ color: "var(--ink-soft)" }}>{children}</ul>;
}

// Where a figure sits on a scale: a tick, or the stretch it covers
export function ScaleBar({ domain = [0, 100], at, span }: { domain?: [number, number]; at?: number; span?: [number, number] }) {
  const x = (v: number) => Math.min(100, Math.max(0, ((v - domain[0]) / (domain[1] - domain[0])) * 100));
  return (
    <div aria-hidden className="relative w-full" style={{ height: "0.375rem", background: "var(--paper-2)" }}>
      {span && <div className="absolute inset-y-0" style={{ left: `${x(span[0])}%`, width: `${x(span[1]) - x(span[0])}%`, background: "var(--sage)" }} />}
      {at !== undefined && (
        <div className="absolute" style={{ left: `${x(at)}%`, top: "-0.1875rem", bottom: "-0.1875rem", width: "0.1875rem", translate: "-50% 0", background: "var(--forest)" }} />
      )}
    </div>
  );
}

// A figure with a sign, on a scale centred on 0: the bar leaves the middle
// towards its side (a correlation from -1 to 1, places won or lost). Made of
// spans, so it can sit in a button.
export function SignedBar({
  value,
  reach = 1,
  colors = ["var(--clay)", "var(--forest)"],
  grow = false,
}: {
  value: number;
  reach?: number; // what the whole half-scale stands for
  colors?: [string, string]; // under 0, above 0
  grow?: boolean; // the bar grows from the middle on arrival
}) {
  const size = Math.min(1, Math.abs(value) / (reach || 1)) * 50;
  const up = value >= 0;
  return (
    <span aria-hidden className="block relative w-full" style={{ height: "0.375rem", background: "var(--paper-2)" }}>
      <span
        className={`absolute inset-y-0 ${grow ? "dash-grow-x" : ""}`}
        style={{ left: up ? "50%" : `${50 - size}%`, width: `${size}%`, transformOrigin: up ? "left" : "right", background: colors[up ? 1 : 0] }}
      />
      <span className="absolute" style={{ left: "50%", top: "-0.125rem", bottom: "-0.125rem", width: "1px", translate: "-50% 0", background: "var(--forest)" }} />
    </span>
  );
}

// ─── A row of key figures, each with its place on a scale ────────────

export interface Figure {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode; // one line under the figure
  bar?: ReactNode; // where it sits: a ScaleBar, a Meter, a SignedBar
}

// `className`: how many tiles to a row at each width (grid-cols-…)
export function Figures({ tiles, className }: { tiles: Figure[]; className: string }) {
  return (
    <BrutalCard withCorners={false}>
      <dl className={`grid gap-px ${className}`} style={{ background: "var(--border)" }}>
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
  );
}

// ─── How many teams in each class of notes ───────────────────────────

export function Histogram<T>({
  classes,
  name,
  lines = [],
  label,
  idle,
  height = "11rem",
}: {
  classes: Bin<T>[];
  name: (item: T) => string; // listed when its class is pointed at
  lines?: ChartLine[];
  label: string; // what the chart shows, for screen readers
  idle: string; // the line under the chart while nothing is pointed at
  height?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  if (classes.length === 0) return null;
  const [from, to] = [classes[0].from, classes[classes.length - 1].to];
  const x = (v: number) => `${((v - from) / (to - from)) * 100}%`;
  const max = niceMax(Math.max(1, ...classes.map((b) => b.items.length)));
  const ticks = Number.isInteger(max / 2) ? [max, max / 2, 0] : [max, 0];
  const describe = (b: Bin<T>) => `De ${b.from} à ${b.to} % : ${plural(b.items.length, "équipe")}`;
  const SHOWN = 12;
  const pointed = active === null ? null : classes[active];

  return (
    <div>
      {/* Room above the tallest bar for its count */}
      <div className="relative" style={{ height, marginTop: "1.25rem" }}>
        {ticks.map((t, i) => (
          <div key={t} className="absolute left-0 right-0 flex items-center gap-2" style={{ top: `${(i / (ticks.length - 1)) * 100}%`, translate: "0 -50%" }} aria-hidden>
            <span className="font-mont text-micro w-6 text-right" style={{ color: "var(--ink-faint)", fontWeight: 700 }}>{t}</span>
            <span className="flex-1" style={{ borderTop: `1px ${t === 0 ? "solid var(--forest)" : "dashed var(--border)"}` }} />
          </div>
        ))}
        <div className="absolute inset-y-0 right-0" style={{ left: "2rem" }}>
          <ul className="absolute inset-0 flex items-end" aria-label={label}>
            {classes.map((b, i) => (
              <li
                key={b.from}
                tabIndex={0}
                aria-label={describe(b)}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="relative flex-1 h-full flex items-end focus-ring"
                style={{ padding: "0 1px", background: active === i ? "rgba(18,32,25,0.05)" : undefined }}
              >
                <div className="relative w-full" style={{ height: `${(b.items.length / max) * 100}%`, minHeight: b.items.length > 0 ? 2 : 0 }}>
                  <div className="absolute inset-0 dash-grow-y" style={{ transformOrigin: "bottom", background: "var(--forest)" }} />
                  {b.items.length > 0 && (
                    <span className="absolute bottom-full left-0 right-0 text-center font-mont text-micro pb-0.5" style={{ color: "var(--ink-soft)", fontWeight: 800 }} aria-hidden>
                      {b.items.length}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {lines.map((line) => (
            <span key={line.key} aria-hidden className="absolute inset-y-0 pointer-events-none" style={{ left: x(line.value), borderLeft: `2px ${line.style ?? "solid"} ${line.color}` }} />
          ))}
        </div>
      </div>
      <div className="relative" style={{ marginLeft: "2rem", height: "1.25rem" }} aria-hidden>
        {[from, ...classes.map((b) => b.to)].filter((v) => v % 10 === 0).map((v) => (
          <span key={v} className="absolute top-1 font-mont text-micro tabular-nums" style={{ left: x(v), translate: "-50% 0", color: "var(--ink-faint)", fontWeight: 700 }}>{v}</span>
        ))}
      </div>
      {lines.length > 0 && <Legend><LineLegend lines={lines} /></Legend>}
      <Readout>
        {pointed ? (
          <>
            <strong style={{ color: "var(--forest)" }}>{describe(pointed)}</strong>
            {pointed.items.length > 0 && (
              <>
                {" "}({pointed.items.slice(0, SHOWN).map(name).join(", ")}
                {pointed.items.length > SHOWN && ` et ${plural(pointed.items.length - SHOWN, "autre")}`})
              </>
            )}
          </>
        ) : idle}
      </Readout>
    </div>
  );
}

// ─── One row of points per group, on a shared scale ──────────────────

// A plain point: one team on the scale
function Dot({ style }: { style?: CSSProperties }) {
  return <span aria-hidden className="inline-block shrink-0" style={{ width: "0.4rem", height: "0.4rem", borderRadius: "50%", background: "var(--forest)", opacity: 0.45, ...style }} />;
}

export interface StripDot {
  key: string;
  value: number;
  text: string; // spelled out when it is pointed at
  mark?: ReactNode; // drawn instead of the plain point
}

export interface StripRow {
  key: string;
  label: string;
  sub?: string; // under the label
  dots: StripDot[];
  box?: Summary | null; // quartiles, median and mean, drawn behind the points
  text: string; // the row, spelled out
  cells?: string[]; // its figures, at the right on a wide screen
  strong?: boolean; // the row the others compare to
}

export function StripPlot({
  rows,
  domain,
  lines = [],
  shadeBelow,
  columns = [],
  label,
  idle,
  legend,
  compact = false,
}: {
  rows: StripRow[];
  domain: [number, number];
  lines?: ChartLine[]; // drawn through every row
  shadeBelow?: number; // tints the scale under this value
  columns?: string[]; // the headers of the rows' cells
  label: string; // what the chart shows, for screen readers
  idle: string; // the line under the chart while nothing is pointed at
  legend?: ReactNode;
  compact?: boolean; // a plot that never gets wide: one axis label in two
}) {
  const [pointed, setPointed] = useState<string | null>(null);
  const [row, setRow] = useState<string | null>(null);
  const roomy = useMediaQuery("(min-width: 768px)");
  const wide = roomy && columns.length > 0;
  const template = wide ? `minmax(4.5rem, 9rem) minmax(0, 1fr) repeat(${columns.length}, 6rem)` : "minmax(4.5rem, 7.5rem) minmax(0, 1fr)";
  const x = (v: number) => `${Math.min(100, Math.max(0, ((v - domain[0]) / (domain[1] - domain[0])) * 100))}%`;
  const tens = Array.from({ length: Math.floor((domain[1] - domain[0]) / 10) + 1 }, (_, i) => domain[0] + i * 10);
  const point = (key: string | null, text: string | null) => {
    setRow(key);
    setPointed(text);
  };

  return (
    <div>
      {wide && (
        <div className="grid items-end pb-1" style={{ gridTemplateColumns: template }} aria-hidden>
          <span />
          <span />
          {columns.map((c) => (
            <span key={c} className="font-mont text-micro uppercase text-right" style={{ color: "var(--ink-faint)", fontWeight: 800, letterSpacing: "0.06em" }}>{c}</span>
          ))}
        </div>
      )}
      <ul aria-label={label}>
        {rows.map((r) => (
          <li
            key={r.key}
            tabIndex={0}
            aria-label={r.text}
            onMouseEnter={() => point(r.key, r.text)}
            onMouseLeave={() => point(null, null)}
            onFocus={() => point(r.key, r.text)}
            onBlur={() => point(null, null)}
            className="grid items-center focus-ring"
            style={{ gridTemplateColumns: template, background: row === r.key ? "rgba(18,32,25,0.04)" : undefined }}
          >
            <div className="min-w-0 pr-3 py-1">
              <div className="font-mont text-xs truncate" style={{ color: "var(--forest)", fontWeight: 900, letterSpacing: r.strong ? "0.06em" : undefined, textTransform: r.strong ? "uppercase" : undefined }}>{r.label}</div>
              {r.sub && <div className="font-open text-micro truncate" style={{ color: "var(--ink-faint)" }}>{r.sub}</div>}
            </div>
            {/* The scale, a little inside the cell so a point at either end shows whole */}
            <div className="relative" style={{ height: "2.5rem", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" }}>
              <div className="absolute inset-y-0" style={{ left: "0.5rem", right: "0.5rem" }}>
                {shadeBelow !== undefined && <span aria-hidden className="absolute inset-y-0" style={{ left: "-0.5rem", width: `calc(${x(shadeBelow)} + 0.5rem)`, background: "rgba(178,59,27,0.07)" }} />}
                {tens.slice(1, -1).map((v) => <span key={v} aria-hidden className="absolute inset-y-0" style={{ left: x(v), borderLeft: "1px dashed var(--border)" }} />)}
                {r.box && <Box summary={r.box} x={x} />}
                {r.dots.map((d) => (
                  <span
                    key={d.key}
                    title={d.text}
                    onMouseEnter={() => setPointed(d.text)}
                    onMouseLeave={() => setPointed(r.text)}
                    className="absolute grid place-items-center"
                    style={{ left: x(d.value), top: "50%", width: "0.75rem", height: "0.75rem", translate: "-50% -50%" }}
                  >
                    {d.mark ?? <Dot />}
                  </span>
                ))}
                {lines.map((line) => (
                  <span key={line.key} aria-hidden className="absolute inset-y-0 pointer-events-none" style={{ left: x(line.value), borderLeft: `2px ${line.style ?? "solid"} ${line.color}` }} />
                ))}
              </div>
            </div>
            {wide && r.cells?.map((cell, i) => (
              <span key={i} className="font-mont text-xs tabular-nums text-right" style={{ color: "var(--forest)", fontWeight: r.strong ? 900 : 700 }}>{cell}</span>
            ))}
          </li>
        ))}
      </ul>
      <div className="grid" style={{ gridTemplateColumns: template }} aria-hidden>
        <span />
        <div className="relative" style={{ height: "1.25rem" }}>
          <div className="absolute inset-y-0" style={{ left: "0.5rem", right: "0.5rem" }}>
            {/* On a narrow screen, one label in two: side by side they would touch */}
            {tens.filter((v) => (roomy && !compact) || v % 20 === 0).map((v) => (
              <span key={v} className="absolute top-1 font-mont text-micro tabular-nums" style={{ left: x(v), translate: "-50% 0", color: "var(--ink-faint)", fontWeight: 700 }}>{v}</span>
            ))}
          </div>
        </div>
      </div>
      {(legend || lines.length > 0) && (
        <Legend>
          {legend}
          <LineLegend lines={lines} />
        </Legend>
      )}
      <Readout>{pointed ?? idle}</Readout>
    </div>
  );
}

// A box plot behind a row's points: from the lowest to the highest note, a
// box from the first to the third quartile, the median across it, and the
// mean as a diamond
function Box({ summary: s, x }: { summary: Summary; x: (v: number) => string }) {
  return (
    <span aria-hidden>
      <span className="absolute" style={{ left: x(s.min), right: `calc(100% - ${x(s.max)})`, top: "50%", borderTop: "1.5px solid var(--forest-soft)" }} />
      <span className="absolute" style={{ left: x(s.q1), right: `calc(100% - ${x(s.q3)})`, top: "50%", height: "1.25rem", translate: "0 -50%", background: "var(--paper-2)", boxShadow: "inset 0 0 0 1.5px var(--forest-soft)" }} />
      <span className="absolute" style={{ left: x(s.median), top: "50%", height: "1.25rem", width: "0.1875rem", translate: "-50% -50%", background: "var(--forest)" }} />
      <span className="absolute" style={{ left: x(s.mean), top: "50%", width: "0.5rem", height: "0.5rem", translate: "-50% -50%", rotate: "45deg", background: "var(--saffron)", boxShadow: "inset 0 0 0 1.5px var(--forest)" }} />
    </span>
  );
}

// What the box plot's strokes mean, for a legend. `one` and `half`: what a
// point stands for, when it isn't a team.
export function BoxLegend({ one = "une équipe", half = "la moitié des équipes" }: { one?: string; half?: string }) {
  const item = "inline-flex items-center gap-2";
  return (
    <>
      <li className={item}><Dot style={{ opacity: 0.7 }} />{one}</li>
      <li className={item}><span aria-hidden className="inline-block" style={{ width: "1.25rem", height: "0.75rem", background: "var(--paper-2)", boxShadow: "inset 0 0 0 1.5px var(--forest-soft)" }} />{half} (du 1er au 3e quartile)</li>
      <li className={item}><span aria-hidden className="inline-block" style={{ width: "0.1875rem", height: "0.85rem", background: "var(--forest)" }} />médiane</li>
      <li className={item}><span aria-hidden className="inline-block" style={{ width: "0.5rem", height: "0.5rem", rotate: "45deg", background: "var(--saffron)", boxShadow: "inset 0 0 0 1.5px var(--forest)" }} />moyenne</li>
    </>
  );
}

// ─── Two notes of each team: a cloud of points ───────────────────────

export interface ScatterPoint {
  key: string;
  x: number;
  y: number;
  text: string; // spelled out when it is pointed at
}

// How near the pointer must come to a point to read it, in pixels
const NEAR = 22;

// One point per team, at its two notes: to the right, more of the first;
// higher up, more of the second. The trend is the line that best tells one
// from the other, the dashed lines are the two means. The points are placed
// from the stylesheet (.scatter-point, index.css): give those of two clouds
// the same keys and, from one to the other, each team glides to its new
// place.
export function Scatter({
  points,
  xLabel,
  yLabel,
  fit,
  trend: trendText = "tendance",
  label,
  idle,
  height = "17rem",
}: {
  points: ScatterPoint[];
  xLabel: string; // what runs along the bottom, with its unit
  yLabel: string; // what runs up the side
  fit?: { slope: number; intercept: number } | null;
  trend?: string; // what the trend's line says, in the legend
  label: string; // what the chart shows, for screen readers
  idle: string; // the line under the chart while nothing is pointed at
  height?: string;
}) {
  const [pointed, setPointed] = useState<string | null>(null);
  if (points.length === 0) return null;
  const xs = niceDomain(points.map((p) => p.x));
  const ys = niceDomain(points.map((p) => p.y));
  const at = (v: number, [from, to]: [number, number]) => ((v - from) / (to - from)) * 100;
  // A label every 10 points on a short scale, every 20 on a long one
  const ticks = ([from, to]: [number, number]) => {
    const step = to - from > 50 ? 20 : 10;
    return Array.from({ length: Math.floor((to - from) / 10) + 1 }, (_, i) => from + i * 10).filter((v) => v % step === 0);
  };
  const [meanX, meanY] = [mean(points.map((p) => p.x))!, mean(points.map((p) => p.y))!];
  // What is read is the point nearest to the pointer, not the one under it:
  // in a dense cloud the points overlap, and one would answer for another
  const point = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    let nearest: string | null = null;
    let reach = NEAR ** 2;
    for (const p of points) {
      const dx = box.left + (at(p.x, xs) / 100) * box.width - e.clientX;
      const dy = box.bottom - (at(p.y, ys) / 100) * box.height - e.clientY;
      if (dx * dx + dy * dy < reach) {
        reach = dx * dx + dy * dy;
        nearest = p.key;
      }
    }
    setPointed(nearest);
  };
  const trend = fit && { from: 100 - at(fit.slope * xs[0] + fit.intercept, ys), to: 100 - at(fit.slope * xs[1] + fit.intercept, ys) };
  const axisLabel = "font-mont text-micro uppercase";
  const axisStyle: CSSProperties = { color: "var(--ink-faint)", fontWeight: 800, letterSpacing: "0.06em" };
  const tickStyle: CSSProperties = { color: "var(--ink-faint)", fontWeight: 700 };

  return (
    <div>
      <div className={axisLabel} style={axisStyle} aria-hidden>{yLabel}</div>
      <div className="relative mt-1" style={{ height, marginLeft: "2rem" }} role="img" aria-label={label}>
        <span aria-hidden className="absolute inset-y-0 left-0" style={{ borderLeft: "1px solid var(--forest)" }} />
        <span aria-hidden className="absolute inset-x-0 bottom-0" style={{ borderTop: "1px solid var(--forest)" }} />
        {/* The side's labels, level with the plot (which sits a little inside) */}
        <div aria-hidden className="absolute" style={{ top: "0.5rem", bottom: "0.5rem", right: "100%", width: "2rem" }}>
          {ticks(ys).map((v) => (
            <span key={v} className="absolute right-0 pr-1.5 font-mont text-micro tabular-nums" style={{ bottom: `${at(v, ys)}%`, translate: "0 50%", ...tickStyle }}>{v}</span>
          ))}
        </div>
        {/* A little inside the axes, so a point at either end shows whole */}
        <div
          className="absolute scatter-plot"
          style={{ inset: "0.5rem" }}
          onPointerDown={point}
          onPointerMove={point}
          // A finger leaves as it lifts: the point it touched stays read
          onPointerLeave={(e) => { if (e.pointerType === "mouse") setPointed(null); }}
        >
          {ticks(ys).map((v) => <span key={`y${v}`} aria-hidden className="absolute inset-x-0" style={{ bottom: `${at(v, ys)}%`, borderTop: "1px dashed var(--border)" }} />)}
          {ticks(xs).map((v) => <span key={`x${v}`} aria-hidden className="absolute inset-y-0" style={{ left: `${at(v, xs)}%`, borderLeft: "1px dashed var(--border)" }} />)}
          {/* The means and the trend: redrawn (and faded in) with each cloud */}
          <svg key={`${xLabel}:${yLabel}`} aria-hidden className="absolute inset-0 w-full h-full fade-in" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1={at(meanX, xs)} x2={at(meanX, xs)} y1="0" y2="100" stroke="var(--sage)" strokeWidth="1.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
            <line x1="0" x2="100" y1={100 - at(meanY, ys)} y2={100 - at(meanY, ys)} stroke="var(--sage)" strokeWidth="1.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
            {trend && <line x1="0" x2="100" y1={trend.from} y2={trend.to} stroke="var(--saffron-dark)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />}
          </svg>
          {points.map((p) => (
            <span
              key={p.key}
              data-on={pointed === p.key ? "" : undefined}
              className="scatter-point"
              style={{ ["--x" as string]: at(p.x, xs), ["--y" as string]: at(p.y, ys) }}
            >
              <span />
            </span>
          ))}
        </div>
      </div>
      <div className="relative" style={{ height: "1.25rem", margin: "0 0.5rem 0 2.5rem" }} aria-hidden>
        {ticks(xs).map((v) => (
          <span key={v} className="absolute top-1 font-mont text-micro tabular-nums" style={{ left: `${at(v, xs)}%`, translate: "-50% 0", ...tickStyle }}>{v}</span>
        ))}
      </div>
      <div className={`${axisLabel} text-right mt-1`} style={axisStyle} aria-hidden>{xLabel}</div>
      <Legend>
        <li className="inline-flex items-center gap-2"><Dot style={{ opacity: 0.7 }} />une équipe</li>
        <li className="inline-flex items-center gap-2"><span aria-hidden className="inline-block" style={{ width: "1.25rem", borderTop: "1.5px dashed var(--sage)" }} />moyennes</li>
        {trend && <li className="inline-flex items-center gap-2"><span aria-hidden className="inline-block" style={{ width: "1.25rem", borderTop: "2.5px solid var(--saffron-dark)" }} />{trendText}</li>}
      </Legend>
      <Readout>{points.find((p) => p.key === pointed)?.text ?? idle}</Readout>
    </div>
  );
}
