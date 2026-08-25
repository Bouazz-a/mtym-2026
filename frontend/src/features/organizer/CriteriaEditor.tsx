import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BrutalCard, SectionHeading, Badge, Btn, Input } from "@/features/shared/primitives";
import { useSession } from "@/features/shared/SessionContext";
import { canManageCriteria } from "@/lib/permissions";
import {
  getCriteria,
  createCriterion,
  updateCriterion,
  deleteCriterion,
} from "@/lib/repositories/evaluationRepository";
import type { Criterion, PassageRole } from "@/types";

// CriteriaEditor — admin / scientific-admin grid editor for the evaluation
// criteria. Criteria (label, coefficient, theme) drive every grading screen
// in the app, so editing them here re-shapes the jury's grids live. Nothing
// about the grids is hardcoded in the UI.

const PROBLEMS = [1, 2, 3, 4] as const;
const ORAL_ROLES: { role: PassageRole; label: string }[] = [
  { role: "defender", label: "Défenseur" },
  { role: "opponent", label: "Opposant" },
  { role: "reporter", label: "Rapporteur" },
];

export function CriteriaEditor() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const criteriaQ = useQuery({ queryKey: ["criteria"], queryFn: getCriteria });
  const all = criteriaQ.data ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["criteria"] });

  const [problem, setProblem] = useState<(typeof PROBLEMS)[number]>(1);
  const [role, setRole] = useState<PassageRole>("defender");

  if (!session || session.role !== "organizer") return null;

  if (!canManageCriteria(session.organizer)) {
    return (
      <BrutalCard className="p-8">
        <p
          className="font-mont mb-1"
          style={{ fontSize: "1.05rem", color: "var(--forest)", fontWeight: 900 }}
        >
          Accès restreint
        </p>
        <p className="font-open text-sm" style={{ color: "var(--ink-soft)" }}>
          Seuls l'administrateur et l'administrateur scientifique peuvent
          modifier le barème d'évaluation.
        </p>
      </BrutalCard>
    );
  }

  if (criteriaQ.isLoading) {
    return <div className="py-24 text-center text-foreground/55">Chargement…</div>;
  }

  const reportCriteria = all
    .filter((c) => c.type === "report" && c.problemNumber === problem)
    .sort((a, b) => a.order - b.order);
  const oralCriteria = all
    .filter((c) => c.type === "oral" && c.role === role)
    .sort((a, b) => a.order - b.order);

  const addReport = async () => {
    const order =
      reportCriteria.reduce((m, c) => Math.max(m, c.order), 0) + 1;
    await createCriterion({
      label: "Nouveau critère",
      coefficient: 1,
      type: "report",
      problemNumber: problem,
      order,
    });
    refresh();
  };

  const addOral = async () => {
    const order = oralCriteria.reduce((m, c) => Math.max(m, c.order), 0) + 1;
    await createCriterion({
      label: "Nouveau critère",
      coefficient: 1,
      type: "oral",
      role,
      theme: "Débat",
      order,
    });
    refresh();
  };

  return (
    <div className="space-y-12">
      {/* ── Final reports ─────────────────────────────────────────────── */}
      <section>
        <SectionHeading
          title="Barème — Rapports finaux"
          right={
            <span
              className="font-mont text-tiny uppercase tracking-widest"
              style={{ color: "var(--ink-faint)", fontWeight: 700 }}
            >
              Critères par problème · taux 0–100 % × coefficient
            </span>
          }
        />
        <Segmented
          options={PROBLEMS.map((n) => ({ value: n, label: `Problème ${n}` }))}
          value={problem}
          onChange={setProblem}
        />
        <div className="mt-5">
          <CriterionGroup
            criteria={reportCriteria}
            showTheme
            onAdd={addReport}
            onMutated={refresh}
          />
        </div>
      </section>

      {/* ── Oral passages ─────────────────────────────────────────────── */}
      <section>
        <SectionHeading
          title="Barème — Passages oraux"
          right={
            <span
              className="font-mont text-tiny uppercase tracking-widest"
              style={{ color: "var(--ink-faint)", fontWeight: 700 }}
            >
              Critères par rôle · groupés par thème
            </span>
          }
        />
        <Segmented
          options={ORAL_ROLES.map((r) => ({ value: r.role, label: r.label }))}
          value={role}
          onChange={setRole}
        />
        <div className="mt-5">
          <CriterionGroup
            criteria={oralCriteria}
            showTheme
            onAdd={addOral}
            onMutated={refresh}
          />
        </div>
      </section>
    </div>
  );
}

