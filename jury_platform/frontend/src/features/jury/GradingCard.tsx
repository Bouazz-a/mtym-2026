import { useEffect, useState, type ReactNode } from "react";
import { Alert, Btn, BrutalCard, Textarea } from "@/features/shared/primitives";
import { useSession } from "@/features/shared/SessionContext";
import { errorMessage } from "@/lib/services/errors";
import { weightedNote } from "@/lib/services/gradingService";
import type { Criterion, Grade } from "@/types";
import { clearDraft, draftBase, readDraft, writeDraft } from "./gradingDraft";
import { CriterionGradingTable, NotePill, type GradeDraft, type GradeDrafts } from "./gradingWidgets";

// One grading grid: the criteria of an oral role or of a report problem,
// pre-filled with what the juror already saved, a live note, a global
// remark and a save button. Oral panels and the report card both use it.
//
// Grades typed but not saved are kept in the browser (see gradingDraft) and
// come back when the grid is opened again; closing or reloading the page
// with unsaved grades asks first.

interface GradingInput {
  globalRemark?: string;
  grades: { criterionId: string; score: number; remark?: string }[];
}

type Saved = { globalRemark: string | null; grades: Grade[] } | undefined;

const savedDrafts = (criteria: Criterion[], saved: Saved): GradeDrafts =>
  Object.fromEntries(
    criteria.map((c) => {
      const g = saved?.grades.find((x) => x.criterionId === c.id);
      return [c.id, { score: g?.score ?? 0, remark: g?.remark ?? "" }];
    }),
  );

export function GradingCard({
  header,
  criteria,
  saved,
  disabled = false,
  disabledHint,
  practice = false,
  tourAnchors = false,
  outOf,
  draftKey,
  onSave,
  children,
}: {
  header: ReactNode;
  criteria: Criterion[];
  saved: Saved;
  disabled?: boolean;
  disabledHint?: string;
  practice?: boolean; // the guide's practice passage: saving sends nothing
  tourAnchors?: boolean; // the card the guide's steps point at
  outOf?: number; // show the note rescaled out of this (written reports: 20) instead of the grid's total
  draftKey?: string; // names this grid's unsaved grades in the browser (none: they aren't kept)
  onSave: (input: GradingInput) => Promise<unknown>;
  children?: ReactNode; // extra content above the grid (e.g. the report viewer)
}) {
  const { user } = useSession();
  // Per juror; never for the practice grids nor a grid with nothing to grade
  const storageId = draftKey && user && !practice && !disabled ? `${user.id}:${draftKey}` : null;
  const base = draftBase(saved);
  // A draft left in this browser, read once when the grid opens
  const [kept] = useState(() => (storageId ? readDraft(storageId, base) : null));

  const [drafts, setDrafts] = useState<GradeDrafts>(() => ({ ...savedDrafts(criteria, saved), ...kept?.drafts }));
  const [remark, setRemark] = useState(kept?.remark ?? saved?.globalRemark ?? "");
  const [status, setStatus] = useState<string | null>(saved && !kept ? "déjà enregistré" : null);
  const [dirty, setDirty] = useState(kept !== null); // changed since the last save
  const [restored, setRestored] = useState(kept !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the unsaved grades in the browser as they're typed
  useEffect(() => {
    if (storageId && dirty) writeDraft(storageId, { base, drafts, remark });
  }, [storageId, dirty, base, drafts, remark]);

  // Closing or reloading the page with unsaved grades asks first
  useEffect(() => {
    if (!dirty || practice) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, practice]);

  const edited = () => {
    setStatus(null);
    setDirty(true);
  };

  const note = weightedNote(
    criteria.map((c) => ({ criterionId: c.id, score: drafts[c.id]?.score ?? 0 })),
    criteria,
  );

  const patch = (criterionId: string, p: Partial<GradeDraft>) => {
    setDrafts((prev) => ({ ...prev, [criterionId]: { ...(prev[criterionId] ?? { score: 0, remark: "" }), ...p } }));
    edited();
  };

  // Back to what was saved: the restored draft is thrown away
  const discard = () => {
    if (storageId) clearDraft(storageId);
    setDrafts(savedDrafts(criteria, saved));
    setRemark(saved?.globalRemark ?? "");
    setStatus(saved ? "déjà enregistré" : null);
    setDirty(false);
    setRestored(false);
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
      if (storageId) clearDraft(storageId);
      setDirty(false);
      setRestored(false);
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
          {outOf && note.maxTotal > 0
            ? <NotePill note={(note.total / note.maxTotal) * outOf} label={`Note / ${outOf}`} />
            : <NotePill note={note.total} label={`Note / ${note.maxTotal}`} />}
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
                onChange={(e) => { setRemark(e.target.value); edited(); }}
                placeholder="Synthèse de votre évaluation…"
                disabled={disabled}
              />
            </label>
          </>
        )}
        {error && <Alert>{error}</Alert>}
      </div>

      <div className="px-5 py-3 flex items-center justify-between gap-3" style={{ borderTop: "1px solid var(--border)", background: "var(--paper-2)" }}>
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <span
            aria-live="polite"
            className="font-mont text-tiny uppercase tracking-widest"
            style={{ color: status ? "var(--sage-dark)" : dirty ? "var(--saffron-dark)" : "var(--ink-faint)", fontWeight: 800 }}
          >
            {restored
              ? "Brouillon non enregistré"
              : status
                ? `Enregistré · ${status}${practice ? " (entraînement)" : ""}`
                : dirty && saved
                  ? "Modifications non enregistrées"
                  : "Non enregistré"}
          </span>
          {restored && (
            <button
              type="button"
              onClick={discard}
              className="font-mont text-tiny uppercase tracking-widest underline underline-offset-2"
              style={{ color: "var(--ink-soft)", fontWeight: 700 }}
            >
              {saved ? "Revenir à la version enregistrée" : "Effacer le brouillon"}
            </button>
          )}
        </div>
        <Btn
          onClick={save}
          disabled={busy || disabled || criteria.length === 0}
          variant={saved && !dirty ? "ghost" : "primary"}
          size="sm"
          data-tour={tourAnchors ? "save" : undefined}
        >
          {busy ? "Enregistrement…" : saved ? "Mettre à jour" : "Enregistrer"}
        </Btn>
      </div>
    </BrutalCard>
  );
}
