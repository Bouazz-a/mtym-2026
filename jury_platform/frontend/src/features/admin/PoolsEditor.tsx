import { useState } from "react";
import { Alert, Badge, Btn, BrutalCard, Field, Input, Modal, Select } from "@/features/shared/primitives";
import { ROLE_PALETTE } from "@/features/shared/widgets";
import { updatePassage } from "@/lib/repositories/poolRepository";
import { QUALIFS_PROBLEMS } from "@/lib/services/tournamentOptimizer";
import type { Passage, PoolDetails, Team } from "@/types";
import { slotTime } from "@/utils/schedule";
import { hasFinalReport } from "@/utils/teams";
import { repeatedDuos } from "@/utils/duos";
import { useAction, TOURNAMENT_QUERIES } from "./useAction";

// A drawn pool: its passages with their jury duo, each passage editable
// (room, or a manual lineup fix). Duos and hours are set on the Jury page.

export function PoolCard({ pool, teamById }: { pool: PoolDetails; teamById: Map<string, Team> }) {
  const [editing, setEditing] = useState<Passage | null>(null);
  const repeated = repeatedDuos(pool);
  const withDuo = pool.passages.filter((p) => p.duo).length;
  const poolTeams = [...new Set(pool.passages.map((p) => p.defenderTeamId))]
    .map((id) => teamById.get(id))
    .filter((t): t is Team => Boolean(t));

  return (
    <BrutalCard className="overflow-hidden">
      <div
        className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap"
        style={{ borderBottom: "2px solid var(--forest)", background: "rgba(98,159,115,0.10)" }}
      >
        <div className="flex items-center gap-3">
          <span style={{ width: 8, height: 28, background: "var(--forest)" }} />
          <h3 className="font-mont" style={{ color: "var(--forest)", fontWeight: 900, fontSize: "1.2rem", letterSpacing: "-0.01em" }}>
            Poule {pool.label}
          </h3>
        </div>
        <Badge tone={withDuo === pool.passages.length ? "sage" : "saffron"}>
          {withDuo}/{pool.passages.length} passages avec un duo
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="brutal-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Pb</th>
              <th>DEF</th>
              <th>OPP</th>
              <th>RAP</th>
              <th>OBS</th>
              <th>Horaire</th>
              <th>Jury</th>
              <th style={{ borderRight: "none" }} />
            </tr>
          </thead>
          <tbody>
            {pool.passages.map((p) => {
              const defender = teamById.get(p.defenderTeamId);
              const missingReport = !hasFinalReport(defender, p.problemNumber);
              return (
                <tr key={p.id}>
                  <td>
                    <span className="font-mont text-xs" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
                      {p.label.split("-").pop()}
                    </span>
                  </td>
                  <td>
                    <span className="font-mont" style={{ color: "var(--saffron-dark)", fontWeight: 900, fontSize: "0.95rem" }}>
                      P{p.problemNumber}
                    </span>
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-1.5">
                      <TeamCell quad={defender?.quadrigram} role="defender" />
                      {missingReport && (
                        <span title={`Pas de rapport final pour le problème ${p.problemNumber}`}>
                          <Badge tone="danger">RF ?</Badge>
                        </span>
                      )}
                    </span>
                  </td>
                  <td><TeamCell quad={teamById.get(p.opponentTeamId)?.quadrigram} role="opponent" /></td>
                  <td><TeamCell quad={teamById.get(p.reporterTeamId)?.quadrigram} role="reporter" /></td>
                  <td>
                    <span className="font-mont text-xs" style={{ color: "var(--ink-faint)", fontWeight: 700 }}>
                      {p.extraTeamId ? teamById.get(p.extraTeamId)?.quadrigram ?? "—" : "—"}
                    </span>
                  </td>
                  <td>
                    <span className="font-mont text-micro uppercase tracking-widest tabular-nums" style={{ color: "var(--ink-soft)", fontWeight: 700 }}>
                      {[slotTime(pool.centerDay, p.slot)?.start, p.room].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </td>
                  <td>
                    {p.duo ? (
                      <span className="inline-flex items-center gap-1.5" title={p.duo.members.map((m) => `${m.firstName} ${m.lastName}`).join(" & ")}>
                        <Badge tone="dark">Duo {p.duo.number}</Badge>
                        {repeated.has(p.duo.id) && (
                          <span title="Ce duo juge plusieurs passages de cette poule"><Badge tone="danger">Doublon</Badge></span>
                        )}
                      </span>
                    ) : (
                      <span className="font-mont text-xs" style={{ color: "var(--ink-faint)" }}>—</span>
                    )}
                  </td>
                  <td style={{ borderRight: "none" }}>
                    <Btn variant="ghost" size="sm" onClick={() => setEditing(p)}>Éditer</Btn>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <PassageEditModal passage={editing} poolTeams={poolTeams} onClose={() => setEditing(null)} />
      )}
    </BrutalCard>
  );
}

function TeamCell({ quad, role }: { quad: string | undefined; role: "defender" | "opponent" | "reporter" }) {
  const meta = ROLE_PALETTE[role];
  const isDefender = role === "defender";
  return (
    <span
      className="font-mont text-xs px-1.5 py-0.5"
      style={{
        background: isDefender ? meta.bg : "transparent",
        color: isDefender ? meta.fg : "var(--forest)",
        border: isDefender ? "none" : `1px solid ${meta.bg}`,
        fontWeight: 800,
        letterSpacing: "0.05em",
      }}
    >
      {quad ?? "—"}
    </span>
  );
}

// ─── Passage edit modal ───────────────────────────────────────────────

function PassageEditModal({
  passage,
  poolTeams,
  onClose,
}: {
  passage: Passage;
  poolTeams: Team[];
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Passage>(passage);
  const { run, busy, error } = useAction(TOURNAMENT_QUERIES);
  const set = <K extends keyof Passage>(key: K, value: Passage[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const roles = [draft.defenderTeamId, draft.opponentTeamId, draft.reporterTeamId, draft.extraTeamId].filter(Boolean);
  const conflict = new Set(roles).size !== roles.length;

  const save = async () => {
    const saved = await run(() =>
      updatePassage(passage.id, {
        problemNumber: draft.problemNumber,
        defenderTeamId: draft.defenderTeamId,
        opponentTeamId: draft.opponentTeamId,
        reporterTeamId: draft.reporterTeamId,
        extraTeamId: draft.extraTeamId ?? null,
        room: draft.room?.trim() || null,
      }),
    );
    if (saved) onClose();
  };

  const teamSelect = (value: string, onChange: (v: string) => void) => (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {poolTeams.map((t) => (
        <option key={t.id} value={t.id}>{t.quadrigram} · {t.name}</option>
      ))}
    </Select>
  );

  return (
    <Modal
      open
      title={`Passage ${passage.label}`}
      onClose={onClose}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
          <Btn onClick={save} disabled={conflict || busy}>{busy ? "Enregistrement…" : "Enregistrer"}</Btn>
        </>
      }
    >
      <div className="space-y-4">
        {conflict && <Alert>Une équipe ne peut pas avoir deux rôles dans le même passage.</Alert>}
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Défenseur">{teamSelect(draft.defenderTeamId, (v) => set("defenderTeamId", v))}</Field>
          <Field label="Opposant">{teamSelect(draft.opponentTeamId, (v) => set("opponentTeamId", v))}</Field>
          <Field label="Rapporteur">{teamSelect(draft.reporterTeamId, (v) => set("reporterTeamId", v))}</Field>
          {poolTeams.length === 4 && (
            <Field label="Observateur">{teamSelect(draft.extraTeamId ?? "", (v) => set("extraTeamId", v))}</Field>
          )}
          <Field label="Problème">
            <Select value={draft.problemNumber} onChange={(e) => set("problemNumber", Number(e.target.value))}>
              {QUALIFS_PROBLEMS.map((n) => <option key={n} value={n}>Problème {n}</option>)}
            </Select>
          </Field>
          <Field label="Salle">
            <Input value={draft.room ?? ""} placeholder="Amphi A" onChange={(e) => set("room", e.target.value)} />
          </Field>
        </div>
        <p className="font-open text-xs" style={{ color: "var(--ink-faint)" }}>
          L'horaire suit le planning du jour (page Jury). Une fois le passage noté, seule la salle peut encore changer.
        </p>
      </div>
    </Modal>
  );
}
