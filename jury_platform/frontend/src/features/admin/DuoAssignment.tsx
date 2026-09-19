import { useState } from "react";
import { Alert, Badge, Btn, BrutalCard, SectionHeading, Select } from "@/features/shared/primitives";
import { createDuo, deleteDuo, updateDuo } from "@/lib/repositories/duoRepository";
import type { Account, CenterDay, JuryDuo, PoolDetails, Team } from "@/types";
import { formatDay } from "@/utils/labels";
import { DayTimetable } from "./JuryTimetable";
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
              <Badge tone={withDuo === passages.length ? "sage" : "saffron"}>
                {withDuo}/{passages.length} passages avec un duo
              </Badge>
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
        {pools.length === 0 ? (
          <BrutalCard className="p-6" withCorners={false} style={{ borderStyle: "dashed", boxShadow: "none" }}>
            <p className="font-open text-sm italic" style={{ color: "var(--ink-faint)" }}>
              Pas encore de tirage pour ce jour : tirez ses poules depuis la page Tournoi.
            </p>
          </BrutalCard>
        ) : (
          <DayTimetable pools={pools} duos={duos} teamById={teamById} onWarnings={setWarnings} />
        )}
      </section>
    </div>
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
    <Select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ width: 220 }}>
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
        <JurorSelect value={a} jurors={jurors} unavailable={busyJurors} placeholder="— Juré 1 —" disabled={busy} onChange={(id) => change(0, id)} />
        <JurorSelect value={b} jurors={jurors} unavailable={busyJurors} placeholder="— Juré 2 —" disabled={busy} onChange={(id) => change(1, id)} />
        <span className="font-mont text-micro uppercase tracking-widest" style={{ color: "var(--ink-soft)", fontWeight: 800, minWidth: 90 }}>
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
        <JurorSelect value={a} jurors={jurors} unavailable={unavailable} placeholder="— Juré 1 —" onChange={setA} />
        <JurorSelect value={b} jurors={jurors} unavailable={unavailable} placeholder="— Juré 2 —" onChange={setB} />
        <Btn size="sm" disabled={!a || !b || a === b || busy} onClick={create}>+ Créer le duo</Btn>
      </div>
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
    </li>
  );
}
