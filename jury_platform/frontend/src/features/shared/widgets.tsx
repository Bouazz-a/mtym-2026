import { useEffect, useRef, useState } from "react";
import AppLogo from "@/assets/MTYM2.svg";
import { BrutalCard } from "./primitives";

// Widgets — composite visuals with motion and depth: animated stat
// counters and cards, the empty state, the logo and the role palette.

// ─── Animated counter (eases from 0 to value) ──────────────────────────

interface StatCounterProps {
  value: number;
  duration?: number;
  suffix?: string;
  className?: string;
  style?: React.CSSProperties;
}

function StatCounter({
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
        padding: "3.75rem 2.5rem",
      }}
    >
      <MoroccoWatermark
        size="13.75rem"
        opacity={0.06}
        top="-2.5rem"
        right="-2.5rem"
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

// Lengths are CSS values in rem, so the decoration follows the page scale.
function MoroccoWatermark({
  size = "17.5rem",
  opacity = 0.08,
  top,
  right,
  left,
  bottom,
  color = "var(--saffron)",
}: {
  size?: string;
  opacity?: number;
  top?: string;
  right?: string;
  left?: string;
  bottom?: string;
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
        style={{ width: size, height: size }}
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

// ─── MTYM Logo ─────────────────────────────────────────────────────────

export function MtymLogo({ size = "2.25rem" }: { size?: string }) {
  return <img src={AppLogo} alt="MTYM Logo" style={{ height: size, width: "auto" }} />;
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
    label: "Observateur",
    short: "OBS",
    glow: "rgba(138,146,144,0.20)",
  },
} as const;

// "DEF PIQU" — a team's role in a passage, in the role's colors
export function RoleChip({ role, quad }: { role: keyof typeof ROLE_PALETTE; quad: string }) {
  return (
    <span
      className="font-mont text-micro uppercase tracking-widest px-1.5 py-0.5 whitespace-nowrap"
      style={{ background: ROLE_PALETTE[role].bg, color: ROLE_PALETTE[role].fg, fontWeight: 800 }}
    >
      {ROLE_PALETTE[role].short} {quad}
    </span>
  );
}

// ─── StatCard — label + big animated number (+ progress when denom) ────

export function StatCard({
  label,
  value,
  denom,
  progressColor = "var(--saffron)",
  highlight = false,
}: {
  label: string;
  value: number;
  denom?: number;
  progressColor?: string;
  highlight?: boolean;
}) {
  const pct = denom ? Math.round((value / denom) * 100) : null;
  return (
    <BrutalCard highlight={highlight} className="p-6 h-full">
      <div
        className="absolute top-0 right-0 clip-triangle-tr pointer-events-none"
        style={{ width: "3rem", height: "3rem", background: highlight ? "rgba(246,168,6,0.12)" : "rgba(18,32,25,0.04)" }}
      />
      <p
        className="font-mont text-tiny uppercase tracking-widest mb-2"
        style={{ color: highlight ? "var(--saffron-dark)" : "var(--ink-faint)", fontWeight: 800 }}
      >
        {label}
      </p>
      <div className="flex items-end gap-3 mb-3">
        <StatCounter
          value={value}
          className="font-mont leading-none"
          style={{ fontSize: "3rem", color: "var(--forest)", fontWeight: 900, letterSpacing: "-0.02em" }}
        />
        {denom !== undefined && (
          <span className="text-sm font-mont" style={{ color: "var(--ink-faint)", fontWeight: 700 }}>
            / {denom}
          </span>
        )}
      </div>
      {pct !== null && (
        <>
          <div className="w-full" style={{ height: "0.375rem", background: "var(--paper-2)" }}>
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                background: progressColor,
                transition: "width 600ms cubic-bezier(0.22,1,0.36,1)",
              }}
            />
          </div>
          <p
            className="text-right mt-1 font-mont text-micro uppercase tracking-widest"
            style={{ color: progressColor, fontWeight: 800 }}
          >
            {pct}%
          </p>
        </>
      )}
    </BrutalCard>
  );
}
