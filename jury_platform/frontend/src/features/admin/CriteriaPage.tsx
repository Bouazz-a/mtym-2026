import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert, Badge, Btn, BrutalCard, Input, PageHeader, PageLoading, PageMotion, SectionHeading, Segmented,
} from "@/features/shared/primitives";
import {
  createCriterion, deleteCriterion, getCriteria, updateCriterion,
} from "@/lib/repositories/criteriaRepository";
import { getFinalWeights, updateFinalWeights } from "@/lib/repositories/finalWeightsRepository";
import { QUALIFS_PROBLEMS } from "@/lib/services/tournamentOptimizer";
import type { Criterion, FinalWeights, PassageRole } from "@/types";
import { useAction } from "./useAction";

// CriteriaPage — the final grade's weights, then the grading grids.
// Criteria (label, coefficient, theme) drive every jury grading screen, so
// editing them here re-shapes the jury's grids live. Nothing about the
// grids is hardcoded in the UI.

const ORAL_ROLES: { value: PassageRole; label: string }[] = [
  { value: "defender", label: "Défenseur" },
  { value: "opponent", label: "Opposant" },
  { value: "reporter", label: "Rapporteur" },
];

const CRITERIA_QUERIES = [["criteria"]];

export function CriteriaPage() {
  const criteriaQ = useQuery({ queryKey: ["criteria"], queryFn: getCriteria });
  const [problem, setProblem] = useState(1);
  const [role, setRole] = useState<PassageRole>("defender");
  const { run, error } = useAction(CRITERIA_QUERIES);

  if (criteriaQ.isLoading) {
    return <PageLoading />;
  }

  const all = criteriaQ.data ?? [];
  const reportCriteria = all
    .filter((c) => c.type === "report" && c.problemNumber === problem)
    .sort((a, b) => a.order - b.order);
  const oralCriteria = all
    .filter((c) => c.type === "oral" && c.role === role)
    .sort((a, b) => a.order - b.order);
  const nextOrder = (list: Criterion[]) => list.reduce((m, c) => Math.max(m, c.order), 0) + 1;

  return (
    <PageMotion className="space-y-12">
      <PageHeader eyebrow="Administration" title="Critères de notation" />
      {error && <Alert>{error}</Alert>}

      <FinalWeightsSection />

      <section>
        <SectionHeading title="Rapports finaux" />
        <Segmented
          options={QUALIFS_PROBLEMS.map((n) => ({ value: n, label: `Problème ${n}` }))}
          value={problem}
          onChange={setProblem}
        />
        <div className="mt-5">
          <CriterionGroup
            criteria={reportCriteria}
            onAdd={() => run(() => createCriterion({
              label: "Nouveau critère", coefficient: 1, type: "report", problemNumber: problem, order: nextOrder(reportCriteria),
            }))}
          />
        </div>
      </section>

      <section>
        <SectionHeading title="Passages oraux" />
        <Segmented options={ORAL_ROLES} value={role} onChange={setRole} />
        <div className="mt-5">
          <CriterionGroup
            criteria={oralCriteria}
            onAdd={() => run(() => createCriterion({
              label: "Nouveau critère", coefficient: 1, type: "oral", role, theme: "Débat", order: nextOrder(oralCriteria),
            }))}
          />
        </div>
      </section>
    </PageMotion>
  );
}

// ─── Final grade weights ──────────────────────────────────────────────

const WEIGHT_PARTS: { key: keyof FinalWeights; label: string }[] = [
  { key: "defender", label: "Défense" },
  { key: "opponent", label: "Opposition" },
  { key: "reporter", label: "Rapporteur" },
  { key: "report", label: "Rapport écrit" },
];

function FinalWeightsSection() {
  const weightsQ = useQuery({ queryKey: ["final-weights"], queryFn: getFinalWeights });
  return (
    <section>
      <SectionHeading title="Note finale" />
      {weightsQ.data ? (
        // Remounted when the saved weights change, so the draft starts from them
        <WeightsEditor key={JSON.stringify(weightsQ.data)} saved={weightsQ.data} />
      ) : (
        <PageLoading />
      )}
    </section>
  );
}

