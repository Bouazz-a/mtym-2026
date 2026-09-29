import { useState } from "react";
import { Alert, Badge, Btn, BrutalCard, Modal, SectionHeading, Select } from "@/features/shared/primitives";
import { completeDraw, deleteDraw, getValidationImpact, saveDraw, setDrawValidation, swapTeams } from "@/lib/repositories/centerDayRepository";
import { createPool } from "@/lib/repositories/poolRepository";
import { teamsInGrid } from "@/lib/services/poolDraft";
import type { CenterDay, PoolDetails, Team, ValidationImpact } from "@/types";
import { SwapIcon } from "@/features/shared/icons";
import { formatDay } from "@/utils/labels";
import { choiceRank, hasFinalReport, ordinal } from "@/utils/teams";
import { PoolCard } from "./PoolsEditor";
import { useAction, TOURNAMENT_QUERIES, VALIDATION_QUERIES } from "./useAction";

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
  const { run, busy, error } = useAction(VALIDATION_QUERIES);
  const [confirm, setConfirm] = useState<"redraw" | "cancel" | null>(null);
  const [impact, setImpact] = useState<ValidationImpact | null>(null); // validation waiting for a yes
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

  // The server draws (backend/src/algorithms/poolDraw.ts): all the day's
  // teams, or only those still without a pool when completing.
  const draw = async () => {
    setConfirm(null);
    await run(() => saveDraw(day.id));
  };

  const complete = () => run(() => completeDraw(day.id));

  // Validating may cancel grades and move reports (the pools changed since
  // the day's reports were handed out): the admin sees what first
  const validate = async () => {
    const next = await run(() => getValidationImpact(day.id));
    if (!next) return;
    if (next.removed.length + next.assigned.length + next.unassigned.length === 0) await run(() => setDrawValidation(day.id, true));
    else setImpact(next);
  };
  const confirmValidate = async () => {
    setImpact(null);
    await run(() => setDrawValidation(day.id, true));
  };

  const cancel = async () => {
    setConfirm(null);
    await run(() => deleteDraw(day.id));
  };

  const missingReports = pools
    .flatMap((p) => p.passages)
    .filter((p) => !hasFinalReport(teamById.get(p.defenderTeamId), p.problemNumber)).length;

  // How many defenders play their 1st, 2nd… choice (teams with a ranking)
  const choices = [1, 2, 3, 4].map((rank) => pools
    .flatMap((p) => p.passages)
    .filter((p) => choiceRank(teamById.get(p.defenderTeamId), p.problemNumber) === rank).length);
  const choiceSummary = choices
    .map((n, i) => (n > 0 ? `${n} × ${ordinal(i + 1)}` : null))
    .filter(Boolean)
    .join(" · ");

  return (
    <section>
      <SectionHeading
        title={`Jour ${dayIndex + 1} · ${formatDay(day.date)}`}
        right={
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone="neutral">{teams.length} équipes</Badge>
            <Badge tone={drawn ? "sage" : "neutral"}>{pools.length} poules</Badge>
            {choiceSummary && (
              <span title="Problème défendu par rapport au classement de chaque équipe">
                <Badge tone="neutral">Choix : {choiceSummary}</Badge>
              </span>
            )}
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
                onClick={() => (validated ? run(() => setDrawValidation(day.id, false)) : validate())}
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
            poules retire la validation ; les rapports déjà attribués sont remis à jour quand le jour est validé à nouveau.
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
          Impossible une fois des passages notés.
        </p>
      </Modal>
      <ValidationModal impact={impact} onCancel={() => setImpact(null)} onConfirm={confirmValidate} />
    </section>
  );
}

// ─── Validating again after the pools changed ─────────────────────────

function ValidationModal({
  impact,
  onCancel,
  onConfirm,
}: {
  impact: ValidationImpact | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const graded = impact?.removed.filter((r) => r.graded) ?? [];
  const ungraded = impact?.removed.filter((r) => !r.graded) ?? [];
  const why = (r: ValidationImpact["removed"][number]) =>
    r.reason === "defended" ? `${r.team} défend désormais le P${r.problemNumber}` : `${r.team} n'est plus dans une poule`;
  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

  return (
    <Modal
      open={impact !== null}
      title="Valider le tirage ?"
      onClose={onCancel}
      width="min(36rem, calc(100vw - 2rem))"
      footer={
        <>
          <Btn variant="ghost" onClick={onCancel}>Annuler</Btn>
          <Btn variant={graded.length > 0 ? "danger" : "primary"} onClick={onConfirm}>
            {graded.length > 0 ? `Valider et annuler ${plural(graded.length, "note")}` : "Valider"}
          </Btn>
        </>
      }
    >
      <div className="space-y-4 font-open text-sm" style={{ color: "var(--ink)" }}>
        <p>Les poules ont changé depuis que les rapports de ce jour ont été attribués. En validant :</p>
        <ImpactList
          title={`${plural(graded.length, "note")} annulée${graded.length > 1 ? "s" : ""}`}
          tone="clay"
          items={graded.map((r) => `${r.team} P${r.problemNumber}, corrigé par ${r.juror} : ${why(r)}`)}
        />
        <ImpactList
          title={`${plural(ungraded.length, "rapport")} retiré${ungraded.length > 1 ? "s" : ""} à ${ungraded.length > 1 ? "leurs jurés" : "son juré"} (pas encore corrigé${ungraded.length > 1 ? "s" : ""})`}
          items={ungraded.map((r) => `${r.team} P${r.problemNumber}, chez ${r.juror} : ${why(r)}`)}
        />
        <ImpactList
          title={`${plural(impact?.assigned.length ?? 0, "rapport")} attribué${(impact?.assigned.length ?? 0) > 1 ? "s" : ""}`}
          items={(impact?.assigned ?? []).map((r) => `${r.team} P${r.problemNumber} → ${r.juror}`)}
        />
        <ImpactList
          title={`${plural(impact?.unassigned.length ?? 0, "rapport")} à attribuer à la main`}
          items={(impact?.unassigned ?? []).map((r) => `${r.team} P${r.problemNumber} : aucun duo n'a encore de problème`)}
        />
        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>Les autres rapports gardent leur juré et leur note.</p>
      </div>
    </Modal>
  );
}

function ImpactList({ title, items, tone }: { title: string; items: string[]; tone?: "clay" }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="font-mont text-micro uppercase tracking-widest mb-1" style={{ color: tone ? "var(--clay)" : "var(--forest)", fontWeight: 800 }}>
        {title}
      </div>
      <ul className="list-disc pl-5 space-y-0.5">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
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
