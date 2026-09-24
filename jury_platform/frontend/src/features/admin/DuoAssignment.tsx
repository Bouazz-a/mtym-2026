import { useState } from "react";
import { Alert, Badge, Btn, BrutalCard, Modal, SectionHeading, Select } from "@/features/shared/primitives";
import { autoAssignDuos, createDuo, deleteDuo, updateDuo, type AutoAssignMode } from "@/lib/repositories/duoRepository";
import type { Account, CenterDay, JuryDuo, PoolDetails, ScheduleSlot, Team } from "@/types";
import { jurorSpecialties, specialtiesAgree } from "@/utils/duos";
import { formatDay, QUALIFS_PROBLEMS } from "@/utils/labels";
import { DayTimetable } from "./JuryTimetable";
import { ScheduleEditor } from "./ScheduleEditor";
import { DUO_QUERIES, useAction } from "./useAction";

// One center day: form its jury duos and give each one a problem (its
// jurors become that problem's specialists, which steers the automatic
// assignment of passages and reports), then give each passage of the day's
// timetable one duo (from the organizers' jury plan). A duo stays together all day and should
// judge at most one passage per pool — the platform warns but doesn't block.

export function DayJury({
  day,
  dayIndex,
  duos,
  allDuos,
  pools,
  jurors,
  teamById,
}: {
  day: CenterDay;
  dayIndex: number;
  duos: JuryDuo[]; // this day's
  allDuos: JuryDuo[]; // every day's: a juror's specialty comes from all their duos
  pools: PoolDetails[];
  jurors: Account[];
  teamById: Map<string, Team>;
}) {
  const [warnings, setWarnings] = useState<string[]>([]);
  const [draft, setDraft] = useState<ScheduleSlot[] | null>(null); // hours being edited
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const schedule = draft ?? day.schedule;
  const busyJurors = new Set(duos.flatMap((d) => d.members.map((m) => m.id)));
  const passages = pools.flatMap((p) => p.passages);
  const withDuo = passages.filter((p) => p.duo).length;
  const passageCount = (duoId: string) => passages.filter((p) => p.duo?.id === duoId).length;

  return (
    <div className="space-y-10">
      <section>
        <SectionHeading
          title={`Duos du jour · J${dayIndex + 1}`}
          right={<Badge tone="neutral">{duos.length} duo{duos.length > 1 ? "s" : ""}</Badge>}
        />
        <BrutalCard className="p-5">
          <ul className="space-y-2">
            {duos.map((duo) => (
              <DuoRow
                key={duo.id}
                duo={duo}
                passages={passageCount(duo.id)}
                jurors={jurors}
                allDuos={allDuos}
                busyJurors={busyJurors}
                onWarnings={setWarnings}
              />
            ))}
            <NewDuoRow dayId={day.id} jurors={jurors} allDuos={allDuos} busyJurors={busyJurors} onWarnings={setWarnings} />
          </ul>
        </BrutalCard>
      </section>

      <section>
        <SectionHeading
          title={`Planning · ${formatDay(day.date)}`}
          right={
            passages.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                <Badge tone={withDuo === passages.length ? "sage" : "saffron"}>
                  {withDuo}/{passages.length} passages avec un duo
                </Badge>
                <AutoAssign day={day} pools={pools} duos={duos} onWarnings={setWarnings} />
              </div>
            )
          }
        />
        {warnings.length > 0 && (
          <div className="mb-4">
            <Alert tone="warning" title="À vérifier">
              <ul className="list-disc pl-5">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </Alert>
          </div>
        )}
        <div className="mb-6">
          <ScheduleEditor day={day} schedule={schedule} onDraft={setDraft} onActive={setActiveSlot} />
        </div>
        {pools.length === 0 ? (
          <BrutalCard className="p-6" withCorners={false} style={{ borderStyle: "dashed", boxShadow: "none" }}>
            <p className="font-open text-sm italic" style={{ color: "var(--ink-faint)" }}>
              Pas encore de tirage pour ce jour : tirez ses poules depuis la page Génération des poules.
            </p>
          </BrutalCard>
        ) : (
          <DayTimetable
            schedule={schedule}
            pools={pools}
            duos={duos}
            teamById={teamById}
            activeSlot={activeSlot}
            onEditSlot={(i) => {
              const field = document.getElementById(`schedule-start-${i}`);
              field?.scrollIntoView({ block: "center", behavior: "smooth" });
              field?.focus({ preventScroll: true });
            }}
            onWarnings={setWarnings}
          />
        )}
      </section>
    </div>
  );
}

// ─── Automatic assignment ─────────────────────────────────────────────

