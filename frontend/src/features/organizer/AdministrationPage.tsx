import { useEffect, useMemo, useRef, useState } from "react";
import {
  PageHeader,
  BrutalCard,
  SectionHeading,
  Badge,
  Modal,
  Field,
  Input,
  Btn,
  PageMotion,
  StaggerRow,
} from "@/features/shared/primitives";
import { ROLE_PALETTE } from "@/features/shared/widgets";
import {
  getPools,
  getPassages,
  upsertPassage,
  deletePassage,
} from "@/lib/repositories/poolRepository";
import { getTeams, upsertTeam } from "@/lib/repositories/teamRepository";
import {
  getParticipants,
  getParticipantsByTeam,
} from "@/lib/repositories/participantRepository";
import {
  getJuryMembers,
  getJuryAssignments,
  upsertJuryAssignment,
  deleteJuryAssignment,
} from "@/lib/repositories/juryRepository";
import type {
  JuryAssignment,
  JuryMember,
  Participant,
  Passage,
  Pool,
  ReportType,
  Team,
} from "@/types";
import { CriteriaEditor } from "./CriteriaEditor";
import { useSession } from "@/features/shared/SessionContext";
import { isAdmin } from "@/lib/permissions";
import { exportAppDataXlsx } from "@/lib/services/exportService";
import { getPoolDisplayLabel } from "@/utils/naming";

// AdministrationPage — manual editors that complement the auto-generation
// flows. Three sub-sections:
//
//   · Pools & passages — edit any passage's defender/opponent/reporter/
//                        extra, problem number, day, time, room.
//   · Équipes          — inline edit name, quadrigramme, creator transfer,
//                        and the two pool assignments.
//   · Affectations jury— matrix toggle (RI / RF / both / none) per
//                        (juror × team) pair.

type TabId = "pools" | "teams" | "jury" | "criteria";

