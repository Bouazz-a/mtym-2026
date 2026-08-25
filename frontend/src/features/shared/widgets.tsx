import { useEffect, useRef, useState } from "react";
import type { Passage, Team } from "@/types";
import type {
  ConstraintCode,
  ConstraintViolation,
} from "@/lib/services/constraintReport";

// Widgets — composite visuals with motion and depth: animated stat
// counters, the SVG pool diagram, and a sentimental empty state.

// ─── Animated counter (eases from 0 to value) ──────────────────────────

interface StatCounterProps {
  value: number;
  duration?: number;
  suffix?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function StatCounter({
  value,
  duration = 900,
  suffix = "",
  className,
  style,
}: StatCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);
  // The count-up only starts once the number scrolls into the viewport.
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (started) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setStarted(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const target = Number(value) || 0;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      // Skip the tween, but still set the value asynchronously (in a frame
      // callback) so the effect body itself never calls setState.
      const raf = requestAnimationFrame(() => setN(target));
      return () => cancelAnimationFrame(raf);
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setN(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, value, duration]);

  const display = Number.isInteger(value) ? Math.round(n) : n.toFixed(1);
  return (
    <span ref={ref} className={className} style={style}>
      {display}
      {suffix}
    </span>
  );
}

// ─── StatCard — eyebrow + big animated number + sub ────────────────────

