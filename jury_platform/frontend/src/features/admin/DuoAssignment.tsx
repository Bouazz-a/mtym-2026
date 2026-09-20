import { useState } from "react";
import { Alert, Badge, Btn, BrutalCard, Modal, SectionHeading, Select } from "@/features/shared/primitives";
import { assignDuos, createDuo, deleteDuo, updateDuo } from "@/lib/repositories/duoRepository";
import { planDuoAssignment, type AssignMode } from "@/lib/services/duoAssignment";
import type { Account, CenterDay, JuryDuo, PoolDetails, ScheduleSlot, Team } from "@/types";
import { formatDay } from "@/utils/labels";
import { DayTimetable } from "./JuryTimetable";
import { ScheduleEditor } from "./ScheduleEditor";
import { DUO_QUERIES, useAction } from "./useAction";

// One center day: form its jury duos, then give each passage of the day's
// timetable one duo (from the organizers' jury plan). A duo stays together
// all day and should judge at most one passage per pool — the platform
// warns but doesn't block.

export function DayJury({
  day,
  dayIndex,
  duos,
  pools,
  jurors,
  teamById,
}: {
  day: CenterDay;
  dayIndex: number;
  duos: JuryDuo[];
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
                busyJurors={busyJurors}
                onWarnings={setWarnings}
              />
            ))}
            <NewDuoRow dayId={day.id} jurors={jurors} busyJurors={busyJurors} onWarnings={setWarnings} />
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
              Pas encore de tirage pour ce jour : tirez ses poules depuis la page Tournoi.
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
// compromises it had to make. The plan itself is in
// lib/services/duoAssignment.ts.
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
  const asPools = pools.map((pool) => ({
    id: pool.id,
    label: pool.label,
    passages: pool.passages.map((p) => ({ id: p.id, slot: p.slot, duoId: p.duo?.id ?? null, locked: false })),
  }));

  const apply = async (mode: AssignMode) => {
    const plan = planDuoAssignment(asPools, duos, mode);
    setOpen(false);
    const res = await run(() => assignDuos(day.id, plan.changes));
    if (!res) return;
    const parts = [`${res.changed} passage${res.changed > 1 ? "s" : ""} attribué${res.changed > 1 ? "s" : ""}`];
    if (plan.withoutDuo > 0) parts.push(`${plan.withoutDuo} sans duo (pas assez de duos)`);
    if (plan.samePool > 0) parts.push(`${plan.samePool} fois la même poule deux fois`);
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
            fois la même poule.
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
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  jurors: Account[];
  unavailable: Set<string>; // already in another duo this day
  onChange: (id: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ width: "13.75rem" }}>
      <option value="">{placeholder}</option>
      {jurors.map((j) => (
        <option key={j.id} value={j.id} disabled={j.id !== value && unavailable.has(j.id)}>
          {j.lastName} {j.firstName}
        </option>
      ))}
    </Select>
  );
}

function DuoRow({
  duo,
  passages,
  jurors,
  busyJurors,
  onWarnings,
}: {
  duo: JuryDuo;
  passages: number; // passages it judges this day
  jurors: Account[];
  busyJurors: Set<string>;
  onWarnings: (w: string[]) => void;
}) {
  const { run, busy, error } = useAction(DUO_QUERIES);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [a, b] = [duo.members[0]?.id ?? "", duo.members[1]?.id ?? ""];

  const change = async (index: 0 | 1, id: string) => {
    const next: [string, string] = index === 0 ? [id, b] : [a, id];
    if (!next[0] || !next[1]) return;
    const res = await run(() => updateDuo(duo.id, next));
    if (res) onWarnings(res.warnings);
  };

  return (
    <li>
      <div className="flex items-center gap-3 flex-wrap">
        <Badge tone="dark">Duo {duo.number}</Badge>
        <JurorSelect value={a} jurors={jurors} unavailable={busyJurors} placeholder="Juré 1" disabled={busy} onChange={(id) => change(0, id)} />
        <JurorSelect value={b} jurors={jurors} unavailable={busyJurors} placeholder="Juré 2" disabled={busy} onChange={(id) => change(1, id)} />
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
  busyJurors,
  onWarnings,
}: {
  dayId: string;
  jurors: Account[];
  busyJurors: Set<string>;
  onWarnings: (w: string[]) => void;
}) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const { run, busy, error } = useAction(DUO_QUERIES);
  const unavailable = new Set([...busyJurors, a, b].filter(Boolean));

  const create = async () => {
    const res = await run(() => createDuo(dayId, [a, b]));
    if (res) {
      onWarnings(res.warnings);
      setA("");
      setB("");
    }
  };

  return (
    <li className="pt-2" style={{ borderTop: "1px dashed var(--border)" }}>
      <div className="flex items-center gap-3 flex-wrap">
        <Badge tone="neutral">Nouveau</Badge>
        <JurorSelect value={a} jurors={jurors} unavailable={unavailable} placeholder="Juré 1" onChange={setA} />
        <JurorSelect value={b} jurors={jurors} unavailable={unavailable} placeholder="Juré 2" onChange={setB} />
        <Btn size="sm" disabled={!a || !b || a === b || busy} onClick={create}>Créer le duo</Btn>
      </div>
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
    </li>
  );
}
