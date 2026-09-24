import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert, Badge, Btn, BrutalCard, Input, PageHeader, PageLoading, PageMotion, SectionHeading, Segmented, Select,
} from "@/features/shared/primitives";
import {
  copyReportCriteria, createCriterion, deleteCriterion, getCriteria, updateCriterion,
} from "@/lib/repositories/criteriaRepository";
import { getFinalWeights, updateFinalWeights } from "@/lib/repositories/finalWeightsRepository";
import { errorMessage } from "@/lib/services/errors";
import { FINAL_PART_LABELS, FINAL_PARTS, type FinalPart } from "@/lib/services/results";
import type { Criterion, FinalWeights, PassageRole } from "@/types";
import { QUALIFS_PROBLEMS } from "@/utils/labels";
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
        <ProblemWeightsSection />
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <Segmented
            options={QUALIFS_PROBLEMS.map((n) => ({ value: n, label: `Problème ${n}` }))}
            value={problem}
            onChange={setProblem}
          />
          <CopyGrid from={problem} all={all} onCopied={setProblem} />
        </div>
        <div className="mt-5">
          <CriterionGroup
            criteria={reportCriteria}
            outOf20
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

const WEIGHT_PARTS = FINAL_PARTS.map((key) => ({ key, label: FINAL_PART_LABELS[key] }));

function FinalWeightsSection() {
  const weightsQ = useQuery({ queryKey: ["final-weights"], queryFn: getFinalWeights });
  return (
    <section>
      <SectionHeading title="Note finale" />
      {weightsQ.isError ? (
        <Alert>Impossible de charger les coefficients : {errorMessage(weightsQ.error)}</Alert>
      ) : weightsQ.data ? (
        // Remounted when the saved weights change, so the draft starts from them
        <WeightsEditor key={JSON.stringify(weightsQ.data)} saved={weightsQ.data} />
      ) : (
        <PageLoading />
      )}
    </section>
  );
}

function WeightsEditor({ saved }: { saved: FinalWeights }) {
  const [draft, setDraft] = useState<Record<FinalPart, string>>(
    () => Object.fromEntries(WEIGHT_PARTS.map(({ key }) => [key, String(saved[key])])) as Record<FinalPart, string>,
  );
  const { run, busy, error } = useAction([["final-weights"]]);
  const values: Record<FinalPart, number> = {
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
          <label key={key} style={{ width: "8.125rem" }}>
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
        coefficients{valid ? ` (total ${total})` : ""}. Le rapport écrit est lui-même la moyenne des rapports de
        l'équipe, chacun sur 20, avec les poids des problèmes ci-dessous (section Rapports finaux).
      </p>
      {!valid && <div className="mt-3"><Alert>Les coefficients doivent être positifs, et au moins un non nul.</Alert></div>}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
    </BrutalCard>
  );
}

// ─── Problem weights (written report) ─────────────────────────────────

// Each problem's weight in a team's written-report note, in %: the note is
// the weighted average of its reports, each out of 20.
function ProblemWeightsSection() {
  const weightsQ = useQuery({ queryKey: ["final-weights"], queryFn: getFinalWeights });
  if (!weightsQ.data) return null; // loading, or failed (FinalWeightsSection says why)
  // Remounted when the saved weights change, so the draft starts from them
  return <ProblemWeightsEditor key={JSON.stringify(weightsQ.data.problemWeights)} saved={weightsQ.data.problemWeights} />;
}

