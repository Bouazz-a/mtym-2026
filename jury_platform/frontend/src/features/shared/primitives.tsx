import { Children, isValidElement, startTransition, useCallback, useEffect, useId, useLayoutEffect, useOptimistic, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FIELD_STYLE } from "./fieldStyle";
import { usePageTitle } from "./usePageTitle";
import { CloseIcon } from "./icons";
import { arrive, hasLeft, slideFrom, useLeave } from "./motion";

// Primitives — visual building blocks aligned with the MTYM aesthetic:
// editorial typography (Montserrat display + IBM Plex Sans body), saturated
// saffron accents on a paper/forest base, square 2-4px borders rather
// than the rounded look that screams generic AI app.

// ─── Buttons ───────────────────────────────────────────────────────────

type BtnVariant = "primary" | "forest" | "sage" | "rose" | "ghost" | "ghostDark" | "danger";
type BtnSize = "sm" | "md";

// Every button stands out from the page: the secondary ones (ghost,
// danger) are white with a dark outline, never see-through. Under the
// pointer a button lifts onto its hard shadow (`shadow`), and sinks back
// when pressed (.btn-fx in index.css).
const BTN_VARIANTS: Record<BtnVariant, { bg: string; fg: string; bd: string; shadow: string }> = {
  primary:    { bg: "var(--saffron)", fg: "var(--forest)", bd: "var(--forest)", shadow: "var(--forest)" },
  forest:     { bg: "var(--forest)", fg: "var(--paper)", bd: "var(--forest)", shadow: "var(--saffron)" },
  sage:       { bg: "var(--sage-dark)", fg: "var(--paper)", bd: "var(--sage-dark)", shadow: "var(--forest)" },
  rose:       { bg: "var(--rose)", fg: "var(--forest)", bd: "var(--forest)", shadow: "var(--forest)" },
  ghost:      { bg: "var(--surface)", fg: "var(--forest)", bd: "var(--forest)", shadow: "var(--forest)" },
  ghostDark:  { bg: "transparent", fg: "var(--paper)", bd: "rgba(244,236,216,0.45)", shadow: "var(--saffron)" },
  danger:     { bg: "var(--surface)", fg: "var(--clay)", bd: "var(--clay)", shadow: "var(--clay)" },
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
        border: `1.5px solid ${v.bd}`,
        fontWeight: 700,
        borderRadius: 2,
        ["--btn-shadow" as string]: v.shadow,
      }}
    >
      {children}
    </button>
  );
}

// ─── A confirmation asked in place ─────────────────────────────────────

// « Confirmer / Annuler » takes the place of the buttons it is about without
// taking more room than them: they stay where they are, hidden, and hold
// the width, so asking never moves the row, or the whole table, around it.
// `className` lays the buttons out (flex, gap…); `question` says what is
// confirmed where there is room for it.
export function ConfirmInPlace({
  asking,
  question,
  confirm,
  onCancel,
  className = "",
  children,
}: {
  asking: boolean;
  question?: string;
  confirm: ReactNode; // the button that goes ahead
  onCancel: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <div className={className} inert={asking} style={asking ? { visibility: "hidden" } : undefined}>
        {children}
      </div>
      {asking && (
        <div className="absolute inset-0 flex items-center justify-end gap-1.5 flex-nowrap fade-in">
          {question && <span className="font-open text-xs mr-1 whitespace-nowrap" style={{ color: "var(--ink)" }}>{question}</span>}
          {confirm}
          <Btn variant="ghost" size="sm" onClick={onCancel}>Annuler</Btn>
        </div>
      )}
    </div>
  );
}

// ─── Form fields ───────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
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

