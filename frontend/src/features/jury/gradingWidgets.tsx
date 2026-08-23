import type { Criterion } from "@/types";
import { fmtNote } from "@/lib/services/gradingService";

// gradingWidgets — shared, presentational building blocks for the jury
// grading screens (final reports + oral passages). They are fully
// controlled: the parent owns the draft state and the save semantics.

export interface GradeDraft {
  score: number; // 0..1 taux de réussite
  remark: string;
}

export type GradeDrafts = Record<string, GradeDraft>;

/** Empty draft for a criterion not yet graded. */
export const emptyDraft = (): GradeDraft => ({ score: 0, remark: "" });

/** Running weighted note for the current (unsaved) drafts. */
export function runningNote(criteria: Criterion[], drafts: GradeDrafts): number {
  let total = 0;
  for (const c of criteria) {
    const d = drafts[c.id];
    if (d) total += d.score * c.coefficient;
  }
  return total;
}

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

export function ScoreInput({
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
        className="w-[68px] px-2 py-1 text-sm font-mont focus-ring"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--ink)",
        }}
      />
      <span
        className="font-mont text-micro tabular-nums"
        style={{ color: "var(--ink-faint)", fontWeight: 800, minWidth: 34 }}
      >
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

// ─── Criterion grading table (controlled) ─────────────────────────────

export function CriterionGradingTable({
  criteria,
  drafts,
  onChange,
  disabled = false,
}: {
  criteria: Criterion[];
  drafts: GradeDrafts;
  onChange: (criterionId: string, patch: Partial<GradeDraft>) => void;
  disabled?: boolean;
}) {
  if (criteria.length === 0) return null;

  const groups = groupByTheme(criteria);

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
                      <span
                        className="font-mont text-xs"
                        style={{ color: "var(--forest)", fontWeight: 800 }}
                      >
                        {c.label}
                      </span>
                      <span
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
                    <div className="flex items-center gap-3 shrink-0">
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
                          minWidth: 52,
                        }}
                        title="Note = taux × coefficient"
                      >
                        {fmtNote(note)}
                      </span>
                    </div>
                  </div>
                  <input
                    value={d.remark}
                    disabled={disabled}
                    onChange={(e) => onChange(c.id, { remark: e.target.value })}
                    placeholder="Commentaire (optionnel)…"
                    className="w-full mt-2 px-2 py-1 text-xs font-open focus-ring"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      color: "var(--ink)",
                    }}
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