function ProblemWeightsEditor({ saved }: { saved: Record<string, number> }) {
  const [draft, setDraft] = useState<Record<string, string>>(
    () => Object.fromEntries(QUALIFS_PROBLEMS.map((p) => [String(p), String(saved[String(p)] ?? 0)])),
  );
  const { run, busy, error } = useAction([["final-weights"]]);
  const values = Object.fromEntries(QUALIFS_PROBLEMS.map((p) => [String(p), Number(draft[String(p)])]));
  const total = QUALIFS_PROBLEMS.reduce((s, p) => s + values[String(p)], 0);
  const filled = QUALIFS_PROBLEMS.every((p) => draft[String(p)].trim() !== "" && values[String(p)] >= 0);
  const valid = filled && Math.abs(total - 100) < 0.01;
  const dirty = QUALIFS_PROBLEMS.some((p) => values[String(p)] !== saved[String(p)]);

  return (
    <BrutalCard className="p-5 mb-6">
      <div className="flex items-end gap-4 flex-wrap">
        {QUALIFS_PROBLEMS.map((p) => (
          <label key={p} style={{ width: "8.125rem" }}>
            <div className="font-mont text-micro uppercase tracking-widest mb-1" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
              Problème {p} · %
            </div>
            <Input
              type="number"
              min={0}
              max={100}
              step={5}
              value={draft[String(p)]}
              onChange={(e) => setDraft((d) => ({ ...d, [String(p)]: e.target.value }))}
            />
          </label>
        ))}
        <Badge tone={valid ? "sage" : "saffron"}>Total · {filled ? `${Math.round(total * 100) / 100} %` : "—"}</Badge>
        <Btn size="sm" disabled={!dirty || !valid || busy} onClick={() => run(() => updateFinalWeights({ problemWeights: values }))}>
          Enregistrer
        </Btn>
      </div>
      <p className="font-open text-sm mt-4" style={{ color: "var(--ink-soft)" }}>
        Le rapport écrit d'une équipe est la moyenne de ses rapports, chacun ramené sur 20, pondérés par ces poids. Il
        compte dès qu'un rapport est noté ; un rapport non déposé vaut 0.
      </p>
      {filled && !valid && <div className="mt-3"><Alert tone="warning">Les poids doivent faire 100 % au total.</Alert></div>}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
    </BrutalCard>
  );
}

// ─── Copy a report grid ───────────────────────────────────────────────

// Copies the shown problem's grid onto another problem, replacing its
// criteria (after a confirmation when it has some). Then shows the copy.
function CopyGrid({ from, all, onCopied }: { from: number; all: Criterion[]; onCopied: (problem: number) => void }) {
  const others = QUALIFS_PROBLEMS.filter((p) => p !== from);
  const [to, setTo] = useState<number>(others[0]);
  const [confirm, setConfirm] = useState(false);
  const { run, busy, error } = useAction(CRITERIA_QUERIES);
  const target = others.includes(to) ? to : others[0];
  const count = (p: number) => all.filter((c) => c.type === "report" && c.problemNumber === p).length;

  const copy = async () => {
    setConfirm(false);
    if (await run(() => copyReportCriteria(from, target))) onCopied(target);
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mont text-micro uppercase tracking-widest" style={{ color: "var(--ink-soft)", fontWeight: 800 }}>
          Copier la grille du P{from} vers
        </span>
        <Select value={target} onChange={(e) => { setTo(Number(e.target.value)); setConfirm(false); }} style={{ width: "14rem" }}>
          {others.map((p) => <option key={p} value={p}>Problème {p}{count(p) ? ` (${count(p)} critères)` : " (vide)"}</option>)}
        </Select>
        {confirm ? (
          <>
            <Btn variant="danger" size="sm" disabled={busy} onClick={copy}>Remplacer</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setConfirm(false)}>Annuler</Btn>
          </>
        ) : (
          <Btn
            size="sm"
            disabled={busy || count(from) === 0}
            title={count(from) === 0 ? "Cette grille est vide" : undefined}
            onClick={() => (count(target) > 0 ? setConfirm(true) : copy())}
          >
            Copier
          </Btn>
        )}
      </div>
      {confirm && (
        <p className="font-open text-xs" style={{ color: "var(--clay)" }}>
          Les {count(target)} critères du problème {target} seront remplacés par ceux du problème {from}.
        </p>
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

// ─── Criterion group ──────────────────────────────────────────────────

function CriterionGroup({ criteria, onAdd, outOf20 = false }: { criteria: Criterion[]; onAdd: () => void; outOf20?: boolean }) {
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
        <Badge tone="neutral">Total des coefficients · {totalCoef}{outOf20 && totalCoef > 0 ? " · note ramenée sur 20" : ""}</Badge>
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
        <label style={{ width: "6.875rem" }}>
          {label("Coefficient")}
          <Input
            type="number"
            step={0.5}
            value={draft.coefficient}
            onChange={(e) => setDraft({ ...draft, coefficient: Number(e.target.value) || 0 })}
          />
        </label>
        <label style={{ width: "10.625rem" }}>
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