export function Input(props: React.ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2 text-sm font-open focus-ring ${props.className || ""}`}
      style={{ ...FIELD_STYLE, ...props.style }}
    />
  );
}

export function Textarea(props: React.ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      rows={props.rows ?? 3}
      className={`w-full px-3 py-2 text-sm font-open resize-y focus-ring ${props.className || ""}`}
      style={{ ...FIELD_STYLE, ...props.style }}
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
  usePageTitle(title);
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
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}

// ─── Brutal corner markers (4 dots) ────────────────────────────────────

function CornerMarkers({ color = "var(--forest)" }: { color?: string }) {
  return (
    <>
      {(["tl", "tr", "bl", "br"] as const).map(c => (
        <span
          key={c}
          aria-hidden
          className="absolute"
          style={{
            width: "0.375rem",
            height: "0.375rem",
            background: color,
            top: c.startsWith("t") ? "-0.1875rem" : "auto",
            bottom: c.startsWith("b") ? "-0.1875rem" : "auto",
            left: c.endsWith("l") ? "-0.1875rem" : "auto",
            right: c.endsWith("r") ? "-0.1875rem" : "auto",
          }}
        />
      ))}
    </>
  );
}

// ─── Diamond marker (used in section headings) ─────────────────────────

function DiamondMarker({ color = "var(--saffron)" }: { color?: string }) {
  return <span className="diamond-marker" style={{ background: color }} />;
}

// ─── Brutal card (white bg + graph paper + forest border + brutal shadow) ─

interface BrutalCardProps extends HTMLAttributes<HTMLDivElement> {
  dark?: boolean;
  highlight?: boolean;
  withCorners?: boolean;
  children: ReactNode;
}

export function BrutalCard({
  dark = false,
  highlight = false,
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
      className={`relative overflow-hidden ${className || ""}`}
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
      {/* Capitals this heavy need air: a slightly open tracking */}
      <h2
        className="font-mont uppercase flex items-center gap-2 min-w-0"
        style={{ fontSize: "1rem", color: "var(--forest)", fontWeight: 900, letterSpacing: "0.02em" }}
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

// ─── Arrivals ─────────────────────────────────────────────────────────

// The browser plays all of these by itself (opacity and transform only), so
// they stay smooth while the page is still being drawn, which is exactly
// when a page arrives. With reduced motion, a fade only.

// A page arrives with a short fade and rise, its sections one after the
// other from the top; the page it replaces leaves at once (no exit to wait
// for), so moving between pages never stalls. Played once, when the page
// appears (arrive() in motion.ts): what it shows later (an error, another
// day's content) has its own entrance, or none.
export function PageMotion({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) return arrive([...ref.current.children]);
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}

// Content replaced in place (another day, another center): it fades in
// instead of snapping. Give it a `key` that changes with what it shows.
// (This one and the next are plain CSS: index.css, "Arrivals".)
export function FadeIn({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`fade-in ${className}`}>{children}</div>;
}

// Staggered entrance container: each direct child fades up (by `y` pixels
// at the reader's font size) with a 40ms cascade. Put the layout classes
// (grid/space-y/flex) on `className`; the wrappers become the layout
// items so spacing is preserved. Remount it (change its `key`) to
// replay the cascade, e.g. on a tab switch.
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
  const items = Children.toArray(children);
  return (
    <div className={className}>
      {items.map((child, i) => (
        <div
          key={isValidElement(child) && child.key != null ? child.key : i}
          className="h-full rise-in"
          style={{
            ["--rise" as string]: `${y / 16}rem`,
            animationDelay: `${Math.round((initialDelay + Math.min(i * step, 0.5)) * 1000)}ms`,
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────

// What Tab can reach inside a dialog
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

// A dialog closes faster than it opens: its veil fades while it draws back a little
const MODAL_EXIT: KeyframeAnimationOptions = { duration: 140, easing: "ease-out", fill: "forwards" };
const leaveModal = (layer: HTMLElement) => {
  layer.querySelector(".modal-dialog")?.animate([{ transform: "none" }, { transform: "scale(0.98)" }], MODAL_EXIT);
  return layer.animate([{ opacity: 1 }, { opacity: 0 }], MODAL_EXIT);
};

// A dialog is drawn at the end of the page (a portal), not where it is
// declared: the layout around it (the spacing of a page's sections, a table
// cell's typography) can't reach it, and it always covers the whole screen.
export function Modal({
  open, title, children, onClose, footer, width,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  // Its widest (40rem by default): px at the base font size, or any CSS
  // width. It follows the page scale and never goes past the screen.
  width?: number | string;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useLeave(layerRef, open, leaveModal);

  // What had focus when the dialog opened, read while rendering: by the
  // time effects run, a field's autoFocus inside the dialog has taken it.
  const [opener, setOpener] = useState<HTMLElement | null>(() => (open ? (document.activeElement as HTMLElement | null) : null));
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpener(document.activeElement as HTMLElement | null);
  }

  // Keyboard focus moves into the dialog when it opens (on the dialog
  // itself, so its title is read first, unless a field took it with
  // autoFocus), Tab and Shift+Tab stay inside, and focus returns to what
  // opened it when it closes.
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog?.contains(document.activeElement)) dialog?.focus();
    const focusables = () =>
      [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => el.offsetParent !== null);
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) {
        e.preventDefault();
        return;
      }
      const [first, last] = [els[0], els[els.length - 1]];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || at === dialogRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && at === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onTab);
    return () => {
      document.removeEventListener("keydown", onTab);
      // Only once the dialog is gone (not on StrictMode's test unmount)
      if (!dialog || hasLeft(dialog)) opener?.focus?.();
    };
  }, [open, opener]);

  // Lock the page's scroll while a dialog is open. The room of the scroll
  // bar this hides is kept (--scrollbar-gap, used by the page and the top
  // bar), so nothing behind the dialog shifts sideways.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const prev = { overflow: document.body.style.overflow, gap: root.style.getPropertyValue("--scrollbar-gap") };
    const gap = window.innerWidth - root.clientWidth;
    document.body.style.overflow = "hidden";
    if (gap > 0) root.style.setProperty("--scrollbar-gap", `${gap}px`);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev.overflow;
      root.style.setProperty("--scrollbar-gap", prev.gap);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="modal-layer" ref={layerRef}>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}
           ref={dialogRef}
           tabIndex={-1}
           style={{
             ...(width !== undefined && { ["--modal-width" as string]: typeof width === "number" ? `${width / 16}rem` : width }),
             outline: "none",
           }}
           onClick={e => e.stopPropagation()}>
        {/* The title and the buttons stay in view; what is between them scrolls */}
        <header
          className="px-6 py-4 flex items-center justify-between gap-3 shrink-0"
          style={{ borderBottom: "2px solid var(--forest)" }}
        >
          <h2 id={titleId} className="font-mont uppercase"
              style={{ fontSize: "1rem", color: "var(--forest)", fontWeight: 900, letterSpacing: "0.02em" }}>
            {title}
          </h2>
          <button onClick={onClose} aria-label="Fermer" className="icon-btn p-2 -mr-2 shrink-0">
            <CloseIcon size="1rem" />
          </button>
        </header>
        <div className="modal-body p-6">{children}</div>
        {footer && (
          <footer
            className="px-6 py-4 flex flex-wrap items-center justify-end gap-2 shrink-0"
            style={{ borderTop: "1px solid var(--border)", background: "var(--paper-2)" }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ─── Popover (anchored to a trigger by the consumer's positioning) ────

// Placing a fixed element is pixel maths, but the page scales with the
// window: sizes given in rem are turned into pixels through the root font
// size, so the popover grows with everything else.
const rootFontSize = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

// It grows out of what opened it (its origin is the anchor's middle), and
// closes faster, drawing back toward it
const leavePopover = (node: HTMLElement) =>
  node.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.97)" }], { duration: 110, easing: "ease-out", fill: "forwards" });

export function Popover({
  open,
  onClose,
  anchorRef,
  children,
  align = "right",
  width = 20,
  id,
  role = "dialog",
  instant = false,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
  align?: "left" | "right";
  /** Width in rem: the popover follows the page scale like everything else */
  width?: number;
  id?: string; // for the anchor's aria-controls / aria-describedby
  role?: "dialog" | "tooltip";
  /** Opens and closes at once: one menu replacing its neighbour, where two fades would cross */
  instant?: boolean;
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

  // getBoundingClientRect() is viewport-relative, and we position the popover
  // with `position: fixed` (also viewport-relative), so the rect maps 1:1 —
  // do NOT add scrollX/scrollY or the popover drifts off-screen once the page
  // is scrolled (the anchor lives in a fixed navbar that never moves).
  //
  // Measured in a layout effect (refs can't be read during render); the
  // popover paints on the frame after `open` flips, before the browser
  // shows anything in between.
  // A stale `pos` from a previous opening is fine: the guard below hides
  // the popover while closed, and the effect re-measures (before paint)
  // when it reopens.
  //
  // On narrow screens the popover is clamped inside the viewport (half a
  // line of margin) rather than anchored off its left edge.
  // `originX`: the anchor's middle, from the popover's left edge
  const [pos, setPos] = useState<{
    top: number; left: number; width: number; maxHeight?: number; placed: boolean; originX: number; above: boolean;
  } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const viewport = window.innerWidth;
    const gap = 0.5 * rootFontSize();
    const w = Math.min(width * rootFontSize(), viewport - 2 * gap);
    const left = Math.max(gap, Math.min(align === "right" ? rect.right - w : rect.left, viewport - w - gap));
    setPos({
      top: rect.bottom + gap,
      left,
      width: w,
      placed: false,
      originX: Math.max(0, Math.min(rect.left + rect.width / 2 - left, w)),
      above: false,
    });
  }, [open, align, width, anchorRef]);

  // Whether it opened at once, as asked at that moment: a change of mind
  // under an open popover would play its entrance again
  const [opening, setOpening] = useState({ open, instant });
  if (open !== opening.open) setOpening({ open, instant });

  // Second pass, once the popover is in the DOM and has a height: if it
  // would run past the bottom of the viewport (a fixed element can't be
  // scrolled to), open it above its anchor instead; when neither side has
  // room, pin it inside the viewport and let it scroll. Both passes run
  // before paint.
  useLayoutEffect(() => {
    if (!open || !pos || pos.placed || !ref.current || !anchorRef.current) return;
    const viewportHeight = window.innerHeight;
    const height = ref.current.offsetHeight;
    const anchorTop = anchorRef.current.getBoundingClientRect().top;
    const gap = 0.5 * rootFontSize();
    let { top } = pos;
    let maxHeight: number | undefined;
    let above = false;
    if (top + height > viewportHeight - gap) {
      const room = anchorTop - gap - height;
      if (room >= gap) {
        top = room;
        above = true;
      } else {
        top = gap;
        maxHeight = viewportHeight - 2 * gap;
      }
    }
    setPos({ ...pos, top, maxHeight, above, placed: true });
  }, [open, pos, anchorRef]);

  const shown = open && pos !== null;
  useLeave(ref, shown, instant ? null : leavePopover);
  if (!shown) return null;

  return (
    <div
      ref={ref}
      className={opening.instant ? "popover popover--instant" : "popover"}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        transformOrigin: `${pos.originX}px ${pos.above ? "100%" : "0"}`,
        ...(pos.maxHeight !== undefined && { maxHeight: pos.maxHeight, overflowY: "auto" }),
      }}
      id={id}
      role={role}
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
      className="font-mont text-micro uppercase tracking-widest px-2 py-0.5 inline-flex items-center gap-1 whitespace-nowrap"
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

// ─── Segmented control (brutal tab strip) ─────────────────────────────

// The active option's dark block slides to the one picked. The weight
// stays the same across states, so picking never shifts the others.
//
// The block follows the click at once, before the page that goes with the
// choice is drawn (a choice kept in the address re-renders the whole page):
// `picked` is the click's own answer until `value` catches up, and the
// slide is played by the browser (slideFrom), whatever the page is doing.
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const [picked, pick] = useOptimistic(value);
  // Where the block was when it left an option: the next one slides from there
  const leftAt = useRef<DOMRect | null>(null);
  const block = useCallback((el: HTMLSpanElement | null) => {
    if (!el) return;
    slideFrom(el, leftAt.current);
    leftAt.current = null;
    return () => {
      leftAt.current = el.getBoundingClientRect();
    };
  }, []);
  return (
    <div
      className="inline-flex p-0.5 flex-wrap"
      style={{
        background: "var(--surface)",
        border: "2px solid var(--forest)",
        boxShadow: "2px 2px 0 0 var(--forest)",
      }}
    >
      {options.map((opt) => {
        const active = opt.value === picked;
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={active}
            onClick={() => startTransition(() => {
              pick(opt.value);
              onChange(opt.value);
            })}
            className="segmented-option relative px-4 py-1.5 font-mont text-micro uppercase tracking-widest focus-ring"
            style={{ color: active ? "var(--saffron)" : "var(--ink-soft)", fontWeight: 800 }}
          >
            {active && <span ref={block} aria-hidden className="absolute inset-0" style={{ background: "var(--forest)" }} />}
            <span className="relative">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Select (styled native select) ────────────────────────────────────

export function Select({ className, style, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full px-3 py-2 text-sm font-mont focus-ring disabled:opacity-50 disabled:cursor-not-allowed ${className || ""}`}
      style={{ ...FIELD_STYLE, ...style }}
    />
  );
}