// Spreads the day's passages between the duos already formed by hand (the
// duos themselves are never generated). Assignment by hand keeps working:
// this only fills the timetable in one click, and leaves a summary of the
// compromises it had to make. The plan is computed by the server
// (backend/src/algorithms/duoAssignment.ts).
function AutoAssign({
  day,
  pools,
  duos,
  onWarnings,
}: {
  day: CenterDay;
  pools: PoolDetails[];
  duos: JuryDuo[];
  onWarnings: (w: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const { run, busy, error } = useAction(DUO_QUERIES);

  const passages = pools.flatMap((p) => p.passages);
  const empty = passages.filter((p) => !p.duo).length;

  const apply = async (mode: AutoAssignMode) => {
    setOpen(false);
    const res = await run(() => autoAssignDuos(day.id, mode));
    if (!res) return;
    const parts = [`${res.changed} passage${res.changed > 1 ? "s" : ""} attribué${res.changed > 1 ? "s" : ""}`];
    if (res.assigned > 0) parts.push(`${res.specialized}/${res.assigned} jugés par un spécialiste`);
    if (res.withoutDuo > 0) parts.push(`${res.withoutDuo} sans duo (pas assez de duos)`);
    if (res.samePool > 0) parts.push(`${res.samePool} fois la même poule deux fois`);
    setSummary(parts.join(" · "));
    onWarnings(res.warnings);
  };

  return (
    <>
      <Btn
        size="sm"
        disabled={busy || duos.length === 0}
        title={duos.length === 0 ? "Formez d'abord au moins un duo" : "Répartit les passages entre les duos du jour"}
        onClick={() => setOpen(true)}
      >
        {busy ? "Attribution…" : "Attribuer automatiquement"}
      </Btn>
      {summary && (
        <span className="font-mont text-micro uppercase tracking-widest" style={{ color: "var(--ink-soft)", fontWeight: 800 }}>
          {summary}
        </span>
      )}
      {error && <Alert>{error}</Alert>}

      <Modal
        open={open}
        title="Attribution automatique des duos"
        onClose={() => setOpen(false)}
        footer={<Btn variant="ghost" onClick={() => setOpen(false)}>Annuler</Btn>}
      >
        <div className="px-5 py-4 space-y-4">
          <p className="font-open text-sm" style={{ color: "var(--ink)" }}>
            {duos.length} duo{duos.length > 1 ? "s" : ""} pour {passages.length} passage{passages.length > 1 ? "s" : ""}
            {empty === 0
              ? ", tous déjà attribués"
              : empty === passages.length
                ? ", aucun attribué pour l'instant"
                : `, dont ${empty} sans duo`}
            . Un duo n'est jamais placé sur deux passages à la même heure, et évite autant que possible de juger deux
            fois la même poule. Les passages sont répartis également entre les duos et, à charge égale, chaque passage
            va à un duo spécialiste de son problème.
          </p>
          <div className="flex flex-wrap gap-3">
            <Btn disabled={empty === 0} onClick={() => apply("fill")}>
              Compléter {empty > 0 ? `(${empty})` : ""}
            </Btn>
            <Btn variant="ghost" onClick={() => apply("replace")}>Tout refaire</Btn>
          </div>
          <p className="font-open text-xs" style={{ color: "var(--ink-soft)" }}>
            « Compléter » ne touche pas aux duos déjà placés à la main. « Tout refaire » recalcule le jour entier ;
            les passages déjà notés gardent leur duo. Tout reste modifiable à la main ensuite.
          </p>
        </div>
      </Modal>
    </>
  );
}

// ─── Duos ─────────────────────────────────────────────────────────────

function JurorSelect({
  value,
  jurors,
  unavailable,
  specialtyOf,
  compatible,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  jurors: Account[];
  unavailable: Set<string>; // already in another duo this day
  specialtyOf: (id: string) => number[];
  compatible: (id: string) => boolean; // their specialty fits the duo
  onChange: (id: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ width: "15rem" }}>
      <option value="">{placeholder}</option>
      {jurors.map((j) => {
        const specialty = specialtyOf(j.id);
        return (
          <option key={j.id} value={j.id} disabled={j.id !== value && (unavailable.has(j.id) || !compatible(j.id))}>
            {j.lastName} {j.firstName}{specialty.length > 0 ? ` · P${specialty.join(" et P")}` : ""}
          </option>
        );
      })}
    </Select>
  );
}

// The duo's problem: its two jurors become its specialists. Only a problem
// matching their specialty, if they already have one, can be picked.
function ProblemSelect({
  value,
  allowed,
  onChange,
  disabled,
}: {
  value: number | null;
  allowed: (problem: number) => boolean;
  onChange: (problem: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value ?? ""}
      disabled={disabled}
      aria-label="Problème du duo"
      title="Les jurés du duo deviennent spécialistes de ce problème : ils en jugent les passages et en corrigent les rapports en priorité"
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      style={{ width: "9.5rem", ...(value === null && { borderColor: "var(--saffron-dark)" }) }}
    >
      <option value="">Problème ?</option>
      {QUALIFS_PROBLEMS.map((n) => <option key={n} value={n} disabled={n !== value && !allowed(n)}>Problème {n}</option>)}
    </Select>
  );
}

function DuoRow({
  duo,
  passages,
  jurors,
  allDuos,
  busyJurors,
  onWarnings,
}: {
  duo: JuryDuo;
  passages: number; // passages it judges this day
  jurors: Account[];
  allDuos: JuryDuo[]; // every day's, for the jurors' specialties
  busyJurors: Set<string>;
  onWarnings: (w: string[]) => void;
}) {
  const { run, busy, error } = useAction(DUO_QUERIES);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [a, b] = [duo.members[0]?.id ?? "", duo.members[1]?.id ?? ""];
  // Specialties from the jurors' other duos
  const specialtyOf = (id: string) => (id ? jurorSpecialties(allDuos, id, duo.id) : []);
  const fitsWith = (partner: string) => (id: string) => specialtiesAgree([specialtyOf(id), specialtyOf(partner)], duo.problemNumber);

  const change = async (index: 0 | 1, id: string) => {
    const next: [string, string] = index === 0 ? [id, b] : [a, id];
    if (!next[0] || !next[1]) return;
    const res = await run(() => updateDuo(duo.id, { accountIds: next }));
    if (res) onWarnings(res.warnings);
  };

  return (
    <li>
      <div className="flex items-center gap-3 flex-wrap">
        <Badge tone="dark">Duo {duo.number}</Badge>
        <JurorSelect
          value={a} jurors={jurors} unavailable={busyJurors} specialtyOf={specialtyOf} compatible={fitsWith(b)}
          placeholder="Juré 1" disabled={busy} onChange={(id) => change(0, id)}
        />
        <JurorSelect
          value={b} jurors={jurors} unavailable={busyJurors} specialtyOf={specialtyOf} compatible={fitsWith(a)}
          placeholder="Juré 2" disabled={busy} onChange={(id) => change(1, id)}
        />
        <ProblemSelect
          value={duo.problemNumber}
          allowed={(n) => specialtiesAgree([specialtyOf(a), specialtyOf(b)], n)}
          disabled={busy}
          onChange={(problemNumber) => run(() => updateDuo(duo.id, { problemNumber }))}
        />
        <span className="font-mont text-micro uppercase tracking-widest" style={{ color: "var(--ink-soft)", fontWeight: 800, minWidth: "5.5rem" }}>
          {passages} passage{passages > 1 ? "s" : ""}
        </span>
        {confirmDelete ? (
          <>
            <Btn variant="danger" size="sm" onClick={() => { setConfirmDelete(false); run(() => deleteDuo(duo.id)); }}>Confirmer</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Annuler</Btn>
          </>
        ) : (
          <Btn variant="danger" size="sm" title="Ses passages repasseront « sans duo »" onClick={() => setConfirmDelete(true)}>
            Supprimer
          </Btn>
        )}
      </div>
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
    </li>
  );
}

function NewDuoRow({
  dayId,
  jurors,
  allDuos,
  busyJurors,
  onWarnings,
}: {
  dayId: string;
  jurors: Account[];
  allDuos: JuryDuo[];
  busyJurors: Set<string>;
  onWarnings: (w: string[]) => void;
}) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [problem, setProblem] = useState<number | null>(null);
  const { run, busy, error } = useAction(DUO_QUERIES);
  const unavailable = new Set([...busyJurors, a, b].filter(Boolean));
  const specialtyOf = (id: string) => (id ? jurorSpecialties(allDuos, id) : []);
  const fitsWith = (partner: string) => (id: string) => specialtiesAgree([specialtyOf(id), specialtyOf(partner)], problem);

  // A specialist brings their problem to the duo
  const pick = (set: (id: string) => void) => (id: string) => {
    set(id);
    const [specialty] = specialtyOf(id);
    if (problem === null && specialty !== undefined) setProblem(specialty);
  };

  const create = async () => {
    const res = await run(() => createDuo(dayId, [a, b], problem));
    if (res) {
      onWarnings(res.warnings);
      setA("");
      setB("");
      setProblem(null);
    }
  };

  return (
    <li className="pt-2" style={{ borderTop: "1px dashed var(--border)" }}>
      <div className="flex items-center gap-3 flex-wrap">
        <Badge tone="neutral">Nouveau</Badge>
        <JurorSelect
          value={a} jurors={jurors} unavailable={unavailable} specialtyOf={specialtyOf} compatible={fitsWith(b)}
          placeholder="Juré 1" onChange={pick(setA)}
        />
        <JurorSelect
          value={b} jurors={jurors} unavailable={unavailable} specialtyOf={specialtyOf} compatible={fitsWith(a)}
          placeholder="Juré 2" onChange={pick(setB)}
        />
        <ProblemSelect value={problem} allowed={(n) => specialtiesAgree([specialtyOf(a), specialtyOf(b)], n)} onChange={setProblem} />
        <Btn size="sm" disabled={!a || !b || a === b || busy} onClick={create}>Créer le duo</Btn>
      </div>
      <p className="font-open text-xs mt-2" style={{ color: "var(--ink-soft)" }}>
        Un juré n'a qu'une spécialité, le problème de ses duos (tous jours et centres confondus), affichée à côté de son nom :
        un duo réunit deux jurés de la même spécialité, ou sans spécialité encore.
      </p>
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
    </li>
  );
}
