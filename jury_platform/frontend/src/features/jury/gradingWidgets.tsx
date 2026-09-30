import { useEffect, useId, useRef, useState } from "react";
import { FIELD_STYLE } from "@/features/shared/fieldStyle";
import { InfoIcon } from "@/features/shared/icons";
import { Popover } from "@/features/shared/primitives";
import type { Criterion } from "@/types";
import { frNote, parseRate } from "@/lib/services/gradingService";
import { SCALE } from "./guide/guideContent";

// gradingWidgets — presentational building blocks of the grading cards
// (oral roles + reports). Fully controlled: GradingCard owns the drafts.

export interface GradeDraft {
  score: number; // 0..1 taux de réussite
  remark: string;
}

export type GradeDrafts = Record<string, GradeDraft>;

const emptyDraft = (): GradeDraft => ({ score: 0, remark: "" });

/** Group criteria by their optional theme, preserving order. */
function groupByTheme(criteria: Criterion[]): [string, Criterion[]][] {
  const groups: [string, Criterion[]][] = [];
  for (const c of [...criteria].sort((a, b) => a.order - b.order)) {
    const key = c.theme ?? "";
    let g = groups.find(([k]) => k === key);
    if (!g) {
      g = [key, []];
      groups.push(g);
    }
    g[1].push(c);
  }
  return groups;
}

// ─── Score scale (0..1 success rate) ──────────────────────────────────

// The organizers' scale, one tap per mark; its meaning shows under the
// pointer (and in the aide-mémoire). A rate in between (0,1…) goes in the
// small « autre » field next to it.
const STEPS = [0, 0.25, 0.5, 0.75, 1];
const MEANING = new Map(SCALE.map((s) => [Number(s.value.replace(",", ".")), s.meaning]));