// ─── Alert (error / success banner) ───────────────────────────────────

export function Alert({
  tone = "error",
  title,
  children,
}: {
  tone?: "error" | "success" | "warning";
  title?: string;
  children: ReactNode;
}) {
  const color = { error: "var(--clay)", success: "var(--sage-dark)", warning: "var(--saffron-dark)" }[tone];
  return (
    <BrutalCard
      className="p-4 alert-in"
      withCorners={false}
      role={tone === "error" ? "alert" : "status"}
      style={{ borderColor: color, boxShadow: `2px 2px 0 0 ${color}` }}
    >
      <div className="font-mont text-tiny uppercase tracking-widest mb-1" style={{ color, fontWeight: 800 }}>
        {title ?? { error: "Erreur", success: "C'est fait", warning: "Attention" }[tone]}
      </div>
      <div className="font-open text-sm" style={{ color: "var(--ink)" }}>{children}</div>
    </BrutalCard>
  );
}

// ─── Page loading placeholder ─────────────────────────────────────────

// While a page (or a section) loads: the shape of what's coming — a page
// header, then a table — under a soft sheen, instead of a lone word. It
// only appears after a short delay, so a fast load doesn't flash it.
// "section": just the table, for a part of a page.
const LOADING_DELAY_MS = 150;
const SKELETON_ROWS = ["55%", "40%", "65%", "35%", "50%"];

