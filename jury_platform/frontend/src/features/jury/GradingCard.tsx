import { useState, type ReactNode } from "react";
import { Alert, Btn, BrutalCard, Textarea } from "@/features/shared/primitives";
import { errorMessage } from "@/lib/services/errors";
import { weightedNote } from "@/lib/services/gradingService";
import type { Criterion, Grade } from "@/types";
import { CriterionGradingTable, NotePill, type GradeDraft, type GradeDrafts } from "./gradingWidgets";

// One grading grid: the criteria of an oral role or of a report problem,
// pre-filled with what the juror already saved, a live note, a global
// remark and a save button. Oral panels and the report card both use it.

interface GradingInput {
  globalRemark?: string;
  grades: { criterionId: string; score: number; remark?: string }[];
}

export function GradingCard({
  header,
  criteria,
  saved,
  disabled = false,
  disabledHint,
  practice = false,
  tourAnchors = false,
  onSave,
  children,
}: {
  header: ReactNode;
  criteria: Criterion[];
  saved: { globalRemark: string | null; grades: Grade[] } | undefined;
  disabled?: boolean;
  disabledHint?: string;
  practice?: boolean; // the guide's practice passage: saving sends nothing
  tourAnchors?: boolean; // the card the guide's steps point at
  onSave: (input: GradingInput) => Promise<unknown>;
  children?: ReactNode; // extra content above the grid (e.g. the report viewer)
}) {
  const [drafts, setDrafts] = useState<GradeDrafts>(() =>
    Object.fromEntries(
      criteria.map((c) => {
        const g = saved?.grades.find((x) => x.criterionId === c.id);
        return [c.id, { score: g?.score ?? 0, remark: g?.remark ?? "" }];
      }),
    ),
  );
  const [remark, setRemark] = useState(saved?.globalRemark ?? "");
  const [status, setStatus] = useState<string | null>(saved ? "déjà enregistré" : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const note = weightedNote(
    criteria.map((c) => ({ criterionId: c.id, score: drafts[c.id]?.score ?? 0 })),
    criteria,
  );

  const patch = (criterionId: string, p: Partial<GradeDraft>) => {
    setDrafts((prev) => ({ ...prev, [criterionId]: { ...(prev[criterionId] ?? { score: 0, remark: "" }), ...p } }));
    setStatus(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave({
        globalRemark: remark.trim() || undefined,
        grades: criteria.map((c) => ({
          criterionId: c.id,
          score: drafts[c.id]?.score ?? 0,
          remark: drafts[c.id]?.remark.trim() || undefined,
        })),
      });
      setStatus(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    } catch (err) {
      setError(errorMessage(err, "Impossible d'enregistrer l'évaluation."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BrutalCard className="flex flex-col overflow-hidden" data-tour={tourAnchors ? "grading-card" : undefined}>
      <div className="px-5 py-4 flex items-start justify-between gap-3" style={{ borderBottom: "2px solid var(--forest)" }}>
        <div className="min-w-0">{header}</div>
        <span data-tour={tourAnchors ? "note" : undefined}>
          <NotePill note={note.total} label={`Note / ${note.maxTotal}`} />
        </span>
      </div>

      <div className="p-5 space-y-4 flex-1">
        {children}
        {disabled && disabledHint ? (
          <p className="font-open text-sm italic" style={{ color: "var(--ink-faint)" }}>{disabledHint}</p>
        ) : criteria.length === 0 ? (
          <p className="font-open text-sm italic" style={{ color: "var(--ink-faint)" }}>
            Aucun critère configuré pour cette grille.
          </p>
        ) : (
          <>
            <CriterionGradingTable criteria={criteria} drafts={drafts} onChange={patch} disabled={disabled} tourAnchors={tourAnchors} />
            <label className="block">
              <span className="font-mont text-tiny uppercase tracking-widest block mb-1.5" style={{ color: "var(--ink-soft)", fontWeight: 800 }}>
                Remarques globales
              </span>
              <Textarea
                value={remark}
                onChange={(e) => { setRemark(e.target.value); setStatus(null); }}
                placeholder="Synthèse de votre évaluation…"
                disabled={disabled}
              />
            </label>
          </>
        )}
        {error && <Alert>{error}</Alert>}
      </div>

      <div className="px-5 py-3 flex items-center justify-between gap-3" style={{ borderTop: "1px solid var(--border)", background: "var(--paper-2)" }}>
        <span className="font-mont text-tiny uppercase tracking-widest" style={{ color: status ? "var(--sage-dark)" : "var(--ink-faint)", fontWeight: 800 }}>
          {status ? `Enregistré · ${status}${practice ? " (entraînement)" : ""}` : "Non enregistré"}
        </span>
        <Btn
          onClick={save}
          disabled={busy || disabled || criteria.length === 0}
          variant={saved ? "ghost" : "primary"}
          size="sm"
          data-tour={tourAnchors ? "save" : undefined}
        >
          {busy ? "Enregistrement…" : saved ? "Mettre à jour" : "Enregistrer"}
        </Btn>
      </div>
    </BrutalCard>
  );
}
