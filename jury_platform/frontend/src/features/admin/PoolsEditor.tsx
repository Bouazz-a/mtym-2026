import { useMemo, useState } from "react";
import { Alert, Badge, Btn, BrutalCard, Field, Input, Modal, Select } from "@/features/shared/primitives";
import { ROLE_PALETTE } from "@/features/shared/widgets";
import { deletePool, savePool, updatePassage } from "@/lib/repositories/poolRepository";
import {
  ROLE_LABEL,
  gridOf,
  gridProblems,
  isComplete,
  missingCells,
  rotationTeams,
  fillRotation,
  setCell,
  setPassage,
  teamsOf as teamsOfRow,
  type Role,
} from "@/lib/services/poolDraft";
import type { GridPassage, Passage, PoolDetails, PoolGrid, Team } from "@/types";
import { slotTime } from "@/utils/schedule";
import { hasFinalReport } from "@/utils/teams";
import { repeatedDuos } from "@/utils/duos";
import { QUALIFS_PROBLEMS } from "@/utils/labels";
import { useAction, TOURNAMENT_QUERIES } from "./useAction";

// A pool of a center day, drawn or composed by hand: its passages with
// their jury duo, each passage editable (room, or a manual lineup fix), and
// a grid editor to fill it cell by cell. Duos and hours are set on the Jury
// page. A pool still being composed (pool.draft) has no passages yet and
// always opens in the editor.

