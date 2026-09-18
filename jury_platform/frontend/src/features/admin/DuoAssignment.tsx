import { useMemo, useState } from "react";
import { Alert, Badge, Btn, BrutalCard, SectionHeading, Segmented, Select } from "@/features/shared/primitives";
import { EmptyState, ROLE_PALETTE } from "@/features/shared/widgets";
import { createDuo, deleteDuo, updateDuo } from "@/lib/repositories/duoRepository";
import { setPassageDuo } from "@/lib/repositories/poolRepository";
import type { Account, CenterDay, JuryDuo, PassageDetails, PoolDetails, Team } from "@/types";
import { CENTERS, formatDay } from "@/utils/labels";
import { duoLabel, repeatedDuos } from "@/utils/duos";
import { useAction } from "./useAction";

// For each center day: form the day's jury duos, then give each passage
// one duo (from the organizers' jury plan). A duo stays together all day
// and should judge at most one passage per pool — the platform warns but
// doesn't block.

const DUO_QUERIES = [["duos"], ["pools"], ["accounts"]];

export function DuosByDay({
  days,
  duos,
  pools,
  jurors,
  teams,
}: {
  days: CenterDay[];
  duos: JuryDuo[];
  pools: PoolDetails[];
  jurors: Account[];
  teams: Team[];
}) {
  const centers = CENTERS.filter((c) => days.some((d) => d.center === c.value));
  const [center, setCenter] = useState<string | null>(null);
  const selected = center ?? centers[0]?.value ?? null;
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  if (!selected) {
    return (
      <section>
        <SectionHeading title="Duos et passages" />
        <EmptyState title="Aucun jour" sub="Déclarez d'abord les jours des centres depuis la page Tournoi." />
      </section>
    );
  }

  const centerDays = days.filter((d) => d.center === selected);
  const sortedJurors = [...jurors].sort((a, b) => a.lastName.localeCompare(b.lastName));

  return (
    <section className="space-y-8">
      <SectionHeading
        title="Duos et passages"
        right={<Segmented options={centers.map((c) => ({ value: c.value, label: c.label }))} value={selected} onChange={setCenter} />}
      />
      {centerDays.map((day, i) => (
        <DayJury
          key={day.id}
          day={day}
          dayIndex={i}
          duos={duos.filter((d) => d.centerDayId === day.id).sort((a, b) => a.number - b.number)}
          pools={pools.filter((p) => p.centerDayId === day.id)}
          jurors={sortedJurors}
          teamById={teamById}
        />
      ))}
    </section>
  );
}

// ─── One day: its duos, then its passages ─────────────────────────────

