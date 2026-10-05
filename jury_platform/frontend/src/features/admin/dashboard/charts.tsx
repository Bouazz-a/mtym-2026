import { useState, type ReactNode } from "react";
import { BrutalCard } from "@/features/shared/primitives";
import { niceMax } from "@/lib/services/stats";
import { hatch } from "./hatch";

// The dashboard's building blocks, drawn with CSS and SVG in the app's
// colors (no chart library). Every figure is also written out: hovering or
// focusing a bar or a slice shows its exact values, and colors never carry
// the meaning alone (hatching, labels, counts).

// ─── A widget's frame ────────────────────────────────────────────────

export function Widget({
  title,
  sub,
  right,
  children,
  className = "",
}: {
  title: string;
  sub?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <BrutalCard withCorners={false} className={`flex flex-col min-w-0 ${className}`}>
      <header className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="min-w-0">
          <h2 className="font-mont uppercase" style={{ fontSize: "0.8125rem", letterSpacing: "0.08em", color: "var(--forest)", fontWeight: 900 }}>
            {title}
          </h2>
          {sub && <p className="font-open text-xs mt-0.5" style={{ color: "var(--ink-faint)" }}>{sub}</p>}
        </div>
        {right}
      </header>
      <div className="p-5 flex-1 min-w-0">{children}</div>
    </BrutalCard>
  );
}

// ─── A progress bar ──────────────────────────────────────────────────

export function Meter({
  done,
  total,
  label,
  color = "var(--saffron)",
  height = "0.5rem",
}: {
  done: number;
  total: number;
  label: string; // what it measures, for screen readers
  color?: string;
  height?: string;
}) {
  const r = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      className="w-full overflow-hidden"
      style={{ height, background: "var(--paper-2)" }}
    >
      <div className="h-full dash-grow-x" style={{ transform: `scaleX(${r})`, transformOrigin: "left", background: r === 1 ? "var(--sage)" : color }} />
    </div>
  );
}

// ─── Bars grouped by category, series switched from the legend ───────

export interface Series {
  key: string;
  label: string;
  color: string;
  hatched?: boolean;
}