export function PoolCard({
  pool,
  teams,
  otherPools,
  teamById,
  editing = false,
  onEdit,
}: {
  pool: PoolDetails;
  teams: Team[]; // the day's teams
  otherPools: PoolDetails[]; // to know which of them are taken
  teamById: Map<string, Team>;
  editing?: boolean;
  onEdit?: (on: boolean) => void;
}) {
  const [passageEdit, setPassageEdit] = useState<Passage | null>(null);
  const repeated = repeatedDuos(pool);
  const withDuo = pool.passages.filter((p) => p.duo).length;
  const poolTeams = [...new Set(pool.passages.map((p) => p.defenderTeamId))]
    .map((id) => teamById.get(id))
    .filter((t): t is Team => Boolean(t));
  const draft = Boolean(pool.draft);
  const showGrid = editing || draft;

  return (
    <BrutalCard className="overflow-hidden">
      <div
        className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap"
        style={{ borderBottom: "2px solid var(--forest)", background: draft ? "rgba(246,168,6,0.10)" : "rgba(98,159,115,0.10)" }}
      >
        <div className="flex items-center gap-3">
          <span style={{ width: "0.5rem", height: "1.75rem", background: "var(--forest)" }} />
          <h3 className="font-mont" style={{ color: "var(--forest)", fontWeight: 900, fontSize: "1.2rem", letterSpacing: "-0.01em" }}>
            Poule {pool.label}
          </h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {draft ? (
            // While the grid is open its footer counts the empty cells live
            <Badge tone="saffron">
              {showGrid ? "Brouillon" : `Brouillon · ${missingCells(pool.draft!)} case${missingCells(pool.draft!) > 1 ? "s" : ""} à remplir`}
            </Badge>
          ) : (
            <Badge tone={withDuo === pool.passages.length ? "sage" : "saffron"}>
              {withDuo}/{pool.passages.length} passages avec un duo
            </Badge>
          )}
          {!showGrid && onEdit && (
            <Btn variant="ghost" size="sm" onClick={() => onEdit(true)}>Composer</Btn>
          )}
        </div>
      </div>

      {showGrid ? (
        <PoolGridEditor
          pool={pool}
          teams={teams}
          otherPools={otherPools}
          teamById={teamById}
          onDone={() => onEdit?.(false)}
        />
      ) : (
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
                    <Btn variant="ghost" size="sm" onClick={() => setPassageEdit(p)}>Éditer</Btn>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {passageEdit && (
        <PassageEditModal passage={passageEdit} poolTeams={poolTeams} onClose={() => setPassageEdit(null)} />
      )}
    </BrutalCard>
  );
}

// ─── Grid editor: one cell per role, filled by hand ───────────────────

function PoolGridEditor({
  pool,
  teams,
  otherPools,
  teamById,
  onDone,
}: {
  pool: PoolDetails;
  teams: Team[];
  otherPools: PoolDetails[];
  teamById: Map<string, Team>;
  onDone: () => void;
}) {
  const saved = useMemo(() => gridOf(pool), [pool]);
  const [grid, setGrid] = useState<PoolGrid>(saved);
  const [picking, setPicking] = useState<{ slot: number; role: Role } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { run, busy, error } = useAction(TOURNAMENT_QUERIES);

  // Teams of the day already used in another pool of the day (drawn or draft)
  const takenElsewhere = useMemo(() => {
    const taken = new Map<string, string>();
    for (const other of otherPools) {
      const ids = other.draft
        ? other.draft.passages.flatMap(teamsOfRow)
        : other.passages.flatMap((p) => [p.defenderTeamId, p.opponentTeamId, p.reporterTeamId, p.extraTeamId]);
      for (const id of ids) if (id) taken.set(id, other.label);
    }
    return taken;
  }, [otherPools]);

  const problems = gridProblems(grid, takenElsewhere);
  const missing = missingCells(grid);
  const dirty = JSON.stringify(grid) !== JSON.stringify(saved);
  const defendersSet = grid.passages.every((p) => p.defenderTeamId !== null);
  const quad = (id: string | null) => (id ? teamById.get(id)?.quadrigram ?? "?" : null);

  const save = async () => {
    const result = await run(() => savePool(pool.id, grid));
    if (result) onDone();
  };

  const remove = async () => {
    setConfirmDelete(false);
    const done = await run(() => deletePool(pool.id));
    if (done !== undefined) onDone();
  };

  const roles: Role[] = grid.size === 4
    ? ["defenderTeamId", "opponentTeamId", "reporterTeamId", "extraTeamId"]
    : ["defenderTeamId", "opponentTeamId", "reporterTeamId"];

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="brutal-table">
          <thead>
            <tr>
              <th className="col-tight">#</th>
              <th className="col-tight">Pb</th>
              {roles.map((role) => <th key={role} className="col-tight">{ROLE_LABEL[role].slice(0, 3).toUpperCase()}</th>)}
              <th style={{ borderRight: "none" }}>Salle</th>
            </tr>
          </thead>
          <tbody>
            {grid.passages.map((p) => (
              <tr key={p.slot}>
                <td className="col-tight">
                  <span className="font-mont text-xs" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>P{p.slot}</span>
                </td>
                <td className="col-tight">
                  <Select
                    value={p.problemNumber}
                    aria-label={`Problème du passage ${p.slot}`}
                    onChange={(e) => setGrid(setPassage(grid, p.slot, "problemNumber", Number(e.target.value)))}
                    style={{ width: "5.5rem" }}
                  >
                    {QUALIFS_PROBLEMS.map((n) => <option key={n} value={n}>P{n}</option>)}
                  </Select>
                </td>
                {roles.map((role) => (
                  <td key={role} className="col-tight">
                    <CellButton
                      label={`${ROLE_LABEL[role]} du passage ${p.slot}`}
                      quad={quad(p[role])}
                      role={role}
                      onClick={() => setPicking({ slot: p.slot, role })}
                    />
                  </td>
                ))}
                <td style={{ borderRight: "none" }}>
                  <Input
                    value={p.room ?? ""}
                    placeholder="Salle"
                    aria-label={`Salle du passage ${p.slot}`}
                    onChange={(e) => setGrid(setPassage(grid, p.slot, "room", e.target.value || null))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-4 space-y-3" style={{ borderTop: "1px solid var(--border)" }}>
        {error && <Alert>{error}</Alert>}
        {problems.length > 0 && (
          <Alert tone="warning" title="À corriger avant d'enregistrer">
            <ul className="list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </Alert>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <Btn size="sm" disabled={!dirty || busy || problems.length > 0} onClick={save}>
            {busy ? "Enregistrement…" : missing > 0 ? "Enregistrer le brouillon" : "Enregistrer"}
          </Btn>
          <Btn variant="ghost" size="sm" disabled={busy} onClick={() => { setGrid(saved); onDone(); }}>
            Annuler
          </Btn>
          <Btn
            variant="ghost"
            size="sm"
            disabled={!defendersSet || busy}
            title="À partir des défenseurs choisis, remplit opposant, rapporteur et observateur en suivant la rotation"
            onClick={() => setGrid(fillRotation(grid, rotationTeams(grid)))}
          >
            Compléter la rotation
          </Btn>
          <span className="font-mont text-micro uppercase tracking-widest ml-auto" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
            {missing > 0 ? `${missing} case${missing > 1 ? "s" : ""} à remplir` : "Poule complète"}
          </span>
          <Btn variant="danger" size="sm" disabled={busy} onClick={() => setConfirmDelete(true)}>Supprimer la poule</Btn>
        </div>
        <p className="font-open text-xs" style={{ color: "var(--ink-faint)" }}>
          {isComplete(grid)
            ? "Enregistrer crée les passages de la poule ; les duos déjà attribués sont conservés."
            : "Une poule incomplète est gardée en brouillon : elle n'apparaît ni chez les jurés ni dans les notes tant qu'il manque une équipe."}
        </p>
      </div>

      {picking && (
        <TeamPicker
          teams={teams}
          takenElsewhere={takenElsewhere}
          usedInPassage={new Set(teamsOfRow(grid.passages.find((p) => p.slot === picking.slot) as GridPassage))}
          current={grid.passages.find((p) => p.slot === picking.slot)?.[picking.role] ?? null}
          title={`${ROLE_LABEL[picking.role]} · passage ${picking.slot}`}
          onPick={(teamId) => {
            setGrid(setCell(grid, picking.slot, picking.role, teamId));
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}

      <Modal
        open={confirmDelete}
        title={`Supprimer la poule ${pool.label} ?`}
        onClose={() => setConfirmDelete(false)}
        width="min(30rem, calc(100vw - 2rem))"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setConfirmDelete(false)}>Non</Btn>
            <Btn variant="danger" onClick={remove}>Supprimer</Btn>
          </>
        }
      >
        <p className="px-5 py-4 font-open text-sm" style={{ color: "var(--ink)" }}>
          Ses passages et les duos qui leur sont attribués seront supprimés ; les équipes redeviennent libres pour une
          autre poule. Impossible si un de ses passages est déjà noté.
        </p>
      </Modal>
    </div>
  );
}

function CellButton({ label, quad, role, onClick }: { label: string; quad: string | null; role: Role; onClick: () => void }) {
  const palette = role === "defenderTeamId" ? ROLE_PALETTE.defender
    : role === "opponentTeamId" ? ROLE_PALETTE.opponent
    : role === "reporterTeamId" ? ROLE_PALETTE.reporter
    : ROLE_PALETTE.extra;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="font-mont text-xs px-2 py-1 w-full text-left transition-colors hover-row"
      style={{
        background: quad && role === "defenderTeamId" ? palette.bg : "transparent",
        color: quad ? (role === "defenderTeamId" ? palette.fg : "var(--forest)") : "var(--ink-faint)",
        border: quad ? `1px solid ${palette.bg}` : "1px dashed var(--border)",
        fontWeight: 800,
        letterSpacing: "0.05em",
      }}
    >
      {quad ?? "+ Choisir"}
    </button>
  );
}

function TeamPicker({
  teams,
  takenElsewhere,
  usedInPassage,
  current,
  title,
  onPick,
  onClose,
}: {
  teams: Team[];
  takenElsewhere: Map<string, string>;
  usedInPassage: Set<string>;
  current: string | null;
  title: string;
  onPick: (teamId: string | null) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      width="min(32rem, calc(100vw - 2rem))"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
          {current && <Btn variant="danger" onClick={() => onPick(null)}>Vider la case</Btn>}
        </>
      }
    >
      <ul className="striped-rows">
        {teams.map((team) => {
          const elsewhere = takenElsewhere.get(team.id);
          const here = team.id !== current && usedInPassage.has(team.id);
          const disabled = Boolean(elsewhere) || here;
          return (
            <li key={team.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(team.id)}
                className="w-full px-5 py-2.5 flex items-center gap-3 text-left hover-row disabled:opacity-50"
                style={{ cursor: disabled ? "not-allowed" : "pointer" }}
              >
                <span className="font-mont text-sm" style={{ color: "var(--forest)", fontWeight: 900 }}>{team.quadrigram}</span>
                <span className="font-open text-sm truncate" style={{ color: "var(--ink)" }}>{team.name}</span>
                {team.id === current && <Badge tone="sage">Choisie</Badge>}
                {elsewhere && <span className="ml-auto"><Badge tone="neutral">Poule {elsewhere}</Badge></span>}
                {here && <span className="ml-auto"><Badge tone="neutral">Déjà dans ce passage</Badge></span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
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
