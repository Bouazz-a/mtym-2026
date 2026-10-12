import { useEffect, useRef, useState } from "react";
import AppLogo from "@/assets/MTYM2.svg";
import { AlertIcon, InboxIcon, type IconComponent } from "./icons";
import { BrutalCard, Btn } from "./primitives";

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

  const display = Number.isInteger(value) ? Math.round(n) : n.toFixed(1).replace(".", ",");
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
  icon: Glyph = InboxIcon,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
  icon?: IconComponent; // what the page would list (report, calendar…)
}) {
  // A dashed placeholder — "nothing here yet" — with the app's forest tile
  // and saffron hard shadow for its icon
  return (
    <div
      className="flex flex-col items-center text-center"
      style={{
        border: "2px dashed rgba(18, 32, 25, 0.25)",
        background: "rgba(255, 255, 255, 0.6)",
        padding: "3rem 2rem",
      }}
    >
      <div
        className="flex items-center justify-center mb-5"
        style={{
          width: "3.25rem",
          height: "3.25rem",
          background: "var(--forest)",
          color: "var(--saffron)",
          boxShadow: "3px 3px 0 0 var(--saffron)",
        }}
      >
        <Glyph size="1.5rem" />
      </div>
      <h2 className="font-mont" style={{ fontSize: "1.25rem", color: "var(--forest)", fontWeight: 900, letterSpacing: "-0.01em", textWrap: "balance" }}>
        {title}
      </h2>
      {sub && (
        <p className="font-open mt-2" style={{ maxWidth: "30rem", fontSize: "0.9rem", lineHeight: 1.6, color: "var(--ink-soft)", textWrap: "pretty" }}>
          {sub}
        </p>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

// A page (or section) whose data couldn't be loaded: said plainly, with a
// way to try again, rather than looking empty ("Aucun passage…").
export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="pt-6">
      <EmptyState
        icon={AlertIcon}
        title="Impossible de charger les données"
        sub="Le serveur n'a pas répondu. Vérifiez votre connexion puis réessayez ; si le problème continue, prévenez l'organisation."
        action={<Btn onClick={onRetry}>Réessayer</Btn>}
      />
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

// "AXIO défend" — a passage read as a sentence rather than three codes.
// The team carries the weight, the role is a plain verb in lower case, and
// the colour bar is decoration: the words already say who does what.
const ROLE_VERB: Record<keyof typeof ROLE_PALETTE, string> = {
  defender: "défend",
  opponent: "oppose",
  reporter: "rapporte",
  extra: "observe",
};

// The bar takes the role's colour, except the reporter: its palette green is
// too close to the opponent's forest to tell apart at this size.
const ROLE_BAR: Record<keyof typeof ROLE_PALETTE, string> = {
  defender: "var(--saffron)",
  opponent: "var(--forest)",
  reporter: "var(--sage)",
  extra: "var(--border)",
};

export function RoleLine({ role, quad }: { role: keyof typeof ROLE_PALETTE; quad: string }) {
  const muted = role === "extra";
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="shrink-0"
        style={{ width: "0.1875rem", height: "0.85rem", background: ROLE_BAR[role] }}
      />
      <span
        className="font-mont text-xs uppercase tracking-wider"
        style={{ color: muted ? "var(--ink-faint)" : "var(--forest)", fontWeight: 900 }}
      >
        {quad}
      </span>
      <span className="font-open text-xs" style={{ color: "var(--ink-soft)" }}>{ROLE_VERB[role]}</span>
    </div>
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
    // Two to a row on a phone: tighter there, so the figure and its total fit
    <BrutalCard highlight={highlight} className="p-4 sm:p-6 h-full">
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
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1 mb-3">
        <StatCounter
          value={value}
          className="font-mont leading-none"
          style={{ fontSize: "clamp(2.25rem, 10vw, 3rem)", color: "var(--forest)", fontWeight: 900, letterSpacing: "-0.02em" }}
        />
        {denom !== undefined && (
          <span className="text-sm font-mont whitespace-nowrap" style={{ color: "var(--ink-faint)", fontWeight: 700 }}>
            / {denom}
          </span>
        )}
      </div>
      {pct !== null && (
        <>
          {/* The bar grows from the left on arrival, like the dashboard's
              (.dash-grow-x), and eases to its new length when the count changes */}
          <div className="w-full overflow-hidden" style={{ height: "0.375rem", background: "var(--paper-2)" }}>
            <div
              className="dash-grow-x"
              style={{
                height: "100%",
                transform: `scaleX(${Math.max(0, Math.min(1, value / (denom || 1)))})`,
                transformOrigin: "left",
                background: progressColor,
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

// ─── StatStrip: the same figures, side by side in one card ────────────

export interface Stat {
  label: string;
  value: number;
  denom?: number;
  progressColor?: string;
  highlight?: boolean;
}

// On a phone a column of StatCards is a screen high and pushes down what the
// page is for (a juror's planning). There, the figures share one card: a
// label, the count and its progress, as many to a row as there are figures.
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <BrutalCard withCorners={false}>
      <dl className="grid gap-px" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`, background: "var(--border)" }}>
        {stats.map((s) => (
          <div key={s.label} className="px-3 py-2.5 flex flex-col" style={{ background: "var(--surface)" }}>
            <dt className="font-mont text-micro uppercase tracking-wider" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
              {s.label}
            </dt>
            {/* Pushed to the bottom: the counts line up whatever lines their labels take */}
            <dd
              className="font-mont tabular-nums leading-none whitespace-nowrap mt-auto pt-2"
              style={{ fontSize: "1.5rem", color: "var(--forest)", fontWeight: 900, letterSpacing: "-0.02em" }}
            >
              {s.value}
              {s.denom !== undefined && (
                <span className="text-xs ml-1" style={{ color: "var(--ink-faint)", fontWeight: 700, letterSpacing: 0 }}>/ {s.denom}</span>
              )}
            </dd>
            <dd aria-hidden className="mt-2 overflow-hidden" style={{ height: "0.25rem", background: s.denom ? "var(--paper-2)" : undefined }}>
              {s.denom ? (
                <div
                  className="dash-grow-x h-full"
                  style={{
                    transform: `scaleX(${Math.max(0, Math.min(1, s.value / s.denom))})`,
                    transformOrigin: "left",
                    background: s.progressColor ?? "var(--saffron)",
                  }}
                />
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </BrutalCard>
  );
}

// ─── Picker (a labelled control above the page, e.g. center / day) ────

export function Picker({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mont text-micro uppercase tracking-widest mb-1.5" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
