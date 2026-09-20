import { useState } from "react";
import { Alert, Badge, Btn, BrutalCard, Modal, SectionHeading, Select } from "@/features/shared/primitives";
import { completeDraw, deleteDraw, saveDraw, setDrawValidation, swapTeams } from "@/lib/repositories/centerDayRepository";
import { createPool } from "@/lib/repositories/poolRepository";
import { teamsInGrid } from "@/lib/services/poolDraft";
import { generateQualifsDay } from "@/lib/services/tournamentOptimizer";
import type { CenterDay, PoolDetails, Team } from "@/types";
import { SwapIcon } from "@/features/shared/icons";
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
  const [adding, setAdding] = useState(false);
  const [openPool, setOpenPool] = useState<string | null>(null); // the pool being edited
  const drawn = pools.length > 0;
  const undrawable = teams.length < 3;
  const drafts = pools.filter((p) => p.draft);
  const validated = Boolean(day.drawValidatedAt);

  // A pool composed by hand: it starts empty and opens straight in edit mode.
  const addPool = async (size: 3 | 4) => {
    setAdding(false);
    const pool = await run(() => createPool(day.id, size));
    if (pool) setOpenPool(pool.id);
  };

  // Teams already in a pool of this day, drafts included
  const placed = new Set(
    pools.flatMap((pool) =>
      pool.draft
        ? teamsInGrid(pool.draft)
        : pool.passages.flatMap((p) => [p.defenderTeamId, p.opponentTeamId, p.reporterTeamId, p.extraTeamId].filter((id): id is string => Boolean(id))),
    ),
  );
  const freeTeams = teams.filter((t) => !placed.has(t.id));
  const nextPoolNumber = pools.reduce((max, p) => Math.max(max, Number(p.label.match(/(\d+)$/)?.[1] ?? 0)), 0) + 1;

  const draw = async () => {
    setConfirm(null);
    await run(async () => {
      const result = generateQualifsDay({ teams, labelPrefix: poolLabelPrefix(day.center, dayIndex), allowLeftovers: true });
      return saveDraw(day.id, result);
    });
  };

  // Draws only the teams that have no pool yet, keeping the pools already
  // there (drawn or composed by hand).
  const complete = async () => {
    await run(async () => {
      const result = generateQualifsDay({
        teams: freeTeams,
        labelPrefix: poolLabelPrefix(day.center, dayIndex),
        labelStart: nextPoolNumber,
        allowLeftovers: true,
      });
      return completeDraw(day.id, result);
    });
  };

  const validate = async (validated: boolean) => run(() => setDrawValidation(day.id, validated));

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
            {validated && (
              <Badge tone="sage">
                Tirage validé{day.drawValidatedAt ? ` · ${formatDay(day.drawValidatedAt.slice(0, 10))}` : ""}
              </Badge>
            )}
            {drawn ? (
              <>
                {/* Below three free teams there's no pool to form: the banner
                    explains what to do with them instead. */}
                {freeTeams.length >= 3 && (
                  <Btn size="sm" disabled={busy} title="Tire seulement les équipes encore sans poule" onClick={complete}>
                    {busy ? "Tirage…" : `Compléter le tirage (${freeTeams.length})`}
                  </Btn>
                )}
                <Btn variant="ghost" size="sm" disabled={busy} onClick={() => setConfirm("redraw")}>Refaire le tirage</Btn>
                <Btn variant="danger" size="sm" disabled={busy} onClick={() => setConfirm("cancel")}>Annuler le tirage</Btn>
              </>
            ) : (
              <Btn
                size="sm"
                disabled={busy || undrawable}
                title={undrawable ? "Il faut au moins 3 équipes pour former une poule" : undefined}
                onClick={draw}
              >
                {busy ? "Tirage…" : "Tirer les poules"}
              </Btn>
            )}
            <Btn variant="ghost" size="sm" disabled={busy} onClick={() => setAdding(true)}>
              Ajouter une poule
            </Btn>
            {drawn && (
              <Btn
                variant={validated ? "ghost" : "primary"}
                size="sm"
                disabled={busy || (!validated && drafts.length > 0)}
                title={
                  validated
                    ? "Rouvrir le jour pour modifier ses poules"
                    : drafts.length > 0
                      ? `À terminer d'abord : ${drafts.map((p) => p.label).join(", ")}`
                      : "Fige la composition du jour, même s'il reste des équipes sans poule"
                }
                onClick={() => validate(!validated)}
              >
                {validated ? "Dévalider" : "Valider le tirage"}
              </Btn>
            )}
          </div>
        }
      />

      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {!drawn && undrawable && teams.length > 0 && (
          <Alert tone="warning">
            {teams.length} équipe{teams.length > 1 ? "s" : ""} ce jour-là : il en faut au moins 3 pour former une poule.
            Déplacez des équipes vers un autre jour.
          </Alert>
        )}
        {drawn && freeTeams.length > 0 && (
          <Alert tone="warning" title={`${freeTeams.length} équipe${freeTeams.length > 1 ? "s" : ""} sans poule`}>
            {freeTeams.map((t) => `${t.quadrigram} (${t.name})`).join(", ")}.{" "}
            {freeTeams.length >= 3
              ? "« Compléter le tirage » leur formera des poules."
              : "Trop peu pour une poule : à basculer vers le tournoi en ligne à la main, ou à replacer dans une poule existante."}{" "}
            Le jour peut être validé ainsi.
          </Alert>
        )}
        {validated && (
          <Alert tone="success" title="Tirage validé">
            Composition figée{day.drawValidatedBy ? ` par ${day.drawValidatedBy}` : ""}
            {day.drawValidatedAt ? `, le ${formatDay(day.drawValidatedAt.slice(0, 10))}` : ""}. Toute modification des
            poules retire la validation.
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
                <PoolCard
                  key={pool.id}
                  pool={pool}
                  teams={teams}
                  otherPools={pools.filter((p) => p.id !== pool.id)}
                  teamById={teamById}
                  editing={openPool === pool.id}
                  onEdit={(on) => setOpenPool(on ? pool.id : null)}
                />
              ))}
            </div>
            <SwapTeams dayId={day.id} teams={teams} />
          </>
        ) : (
          <BrutalCard className="p-6" withCorners={false} style={{ borderStyle: "dashed", boxShadow: "none" }}>
            <p className="font-open text-sm italic" style={{ color: "var(--ink-faint)" }}>
              Pas encore de tirage pour ce jour — tirez les poules, ou composez-en une à la main.
            </p>
          </BrutalCard>
        )}
      </div>

      <Modal
        open={adding}
        title="Ajouter une poule"
        onClose={() => setAdding(false)}
        width="min(30rem, calc(100vw - 2rem))"
        footer={<Btn variant="ghost" onClick={() => setAdding(false)}>Annuler</Btn>}
      >
        <div className="px-5 py-4 space-y-4">
          <p className="font-open text-sm" style={{ color: "var(--ink)" }}>
            Combien d'équipes dans cette poule ? Elle s'ouvrira vide : chaque case se remplit ensuite d'un clic, et
            vous pourrez l'enregistrer même incomplète.
          </p>
          <div className="flex gap-3">
            <Btn onClick={() => addPool(3)}>Poule de 3</Btn>
            <Btn onClick={() => addPool(4)}>Poule de 4</Btn>
          </div>
          <p className="font-open text-xs" style={{ color: "var(--ink-soft)" }}>
            3 équipes : 3 passages, chacune défend une fois. 4 équipes : 4 passages, l'équipe sans rôle reste
            observatrice.
          </p>
        </div>
      </Modal>

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
    <Select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "13.75rem" }}>
      <option value="">Choisir une équipe</option>
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
            <span style={{ color: "var(--ink-faint)" }}><SwapIcon size="1rem" /></span>
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