function DayJury({
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

  return (
    <BrutalCard className="overflow-hidden">
      <div
        className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap"
        style={{ borderBottom: "2px solid var(--forest)", background: "rgba(98,159,115,0.10)" }}
      >
        <h3 className="font-mont" style={{ color: "var(--forest)", fontWeight: 900, fontSize: "1.15rem" }}>
          Jour {dayIndex + 1} · {formatDay(day.date)}
        </h3>
        <div className="flex gap-2">
          <Badge tone="neutral">{duos.length} duo{duos.length > 1 ? "s" : ""}</Badge>
          <Badge tone={passages.length > 0 && withDuo === passages.length ? "sage" : "saffron"}>
            {withDuo}/{passages.length} passages avec un duo
          </Badge>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {warnings.length > 0 && (
          <Alert tone="warning" title="À vérifier">
            <ul className="list-disc pl-5">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </Alert>
        )}

        <div>
          <SubTitle>Duos du jour</SubTitle>
          <ul className="space-y-2">
            {duos.map((duo) => (
              <DuoRow key={duo.id} duo={duo} jurors={jurors} busyJurors={busyJurors} onWarnings={setWarnings} />
            ))}
            <NewDuoRow dayId={day.id} jurors={jurors} busyJurors={busyJurors} onWarnings={setWarnings} />
          </ul>
        </div>

        <div>
          <SubTitle>Jury par passage</SubTitle>
          {pools.length === 0 ? (
            <p className="font-open text-sm italic" style={{ color: "var(--ink-faint)" }}>
              Pas encore de tirage pour ce jour.
            </p>
          ) : duos.length === 0 ? (
            <p className="font-open text-sm italic" style={{ color: "var(--ink-faint)" }}>
              Formez d'abord les duos du jour.
            </p>
          ) : (
            <div className="space-y-4">
              {pools.map((pool) => (
                <PoolPassages key={pool.id} pool={pool} duos={duos} teamById={teamById} onWarnings={setWarnings} />
              ))}
            </div>
          )}
        </div>
      </div>
    </BrutalCard>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mont text-tiny uppercase tracking-widest mb-3" style={{ color: "var(--saffron-dark)", fontWeight: 800 }}>
      {children}
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
  jurors,
  busyJurors,
  onWarnings,
}: {
  duo: JuryDuo;
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

// ─── Passages of a pool, each with its duo ────────────────────────────

function PoolPassages({
  pool,
  duos,
  teamById,
  onWarnings,
}: {
  pool: PoolDetails;
  duos: JuryDuo[];
  teamById: Map<string, Team>;
  onWarnings: (w: string[]) => void;
}) {
  const repeated = repeatedDuos(pool);
  return (
    <div style={{ border: "1px solid var(--border)" }}>
      <div className="px-4 py-2 font-mont" style={{ color: "var(--forest)", fontWeight: 900, background: "var(--paper-2)" }}>
        Poule {pool.label}
      </div>
      <ul>
        {pool.passages.map((p, i) => (
          <PassageDuoRow
            key={p.id}
            passage={p}
            duos={duos}
            teamById={teamById}
            repeated={Boolean(p.duo && repeated.has(p.duo.id))}
            first={i === 0}
            onWarnings={onWarnings}
          />
        ))}
      </ul>
    </div>
  );
}

function PassageDuoRow({
  passage,
  duos,
  teamById,
  repeated,
  first,
  onWarnings,
}: {
  passage: PassageDetails;
  duos: JuryDuo[];
  teamById: Map<string, Team>;
  repeated: boolean;
  first: boolean;
  onWarnings: (w: string[]) => void;
}) {
  const { run, busy, error } = useAction(DUO_QUERIES);
  const quad = (id: string | null | undefined) => (id ? teamById.get(id)?.quadrigram ?? "—" : "—");

  const change = async (duoId: string) => {
    const res = await run(() => setPassageDuo(passage.id, duoId || null));
    if (res) onWarnings(res.warnings);
  };

  return (
    <li className="px-4 py-2.5 hover-row transition-colors" style={{ borderTop: first ? undefined : "1px solid var(--border)" }}>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-mont text-xs" style={{ color: "var(--ink-faint)", fontWeight: 800, minWidth: 90 }}>{passage.label}</span>
        <span className="font-mont" style={{ color: "var(--saffron-dark)", fontWeight: 900, minWidth: 28 }}>P{passage.problemNumber}</span>
        <div className="flex gap-1.5 flex-wrap">
          {(["defender", "opponent", "reporter"] as const).map((role) => (
            <span
              key={role}
              className="font-mont text-micro uppercase tracking-widest px-1.5 py-0.5 whitespace-nowrap"
              style={{ background: ROLE_PALETTE[role].bg, color: ROLE_PALETTE[role].fg, fontWeight: 800 }}
            >
              {ROLE_PALETTE[role].short} {quad(passage[`${role}TeamId`])}
            </span>
          ))}
        </div>
        {passage.timeSlot && (
          <span className="font-mont text-micro uppercase tracking-widest" style={{ color: "var(--ink-soft)", fontWeight: 700 }}>
            {passage.timeSlot}
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          {repeated && <span title="Ce duo juge plusieurs passages de cette poule"><Badge tone="danger">Doublon</Badge></span>}
          <Select value={passage.duo?.id ?? ""} disabled={busy} onChange={(e) => change(e.target.value)} style={{ width: 280 }}>
            <option value="">— Aucun duo —</option>
            {duos.map((d) => <option key={d.id} value={d.id}>{duoLabel(d)}</option>)}
          </Select>
        </div>
      </div>
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
    </li>
  );
}
