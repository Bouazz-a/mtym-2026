import { Fragment, useState } from "react";
import { Alert, Badge, Btn, Modal } from "@/features/shared/primitives";
import { RoleChip } from "@/features/shared/widgets";
import { setPassageDuo } from "@/lib/repositories/poolRepository";
import type { JuryDuo, PassageDetails, PoolDetails, ScheduleSlot, Team } from "@/types";
import { duoMembers, repeatedDuos } from "@/utils/duos";
import { breakMinutes, slotEnd } from "@/utils/schedule";
import { DUO_QUERIES, useAction } from "./useAction";

// A center day as a timetable: one column per pool, one row per slot of the
// day's schedule (the pools play in parallel). Clicking a passage opens its
// duo picker; clicking a time jumps to its line of the schedule editor.
// Pause bands grow and shrink with the break they stand for.
// Doublon = the duo judges another passage of the same pool; Même heure =
// the duo has another passage in the same slot. Both only warn.

// Column widths in rem (CSS lengths, so they follow the page scale): the
// hours column is fixed, the pools share what's left down to their minimum.
const TIME_COL = "5.75rem";
const POOL_COL = "13.125rem";

interface Slot {
  pool: PoolDetails;
  passage: PassageDetails;
}

export function DayTimetable({
  schedule,
  pools,
  duos,
  teamById,
  activeSlot,
  onEditSlot,
  onWarnings,
}: {
  schedule: ScheduleSlot[];
  pools: PoolDetails[];
  duos: JuryDuo[];
  teamById: Map<string, Team>;
  activeSlot: number | null; // index of the slot being edited, highlighted
  onEditSlot: (index: number) => void;
  onWarnings: (w: string[]) => void;
}) {
  const [picking, setPicking] = useState<Slot | null>(null);
  const passageAt = (pool: PoolDetails, n: number) => pool.passages.find((p) => p.slot === n);
  const repeatedByPool = new Map(pools.map((pool) => [pool.id, repeatedDuos(pool)]));
  // Per slot, the duos holding two passages of it
  const clashes = schedule.map((_, i) => {
    const seen = new Set<string>();
    const twice = new Set<string>();
    for (const pool of pools) {
      const duoId = passageAt(pool, i + 1)?.duo?.id;
      if (!duoId) continue;
      if (seen.has(duoId)) twice.add(duoId);
      seen.add(duoId);
    }
    return twice;
  });

  return (
    <>
      <div
        className="overflow-x-auto"
        style={{ border: "2px solid var(--forest)", boxShadow: "2px 2px 0 0 var(--forest)", background: "var(--surface)" }}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: `${TIME_COL} repeat(${pools.length}, minmax(${POOL_COL}, 1fr))`,
            minWidth: `calc(${TIME_COL} + ${pools.length} * ${POOL_COL})`,
          }}
        >
          <HeadCell sticky>Horaire</HeadCell>
          {pools.map((pool) => (
            <HeadCell key={pool.id}>Poule {pool.label}</HeadCell>
          ))}

          {schedule.map((slot, i) => (
            <Fragment key={i}>
              {i > 0 && <BreakRow minutes={breakMinutes(schedule, i)} />}
              <button
                type="button"
                onClick={() => onEditSlot(i)}
                title="Modifier l'horaire de ce passage"
                aria-label={`Passage ${i + 1}, de ${slot.start} à ${slotEnd(slot)} : modifier l'horaire`}
                className={`time-cell px-3 py-3 flex flex-col justify-center text-left${activeSlot === i ? " time-cell--active" : ""}`}
                style={{ position: "sticky", left: 0, zIndex: 1, borderTop: "1px solid var(--border)", borderRight: "2px solid var(--forest)" }}
              >
                <span className="font-mont tabular-nums" style={{ color: "var(--forest)", fontWeight: 900, fontSize: "1.05rem" }}>{slot.start}</span>
                <span className="font-mont text-xs tabular-nums" style={{ color: "var(--ink-soft)", fontWeight: 700 }}>{slotEnd(slot)}</span>
                <span className="font-mont text-micro uppercase tracking-widest mt-1" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
                  Passage {i + 1}
                </span>
              </button>
              {pools.map((pool) => {
                const passage = passageAt(pool, i + 1);
                if (!passage) return <NoPassage key={pool.id} />;
                const duoId = passage.duo?.id;
                return (
                  <PassageCell
                    key={pool.id}
                    passage={passage}
                    time={slot.start}
                    active={activeSlot === i}
                    teamById={teamById}
                    repeated={Boolean(duoId && repeatedByPool.get(pool.id)?.has(duoId))}
                    clash={Boolean(duoId && clashes[i].has(duoId))}
                    onOpen={() => setPicking({ pool, passage })}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <p className="font-open text-xs mt-3" style={{ color: "var(--ink-faint)" }}>
        Cliquez sur un passage pour lui attribuer un duo ou le changer. <strong>Doublon</strong> : le duo juge un autre
        passage de la même poule. <strong>Même heure</strong> : il a déjà un passage à ce créneau.
      </p>

      {picking && (
        <DuoPicker
          {...picking}
          schedule={schedule}
          pools={pools}
          duos={duos}
          teamById={teamById}
          onClose={() => setPicking(null)}
          onWarnings={onWarnings}
        />
      )}
    </>
  );
}

function HeadCell({ children, sticky = false }: { children: React.ReactNode; sticky?: boolean }) {
  return (
    <div
      className="px-3 py-3 font-mont text-tiny uppercase tracking-widest"
      style={{
        background: "var(--forest-soft)",
        color: "var(--paper)",
        fontWeight: 900,
        borderLeft: sticky ? undefined : "1px solid rgba(255,255,255,0.1)",
        ...(sticky && { position: "sticky", left: 0, zIndex: 2, borderRight: "2px solid var(--forest)" }),
      }}
    >
      {children}
    </div>
  );
}

// Its height follows the break's length (animated in index.css), so moving
// a passage visibly stretches or shrinks the pauses around it.
function BreakRow({ minutes }: { minutes: number }) {
  return (
    <div
      className="break-row flex items-center"
      style={{
        gridColumn: "1 / -1",
        // A band as long as the break it stands for (capped at 90 min)
        height: `calc(1.5rem + ${(Math.min(minutes, 90) * 0.0375).toFixed(3)}rem)`,
        borderTop: "1px solid var(--border)",
        background: "repeating-linear-gradient(135deg, var(--paper) 0 0.375rem, var(--paper-2) 0.375rem 0.75rem)",
      }}
    >
      <span
        className="inline-block px-3 font-mont text-micro uppercase tracking-widest tabular-nums"
        style={{ position: "sticky", left: 0, color: "var(--ink-soft)", fontWeight: 800 }}
      >
        {minutes > 0 ? `Pause · ${minutes} min` : "Sans pause"}
      </span>
    </div>
  );
}

// A pool of 3 has no 4th passage
function NoPassage() {
  return (
    <div
      className="flex items-center justify-center font-mont text-micro uppercase tracking-widest"
      style={{ borderTop: "1px solid var(--border)", borderLeft: "1px solid var(--border)", color: "var(--ink-faint)", fontWeight: 700, background: "var(--paper)" }}
    >
      Pas de passage
    </div>
  );
}

function PassageCell({
  passage,
  time,
  active,
  teamById,
  repeated,
  clash,
  onOpen,
}: {
  passage: PassageDetails;
  time: string;
  active: boolean; // its slot is being edited
  teamById: Map<string, Team>;
  repeated: boolean;
  clash: boolean;
  onOpen: () => void;
}) {
  const quad = (id: string) => teamById.get(id)?.quadrigram ?? "—";
  const { duo } = passage;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`slot-cell text-left p-3 flex flex-col gap-2.5${active ? " slot-cell--active" : ""}`}
      style={{ borderTop: "1px solid var(--border)", borderLeft: "1px solid var(--border)" }}
      aria-label={`Passage ${passage.label}, ${time}, ${duo ? `duo ${duo.number}` : "sans duo"} : choisir le duo`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mont text-xs uppercase tracking-wider" style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
          Problème {passage.problemNumber}
        </span>
        <span className="font-mont text-micro" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>{passage.label}</span>
      </div>
      <div className="flex gap-1 flex-wrap">
        <RoleChip role="defender" quad={quad(passage.defenderTeamId)} />
        <RoleChip role="opponent" quad={quad(passage.opponentTeamId)} />
        <RoleChip role="reporter" quad={quad(passage.reporterTeamId)} />
      </div>
      <div className="mt-auto pt-2" style={{ borderTop: "1px dashed var(--border)" }}>
        {duo ? (
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone="dark">Duo {duo.number}</Badge>
            <span className="font-open text-xs" style={{ color: "var(--ink)" }}>{duoMembers(duo)}</span>
          </div>
        ) : (
          <span className="font-mont text-micro uppercase tracking-widest" style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
            Attribuer un duo
          </span>
        )}
        {(repeated || clash) && (
          <div className="flex gap-1 flex-wrap mt-1.5">
            {repeated && <Badge tone="danger">Doublon</Badge>}
            {clash && <Badge tone="danger">Même heure</Badge>}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Duo picker for one passage ───────────────────────────────────────

function DuoPicker({
  pool,
  passage,
  schedule,
  pools,
  duos,
  teamById,
  onClose,
  onWarnings,
}: Slot & {
  schedule: ScheduleSlot[];
  pools: PoolDetails[];
  duos: JuryDuo[];
  teamById: Map<string, Team>;
  onClose: () => void;
  onWarnings: (w: string[]) => void;
}) {
  const { run, busy, error } = useAction(DUO_QUERIES);
  const n = passage.slot;
  const slot = schedule[n - 1];
  const quad = (id: string) => teamById.get(id)?.quadrigram ?? "—";
  const dayPassages = pools.flatMap((p) => p.passages);
  const labelsOf = (duoId: string, ps: (PassageDetails | undefined)[]) =>
    ps.filter((p): p is PassageDetails => Boolean(p && p.id !== passage.id && p.duo?.id === duoId)).map((p) => p.label);

  const choose = async (duoId: string | null) => {
    if (duoId === (passage.duo?.id ?? null)) return onClose();
    const res = await run(() => setPassageDuo(passage.id, duoId));
    if (res) {
      onWarnings(res.warnings);
      onClose();
    }
  };

  return (
    <Modal open title={`Passage ${passage.label}`} onClose={onClose} width={560} footer={<Btn variant="ghost" onClick={onClose}>Fermer</Btn>}>
      <div className="space-y-5">
        <div>
          <div className="font-mont text-micro uppercase tracking-widest mb-2" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
            Poule {pool.label}{slot ? ` · ${slot.start} – ${slotEnd(slot)}` : ""} · Problème {passage.problemNumber}
          </div>
          <div className="flex gap-1 flex-wrap">
            <RoleChip role="defender" quad={quad(passage.defenderTeamId)} />
            <RoleChip role="opponent" quad={quad(passage.opponentTeamId)} />
            <RoleChip role="reporter" quad={quad(passage.reporterTeamId)} />
            {passage.extraTeamId && <RoleChip role="extra" quad={quad(passage.extraTeamId)} />}
          </div>
        </div>

        {error && <Alert>{error}</Alert>}

        {duos.length === 0 ? (
          <p className="font-open text-sm italic" style={{ color: "var(--ink-faint)" }}>
            Aucun duo ce jour : formez-les d'abord dans « Duos du jour ».
          </p>
        ) : (
          <div role="radiogroup" aria-label="Duo du passage" className="space-y-2">
            {duos.map((duo) => {
              const inPool = labelsOf(duo.id, pool.passages);
              const sameTime = labelsOf(duo.id, pools.map((p) => p.passages.find((x) => x.slot === n)));
              const count = dayPassages.filter((p) => p.duo?.id === duo.id).length;
              return (
                <DuoOption
                  key={duo.id}
                  selected={passage.duo?.id === duo.id}
                  disabled={busy}
                  onSelect={() => choose(duo.id)}
                  title={`Duo ${duo.number}`}
                  sub={duoMembers(duo)}
                  aside={`${count} passage${count > 1 ? "s" : ""}`}
                >
                  {inPool.length > 0 && <Badge tone="danger">Doublon · {inPool.join(", ")}</Badge>}
                  {sameTime.length > 0 && <Badge tone="danger">Même heure · {sameTime.join(", ")}</Badge>}
                </DuoOption>
              );
            })}
            <DuoOption selected={!passage.duo} disabled={busy} onSelect={() => choose(null)} title="Aucun duo" />
          </div>
        )}
      </div>
    </Modal>
  );
}

function DuoOption({
  selected,
  disabled,
  onSelect,
  title,
  sub,
  aside,
  children,
}: {
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  title: string;
  sub?: string;
  aside?: string;
  children?: React.ReactNode; // warnings
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className="duo-option w-full text-left px-4 py-3 flex items-center gap-3 disabled:opacity-60"
      style={{ border: `2px solid ${selected ? "var(--forest)" : "var(--border)"}` }}
    >
      <span
        aria-hidden
        className="shrink-0 flex items-center justify-center"
        style={{ width: "1.125rem", height: "1.125rem", border: "2px solid var(--forest)", borderRadius: "50%" }}
      >
        {selected && <span style={{ width: "0.5rem", height: "0.5rem", borderRadius: "50%", background: "var(--forest)" }} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-mont text-sm block" style={{ color: "var(--forest)", fontWeight: 900 }}>
          {title}
          {sub && <span className="font-open ml-2" style={{ color: "var(--ink)", fontWeight: 400 }}>{sub}</span>}
        </span>
        {children && <span className="flex gap-1 flex-wrap mt-1.5">{children}</span>}
      </span>
      {aside && (
        <span className="font-mont text-micro uppercase tracking-widest shrink-0" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
          {aside}
        </span>
      )}
    </button>
  );
}
