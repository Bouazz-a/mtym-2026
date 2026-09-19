import { useState } from "react";
import { Alert, Badge, Btn, BrutalCard, Modal, SectionHeading, Select } from "@/features/shared/primitives";
import { deleteDraw, saveDraw, swapTeams } from "@/lib/repositories/centerDayRepository";
import { generateQualifsDay } from "@/lib/services/tournamentOptimizer";
import type { CenterDay, PoolDetails, Team } from "@/types";
import { formatDay, poolLabelPrefix } from "@/utils/labels";
import { hasFinalReport } from "@/utils/teams";
import { PoolCard } from "./PoolsEditor";
import { useAction, TOURNAMENT_QUERIES } from "./useAction";

// One day of a center: draw (or redraw) its pools, then adjust them.

export function DayDraw({
  day,
  dayIndex,
  teams,
  pools,
  teamById,
}: {
  day: CenterDay;
  dayIndex: number;
  teams: Team[]; // the teams playing this day
  pools: PoolDetails[];
  teamById: Map<string, Team>;
}) {
  const { run, busy, error } = useAction(TOURNAMENT_QUERIES);
  const [confirm, setConfirm] = useState<"redraw" | "cancel" | null>(null);
  const drawn = pools.length > 0;
  const undrawable = teams.length < 3 || teams.length === 5;

  const draw = async () => {
    setConfirm(null);
    await run(async () => {
      const result = generateQualifsDay({ teams, labelPrefix: poolLabelPrefix(day.center, dayIndex) });
      return saveDraw(day.id, result);
    });
  };

  const cancel = async () => {
    setConfirm(null);
    await run(() => deleteDraw(day.id));
  };

  const missingReports = pools
    .flatMap((p) => p.passages)
    .filter((p) => !hasFinalReport(teamById.get(p.defenderTeamId), p.problemNumber)).length;

  return (
    <section>
      <SectionHeading
        title={`Jour ${dayIndex + 1} · ${formatDay(day.date)}`}
        right={
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone="neutral">{teams.length} équipes</Badge>
            <Badge tone={drawn ? "sage" : "neutral"}>{pools.length} poules</Badge>
            {drawn ? (
              <>
                <Btn variant="ghost" size="sm" disabled={busy} onClick={() => setConfirm("redraw")}>Refaire le tirage</Btn>
                <Btn variant="danger" size="sm" disabled={busy} onClick={() => setConfirm("cancel")}>Annuler le tirage</Btn>
              </>
            ) : (
              <Btn
                size="sm"
                disabled={busy || undrawable}
                title={undrawable ? "Il faut 3, 4, 6 équipes ou plus (pas 5) pour former des poules de 3 ou 4" : undefined}
                onClick={draw}
              >
                {busy ? "Tirage…" : "Tirer les poules"}
              </Btn>
            )}
          </div>
        }
      />

      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {!drawn && undrawable && teams.length > 0 && (
          <Alert tone="warning">
            {teams.length} équipe{teams.length > 1 ? "s" : ""} ce jour-là : impossible de faire des poules de 3 ou 4.
            Déplacez des équipes vers un autre jour.
          </Alert>
        )}
        {drawn && missingReports > 0 && (
          <Alert tone="warning" title="Rapports finaux manquants">
            {missingReports} défenseur{missingReports > 1 ? "s n'ont" : " n'a"} pas (encore) de rapport final pour le
            problème qu'{missingReports > 1 ? "ils défendent" : "il défend"} (marqués « RF ? »).
          </Alert>
        )}

        {drawn ? (
          <>
            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
              {pools.map((pool) => (
                <PoolCard key={pool.id} pool={pool} teamById={teamById} />
              ))}
            </div>
            <SwapTeams dayId={day.id} teams={teams} />
          </>
        ) : (
          <BrutalCard className="p-6" withCorners={false} style={{ borderStyle: "dashed", boxShadow: "none" }}>
            <p className="font-open text-sm italic" style={{ color: "var(--ink-faint)" }}>
              Pas encore de tirage pour ce jour.
            </p>
          </BrutalCard>
        )}
      </div>

      <Modal
        open={confirm !== null}
        title={confirm === "redraw" ? "Refaire le tirage ?" : "Annuler le tirage ?"}
        onClose={() => setConfirm(null)}
        width={460}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setConfirm(null)}>Non</Btn>
            <Btn variant={confirm === "cancel" ? "danger" : "primary"} onClick={confirm === "redraw" ? draw : cancel}>
              {confirm === "redraw" ? "Refaire le tirage" : "Annuler le tirage"}
            </Btn>
          </>
        }
      >
        <p className="font-open text-sm" style={{ color: "var(--ink)" }}>
          Les poules actuelles de ce jour et les duos attribués à leurs passages seront supprimés
          {confirm === "redraw" ? " et remplacés par un nouveau tirage" : ""} ; les duos du jour, eux, restent.
          Impossible une fois des notes saisies.
        </p>
      </Modal>
    </section>
  );
}

// ─── Swap two teams of the day ────────────────────────────────────────

function SwapTeams({ dayId, teams }: { dayId: string; teams: Team[] }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const { run, busy, error } = useAction(TOURNAMENT_QUERIES);
  const sorted = [...teams].sort((x, y) => x.quadrigram.localeCompare(y.quadrigram));

  const swap = async () => {
    if (await run(() => swapTeams(dayId, a, b))) {
      setA("");
      setB("");
    }
  };

  const select = (value: string, onChange: (v: string) => void) => (
    <Select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 220 }}>
      <option value="">— Choisir —</option>
      {sorted.map((t) => <option key={t.id} value={t.id}>{t.quadrigram} · {t.name}</option>)}
    </Select>
  );

  return (
    <BrutalCard className="p-4" withCorners={false}>
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <div className="font-mont text-micro uppercase tracking-widest mb-1" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
            Échanger deux équipes
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {select(a, setA)}
            <span className="font-mont" style={{ color: "var(--ink-faint)", fontWeight: 900 }}>⇄</span>
            {select(b, setB)}
          </div>
        </div>
        <Btn variant="forest" size="sm" disabled={!a || !b || a === b || busy} onClick={swap}>Échanger</Btn>
      </div>
      <p className="font-open text-xs mt-2" style={{ color: "var(--ink-faint)" }}>
        Les deux équipes échangent leur place dans tous les passages du jour (poules et rôles).
      </p>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
    </BrutalCard>
  );
}