// ─── Segmented control ────────────────────────────────────────────────

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
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
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            className="px-4 py-1.5 font-mont text-micro uppercase tracking-widest transition-colors"
            style={{
              background: active ? "var(--forest)" : "transparent",
              color: active ? "var(--saffron)" : "var(--ink-soft)",
              fontWeight: active ? 900 : 700,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Criterion group ──────────────────────────────────────────────────

function CriterionGroup({
  criteria,
  showTheme,
  onAdd,
  onMutated,
}: {
  criteria: Criterion[];
  showTheme: boolean;
  onAdd: () => void;
  onMutated: () => void;
}) {
  const totalCoef = criteria.reduce(
    (s, c) => s + Math.max(c.coefficient, 0),
    0,
  );
  return (
    <BrutalCard className="overflow-hidden">
      <div
        className="px-4 py-3 flex items-center justify-between gap-3"
        style={{
          borderBottom: "2px solid var(--forest)",
          background: "rgba(98,159,115,0.08)",
        }}
      >
        <span
          className="font-mont text-tiny uppercase tracking-widest"
          style={{ color: "var(--forest)", fontWeight: 900 }}
        >
          {criteria.length} critère{criteria.length > 1 ? "s" : ""}
        </span>
        <Badge tone="neutral">Σ coefficients positifs · {totalCoef}</Badge>
      </div>

      {criteria.length === 0 ? (
        <p
          className="font-open text-sm italic px-4 py-5"
          style={{ color: "var(--ink-faint)" }}
        >
          Aucun critère. Ajoutez-en un ci-dessous.
        </p>
      ) : (
        <ul>
          {criteria.map((c, i) => (
            <li
              key={c.id}
              style={{
                borderTop: i === 0 ? undefined : "1px solid var(--border)",
              }}
            >
              <CriterionRowEditor
                criterion={c}
                showTheme={showTheme}
                onMutated={onMutated}
              />
            </li>
          ))}
        </ul>
      )}

      <div
        className="px-4 py-3"
        style={{
          borderTop: "1px solid var(--border)",
          background: "var(--paper-2)",
        }}
      >
        <Btn variant="ghost" size="sm" onClick={onAdd}>
          + Ajouter un critère
        </Btn>
      </div>
    </BrutalCard>
  );
}

// ─── Single criterion row ─────────────────────────────────────────────

function CriterionRowEditor({
  criterion,
  showTheme,
  onMutated,
}: {
  criterion: Criterion;
  showTheme: boolean;
  onMutated: () => void;
}) {
  const [draft, setDraft] = useState<Criterion>(criterion);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty =
    draft.label !== criterion.label ||
    draft.coefficient !== criterion.coefficient ||
    (draft.theme ?? "") !== (criterion.theme ?? "");

  const valid = draft.label.trim().length > 0;

  const save = async () => {
    if (!valid) return;
    await updateCriterion(criterion.id, {
      label: draft.label.trim(),
      coefficient: draft.coefficient,
      theme: draft.theme?.trim() || undefined,
    });
    onMutated();
  };

  const remove = async () => {
    await deleteCriterion(criterion.id);
    onMutated();
  };

  return (
    <div className="px-4 py-3 flex items-end gap-3 flex-wrap hover-row transition-colors">
      <label className="flex-1 min-w-[200px]">
        <div
          className="font-mont text-micro uppercase tracking-widest mb-1"
          style={{ color: "var(--ink-faint)", fontWeight: 800 }}
        >
          Intitulé
        </div>
        <Input
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        />
      </label>

      <label style={{ width: 110 }}>
        <div
          className="font-mont text-micro uppercase tracking-widest mb-1"
          style={{ color: "var(--ink-faint)", fontWeight: 800 }}
        >
          Coefficient
        </div>
        <Input
          type="number"
          step={0.5}
          value={draft.coefficient}
          onChange={(e) =>
            setDraft({ ...draft, coefficient: Number(e.target.value) || 0 })
          }
        />
      </label>

      {showTheme && (
        <label style={{ width: 170 }}>
          <div
            className="font-mont text-micro uppercase tracking-widest mb-1"
            style={{ color: "var(--ink-faint)", fontWeight: 800 }}
          >
            Thème (optionnel)
          </div>
          <Input
            value={draft.theme ?? ""}
            placeholder="Débat, Malus…"
            onChange={(e) => setDraft({ ...draft, theme: e.target.value })}
          />
        </label>
      )}

      <div className="flex items-center gap-1.5">
        <Btn size="sm" onClick={save} disabled={!dirty || !valid}>
          Enregistrer
        </Btn>
        {confirmDelete ? (
          <>
            <Btn variant="danger" size="sm" onClick={remove}>
              Confirmer
            </Btn>
            <Btn
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(false)}
            >
              Annuler
            </Btn>
          </>
        ) : (
          <Btn
            variant="danger"
            size="sm"
            onClick={() => setConfirmDelete(true)}
          >
            Supprimer
          </Btn>
        )}
      </div>
    </div>
  );
}