export function GroupedBars({
  groups,
  series,
  label,
  height = "12rem",
}: {
  groups: { key: string; label: string; values: Record<string, number> }[];
  series: Series[];
  label: string; // what the chart shows, for screen readers
  height?: string;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<string | null>(null);
  const shown = series.filter((s) => !hidden.has(s.key));
  const max = niceMax(Math.max(1, ...groups.flatMap((g) => shown.map((s) => g.values[s.key] ?? 0))));
  const ticks = [max, max / 2, 0];
  const toggle = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else if (shown.length > 1) next.add(key); // one series always stays
    setHidden(next);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Séries affichées">
        {series.map((s) => {
          const on = !hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(s.key)}
              className="dash-chip inline-flex items-center gap-2 px-2.5 py-1 font-mont text-micro uppercase tracking-widest focus-ring"
              style={{ border: `1.5px solid ${on ? "var(--forest)" : "var(--field-border)"}`, background: "var(--surface)", color: on ? "var(--forest)" : "var(--ink-faint)", fontWeight: 800 }}
            >
              <span aria-hidden className="inline-block" style={{ width: "0.75rem", height: "0.75rem", ...(s.hatched ? hatch(s.color) : { background: s.color }), opacity: on ? 1 : 0.35 }} />
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="relative" style={{ height }}>
        {/* The axis: faint lines, their values on the left */}
        {ticks.map((t, i) => (
          <div key={i} className="absolute left-0 right-0 flex items-center gap-2" style={{ top: `${(i / (ticks.length - 1)) * 100}%`, transform: "translateY(-50%)" }} aria-hidden>
            <span className="font-mont text-micro w-6 text-right" style={{ color: "var(--ink-faint)", fontWeight: 700 }}>{Math.round(t)}</span>
            <span className="flex-1" style={{ borderTop: `1px ${t === 0 ? "solid var(--forest)" : "dashed var(--border)"}` }} />
          </div>
        ))}
        <ul className="absolute inset-0 flex items-stretch justify-around gap-3" style={{ paddingLeft: "2rem" }} aria-label={label}>
          {groups.map((g) => {
            const describe = `${g.label} : ${shown.map((s) => `${g.values[s.key] ?? 0} ${s.label.toLowerCase()}`).join(", ")}`;
            return (
              <li
                key={g.key}
                tabIndex={0}
                aria-label={describe}
                onMouseEnter={() => setActive(g.key)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(g.key)}
                onBlur={() => setActive(null)}
                className="relative flex-1 flex items-end justify-center gap-1 focus-ring"
                style={{ maxWidth: "7rem", background: active === g.key ? "rgba(18,32,25,0.04)" : undefined }}
              >
                {shown.map((s) => {
                  const v = g.values[s.key] ?? 0;
                  return (
                    <div key={s.key} className="relative flex-1 flex flex-col justify-end h-full" style={{ maxWidth: "1.75rem" }}>
                      <span className="font-mont text-micro text-center mb-1" style={{ color: "var(--ink-soft)", fontWeight: 800 }} aria-hidden>{v}</span>
                      <div
                        className="dash-grow-y"
                        style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? 2 : 0, transformOrigin: "bottom", ...(s.hatched ? hatch(s.color) : { background: s.color }) }}
                      />
                    </div>
                  );
                })}
                {active === g.key && (
                  <div role="presentation" className="dash-tip" style={{ bottom: "calc(100% + 0.25rem)" }}>
                    <div className="font-mont text-micro uppercase tracking-widest mb-1" style={{ color: "var(--saffron)", fontWeight: 900 }}>{g.label}</div>
                    {shown.map((s) => (
                      <div key={s.key} className="flex justify-between gap-4">
                        <span>{s.label}</span>
                        <strong>{g.values[s.key] ?? 0}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex justify-around gap-3 mt-2" style={{ paddingLeft: "2rem" }} aria-hidden>
        {groups.map((g) => (
          <span key={g.key} className="flex-1 text-center font-mont text-xs" style={{ maxWidth: "7rem", color: "var(--forest)", fontWeight: 900 }}>{g.label}</span>
        ))}
      </div>
    </div>
  );
}

// ─── A donut, its legend beside it ───────────────────────────────────

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function Donut({ slices, center, label }: { slices: Slice[]; center: ReactNode; label: string }) {
  const [active, setActive] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 46;
  const C = 2 * Math.PI * R;
  const gap = slices.filter((s) => s.value > 0).length > 1 ? 1.5 : 0;
  // Each slice starts where the ones before it end
  const lengths = slices.map((s) => (total > 0 ? (s.value / total) * C : 0));
  const arcs = slices.map((s, i) => ({
    ...s,
    dash: Math.max(0, lengths[i] - gap),
    offset: lengths.slice(0, i).reduce((sum, l) => sum + l, 0),
  }));
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0" style={{ width: "10rem", height: "10rem" }}>
        <svg viewBox="0 0 120 120" className="w-full h-full" role="img" aria-label={label} style={{ transform: "rotate(-90deg)" }}>
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--paper-2)" strokeWidth="16" />
          {arcs.map((a) => a.value > 0 && (
            <circle
              key={a.key}
              cx="60" cy="60" r={R}
              fill="none"
              stroke={a.color}
              strokeWidth={active === a.key ? 20 : 16}
              strokeDasharray={`${a.dash} ${C}`}
              strokeDashoffset={-a.offset}
              className="dash-arc"
              style={{ opacity: active && active !== a.key ? 0.3 : 1 }}
              onMouseEnter={() => setActive(a.key)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">{center}</div>
      </div>
      <ul className="flex-1 min-w-[11rem] space-y-1">
        {slices.map((s) => (
          <li
            key={s.key}
            tabIndex={0}
            aria-label={`${s.label} : ${s.value} (${pct(s.value)} %)`}
            onMouseEnter={() => setActive(s.key)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(s.key)}
            onBlur={() => setActive(null)}
            className="flex items-center gap-2.5 px-2 py-1 font-open text-sm focus-ring"
            style={{ background: active === s.key ? "var(--paper-2)" : undefined, opacity: s.value === 0 ? 0.55 : 1 }}
          >
            <span aria-hidden className="shrink-0" style={{ width: "0.75rem", height: "0.75rem", background: s.color, boxShadow: "inset 0 0 0 1px rgba(18,32,25,0.25)" }} />
            <span className="flex-1" style={{ color: "var(--ink)" }}>{s.label}</span>
            <span className="font-mont text-xs tabular-nums" style={{ color: "var(--forest)", fontWeight: 900 }}>{s.value}</span>
            <span className="font-mont text-micro tabular-nums w-10 text-right" style={{ color: "var(--ink-faint)", fontWeight: 700 }}>{pct(s.value)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Placeholders ────────────────────────────────────────────────────

// While a widget's data loads: its shape, so nothing jumps
export function Skeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Chargement">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="dash-skeleton" style={{ height: "0.875rem", width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}