export function AdministrationPage() {
  const { session } = useSession();
  const [tab, setTab] = useState<TabId>("pools");
  const [version, setVersion] = useState(0);
  const [exporting, setExporting] = useState(false);
  const refresh = () => setVersion((v) => v + 1);

  const canExport =
    session?.role === "organizer" && isAdmin(session.organizer);

  const handleExport = () => {
    setExporting(true);
    try {
      exportAppDataXlsx();
    } finally {
      // The download is synchronous; clear the flag on the next tick so the
      // button briefly shows the busy state.
      setTimeout(() => setExporting(false), 400);
    }
  };

  return (
    <PageMotion>
      <PageHeader
        eyebrow="Administration"
        title="Édition manuelle"
        sub="Ajuster les pools, les équipes, les affectations jury et le barème."
        right={
          canExport ? (
            <Btn onClick={handleExport} disabled={exporting} size="sm">
              {exporting ? "Export en cours…" : "↓ Exporter XLSX"}
            </Btn>
          ) : undefined
        }
      />

      <Tabs current={tab} onChange={setTab} />

      <div className="mt-8 space-y-10">
        {tab === "pools" && <PoolsEditor key={version} onChange={refresh} />}
        {tab === "teams" && <TeamsEditor key={version} />}
        {tab === "jury" && <JuryMatrixEditor key={version} />}
        {tab === "criteria" && <CriteriaEditor key={version} />}
      </div>
    </PageMotion>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────

function Tabs({
  current,
  onChange,
}: {
  current: TabId;
  onChange: (t: TabId) => void;
}) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "pools", label: "Poules & passages" },
    { id: "teams", label: "Équipes" },
    { id: "jury", label: "Affectations jury" },
    { id: "criteria", label: "Critères" },
  ];
  return (
    <div
      className="flex gap-1"
      role="tablist"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {tabs.map((t) => {
        const active = t.id === current;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className="px-4 py-2 font-mont text-tiny uppercase tracking-[0.16em] transition-colors"
            style={{
              color: active ? "var(--forest)" : "var(--ink-faint)",
              fontWeight: active ? 900 : 700,
              borderBottom: active
                ? "2px solid var(--saffron)"
                : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Pools & passages
// ════════════════════════════════════════════════════════════════════════

function PoolsEditor({ onChange }: { onChange: () => void }) {
  const pools = useMemo(
    () => getPools().sort((a, b) => a.label.localeCompare(b.label)),
    [],
  );
  const passages = useMemo(() => getPassages(), []);
  const teams = useMemo(() => getTeams(), []);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const r1 = pools.filter((p) => p.round === 1);
  const r2 = pools.filter((p) => p.round === 2);

  const [editing, setEditing] = useState<Passage | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Passage | null>(null);

  return (
    <>
      {[
        { label: "Tour 1", list: r1 },
        { label: "Tour 2", list: r2 },
      ].map((group) => (
        <section key={group.label}>
          <SectionHeading
            title={group.label}
            right={
              <span
                className="font-mont text-tiny uppercase tracking-widest"
                style={{ color: "var(--ink-faint)", fontWeight: 700 }}
              >
                {group.list.length} poule{group.list.length > 1 ? "s" : ""} ·{" "}
                {
                  passages.filter((p) =>
                    group.list.some((po) => po.id === p.poolId),
                  ).length
                }{" "}
                passages
              </span>
            }
          />
          {group.list.length === 0 ? (
            <BrutalCard
              className="p-6"
              style={{ border: "2px dashed var(--border)", boxShadow: "none" }}
              withCorners={false}
            >
              <p
                className="font-open text-sm italic"
                style={{ color: "var(--ink-faint)" }}
              >
                Aucune poule générée pour ce tour.
              </p>
            </BrutalCard>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {group.list.map((pool) => {
                const poolPassages = passages
                  .filter((p) => p.poolId === pool.id)
                  .sort((a, b) => a.label.localeCompare(b.label));
                return (
                  <BrutalCard key={pool.id} className="overflow-hidden">
                    <div
                      className="w-full px-5 py-4 flex items-center justify-between gap-3"
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background:
                          pool.round === 1
                            ? "rgba(98,159,115,0.08)"
                            : "rgba(246,168,6,0.06)",
                      }}
                    >
                      <h3
                        className="font-mont"
                        style={{
                          color: "var(--forest)",
                          fontWeight: 900,
                          fontSize: "1.15rem",
                        }}
                      >
                        {getPoolDisplayLabel(pool)}
                      </h3>
                      <Badge tone="neutral">
                        {poolPassages.length} passages
                      </Badge>
                    </div>

                    <ul
                      className="divide-y"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {poolPassages.map((p, i) => (
                        <StaggerRow as="li" index={i} key={p.id}>
                          <PassageRow
                            passage={p}
                            teamById={teamById}
                            onEdit={() => setEditing(p)}
                            onDelete={() => setConfirmDelete(p)}
                          />
                        </StaggerRow>
                      ))}
                    </ul>
                  </BrutalCard>
                );
              })}
            </div>
          )}
        </section>
      ))}

      {editing && (
        <PassageEditModal
          passage={editing}
          teams={teams}
          pools={pools}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChange();
          }}
        />
      )}

      {confirmDelete && (
        <Modal
          open
          title="Supprimer ce passage ?"
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setConfirmDelete(null)}>
                Annuler
              </Btn>
              <Btn
                variant="danger"
                onClick={() => {
                  deletePassage(confirmDelete.id);
                  setConfirmDelete(null);
                  onChange();
                }}
              >
                Supprimer
              </Btn>
            </>
          }
        >
          <p className="font-open text-sm" style={{ color: "var(--ink)" }}>
            Le passage <strong>{confirmDelete.label}</strong> sera retiré de la
            base. Cette opération est irréversible.
          </p>
        </Modal>
      )}
    </>
  );
}

