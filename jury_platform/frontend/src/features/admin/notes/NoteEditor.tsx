import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Btn, Modal } from "@/features/shared/primitives";
import { GradingCard } from "@/features/jury/GradingCard";
import {
  deleteOralEvaluation, deleteReportEvaluation, updateOralEvaluation, updateReportEvaluation,
} from "@/lib/repositories/evaluationRepository";
import { errorMessage } from "@/lib/services/errors";
import { frNote } from "@/lib/services/gradingService";
import type { Criterion, OralEvaluation, ReportEvaluation } from "@/types";

// A juror's note in the admin's hands: « Modifier » opens the juror's own
// grid, filled with what they saved, and « Supprimer » removes the note so
// they can grade again. Both go to the journal with the note as it was.

export interface EditableNote {
  kind: "oral" | "report";
  evaluation: OralEvaluation | ReportEvaluation;
  juror: string; // "Ines Uitest"
  subject: string; // "MMVI, défenseur dans RAB-B2P3"
  criteria: Criterion[]; // the grid it was given on
  total: number; // as read on the page: out of `max`
  max: number;
}

// What a changed note moves: the notes, the results, the reports board and the journal
const TOUCHED = [["oral-evaluations"], ["report-evaluations"], ["report-assignments"], ["audit-log"]];

export function NoteActions({ note }: { note: EditableNote }) {
  const [open, setOpen] = useState<"edit" | "delete" | null>(null);
  const link = "font-mont text-tiny uppercase tracking-widest underline underline-offset-2 py-1 focus-ring";
  return (
    <>
      <span className="inline-flex items-center gap-3">
        <button type="button" className={link} style={{ color: "var(--forest)", fontWeight: 800 }} onClick={() => setOpen("edit")}>
          Modifier<span className="sr-only"> la note de {note.juror} ({note.subject})</span>
        </button>
        <button type="button" className={link} style={{ color: "var(--clay)", fontWeight: 800 }} onClick={() => setOpen("delete")}>
          Supprimer<span className="sr-only"> la note de {note.juror} ({note.subject})</span>
        </button>
      </span>
      {open === "edit" && <EditModal note={note} onClose={() => setOpen(null)} />}
      {open === "delete" && <DeleteModal note={note} onClose={() => setOpen(null)} />}
    </>
  );
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => Promise.all(TOUCHED.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

// ─── The juror's grid, as they filled it ─────────────────────────────

function EditModal({ note, onClose }: { note: EditableNote; onClose: () => void }) {
  const refresh = useRefresh();
  // Read when the dialog is asked to close, whichever render the request
  // comes from (Escape is wired when the dialog renders)
  const dirty = useRef(false);
  const setDirty = useCallback((changed: boolean) => {
    dirty.current = changed;
  }, []);
  const [leaving, setLeaving] = useState(false); // asked to close with changes not saved
  const close = () => (dirty.current ? setLeaving(true) : onClose());

  return (
    <Modal open title={`Note de ${note.juror}`} onClose={close} width="min(64rem, calc(100vw - 2rem))">
      <div className="space-y-4">
        <p className="font-open text-sm" style={{ color: "var(--ink-soft)" }}>
          Vous corrigez la note saisie par {note.juror}. Elle remplace la sienne dans les notes et les résultats, et le journal garde
          l'ancienne, critère par critère.
        </p>
        {leaving && (
          <Alert tone="warning" title="Modifications non enregistrées">
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <Btn size="sm" variant="ghost" onClick={() => setLeaving(false)}>Continuer</Btn>
              <Btn size="sm" variant="danger" onClick={onClose}>Fermer sans enregistrer</Btn>
            </div>
          </Alert>
        )}
        <GradingCard
          header={
            <>
              <div className="font-mont text-micro uppercase tracking-widest" style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
                {note.kind === "oral" ? "Oral" : "Rapport écrit"}
              </div>
              <div className="font-mont" style={{ color: "var(--forest)", fontWeight: 900, fontSize: "1.05rem" }}>{note.subject}</div>
            </>
          }
          criteria={note.criteria}
          saved={note.evaluation}
          outOf={note.kind === "report" ? 20 : undefined}
          onDirtyChange={setDirty}
          onSave={async (input) => {
            await (note.kind === "oral" ? updateOralEvaluation : updateReportEvaluation)(note.evaluation.id, input);
            await refresh();
            onClose();
          }}
        />
      </div>
    </Modal>
  );
}

// ─── Remove the note ─────────────────────────────────────────────────

function DeleteModal({ note, onClose }: { note: EditableNote; onClose: () => void }) {
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await (note.kind === "oral" ? deleteOralEvaluation : deleteReportEvaluation)(note.evaluation.id);
      await refresh();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Impossible de supprimer la note."));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="Supprimer cette note ?"
      onClose={onClose}
      width="min(32rem, calc(100vw - 2rem))"
      footer={
        <>
          <Btn variant="ghost" disabled={busy} onClick={onClose}>Non</Btn>
          <Btn variant="danger" disabled={busy} onClick={remove}>{busy ? "Suppression" : "Supprimer la note"}</Btn>
        </>
      }
    >
      <div className="space-y-3 font-open text-sm" style={{ color: "var(--ink)" }}>
        <p>
          <strong className="font-mont">{note.juror}</strong>, {note.subject} :{" "}
          <strong className="font-mont tabular-nums">{frNote(note.total)} sur {frNote(note.max)}</strong>.
        </p>
        <p style={{ color: "var(--ink-soft)" }}>
          La note disparaît des notes et des résultats, et {note.juror} peut en saisir une nouvelle. Son contenu reste dans le journal.
        </p>
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}
