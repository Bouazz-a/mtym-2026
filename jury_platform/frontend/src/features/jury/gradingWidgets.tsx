import { useEffect, useId, useRef, useState } from "react";
import { FIELD_STYLE } from "@/features/shared/fieldStyle";
import { InfoIcon } from "@/features/shared/icons";
import { Popover } from "@/features/shared/primitives";
import type { Criterion } from "@/types";
import { fmtNote } from "@/lib/services/gradingService";

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

// ─── Score input (0..1 success rate) ──────────────────────────────────

function ScoreInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <input
        type="number"
        min={0}
        max={1}
        step={0.05}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          let v = Number(e.target.value);
          if (Number.isNaN(v)) v = 0;
          onChange(Math.max(0, Math.min(1, v)));
        }}
        className="w-[4.5rem] px-2 py-1 text-sm font-mont focus-ring"
        style={FIELD_STYLE}
      />
      <span
        className="font-mont text-micro tabular-nums"
        style={{ color: "var(--ink-faint)", fontWeight: 800, minWidth: "2.125rem" }}
      >
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

// ─── Criterion title (and its description) ────────────────────────────

const TITLE_STYLE = { color: "var(--forest)", fontWeight: 800 } as const;

// A criterion's title. With a description, hovering shows it and a click
// pins it open (touch screens have no hover; Escape or a click elsewhere
// closes it). It floats in a Popover, fixed on screen, so the grading card
// can't clip it — and closes when the page scrolls, which it can't follow.
function CriterionTitle({ label, description }: { label: string; description?: string | null }) {
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
    return <span className="font-mont text-xs" style={TITLE_STYLE}>{label}</span>;
  }
  return (
    <div
      className="inline-flex min-w-0"
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
        type="button"
        onClick={() => setPinned((p) => !p)}
        aria-expanded={open}
        aria-controls={id}
        className="font-mont text-xs inline-flex items-center gap-1 text-left focus-ring"
        style={{ ...TITLE_STYLE, textDecoration: "underline dotted", textUnderlineOffset: "3px", cursor: "help" }}
      >
        {label}
        <InfoIcon size="0.8rem" style={{ color: "var(--ink-faint)" }} />
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
            {list.map((c, i) => {
              const d = drafts[c.id] ?? emptyDraft();
              const note = d.score * c.coefficient;
              return (
                <div
                  key={c.id}
                  className="px-3 py-2.5"
                  style={{
                    borderTop: i === 0 ? undefined : "1px solid var(--border)",
                    background:
                      i % 2 ? "var(--surface)" : "rgba(240,235,220,0.4)",
                  }}
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <CriterionTitle label={c.label} description={c.description} />
                      <span
                        data-tour={anchor(c.id, "coef")}
                        className="font-mont text-micro uppercase tracking-widest px-1.5 py-0.5"
                        style={{
                          background:
                            c.coefficient < 0
                              ? "rgba(178,59,27,0.10)"
                              : "var(--paper-2)",
                          color:
                            c.coefficient < 0
                              ? "var(--clay)"
                              : "var(--ink-soft)",
                          border: "1px solid var(--border)",
                          fontWeight: 800,
                        }}
                      >
                        coef {c.coefficient}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0" data-tour={anchor(c.id, "score")}>
                      <ScoreInput
                        value={d.score}
                        disabled={disabled}
                        onChange={(v) => onChange(c.id, { score: v })}
                      />
                      <span
                        className="font-mont text-xs tabular-nums text-right"
                        style={{
                          color:
                            note < 0 ? "var(--clay)" : "var(--saffron-dark)",
                          fontWeight: 900,
                          minWidth: "3.25rem",
                        }}
                        title="Note = taux × coefficient"
                      >
                        {fmtNote(note)}
                      </span>
                    </div>
                  </div>
                  <input
                    data-tour={anchor(c.id, "comment")}
                    value={d.remark}
                    disabled={disabled}
                    onChange={(e) => onChange(c.id, { remark: e.target.value })}
                    placeholder="Commentaire (optionnel)…"
                    className="w-full mt-2 px-2 py-1 text-xs font-open focus-ring"
                    style={FIELD_STYLE}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Note summary pill ────────────────────────────────────────────────

export function NotePill({
  note,
  label = "Note",
}: {
  note: number;
  label?: string;
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
        className="tabular-nums"
        style={{
          color: "var(--paper)",
          fontSize: "1.15rem",
          fontWeight: 700,
          letterSpacing: "0.01em",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        }}
      >
        {fmtNote(note)}
      </span>
    </span>
  );
}