function PassageRow({
  passage,
  teamById,
  onEdit,
  onDelete,
}: {
  passage: Passage;
  teamById: Map<string, Team>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const def = teamById.get(passage.defenderTeamId)?.quadrigramme ?? "—";
  const opp = teamById.get(passage.opponentTeamId)?.quadrigramme ?? "—";
  const rap = teamById.get(passage.reporterTeamId)?.quadrigramme ?? "—";
  const ex = passage.extraTeamId
    ? (teamById.get(passage.extraTeamId)?.quadrigramme ?? "—")
    : null;

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover-row">
      <div className="flex items-center gap-4 min-w-0">
        <span
          className="font-mont text-xs"
          style={{ color: "var(--ink-faint)", fontWeight: 800, minWidth: 48 }}
        >
          {passage.label}
        </span>
        <span
          className="font-mont"
          style={{
            color: "var(--saffron-dark)",
            fontWeight: 900,
            minWidth: 28,
          }}
        >
          P{passage.problemNumber}
        </span>
        <div className="flex items-center gap-1 flex-wrap">
          <RolePill label="DEF" q={def} role="defender" />
          <RolePill label="OPP" q={opp} role="opponent" />
          <RolePill label="RAP" q={rap} role="reporter" />
          {ex && <RolePill label="EX" q={ex} role="extra" />}
        </div>
        <span
          className="font-mont text-micro uppercase tracking-widest"
          style={{ color: "var(--ink-soft)", fontWeight: 700 }}
        >
          {[passage.day, passage.timeSlot, passage.room]
            .filter(Boolean)
            .join(" · ") || "—"}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Btn variant="ghost" size="sm" onClick={onEdit}>
          Éditer
        </Btn>
        <Btn variant="danger" size="sm" onClick={onDelete}>
          ×
        </Btn>
      </div>
    </div>
  );
}

function RolePill({
  label,
  q,
  role,
}: {
  label: string;
  q: string;
  role: "defender" | "opponent" | "reporter" | "extra";
}) {
  const meta = ROLE_PALETTE[role];
  return (
    <span
      className="font-mont text-micro uppercase tracking-widest px-1.5 py-0.5"
      style={{ background: meta.bg, color: meta.fg, fontWeight: 800 }}
    >
      {label} {q}
    </span>
  );
}

// ─── Passage edit modal ───────────────────────────────────────────────