export function PageLoading({ variant = "page" }: { variant?: "page" | "section" }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setShown(true), LOADING_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);
  const rows = variant === "page" ? SKELETON_ROWS : SKELETON_ROWS.slice(0, 3);

  return (
    <div
      role="status"
      aria-busy="true"
      className={variant === "page" ? "space-y-10" : undefined}
      style={{ opacity: shown ? 1 : 0, transition: "opacity 200ms ease-out" }}
    >
      {variant === "page" && (
        // Same box as PageHeader, so nothing jumps when the page arrives
        <div aria-hidden className="pb-6" style={{ borderBottom: "2px solid var(--border)" }}>
          <Bone width="6rem" height="0.6rem" saffron className="mt-1" />
          <Bone width="min(18rem, 70%)" height="2.4rem" className="mt-2" />
          <Bone width="min(34rem, 100%)" height="0.8rem" className="mt-3" />
          <Bone width="min(24rem, 80%)" height="0.8rem" className="mt-2" />
        </div>
      )}
      <div aria-hidden style={{ border: "2px solid var(--forest)", boxShadow: "2px 2px 0 0 var(--forest)", background: "var(--surface)" }}>
        <div className="px-4 flex items-center" style={{ height: "2.75rem", background: "var(--forest-soft)" }}>
          <span className="loading-label font-mont text-micro uppercase tracking-widest" style={{ color: "rgba(244,236,216,0.75)", fontWeight: 800 }}>
            Chargement...
          </span>
        </div>
        {rows.map((width, i) => (
          <div
            key={i}
            className="px-4 flex items-center gap-6"
            style={{ height: "3.25rem", borderTop: "1px solid var(--border)", background: i % 2 ? "var(--row-alt)" : undefined }}
          >
            <Bone width="3.5rem" />
            <Bone width={width} />
            <Bone width="2.5rem" className="ml-auto" />
          </div>
        ))}
      </div>
      {/* Last, so the spacing above doesn't count it as the first child */}
      <span className="sr-only">Chargement...</span>
    </div>
  );
}

// One placeholder bar of the loading skeleton
function Bone({ width, height = "0.7rem", saffron = false, className = "" }: { width: string; height?: string; saffron?: boolean; className?: string }) {
  return <span className={`skeleton${saffron ? " skeleton--saffron" : ""} ${className}`} style={{ width, height }} />;
}