function WeightsEditor({ saved }: { saved: FinalWeights }) {
  const [draft, setDraft] = useState<Record<keyof FinalWeights, string>>(
    () => Object.fromEntries(WEIGHT_PARTS.map(({ key }) => [key, String(saved[key])])) as Record<keyof FinalWeights, string>,
  );
  const { run, busy, error } = useAction([["final-weights"]]);
  const values: FinalWeights = {
    defender: Number(draft.defender),
    opponent: Number(draft.opponent),
    reporter: Number(draft.reporter),
    report: Number(draft.report),
  };
  const total = WEIGHT_PARTS.reduce((s, { key }) => s + values[key], 0);
  const valid = WEIGHT_PARTS.every(({ key }) => draft[key].trim() !== "" && values[key] >= 0) && total > 0;
  const dirty = WEIGHT_PARTS.some(({ key }) => values[key] !== saved[key]);

  return (
    <BrutalCard className="p-5">
      <div className="flex items-end gap-4 flex-wrap">
        {WEIGHT_PARTS.map(({ key, label }) => (
          <label key={key} style={{ width: 130 }}>
            <div className="font-mont text-micro uppercase tracking-widest mb-1" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
              {label}
            </div>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={draft[key]}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
            />
          </label>
        ))}
        <Btn size="sm" disabled={!dirty || !valid || busy} onClick={() => run(() => updateFinalWeights(values))}>
          Enregistrer
        </Btn>
      </div>
      <p className="font-open text-sm mt-4" style={{ color: "var(--ink-soft)" }}>
        La note finale d'une équipe est la moyenne de ses quatre notes, chacune en % de sa grille, pondérées par ces
        coefficients{valid ? ` (total ${total})` : ""}.
      </p>
      {!valid && <div className="mt-3"><Alert>Les coefficients doivent être positifs, et au moins un non nul.</Alert></div>}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
    </BrutalCard>
  );
}

// ─── Criterion group ──────────────────────────────────────────────────

function CriterionGroup({ criteria, onAdd }: { criteria: Criterion[]; onAdd: () => void }) {
  const totalCoef = criteria.reduce((s, c) => s + Math.max(c.coefficient, 0), 0);
  return (
    <BrutalCard className="overflow-hidden">
      <div
        className="px-4 py-3 flex items-center justify-between gap-3"
        style={{ borderBottom: "2px solid var(--forest)", background: "rgba(98,159,115,0.08)" }}
      >
        <span className="font-mont text-tiny uppercase tracking-widest" style={{ color: "var(--forest)", fontWeight: 900 }}>
          {criteria.length} critère{criteria.length > 1 ? "s" : ""}
        </span>
        <Badge tone="neutral">Total des coefficients · {totalCoef}</Badge>
      </div>

      {criteria.length === 0 ? (
        <p className="font-open text-sm italic px-4 py-5" style={{ color: "var(--ink-faint)" }}>
          Aucun critère. Ajoutez-en un ci-dessous.
        </p>
      ) : (
        <ul className="striped-rows">
          {criteria.map((c, i) => (
            <li key={c.id} style={{ borderTop: i === 0 ? undefined : "1px solid var(--border)" }}>
              <CriterionRowEditor criterion={c} />
            </li>
          ))}
        </ul>
      )}

      <div className="px-4 py-3" style={{ borderTop: "1px solid var(--border)", background: "var(--paper-2)" }}>
        <Btn variant="ghost" size="sm" onClick={onAdd}>Ajouter un critère</Btn>
      </div>
    </BrutalCard>
  );
}

// ─── Single criterion row ─────────────────────────────────────────────

function CriterionRowEditor({ criterion }: { criterion: Criterion }) {
  const [draft, setDraft] = useState<Criterion>(criterion);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { run, busy, error } = useAction(CRITERIA_QUERIES);

  const dirty =
    draft.label !== criterion.label ||
    draft.coefficient !== criterion.coefficient ||
    (draft.theme ?? "") !== (criterion.theme ?? "");
  const valid = draft.label.trim().length > 0 && draft.coefficient !== 0;

  const label = (text: string) => (
    <div className="font-mont text-micro uppercase tracking-widest mb-1" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
      {text}
    </div>
  );

  return (
    <div className="px-4 py-3">
      <div className="flex items-end gap-3 flex-wrap">
        <label className="flex-1 min-w-[13rem]">
          {label("Intitulé")}
          <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        </label>
        <label style={{ width: 110 }}>
          {label("Coefficient")}
          <Input
            type="number"
            step={0.5}
            value={draft.coefficient}
            onChange={(e) => setDraft({ ...draft, coefficient: Number(e.target.value) || 0 })}
          />
        </label>
        <label style={{ width: 170 }}>
          {label("Thème (optionnel)")}
          <Input value={draft.theme ?? ""} placeholder="Débat, Malus…" onChange={(e) => setDraft({ ...draft, theme: e.target.value })} />
        </label>
        <div className="flex items-center gap-1.5">
          <Btn
            size="sm"
            disabled={!dirty || !valid || busy}
            onClick={() => run(() => updateCriterion(criterion.id, {
              label: draft.label.trim(),
              coefficient: draft.coefficient,
              theme: draft.theme?.trim() || null,
            }))}
          >
            Enregistrer
          </Btn>
          {confirmDelete ? (
            <>
              <Btn variant="danger" size="sm" onClick={() => { setConfirmDelete(false); run(() => deleteCriterion(criterion.id)); }}>
                Confirmer
              </Btn>
              <Btn variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Annuler</Btn>
            </>
          ) : (
            <Btn variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>Supprimer</Btn>
          )}
        </div>
      </div>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
    </div>
  );
}