function PassageEditModal({
  passage,
  teams,
  pools,
  onClose,
  onSaved,
}: {
  passage: Passage;
  teams: Team[];
  pools: Pool[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Passage>(passage);
  void pools;

  const sortedTeams = useMemo(
    () =>
      [...teams].sort((a, b) => a.quadrigramme.localeCompare(b.quadrigramme)),
    [teams],
  );

  const set = <K extends keyof Passage>(key: K, value: Passage[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Hard guard: the four role slots must be distinct (except extra may
  // be absent).
  const conflict = (() => {
    const ids = [
      draft.defenderTeamId,
      draft.opponentTeamId,
      draft.reporterTeamId,
    ];
    if (draft.extraTeamId) ids.push(draft.extraTeamId);
    return new Set(ids).size !== ids.length;
  })();

  const handleSave = () => {
    if (conflict) return;
    upsertPassage(draft);
    onSaved();
  };

  return (
    <Modal
      open
      title={`Éditer le passage ${passage.label}`}
      onClose={onClose}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Annuler
          </Btn>
          <Btn onClick={handleSave} disabled={conflict}>
            Enregistrer
          </Btn>
        </>
      }
    >
      {conflict && (
        <p
          className="font-open text-xs mb-4 px-3 py-2"
          style={{ background: "rgba(178,59,27,0.08)", color: "var(--clay)" }}
        >
          Une équipe ne peut pas occuper deux rôles dans le même passage.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Défense">
          <TeamSelect
            teams={sortedTeams}
            value={draft.defenderTeamId}
            onChange={(v) => set("defenderTeamId", v)}
          />
        </Field>
        <Field label="Opposition">
          <TeamSelect
            teams={sortedTeams}
            value={draft.opponentTeamId}
            onChange={(v) => set("opponentTeamId", v)}
          />
        </Field>
        <Field label="Rapport">
          <TeamSelect
            teams={sortedTeams}
            value={draft.reporterTeamId}
            onChange={(v) => set("reporterTeamId", v)}
          />
        </Field>
        <Field label="Extra (optionnel)">
          <TeamSelect
            teams={sortedTeams}
            value={draft.extraTeamId ?? ""}
            onChange={(v) => set("extraTeamId", v || undefined)}
            allowNone
          />
        </Field>

        <Field label="Problème (n°)">
          <Input
            type="number"
            min={1}
            max={5}
            value={draft.problemNumber}
            onChange={(e) => set("problemNumber", Number(e.target.value) || 1)}
          />
        </Field>
        <Field label="Jour (DD-MM-YYYY)">
          <Input
            value={draft.day ?? ""}
            placeholder="14-06-2026"
            onChange={(e) => set("day", e.target.value || undefined)}
          />
        </Field>
        <Field label="Horaire">
          <Input
            value={draft.timeSlot ?? ""}
            placeholder="09:00"
            onChange={(e) => set("timeSlot", e.target.value || undefined)}
          />
        </Field>
        <Field label="Amphi / salle">
          <Input
            value={draft.room ?? ""}
            placeholder="Salle 101"
            onChange={(e) => set("room", e.target.value || undefined)}
          />
        </Field>
      </div>
    </Modal>
  );
}

function TeamSelect({
  teams,
  value,
  onChange,
  allowNone = false,
}: {
  teams: Team[];
  value: string;
  onChange: (v: string) => void;
  allowNone?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 text-sm font-mont focus-ring"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        color: "var(--ink)",
      }}
    >
      {allowNone && <option value="">— Aucune —</option>}
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.quadrigramme} · {t.name}
        </option>
      ))}
    </select>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Teams editor
// ════════════════════════════════════════════════════════════════════════

function TeamsEditor() {
  // Self-managed so a save refreshes the picker (updated quad/name) without
  // remounting the whole editor and losing the current selection.
  const sortTeams = (list: Team[]) =>
    [...list].sort((a, b) => a.quadrigramme.localeCompare(b.quadrigramme));
  const [teams, setTeams] = useState<Team[]>(() => sortTeams(getTeams()));
  const pools = useMemo(() => getPools(), []);
  const participants = useMemo(() => getParticipants(), []);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = teams.find((t) => t.id === selectedId) ?? null;

  const reload = () => setTeams(sortTeams(getTeams()));

  return (
    <section>
      <SectionHeading
        title="Équipes"
        right={
          <span
            className="font-mont text-tiny uppercase tracking-widest"
            style={{ color: "var(--ink-faint)", fontWeight: 700 }}
          >
            {teams.length} équipe{teams.length > 1 ? "s" : ""}
          </span>
        }
      />

      <div className="mb-6 max-w-md">
        <div
          className="font-mont text-tiny uppercase tracking-widest mb-2"
          style={{ color: "var(--ink-faint)", fontWeight: 800 }}
        >
          Équipe à modifier
        </div>
        <TeamPicker
          teams={teams}
          selected={selected}
          onSelect={(id) => setSelectedId(id)}
        />
      </div>

      {selected ? (
        <TeamEditCard
          key={selected.id}
          team={selected}
          pools={pools}
          participants={participants}
          onSaved={reload}
        />
      ) : (
        <TeamCardPlaceholder />
      )}
    </section>
  );
}

// Searchable team selector (filters by quadrigramme or name).
function TeamPicker({
  teams,
  selected,
  onSelect,
}: {
  teams: Team[];
  selected: Team | null;
  onSelect: (id: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? teams.filter(
        (t) =>
          t.quadrigramme.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q),
      )
    : teams;

  const pick = (id: string) => {
    onSelect(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative" ref={boxRef}>
      <input
        value={open ? query : selected ? `${selected.quadrigramme} · ${selected.name}` : ""}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && filtered.length > 0) {
            e.preventDefault();
            pick(filtered[0].id);
          }
        }}
        placeholder="Rechercher une équipe (quadrigramme ou nom)…"
        className="w-full px-3 py-2 text-sm font-mont focus-ring"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--ink)",
        }}
      />
      {open && (
        <div
          className="absolute left-0 right-0 mt-1 z-30 max-h-72 overflow-auto"
          style={{
            background: "var(--surface)",
            border: "2px solid var(--forest)",
            boxShadow: "4px 4px 0 0 var(--forest)",
          }}
        >
          {filtered.length === 0 ? (
            <div
              className="px-3 py-3 font-mont text-tiny uppercase tracking-widest"
              style={{ color: "var(--ink-faint)", fontWeight: 700 }}
            >
              Aucune équipe trouvée
            </div>
          ) : (
            filtered.map((t) => {
              const active = selected?.id === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => pick(t.id)}
                  className="w-full text-left px-3 py-2 flex items-center gap-3 transition-colors hover-row"
                  style={{
                    borderBottom: "1px solid var(--border)",
                    background: active ? "rgba(246,168,6,0.10)" : "transparent",
                  }}
                >
                  <span
                    className="font-mont"
                    style={{
                      color: "var(--saffron-dark)",
                      fontWeight: 900,
                      letterSpacing: "0.06em",
                      minWidth: 52,
                    }}
                  >
                    {t.quadrigramme}
                  </span>
                  <span
                    className="font-open text-sm truncate"
                    style={{ color: "var(--ink)" }}
                  >
                    {t.name}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// Placeholder shown until a team is picked — mirrors the editor card
// layout so the section never collapses to a bare dropdown.
function TeamCardPlaceholder() {
  return (
    <BrutalCard
      className="p-5"
      withCorners={false}
      style={{ borderStyle: "dashed", boxShadow: "none" }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[140px_1fr] gap-6">
        <div>
          <div
            className="font-mont text-micro uppercase tracking-widest"
            style={{ color: "var(--ink-faint)", fontWeight: 800 }}
          >
            Identifiant
          </div>
          <div
            className="font-mont"
            style={{
              color: "var(--ink-faint)",
              fontWeight: 900,
              fontSize: "1.8rem",
              letterSpacing: "0.08em",
              opacity: 0.4,
            }}
          >
            ————
          </div>
        </div>
        <div className="flex flex-col justify-center">
          <div
            className="font-mont"
            style={{ color: "var(--forest)", fontWeight: 900, fontSize: "1.05rem" }}
          >
            Sélectionnez une équipe
          </div>
          <p
            className="font-open text-sm mt-1"
            style={{ color: "var(--ink-soft)", maxWidth: "32rem" }}
          >
            Utilisez la recherche ci-dessus pour ouvrir la fiche d'une équipe
            (nom, quadrigramme, créateur, poules) et la modifier.
          </p>
        </div>
      </div>
    </BrutalCard>
  );
}

function TeamEditCard({
  team,
  pools,
  participants,
  onSaved,
}: {
  team: Team;
  pools: Pool[];
  participants: Participant[];
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Team>(team);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const members = useMemo(() => getParticipantsByTeam(team.id), [team.id]);

  // Reset internal state if the canonical team prop changes (e.g. after
  // an external re-seed).
  const [prevTeamId, setPrevTeamId] = useState(team.id);
  if (prevTeamId !== team.id) {
    setPrevTeamId(team.id);
    setDraft(team);
    setError(null);
    setSaved(false);
  }

  const r1Pools = pools.filter((p) => p.round === 1);
  const r2Pools = pools.filter((p) => p.round === 2);

  const dirty =
    draft.name !== team.name ||
    draft.quadrigramme !== team.quadrigramme ||
    draft.creatorId !== team.creatorId ||
    draft.poolIdRound1 !== team.poolIdRound1 ||
    draft.poolIdRound2 !== team.poolIdRound2;

  const validQuad = /^[A-Z]{4}$/.test(draft.quadrigramme);

  const handleSave = () => {
    setError(null);
    if (!validQuad) {
      setError("Le quadrigramme doit faire exactement 4 lettres majuscules.");
      return;
    }
    const dup = getTeams().some(
      (t) => t.id !== draft.id && t.quadrigramme === draft.quadrigramme,
    );
    if (dup) {
      setError(`Le quadrigramme ${draft.quadrigramme} est déjà utilisé.`);
      return;
    }
    upsertTeam(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onSaved();
  };

  // Restrict the "creator" select to participants currently in this team.
  const teamMembers = participants.filter((p) => p.teamId === team.id);

  return (
    <BrutalCard className="p-5" hoverable>
      <div className="grid grid-cols-1 lg:grid-cols-[140px_1fr] gap-6">
        <div>
          <div
            className="font-mont text-micro uppercase tracking-widest"
            style={{ color: "var(--ink-faint)", fontWeight: 800 }}
          >
            Identifiant
          </div>
          <div
            className="font-mont"
            style={{
              color: "var(--saffron)",
              fontWeight: 900,
              fontSize: "1.8rem",
              letterSpacing: "0.08em",
            }}
          >
            {team.quadrigramme}
          </div>
          <div
            className="font-mont text-micro uppercase tracking-widest mt-3"
            style={{ color: "var(--ink-faint)", fontWeight: 700 }}
          >
            {members.length} membre{members.length > 1 ? "s" : ""}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Nom d'équipe">
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field
            label="Quadrigramme (4 majuscules)"
            error={!validQuad ? "Format invalide" : undefined}
          >
            <Input
              value={draft.quadrigramme}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  quadrigramme: e.target.value.toUpperCase().slice(0, 4),
                })
              }
            />
          </Field>

          <Field label="Créateur · Tag créateur">
            <select
              value={draft.creatorId}
              onChange={(e) =>
                setDraft({ ...draft, creatorId: e.target.value })
              }
              className="w-full px-3 py-2 text-sm font-mont focus-ring"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--ink)",
              }}
            >
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.firstName} {m.lastName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Poule · Tour 1">
            <PoolSelect
              pools={r1Pools}
              value={draft.poolIdRound1}
              onChange={(v) => setDraft({ ...draft, poolIdRound1: v })}
            />
          </Field>

          <Field label="Poule · Tour 2 (optionnel)">
            <PoolSelect
              pools={r2Pools}
              value={draft.poolIdRound2 ?? ""}
              onChange={(v) =>
                setDraft({ ...draft, poolIdRound2: v || undefined })
              }
              allowNone
            />
          </Field>

          <div className="flex items-end justify-end gap-2">
            {saved && (
              <span
                className="font-mont text-tiny uppercase tracking-widest"
                style={{ color: "var(--sage-dark)", fontWeight: 800 }}
              >
                Enregistré
              </span>
            )}
            <Btn onClick={handleSave} disabled={!dirty || !validQuad} size="sm">
              Enregistrer
            </Btn>
          </div>
        </div>
      </div>
      {error && (
        <div
          className="mt-3 px-3 py-2 font-open text-xs"
          style={{ background: "rgba(178,59,27,0.08)", color: "var(--clay)" }}
        >
          {error}
        </div>
      )}
    </BrutalCard>
  );
}

function PoolSelect({
  pools,
  value,
  onChange,
  allowNone = false,
}: {
  pools: Pool[];
  value: string;
  onChange: (v: string) => void;
  allowNone?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 text-sm font-mont focus-ring"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        color: "var(--ink)",
      }}
    >
      {allowNone && <option value="">— Aucune —</option>}
      {pools.map((p) => (
        <option key={p.id} value={p.id}>
          {getPoolDisplayLabel(p)}
        </option>
      ))}
    </select>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Jury assignment matrix
// ════════════════════════════════════════════════════════════════════════

type CellState = "none" | "intermediaire" | "final" | "both";

function readCell(
  assignments: JuryAssignment[],
  juryId: string,
  teamId: string,
): CellState {
  const matching = assignments.filter(
    (a) => a.juryMemberId === juryId && a.teamId === teamId,
  );
  const hasI = matching.some((a) => a.reportType === "intermediaire");
  const hasF = matching.some((a) => a.reportType === "final");
  if (hasI && hasF) return "both";
  if (hasI) return "intermediaire";
  if (hasF) return "final";
  return "none";
}

// Cycle: none -> RI -> RF -> both -> none
function nextCell(state: CellState): CellState {
  return state === "none"
    ? "intermediaire"
    : state === "intermediaire"
      ? "final"
      : state === "final"
        ? "both"
        : "none";
}

function applyCell(
  juryId: string,
  teamId: string,
  prev: CellState,
  next: CellState,
): void {
  // Compute the diff between prev and next and apply only what changed.
  const wants: Record<ReportType, boolean> = {
    intermediaire: next === "intermediaire" || next === "both",
    final: next === "final" || next === "both",
  };
  const had: Record<ReportType, boolean> = {
    intermediaire: prev === "intermediaire" || prev === "both",
    final: prev === "final" || prev === "both",
  };
  (Object.keys(wants) as ReportType[]).forEach((rt) => {
    if (wants[rt] && !had[rt]) {
      upsertJuryAssignment({ juryMemberId: juryId, teamId, reportType: rt });
    } else if (!wants[rt] && had[rt]) {
      deleteJuryAssignment({ juryMemberId: juryId, teamId, reportType: rt });
    }
  });
}

function JuryMatrixEditor() {
  const jurors = useMemo(() => getJuryMembers(), []);
  const teams = useMemo(
    () =>
      getTeams().sort((a, b) => a.quadrigramme.localeCompare(b.quadrigramme)),
    [],
  );
  const [assignments, setAssignments] = useState<JuryAssignment[]>(() =>
    getJuryAssignments(),
  );

  const toggle = (juryId: string, teamId: string) => {
    const prev = readCell(assignments, juryId, teamId);
    const next = nextCell(prev);
    applyCell(juryId, teamId, prev, next);
    // Update only this editor's own state. We deliberately do NOT call the
    // parent's onChange/refresh here: that bumps `version`, which is used as
    // this component's React `key`, remounting the whole matrix (state reset
    // + StaggerRow entrance animation replay). Local state already reflects
    // the change, so React reconciles just the clicked cell in place.
    setAssignments(getJuryAssignments());
  };

  return (
    <section>
      <SectionHeading
        title="Affectations jury"
        right={
          <span
            className="font-mont text-tiny uppercase tracking-widest"
            style={{ color: "var(--ink-faint)", fontWeight: 700 }}
          >
            Cliquer pour cycler : · RI · RF · RI+RF ·
          </span>
        }
      />

      <BrutalCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className="w-full border-collapse"
            style={{ fontFamily: "Montserrat, sans-serif" }}
          >
            <thead>
              <tr
                style={{
                  background: "var(--forest-soft)",
                  color: "var(--paper)",
                }}
              >
                <th
                  className="sticky left-0 px-3 py-3 text-left text-[11px] uppercase tracking-widest"
                  style={{
                    fontWeight: 800,
                    background: "var(--forest-soft)",
                    borderRight: "1px solid rgba(255,255,255,0.1)",
                    minWidth: 220,
                  }}
                >
                  Membre du jury
                </th>
                {teams.map((t) => (
                  <th
                    key={t.id}
                    className="px-2 py-3 text-[10px] uppercase tracking-[0.12em]"
                    style={{
                      fontWeight: 800,
                      borderRight: "1px solid rgba(255,255,255,0.08)",
                      minWidth: 64,
                    }}
                  >
                    {t.quadrigramme}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jurors.map((j, idx) => (
                <JurorMatrixRow
                  key={j.id}
                  juror={j}
                  teams={teams}
                  assignments={assignments}
                  onToggle={toggle}
                  rowIndex={idx}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div
          className="px-4 py-3 flex items-center gap-4 flex-wrap"
          style={{
            borderTop: "1px solid var(--border)",
            background: "var(--paper-2)",
          }}
        >
          <Legend />
        </div>
      </BrutalCard>
    </section>
  );
}

function JurorMatrixRow({
  juror,
  teams,
  assignments,
  onToggle,
  rowIndex,
}: {
  juror: JuryMember;
  teams: Team[];
  assignments: JuryAssignment[];
  onToggle: (juryId: string, teamId: string) => void;
  rowIndex: number;
}) {
  const initials =
    `${juror.firstName[0] ?? ""}${juror.lastName[0] ?? ""}`.toUpperCase();
  return (
    <StaggerRow index={rowIndex}>
      <td
        className="sticky left-0 px-3 py-2"
        style={{
          background:
            rowIndex % 2 ? "var(--surface)" : "rgba(240,235,220,0.45)",
          borderRight: "1px solid var(--border)",
          borderTop: "1px solid var(--border)",
          minWidth: 220,
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="flex items-center justify-center font-mont shrink-0"
            style={{
              width: 30,
              height: 30,
              background: "var(--paper-2)",
              color: "var(--forest)",
              fontWeight: 900,
              border: "1px solid var(--forest)",
              fontSize: "0.7rem",
            }}
          >
            {initials}
          </span>
          <div className="min-w-0">
            <div
              className="font-mont text-xs truncate"
              style={{ color: "var(--forest)", fontWeight: 800 }}
            >
              {juror.firstName} {juror.lastName}
            </div>
            {juror.city && (
              <div
                className="font-open text-micro"
                style={{ color: "var(--ink-soft)" }}
              >
                {juror.city}
              </div>
            )}
          </div>
        </div>
      </td>
      {teams.map((t) => {
        const state = readCell(assignments, juror.id, t.id);
        return (
          <td
            key={t.id}
            style={{
              borderRight: "1px solid var(--border)",
              borderTop: "1px solid var(--border)",
              background:
                rowIndex % 2 ? "var(--surface)" : "rgba(240,235,220,0.45)",
              padding: 0,
              textAlign: "center",
            }}
          >
            <button
              onClick={() => onToggle(juror.id, t.id)}
              className="w-full h-full px-2 py-2 transition-colors"
              style={{ cursor: "pointer" }}
              aria-label={`${juror.firstName} ${juror.lastName} - ${t.quadrigramme}: ${state}`}
              title={`${juror.firstName} ${juror.lastName} - ${t.quadrigramme}`}
            >
              <CellGlyph state={state} />
            </button>
          </td>
        );
      })}
    </StaggerRow>
  );
}

function CellGlyph({ state }: { state: CellState }) {
  if (state === "none") {
    return (
      <span
        className="font-mont text-micro"
        style={{ color: "var(--ink-faint)", fontWeight: 700 }}
      >
        ·
      </span>
    );
  }
  const palettes: Record<
    Exclude<CellState, "none">,
    { label: string; bg: string; fg: string }
  > = {
    intermediaire: {
      label: "RI",
      bg: "rgba(98,159,115,0.20)",
      fg: "var(--sage-dark)",
    },
    final: {
      label: "RF",
      bg: "rgba(246,168,6,0.18)",
      fg: "var(--saffron-dark)",
    },
    both: { label: "RI+RF", bg: "var(--forest)", fg: "var(--saffron)" },
  };
  const p = palettes[state];
  return (
    <span
      className="font-mont text-micro uppercase tracking-widest inline-block px-1.5 py-0.5"
      style={{ background: p.bg, color: p.fg, fontWeight: 900 }}
    >
      {p.label}
    </span>
  );
}

function Legend() {
  const items: { label: string; glyph: React.ReactNode }[] = [
    { label: "Non affecté", glyph: <CellGlyph state="none" /> },
    {
      label: "Intermédiaire seulement",
      glyph: <CellGlyph state="intermediaire" />,
    },
    { label: "Final seulement", glyph: <CellGlyph state="final" /> },
    { label: "Intermédiaire + Final", glyph: <CellGlyph state="both" /> },
  ];
  return (
    <>
      {items.map((it) => (
        <span
          key={it.label}
          className="flex items-center gap-2 font-mont text-micro uppercase tracking-widest"
          style={{ color: "var(--ink-soft)", fontWeight: 700 }}
        >
          {it.glyph}
          {it.label}
        </span>
      ))}
    </>
  );
}