function ScoreScale({
  value,
  onChange,
  disabled,
  malus,
  labelId,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  malus: boolean; // a malus criterion: a picked mark above 0 is drawn in clay
  labelId: string; // the criterion's title, which names the group
  label: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const picked = STEPS.indexOf(value); // -1: a rate in between
  // Arrow keys move along the scale and pick, like radio buttons
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" || e.key === "ArrowDown" ? i + 1
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? i - 1
      : e.key === "Home" ? 0
      : e.key === "End" ? STEPS.length - 1
      : null;
    if (next === null) return;
    e.preventDefault();
    const j = Math.max(0, Math.min(STEPS.length - 1, next));
    onChange(STEPS[j]);
    buttons.current[j]?.focus();
  };

  return (
    <div className="flex items-center gap-x-3 gap-y-2 flex-wrap">
      <div role="radiogroup" aria-labelledby={labelId} className="inline-flex" style={{ border: "1px solid var(--field-border)" }}>
        {STEPS.map((step, i) => {
          const on = i === picked;
          const penalty = malus && step > 0; // a malus that applies
          return (
            <button
              key={step}
              ref={(el) => { buttons.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              // One stop in the tab order: the picked mark, or the first
              tabIndex={on || (picked === -1 && i === 0) ? 0 : -1}
              disabled={disabled}
              title={MEANING.get(step)}
              onClick={() => onChange(step)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className="score-step font-mont tabular-nums"
              style={{
                borderLeft: i > 0 ? "1px solid var(--border)" : undefined,
                ...(on && { background: penalty ? "var(--clay)" : "var(--forest)", color: penalty ? "var(--surface)" : "var(--saffron)" }),
              }}
            >
              {frNote(step)}
            </button>
          );
        })}
      </div>
      <OtherRate value={value} onChange={onChange} disabled={disabled} label={label} inUse={picked === -1} />
    </div>
  );
}

// « autre »: a rate off the scale, typed with a comma or a dot. It shows
// the rate while it isn't one of the marks.
function OtherRate({
  value,
  onChange,
  disabled,
  label,
  inUse,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  label: string;
  inUse: boolean;
}) {
  const [typing, setTyping] = useState<string | null>(null);
  const shown = typing ?? (inUse ? frNote(value) : "");
  return (
    <label className="inline-flex items-center gap-1.5 font-open text-xs" style={{ color: "var(--ink-soft)" }}>
      ou
      <input
        type="text"
        inputMode="decimal"
        value={shown}
        disabled={disabled}
        placeholder="autre"
        aria-label={`${label} : autre taux, entre 0 et 1`}
        onChange={(e) => {
          setTyping(e.target.value);
          const v = parseRate(e.target.value);
          if (v !== null) onChange(v);
        }}
        onBlur={() => setTyping(null)}
        className="px-2 py-1.5 text-sm font-mont tabular-nums focus-ring"
        style={{
          ...FIELD_STYLE,
          width: "4.25rem",
          ...(inUse && { borderColor: "var(--forest)", boxShadow: "inset 0 0 0 1px var(--forest)", fontWeight: 800 }),
        }}
      />
    </label>
  );
}

// ─── A criterion's points ─────────────────────────────────────────────

// The room a note up to `max` can take (« 2,75 », « −1,25 »), in its own
// font: reserved ahead, a note that changes never moves what's beside it
function noteWidth(max: number, negative = false): string {
  const units = String(Math.floor(Math.abs(max))).length; // digits before the comma
  return `${units + 3 + (negative ? 1 : 0)}ch`;
}

// What the criterion brings to the grid: the rate times what it's worth,
// read as « 2,25 / 3 pts ». A malus reads « −1,25 », in clay once it
// applies, over « malus · jusqu'à −5 ».
function Points({ score, coefficient }: { score: number; coefficient: number }) {
  const points = score * coefficient;
  const malus = coefficient < 0;
  const unit = Math.abs(coefficient) > 1 ? "pts" : "pt";
  return (
    <span
      className="block text-right font-mont tabular-nums whitespace-nowrap leading-tight"
      title={`Taux ${frNote(score)} × ${frNote(coefficient)} ${unit}`}
    >
      <span
        className="inline-block text-right"
        style={{
          minWidth: noteWidth(coefficient, malus),
          fontSize: "1.05rem",
          fontWeight: 900,
          color: malus ? (points < 0 ? "var(--clay)" : "var(--ink-faint)") : "var(--forest)",
        }}
      >
        {frNote(points)}
      </span>
      {malus ? (
        <span className="block text-micro uppercase tracking-widest" style={{ color: "var(--clay)", fontWeight: 800 }}>
          malus · jusqu'à {frNote(coefficient)}
        </span>
      ) : (
        <span className="text-xs" style={{ color: "var(--ink-faint)", fontWeight: 700 }}> / {frNote(coefficient)} {unit}</span>
      )}
    </span>
  );
}

// ─── The scale, drawn: four quarters, filled up to the rate ───────────

export function QuarterMeter({ value, label }: { value: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex gap-0.5 shrink-0">
      {[1, 2, 3, 4].map((q) => (
        <span
          key={q}
          aria-hidden
          style={{
            width: "0.55rem",
            height: "0.55rem",
            background: value * 4 >= q ? "var(--saffron)" : "var(--paper-2)",
            border: `1px solid ${value * 4 >= q ? "var(--saffron-dark)" : "var(--border)"}`,
          }}
        />
      ))}
    </span>
  );
}

// ─── Criterion title (and its description) ────────────────────────────

const TITLE_STYLE = { color: "var(--forest)", fontWeight: 800 } as const;

// A criterion's title. With a description, hovering shows it and a click
// pins it open (touch screens have no hover; Escape or a click elsewhere
// closes it). It floats in a Popover, fixed on screen, so the grading card
// can't clip it — and closes when the page scrolls, which it can't follow.
function CriterionTitle({ id: titleId, label, description }: { id: string; label: string; description?: string | null }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const leaveTimer = useRef<number | undefined>(undefined);
  const open = pinned || hovered;
  const close = () => {
    setPinned(false);
    setHovered(false);
  };

  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      if (document.getElementById(id)?.contains(e.target as Node)) return; // scrolling the description itself
      setPinned(false);
      setHovered(false);
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", onScroll, { capture: true });
  }, [open, id]);
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  if (!description?.trim()) {
    return <span id={titleId} className="font-mont text-sm" style={TITLE_STYLE}>{label}</span>;
  }
  const cut = label.trimEnd().lastIndexOf(" ") + 1;
  const [head, tail] = [label.slice(0, cut), label.slice(cut)];
  return (
    <div
      className="min-w-0"
      onMouseEnter={() => {
        window.clearTimeout(leaveTimer.current);
        setHovered(true);
      }}
      // A short grace: time to move the pointer into the description
      onMouseLeave={() => {
        leaveTimer.current = window.setTimeout(() => setHovered(false), 150);
      }}
    >
      <button
        ref={anchor}
        id={titleId}
        type="button"
        onClick={() => setPinned((p) => !p)}
        aria-expanded={open}
        aria-controls={id}
        className="font-mont text-sm text-left focus-ring"
        style={{ ...TITLE_STYLE, textDecoration: "underline dotted", textUnderlineOffset: "3px", cursor: "help" }}
      >
        {/* The (i) follows the last word, on its line: it stays with the
            title however the title wraps */}
        {head}
        <span className="whitespace-nowrap">
          {tail}
          <InfoIcon size="0.8rem" style={{ display: "inline-block", verticalAlign: "-0.1em", color: "var(--ink-faint)", marginLeft: "0.3rem" }} />
        </span>
      </button>
      <Popover open={open} onClose={close} anchorRef={anchor} align="left" width={22} id={id} role="tooltip">
        <p className="font-open text-sm px-4 py-3" style={{ color: "var(--ink)", whiteSpace: "pre-line", lineHeight: 1.5 }}>
          {description}
        </p>
      </Popover>
    </div>
  );
}

// ─── Criterion grading table (controlled) ─────────────────────────────

export function CriterionGradingTable({
  criteria,
  drafts,
  onChange,
  disabled = false,
  tourAnchors = false,
}: {
  criteria: Criterion[];
  drafts: GradeDrafts;
  onChange: (criterionId: string, patch: Partial<GradeDraft>) => void;
  disabled?: boolean;
  tourAnchors?: boolean; // mark the first criterion for the guide's steps
}) {
  if (criteria.length === 0) return null;

  const groups = groupByTheme(criteria);
  const firstId = groups[0]?.[1][0]?.id;
  const anchor = (id: string, name: string) => (tourAnchors && id === firstId ? name : undefined);

  return (
    <div className="space-y-4">
      {groups.map(([theme, list]) => (
        <div key={theme || "—"}>
          {theme && (
            <div
              className="font-mont text-tiny uppercase tracking-widest mb-1.5 px-1"
              style={{ color: "var(--saffron-dark)", fontWeight: 900 }}
            >
              {theme}
            </div>
          )}
          <div style={{ border: "1px solid var(--border)" }}>
            {list.map((c, i) => (
              <CriterionRow
                key={c.id}
                criterion={c}
                draft={drafts[c.id] ?? emptyDraft()}
                striped={i % 2 === 1}
                first={i === 0}
                onChange={(patch) => onChange(c.id, patch)}
                disabled={disabled}
                anchor={(name) => anchor(c.id, name)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// One criterion, always laid out the same, whatever the card's width: its
// title and its points, the scale, then the comment
function CriterionRow({
  criterion: c,
  draft: d,
  striped,
  first,
  onChange,
  disabled,
  anchor,
}: {
  criterion: Criterion;
  draft: GradeDraft;
  striped: boolean;
  first: boolean;
  onChange: (patch: Partial<GradeDraft>) => void;
  disabled: boolean;
  anchor: (name: string) => string | undefined;
}) {
  const titleId = useId();
  return (
    <div
      className="px-3 py-3 space-y-2.5"
      style={{ borderTop: first ? undefined : "1px solid var(--border)", background: striped ? "var(--row-alt)" : "var(--surface)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 pt-0.5">
          <CriterionTitle id={titleId} label={c.label} description={c.description} />
        </div>
        <span data-tour={anchor("coef")} className="shrink-0">
          <Points score={d.score} coefficient={c.coefficient} />
        </span>
      </div>
      <div data-tour={anchor("score")}>
        <ScoreScale
          value={d.score}
          onChange={(score) => onChange({ score })}
          disabled={disabled}
          malus={c.coefficient < 0}
          labelId={titleId}
          label={c.label}
        />
      </div>
      <input
        data-tour={anchor("comment")}
        value={d.remark}
        disabled={disabled}
        onChange={(e) => onChange({ remark: e.target.value })}
        placeholder="Commentaire (optionnel)…"
        aria-label={`${c.label} : commentaire`}
        className="w-full px-2 py-1.5 text-xs font-open focus-ring"
        style={FIELD_STYLE}
      />
    </div>
  );
}

// ─── Note summary pill ────────────────────────────────────────────────

export function NotePill({
  note,
  label = "Note",
  max,
  negative = false,
}: {
  note: number;
  label?: string;
  max: number; // the largest the note can be: its room is kept, so the pill never resizes
  negative?: boolean; // a malus can take it below 0
}) {
  // Number rendered in paper (cream) rather than saffron: at small sizes
  // saffron-on-forest sits too close in luminance for clean sub-pixel
  // rendering and the digits look fuzzy. We keep the saffron accent on the
  // label and force greyscale AA on the number so it stays crisp.
  return (
    <span
      className="font-mont uppercase inline-flex items-baseline gap-2.5 px-3 py-1.5"
      style={{ background: "var(--forest)" }}
    >
      <span
        className="text-micro tracking-widest"
        style={{ color: "var(--saffron)", fontWeight: 700, opacity: 0.85 }}
      >
        {label}
      </span>
      <span
        className="tabular-nums inline-block text-right"
        style={{
          minWidth: noteWidth(max, negative),
          color: "var(--paper)",
          fontSize: "1.15rem",
          fontWeight: 700,
          letterSpacing: "0.01em",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        }}
      >
        {frNote(note)}
      </span>
    </span>
  );
}