export function StatCard({
  eyebrow,
  value,
  suffix,
  sub,
  accent = "var(--saffron)",
}: {
  eyebrow: string;
  value: number;
  suffix?: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="relative overflow-hidden card-hover"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 4,
        padding: "20px 22px",
      }}
    >
      {/* Accent stripe on the left */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 3,
          height: "100%",
          background: accent,
        }}
      />
      <div
        className="font-mont text-tiny uppercase tracking-widest mb-3"
        style={{ color: "var(--ink-faint)", fontWeight: 700 }}
      >
        {eyebrow}
      </div>
      <div
        className="font-mont leading-none"
        style={{
          fontSize: "2rem",
          color: "var(--forest)",
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        <StatCounter value={Math.round(value)} suffix={suffix} />
      </div>
      {sub && (
        <div
          className="font-open text-xs mt-2"
          style={{ color: "var(--ink-soft)" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── PoolDiagram — SVG of the teams in a pool, highlighting your own ───

export function PoolDiagram({
  poolLabel,
  passages,
  highlightTeamQuad,
  teamQuadById,
  size = 220,
}: {
  poolLabel: string;
  passages: Passage[];
  highlightTeamQuad: string;
  teamQuadById: Map<string, string>;
  size?: number;
}) {
  if (passages.length === 0) return null;

  // Collect distinct team quadrigrammes from defender/opponent/reporter/extra
  const teamSet = new Set<string>();
  for (const p of passages) {
    [
      p.defenderTeamId,
      p.opponentTeamId,
      p.reporterTeamId,
      p.extraTeamId,
    ].forEach((id) => {
      if (id) {
        const q = teamQuadById.get(id);
        if (q) teamSet.add(q);
      }
    });
  }
  const teams = Array.from(teamSet);
  const r = size / 2 - 36;
  const cx = size / 2;
  const cy = size / 2;
  const positions = teams.map((q, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / teams.length;
    return { q, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ overflow: "visible" }}
    >
      {/* Edges */}
      {passages.map((p, idx) => {
        const defQuad = teamQuadById.get(p.defenderTeamId);
        const oppQuad = teamQuadById.get(p.opponentTeamId);
        const def = positions.find((x) => x.q === defQuad);
        const opp = positions.find((x) => x.q === oppQuad);
        if (!def || !opp) return null;
        return (
          <line
            key={idx}
            x1={def.x}
            y1={def.y}
            x2={opp.x}
            y2={opp.y}
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        );
      })}
      {/* Nodes */}
      {positions.map((pos) => {
        const isMe = pos.q === highlightTeamQuad;
        return (
          <g key={pos.q} transform={`translate(${pos.x}, ${pos.y})`}>
            <circle r={26} fill={isMe ? "var(--saffron)" : "var(--forest)"} />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="Montserrat, sans-serif"
              fontWeight={800}
              fontSize={12}
              fill={isMe ? "var(--forest)" : "var(--saffron)"}
            >
              {pos.q}
            </text>
          </g>
        );
      })}
      {/* Center label */}
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Montserrat, sans-serif"
        fontWeight={900}
        fontSize={20}
        fill="var(--ink-faint)"
      >
        {poolLabel}
      </text>
    </svg>
  );
}

// ─── Empty state with personality ──────────────────────────────────────

export function EmptyState({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 4,
        padding: "60px 40px",
      }}
    >
      <MoroccoWatermark
        size={220}
        opacity={0.06}
        top={-40}
        right={-40}
        color="var(--forest)"
      />
      <div className="relative text-center">
        <div
          className="font-mont mb-2"
          style={{
            fontSize: "1.1rem",
            color: "var(--forest)",
            fontWeight: 700,
          }}
        >
          {title}
        </div>
        {sub && (
          <div
            className="font-open text-sm max-w-md mx-auto"
            style={{ color: "var(--ink-soft)" }}
          >
            {sub}
          </div>
        )}
        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

// ─── Morocco silhouette watermark (decorative) ─────────────────────────

export function MoroccoWatermark({
  size = 280,
  opacity = 0.08,
  top,
  right,
  left,
  bottom,
  color = "var(--saffron)",
}: {
  size?: number;
  opacity?: number;
  top?: number;
  right?: number;
  left?: number;
  bottom?: number;
  color?: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top,
        right,
        left,
        bottom,
        opacity,
        pointerEvents: "none",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          fill={color}
          d="M14 4 L19 3 L23 5 L26 9 L28 14 L29 19 L28 24 L26 27 L22 29 L17 30 L13 29 L9 26 L7 22 L7 17 L9 12 L11 8 Z"
        />
      </svg>
    </div>
  );
}

// ─── MTYM Logo (SVG, from the old brand.jsx) ───────────────────────────
import AppLogo from "@/assets/MTYM2.svg";

export function MtymLogo({
  size = 36,
}: {
  size?: number;
  // Color props kept for API compatibility with older call sites; the
  // current implementation renders the asset SVG without recolouring.
  color?: string;
  colorMap?: string;
}) {
  return (
    <img
      src={AppLogo}
      height={size}
      alt="MTYM Logo"
      style={{ height: size, width: "auto" }}
    />
  );
}

// ─── Role palette (single source of truth) ─────────────────────────────

export const ROLE_PALETTE = {
  defender: {
    bg: "var(--saffron)",
    fg: "var(--forest)",
    label: "Défenseur",
    short: "DEF",
    glow: "rgba(246,168,6,0.35)",
  },
  opponent: {
    bg: "var(--forest)",
    fg: "var(--saffron)",
    label: "Opposant",
    short: "OPP",
    glow: "rgba(18,32,25,0.30)",
  },
  reporter: {
    bg: "var(--sage-dark)",
    fg: "var(--paper)",
    label: "Rapporteur",
    short: "RAP",
    glow: "rgba(36,75,58,0.30)",
  },
  extra: {
    bg: "var(--paper-2)",
    fg: "var(--ink-soft)",
    label: "Extra",
    short: "EXTRA",
    glow: "rgba(138,146,144,0.20)",
  },
} as const;

export type RoleKey = keyof typeof ROLE_PALETTE;

// Used by Team type — passage role corresponds to RoleKey.
export function teamRoleFromIds(team: Pick<Team, "id">, passage: Passage): RoleKey | null {
  if (passage.defenderTeamId === team.id) return "defender";
  if (passage.opponentTeamId === team.id) return "opponent";
  if (passage.reporterTeamId === team.id) return "reporter";
  if (passage.extraTeamId === team.id) return "extra";
  return null;
}

// ─── Constraint palette (soft-constraint violation colours) ────────────
// A gradient of red, deepest for the heaviest penalties (weight 15) and
// lighter for the lighter ones (weight 5). Each code is read as
// "round-1 role → round-2 role".

export const CONSTRAINT_PALETTE: Record<
  ConstraintCode,
  { bg: string; fg: string; label: string; desc: string; weight: number }
> = {
  OO: {
    bg: "#7F1D1D",
    fg: "#FEE2E2",
    label: "OO",
    desc: "A opposé puis oppose le même problème",
    weight: 15,
  },
  OD: {
    bg: "#B91C1C",
    fg: "#FEE2E2",
    label: "OD",
    desc: "A défendu puis oppose le même problème",
    weight: 15,
  },
  OR: {
    bg: "#DC2626",
    fg: "#FFF1F2",
    label: "OR",
    desc: "A rapporté puis oppose le même problème",
    weight: 15,
  },
  DO: {
    bg: "#F87171",
    fg: "#7F1D1D",
    label: "DO",
    desc: "A opposé puis défend le même problème",
    weight: 5,
  },
  DR: {
    bg: "#FCA5A5",
    fg: "#7F1D1D",
    label: "DR",
    desc: "A rapporté puis défend le même problème",
    weight: 5,
  },
};

const R1_ROLE_TO_CELL: Record<
  ConstraintViolation["round1"]["role"],
  "defender" | "opponent" | "reporter"
> = {
  defended: "defender",
  opposed: "opponent",
  reported: "reporter",
};

// Index violations by the cells they touch in *both* rounds, so a passage
// table can look up "is (this passage label, this role) implicated?".
// Key = `${passageLabel}::${role}`.
export function buildViolationIndex(
  violations: ConstraintViolation[],
): Map<string, ConstraintViolation[]> {
  const idx = new Map<string, ConstraintViolation[]>();
  const add = (key: string, v: ConstraintViolation) => {
    const list = idx.get(key);
    if (list) list.push(v);
    else idx.set(key, [v]);
  };
  for (const v of violations) {
    add(`${v.round2.passageLabel}::${v.round2.role}`, v);
    add(`${v.round1.passageLabel}::${R1_ROLE_TO_CELL[v.round1.role]}`, v);
  }
  return idx;
}

// Pick the most severe violation touching a cell (heaviest weight wins) so
// a single cell with multiple conflicts still shows the worst one.
export function dominantViolation(
  list: ConstraintViolation[] | undefined,
): ConstraintViolation | null {
  if (!list || list.length === 0) return null;
  return list.reduce((a, b) => (b.weight > a.weight ? b : a));
}

export function ConstraintLegend({
  codes,
}: {
  codes?: ConstraintCode[];
}) {
  const shown = codes ?? (Object.keys(CONSTRAINT_PALETTE) as ConstraintCode[]);
  return (
    <div className="flex flex-wrap gap-2">
      {shown.map((c) => {
        const meta = CONSTRAINT_PALETTE[c];
        return (
          <span
            key={c}
            className="font-mont text-micro uppercase tracking-widest px-2 py-1 flex items-center gap-1.5"
            style={{ background: meta.bg, color: meta.fg, fontWeight: 800 }}
            title={meta.desc}
          >
            <span>{meta.label}</span>
            <span style={{ opacity: 0.75 }}>·{meta.weight}</span>
          </span>
        );
      })}
    </div>
  );
}
