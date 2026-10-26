import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Alert, Btn, BrutalCard, Field, Input, Modal } from "@/features/shared/primitives";
import { fixAdmissibles, previewAdmissibles, reopenAdmissibles } from "@/lib/repositories/admissiblesRepository";
import { missingText, type AdmissibilityRow, type Selection } from "@/lib/services/admissibility";
import { frStat } from "@/lib/services/stats";
import type { AdmissibleList, FinalWeights, Team } from "@/types";
import { useAction } from "../useAction";

// Phase A of the selection, above the Classements table (results/Rankings):
// n and λ, how many teams λ × n makes, the button that fixes the list of
// admissibles (backend routes/admissibles.ts), or once fixed the list's
// banner and the button that reopens it. The table shows the ranking itself.

// What the list changes, for the pages that read it
const TOUCHED = [["admissibles"], ["report-assignments"], ["audit-log"]];

const lambdaText = (n: number) => String(n).replace(".", ",");
const dateText = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export function AdmissiblesPanel({
  list,
  weights,
  placesText,
  lambdaText: lambdaTyped,
  onPlaces,
  onLambda,
  typed,
  count,
  chosen,
  incomplete,
  moved,
  teamById,
  played,
}: {
  list: AdmissibleList | null;
  weights: FinalWeights;
  placesText: string;
  lambdaText: string;
  onPlaces: (v: string) => void;
  onLambda: (v: string) => void;
  typed: Selection;
  count: number; // λ × n, whole teams
  chosen: string[]; // the admissibles the ranking gives now, in its order (ties at the cut included)
  incomplete: AdmissibilityRow[];
  moved: { enter: string[]; leave: string[] } | null; // since the list was fixed
  teamById: Map<string, Team>;
  played: number; // the teams that played: λ max is played / n
}) {
  const [modal, setModal] = useState<"fix" | "reopen" | null>(null);
  // "3,82": λ max is rarely round, and is cut (not rounded) to what is accepted
  const maxText = typed.lambdaMax === null ? null : frStat(Math.floor(typed.lambdaMax * 100) / 100, Number.isInteger(typed.lambdaMax) ? 0 : 2);
  const quads = (ids: string[]) => ids.map((id) => teamById.get(id)?.quadrigram ?? "?").join(", ");
  const sum = weights.defender + weights.opponent + weights.reporter + weights.report;
  const n = (v: number) => frStat(v, Number.isInteger(v) ? 0 : 1);

  return (
    <div className="space-y-4 mb-6">
      {list ? (
        <Alert tone="success" title="Liste des admissibles arrêtée">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {list.teamIds.length} équipes (n = {list.places}, λ = {lambdaText(list.lambda)}), arrêtée le {dateText(list.fixedAt)} par {list.fixedBy}.
              Seuls leurs autres rapports sont à corriger ; ceux des autres équipes comptent 0, le rapport défendu à part.
            </span>
            <Btn variant="danger" size="sm" onClick={() => setModal("reopen")}>Rouvrir la liste</Btn>
          </div>
        </Alert>
      ) : (
        <BrutalCard withCorners={false} className="p-5">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <div className="grid grid-cols-2 gap-4" style={{ width: "min(100%, 16rem)" }}>
              {/* Symbols keep their case: the labels' capitals would turn λ into Λ */}
              <Field label={<>Places <span className="normal-case">(n)</span></>} error={typed.error === "places" ? `Un nombre entier, de 1 à ${played}` : undefined}>
                <Input value={placesText} inputMode="numeric" onChange={(e) => onPlaces(e.target.value)} aria-describedby="admissibles-count" />
              </Field>
              <Field
                label={<span className="normal-case">λ</span>}
                hint={maxText === null ? `λ max = ${played} / n` : `λ max = ${played} / ${typed.places}, soit ${maxText}`}
                error={typed.error === "lambda" && maxText !== null ? `Entre 0 et ${maxText} (${played} / ${typed.places})` : undefined}
              >
                <Input value={lambdaTyped} inputMode="decimal" onChange={(e) => onLambda(e.target.value)} aria-describedby="admissibles-count" />
              </Field>
            </div>
            <div id="admissibles-count" aria-live="polite" className="min-w-0 pb-5">
              <div className="font-mont text-tiny tracking-widest" style={{ color: "var(--ink-soft)", fontWeight: 700 }}>λ × n</div>
              <div className="font-mont tabular-nums leading-none mt-1" style={{ fontSize: "2.25rem", color: "var(--forest)", fontWeight: 900 }}>
                {typed.error ? "?" : count}
                <span className="font-open text-sm ml-2" style={{ color: "var(--ink-soft)", fontWeight: 400 }}>équipes admissibles</span>
              </div>
            </div>
            <div className="ml-auto pb-5">
              <Btn disabled={Boolean(typed.error) || chosen.length === 0} onClick={() => setModal("fix")}>
                Arrêter la liste ({plural(chosen.length, "équipe", "équipes")})
              </Btn>
            </div>
          </div>
          <p className="font-open text-sm" style={{ color: "var(--ink-soft)" }}>
            Note d'admissibilité : {n(weights.defender)} fois la défense, {n(weights.opponent)} fois l'opposition, {n(weights.reporter)} fois le
            rapporteur et {n(weights.report)} fois le rapport défendu, le tout divisé par {n(sum)}, chaque note en % de sa grille (coefficients de la
            page <Link to="/criteres" className="underline font-semibold">Critères de notation</Link>). Une fois la liste arrêtée, seuls les autres
            rapports des admissibles sont distribués et corrigés ; ceux des autres équipes comptent 0.
          </p>
        </BrutalCard>
      )}

      {!list && incomplete.length > 0 && (
        <Alert tone="warning" title={`${plural(incomplete.length, "équipe", "équipes")} sans note complète`}>
          Sans note d'admissibilité, {incomplete.length > 1 ? "elles ne sont pas classées et ne seront pas admissibles" : "elle n'est pas classée et ne sera pas admissible"} si
          la liste est arrêtée maintenant :{" "}
          {incomplete.map((r) => `${teamById.get(r.teamId)?.quadrigram ?? "?"} (${missingText(r.missing)})`).join(", ")}.
        </Alert>
      )}
      {!list && !typed.error && chosen.length > count && (
        <Alert tone="warning" title="Égalité à la coupure">
          {chosen.length - count + 1} équipes partagent la dernière place admissible : toutes entrent, la liste compte {chosen.length} équipes au lieu de {count}.
        </Alert>
      )}
      {moved && (moved.enter.length > 0 || moved.leave.length > 0) && (
        <Alert tone="warning" title="Le classement a bougé depuis">
          Avec les notes actuelles, {moved.enter.length > 0 ? `${quads(moved.enter)} entrerai${moved.enter.length > 1 ? "ent" : "t"}` : "aucune équipe n'entrerait"}
          {moved.leave.length > 0 ? ` et ${quads(moved.leave)} sortirai${moved.leave.length > 1 ? "ent" : "t"}` : ""}. La liste ne change pas d'elle-même :
          rouvrez-la puis arrêtez-la de nouveau pour la mettre à jour.
        </Alert>
      )}

      {modal === "fix" && (
        <FixModal
          ids={chosen}
          count={count}
          places={typed.places}
          lambda={typed.lambda}
          incomplete={incomplete}
          teamById={teamById}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "reopen" && list && <ReopenModal list={list} onClose={() => setModal(null)} />}
    </div>
  );
}

function FixModal({
  ids,
  count,
  places,
  lambda,
  incomplete,
  teamById,
  onClose,
}: {
  ids: string[];
  count: number;
  places: number;
  lambda: number;
  incomplete: AdmissibilityRow[];
  teamById: Map<string, Team>;
  onClose: () => void;
}) {
  const previewQ = useQuery({ queryKey: ["admissibles-preview", ids], queryFn: () => previewAdmissibles(ids), staleTime: 0 });
  const { run, busy, error } = useAction(TOUCHED);
  const impact = previewQ.data;
  const fix = async () => {
    const done = await run(() => fixAdmissibles({ places, lambda, teamIds: ids }));
    if (done) onClose();
  };

  return (
    <Modal
      open
      title="Arrêter la liste des admissibles ?"
      onClose={onClose}
      width="min(36rem, calc(100vw - 2rem))"
      footer={
        <>
          <Btn variant="ghost" disabled={busy} onClick={onClose}>Annuler</Btn>
          <Btn disabled={busy || !impact} onClick={fix}>{busy ? "Enregistrement…" : "Arrêter la liste"}</Btn>
        </>
      }
    >
      <div className="space-y-4 font-open text-sm" style={{ color: "var(--ink)" }}>
        <p>
          <strong className="font-mont">{plural(ids.length, "équipe devient admissible", "équipes deviennent admissibles")}</strong>{" "}
          (n = {places}, λ = {lambdaText(lambda)}{ids.length > count ? `, dont ${ids.length - count} à égalité à la dernière place` : ""}).
          Les rapports des autres équipes, le rapport défendu à part, comptent 0.
        </p>
        {previewQ.isLoading ? (
          <p className="loading-label" style={{ color: "var(--ink-faint)" }}>Recherche des rapports déjà attribués</p>
        ) : previewQ.isError ? (
          <Alert>Impossible de calculer les rapports concernés. Fermez et réessayez.</Alert>
        ) : impact && (
          <ul className="list-disc pl-5 space-y-1" style={{ color: "var(--ink-soft)" }}>
            <li>
              {impact.takenBack.length === 0
                ? "Aucun rapport non corrigé de ces équipes n'est attribué : rien à reprendre aux jurés."
                : `${plural(impact.takenBack.length, "rapport non corrigé est repris", "rapports non corrigés sont repris")} à ${impact.takenBack.length > 1 ? "leurs jurés" : "son juré"}.`}
            </li>
            {impact.keptGraded.length > 0 && (
              <li>{plural(impact.keptGraded.length, "rapport déjà corrigé reste", "rapports déjà corrigés restent")} à leur juré, et compte{impact.keptGraded.length > 1 ? "nt" : ""} 0.</li>
            )}
            <li>Ensuite, sur Affectation des rapports, « Compléter » distribue les autres rapports des admissibles.</li>
          </ul>
        )}
        {incomplete.length > 0 && (
          <Alert tone="warning" title="Équipes sans note complète">
            {incomplete.map((r) => teamById.get(r.teamId)?.quadrigram ?? "?").join(", ")} ne {incomplete.length > 1 ? "sont" : "est"} pas
            classée{incomplete.length > 1 ? "s" : ""} : {incomplete.length > 1 ? "elles ne seront pas admissibles" : "elle ne sera pas admissible"}, et
            {incomplete.length > 1 ? " leurs" : " ses"} autres rapports compteront 0.
          </Alert>
        )}
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}

function ReopenModal({ list, onClose }: { list: AdmissibleList; onClose: () => void }) {
  const { run, busy, error } = useAction(TOUCHED);
  const reopen = async () => {
    const done = await run(() => reopenAdmissibles());
    if (done !== undefined) onClose();
  };
  return (
    <Modal
      open
      title="Rouvrir la liste des admissibles ?"
      onClose={onClose}
      width="min(34rem, calc(100vw - 2rem))"
      footer={
        <>
          <Btn variant="ghost" disabled={busy} onClick={onClose}>Non</Btn>
          <Btn variant="danger" disabled={busy} onClick={reopen}>{busy ? "Réouverture…" : "Rouvrir la liste"}</Btn>
        </>
      }
    >
      <div className="space-y-3 font-open text-sm" style={{ color: "var(--ink)" }}>
        <p>
          La liste de {list.teamIds.length} équipes est retirée : les rapports des autres équipes comptent de nouveau avec leur note, pour ceux
          déjà corrigés.
        </p>
        <p style={{ color: "var(--ink-soft)" }}>
          Les rapports repris aux jurés ne leur sont pas rendus : sur Affectation des rapports, « Compléter » les distribue de nouveau. Vous
          pourrez arrêter une nouvelle liste aussitôt.
        </p>
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}
