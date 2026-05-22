import { Children, isValidElement, useEffect, useRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { motion, useReducedMotion, type HTMLMotionProps, type Transition } from "framer-motion";

// Primitives — visual building blocks aligned with the MTYM aesthetic:
// editorial typography (Montserrat display + Open Sans body), saturated
// saffron accents on a paper/forest base, square 2-4px borders rather
// than the rounded look that screams generic AI app.

// ─── PageTitle ─────────────────────────────────────────────────────────

export function PageTitle({
  eyebrow,
  title,
  sub,
  right,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-10 flex items-end justify-between gap-6 flex-wrap">
      <div className="min-w-0">
        {eyebrow && (
          <div
            className="font-mont text-tiny tracking-widest uppercase mb-3"
            style={{ color: "var(--saffron-dark)", fontWeight: 700 }}
          >
            {eyebrow}
          </div>
        )}
        <h1
          className="font-mont leading-none mb-3"
          style={{
            fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)",
            color: "var(--forest)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h1>
        {sub && (
          <p
            className="text-sm max-w-2xl leading-relaxed font-open"
            style={{ color: "var(--ink-soft)" }}
          >
            {sub}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}

// ─── Rule (horizontal hairline) ────────────────────────────────────────

export function Rule({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-px w-full ${className}`}
      style={{ background: "var(--border)" }}
    />
  );
}

// ─── Status pill (with colored dot) ────────────────────────────────────

type PillKind = "uploaded" | "pending" | "locked" | "success" | "info" | "danger";

const PILL_STYLES: Record<PillKind, { bg: string; fg: string; dot: string }> = {
  uploaded: { bg: "rgba(98,159,115,0.15)", fg: "var(--forest)", dot: "var(--sage)" },
  pending:  { bg: "rgba(246,168,6,0.18)",  fg: "var(--saffron-dark)", dot: "var(--saffron)" },
  locked:   { bg: "rgba(18,32,25,0.08)",   fg: "var(--ink-soft)", dot: "var(--ink-soft)" },
  success:  { bg: "rgba(98,159,115,0.20)", fg: "var(--forest)", dot: "var(--sage-dark)" },
  info:     { bg: "rgba(18,32,25,0.06)",   fg: "var(--ink-soft)", dot: "var(--ink-soft)" },
  danger:   { bg: "rgba(178,59,27,0.12)",  fg: "var(--clay)", dot: "var(--clay)" },
};

export function StatusPill({
  kind = "pending",
  children,
}: {
  kind?: PillKind;
  children: ReactNode;
}) {
  const s = PILL_STYLES[kind];
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mont text-tiny tracking-widest uppercase px-2 py-0.5"
      style={{ background: s.bg, color: s.fg, fontWeight: 600, borderRadius: 2 }}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {children}
    </span>
  );
}

// ─── Buttons ───────────────────────────────────────────────────────────

type BtnVariant = "primary" | "forest" | "sage" | "ghost" | "ghostDark" | "danger";
type BtnSize = "sm" | "md";

const BTN_VARIANTS: Record<BtnVariant, { bg: string; fg: string; bd: string }> = {
  primary:    { bg: "var(--saffron)", fg: "var(--forest)", bd: "var(--saffron)" },
  forest:     { bg: "var(--forest)", fg: "var(--paper)", bd: "var(--forest)" },
  sage:       { bg: "var(--sage-dark)", fg: "var(--paper)", bd: "var(--sage-dark)" },
  ghost:      { bg: "transparent", fg: "var(--forest)", bd: "var(--border)" },
  ghostDark:  { bg: "transparent", fg: "var(--paper)", bd: "rgba(244,236,216,0.3)" },
  danger:     { bg: "transparent", fg: "var(--clay)", bd: "var(--clay)" },
};

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
  children: ReactNode;
}

export function Btn({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: BtnProps) {
  const v = BTN_VARIANTS[variant];
  const sCls = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm";
  return (
    <button
      {...rest}
      className={`font-mont uppercase tracking-wider inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed btn-fx ${sCls} ${className || ""}`}
      style={{
        background: v.bg,
        color: v.fg,
        border: `1px solid ${v.bd}`,
        fontWeight: 600,
        borderRadius: 2,
      }}
    >
      {children}
    </button>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  dark?: boolean;
  hoverable?: boolean;
}

export function Card({ children, dark, hoverable, className, style, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={`${hoverable ? "card-hover" : ""} ${className || ""}`}
      style={{
        background: dark ? "var(--forest)" : "var(--surface)",
        color: dark ? "var(--paper)" : "var(--ink)",
        border: `1px solid ${dark ? "rgba(244,236,216,0.12)" : "var(--border)"}`,
        borderRadius: 4,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Form fields ───────────────────────────────────────────────────────

const INPUT_STYLE: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  color: "var(--ink)",
  borderRadius: 2,
};

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div
        className="font-mont text-tiny uppercase tracking-widest mb-2"
        style={{ color: error ? "var(--clay)" : "var(--ink-soft)", fontWeight: 700 }}
      >
        {label}
      </div>
      {children}
      {error && (
        <div className="text-xs mt-1 font-open" style={{ color: "var(--clay)" }}>
          {error}
        </div>
      )}
      {hint && !error && (
        <div className="text-xs mt-1 font-open" style={{ color: "var(--ink-faint)" }}>
          {hint}
        </div>
      )}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2 text-sm font-open focus-ring ${props.className || ""}`}
      style={{ ...INPUT_STYLE, ...props.style }}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      rows={props.rows ?? 3}
      className={`w-full px-3 py-2 text-sm font-open resize-y focus-ring ${props.className || ""}`}
      style={{ ...INPUT_STYLE, ...props.style }}
    />
  );
}

// ─── Page header (unified across all role pages) ───────────────────────

export function PageHeader({
  eyebrow,
  title,
  sub,
  right,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <header
      className="flex flex-col md:flex-row md:flex-wrap md:items-end justify-between gap-4 pb-6 mb-8"
      style={{ borderBottom: "2px solid var(--border)" }}
    >
      <div>
        {eyebrow && (
          <span
            className="font-mont text-tiny uppercase tracking-widest"
            style={{ color: "var(--saffron-dark)", fontWeight: 800 }}
          >
            {eyebrow}
          </span>
        )}
        <h1
          className="font-mont mt-1 leading-none"
          style={{
            fontSize: "clamp(1.75rem, 3vw, 2.25rem)",
            color: "var(--forest)",
            fontWeight: 900,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h1>
        {sub && (
          <p className="font-open text-sm mt-2 max-w-2xl leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            {sub}
          </p>
        )}
      </div>
      {right}
    </header>
  );
}

// ─── Brutal corner markers (4 dots) ────────────────────────────────────

export function CornerMarkers({ color = "var(--forest)" }: { color?: string }) {
  return (
    <>
      {(["tl", "tr", "bl", "br"] as const).map(c => (
        <span
          key={c}
          aria-hidden
          className="absolute"
          style={{
            width: 6,
            height: 6,
            background: color,
            top: c.startsWith("t") ? -3 : "auto",
            bottom: c.startsWith("b") ? -3 : "auto",
            left: c.endsWith("l") ? -3 : "auto",
            right: c.endsWith("r") ? -3 : "auto",
          }}
        />
      ))}
    </>
  );
}

// ─── Diamond marker (used in section headings) ─────────────────────────

export function DiamondMarker({ color = "var(--saffron)" }: { color?: string }) {
  return <span className="diamond-marker" style={{ background: color }} />;
}

// ─── Brutal card (white bg + graph paper + forest border + brutal shadow) ─

interface BrutalCardProps extends HTMLAttributes<HTMLDivElement> {
  dark?: boolean;
  highlight?: boolean;
  hoverable?: boolean;
  withCorners?: boolean;
  children: ReactNode;
}

export function BrutalCard({
  dark = false,
  highlight = false,
  hoverable = false,
  withCorners = true,
  className,
  style,
  children,
  ...rest
}: BrutalCardProps) {
  // Depth comes from shadow elevation, not colored left-borders. The
  // graph-paper grid is NOT applied to the card wrapper anymore — that
  // texture is reserved for the actual drop-zone elements, so cards
  // pop cleanly against the page background.
  const shadow = highlight ? "4px 4px 0 0 var(--saffron)" : "2px 2px 0 0 var(--forest)";
  return (
    <div
      {...rest}
      className={`relative overflow-hidden ${hoverable ? "brutal-hover" : ""} ${className || ""}`}
      style={{
        background: dark ? "var(--forest)" : "var(--surface)",
        color: dark ? "var(--paper)" : "var(--ink)",
        border: `2px solid var(--forest)`,
        boxShadow: shadow,
        ...style,
      }}
    >
      {withCorners && <CornerMarkers color={dark ? "var(--saffron)" : "var(--forest)"} />}
      {children}
    </div>
  );
}

// ─── Brutal section heading ────────────────────────────────────────────

export function SectionHeading({
  title,
  right,
  className = "",
}: {
  title: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-x-4 gap-y-3 mb-4 ${className}`}>
      <h2
        className="font-mont uppercase tracking-tight flex items-center gap-2 min-w-0"
        style={{ fontSize: "1.05rem", color: "var(--forest)", fontWeight: 900 }}
      >
        <DiamondMarker />
        {title}
      </h2>
      {right}
    </div>
  );
}

// ─── Badge (small status chip with semantic colors) ────────────────────

type BadgeTone = "neutral" | "saffron" | "sage" | "danger" | "dark";

// ─── Page transition wrapper ──────────────────────────────────────────

const PAGE_TRANSITION: Transition = { duration: 0.2, ease: [0.16, 1, 0.3, 1] };

export function PageMotion({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={PAGE_TRANSITION}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Staggered row entry — for table rows or list items so they cascade in.
// `index` controls the delay (40ms per row).
export function StaggerRow({
  index,
  children,
  as: Tag = "tr",
  ...rest
}: HTMLMotionProps<"tr"> & {
  index: number;
  as?: "tr" | "li" | "div";
  children: ReactNode;
}) {
  const MotionTag: typeof motion.tr =
    Tag === "li" ? (motion.li as unknown as typeof motion.tr)
    : Tag === "div" ? (motion.div as unknown as typeof motion.tr)
    : motion.tr;
  return (
    <MotionTag
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

// Staggered entrance container — each direct child fades up
// (opacity 0→1, y 12→0) with a 40ms cascade. Put the layout classes
// (grid/space-y/flex) on `className`; the wrappers become the layout
// items so spacing is preserved. Remount it (change its `key`) to
// replay the cascade — e.g. on a tab switch. Honors reduced-motion.
export function Stagger({
  children,
  className = "",
  step = 0.04,
  y = 12,
  initialDelay = 0,
}: {
  children: ReactNode;
  className?: string;
  step?: number;
  y?: number;
  initialDelay?: number;
}) {
  const reduce = useReducedMotion();
  const items = Children.toArray(children);
  return (
    <div className={className}>
      {items.map((child, i) => (
        <motion.div
          key={isValidElement(child) && child.key != null ? child.key : i}
          className="h-full"
          initial={reduce ? false : { opacity: 0, y }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: reduce ? 0 : initialDelay + Math.min(i * step, 0.5),
            duration: 0.32,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────

export function Modal({
  open, title, children, onClose, footer, width,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  width?: number;
}) {
  // Lock the body scroll while a modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-dialog" role="dialog" aria-modal="true"
           style={width ? { width } : undefined}
           onClick={e => e.stopPropagation()}>
        <header
          className="px-6 py-4 flex items-center justify-between gap-3"
          style={{ borderBottom: "2px solid var(--forest)" }}
        >
          <h2 className="font-mont uppercase tracking-tight"
              style={{ fontSize: "1.05rem", color: "var(--forest)", fontWeight: 900, letterSpacing: "-0.01em" }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="font-mont text-lg leading-none px-2 py-1"
            style={{ color: "var(--ink-faint)", fontWeight: 800 }}
          >
            ×
          </button>
        </header>
        <div className="p-6">{children}</div>
        {footer && (
          <footer
            className="px-6 py-4 flex items-center justify-end gap-2"
            style={{ borderTop: "1px solid var(--border)", background: "var(--paper-2)" }}
          >
            {footer}
          </footer>
        )}
      </div>
    </>
  );
}

// ─── Popover (anchored to a trigger by the consumer's positioning) ────

export function Popover({
  open,
  onClose,
  anchorRef,
  children,
  align = "right",
  width = 320,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
  align?: "left" | "right";
  width?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Outside-click + Escape handling.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !anchorRef.current) return null;

  // getBoundingClientRect() is viewport-relative, and we position the popover
  // with `position: fixed` (also viewport-relative), so the rect maps 1:1 —
  // do NOT add scrollX/scrollY or the popover drifts off-screen once the page
  // is scrolled (the anchor lives in a fixed navbar that never moves).
  //
  // The popover renders inside <body>, which carries `zoom`. Chromium
  // interprets a fixed element's px in that zoomed space (rendered at
  // value × zoom) while getBoundingClientRect() already returns the
  // post-zoom visual position — so divide the rect coords by the zoom
  // factor to cancel the double-scale. zoom = 1 leaves behaviour unchanged.
  const zoom =
    parseFloat(getComputedStyle(document.body).getPropertyValue("zoom")) || 1;
  const rect = anchorRef.current.getBoundingClientRect();
  const top = (rect.bottom + 8) / zoom;
  const left = align === "right"
    ? rect.right / zoom - width
    : rect.left / zoom;

  return (
    <div
      ref={ref}
      className="popover"
      style={{ position: "fixed", top, left, width }}
      role="dialog"
    >
      {children}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  outlined = false,
  children,
}: {
  tone?: BadgeTone;
  outlined?: boolean;
  children: ReactNode;
}) {
  const palettes: Record<BadgeTone, { bg: string; fg: string; bd: string }> = {
    neutral: { bg: "var(--paper-2)", fg: "var(--ink-soft)", bd: "var(--border)" },
    saffron: { bg: "rgba(246,168,6,0.18)", fg: "var(--saffron-dark)", bd: "rgba(246,168,6,0.45)" },
    sage:    { bg: "rgba(98,159,115,0.20)", fg: "var(--forest)", bd: "var(--sage)" },
    danger:  { bg: "rgba(178,59,27,0.10)", fg: "var(--clay)", bd: "rgba(178,59,27,0.3)" },
    dark:    { bg: "var(--forest)", fg: "var(--saffron)", bd: "var(--forest)" },
  };
  const p = palettes[tone];
  return (
    <span
      className="font-mont text-micro uppercase tracking-widest px-2 py-0.5 inline-flex items-center gap-1"
      style={{
        background: outlined ? "transparent" : p.bg,
        color: p.fg,
        border: `1px solid ${p.bd}`,
        fontWeight: 800,
      }}
    >
      {children}
    </span>
  );
}
