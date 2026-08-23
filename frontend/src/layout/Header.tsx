import { useSession } from "@/features/shared/SessionContext";

// Header — paper top bar with the connected-user identity on the left
// and the demo role switcher on the right. Light only for the demo.

const ROLES = [
  { value: "participant", label: "Participant" },
  { value: "jury", label: "Jury" },
  { value: "organizer", label: "Organisateur" },
] as const;

export function Header() {
  const { role, setRole, session } = useSession();

  const userName = !session
    ? "—"
    : session.role === "participant"
    ? `${session.participant.firstName} ${session.participant.lastName}`
    : session.role === "jury"
    ? `${session.juryMember.firstName} ${session.juryMember.lastName}`
    : `${session.organizer.firstName} ${session.organizer.lastName}`;

  const userSub =
    !session
      ? ""
      : session.role === "participant"
      ? `Équipe ${session.team.quadrigramme}`
      : session.role === "jury"
      ? "Membre du jury"
      : session.organizer.role === "admin"
      ? "Administrateur"
      : session.organizer.role === "scientific"
      ? "Coord. scientifique"
      : "Coord. logistique";

  return (
    <header
      style={{
        background: "var(--paper)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="px-8 lg:px-14 h-16 flex items-center justify-between max-w-[1400px] w-full mx-auto">
        <div>
          <div
            className="font-mont text-tiny uppercase tracking-widest"
            style={{ color: "var(--ink-faint)", fontWeight: 700 }}
          >
            Connecté
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span
              className="font-mont"
              style={{ color: "var(--forest)", fontWeight: 700, fontSize: "0.95rem" }}
            >
              {userName}
            </span>
            {userSub && (
              <span
                className="font-mont text-micro uppercase tracking-widest"
                style={{ color: "var(--ink-faint)", fontWeight: 600 }}
              >
                · {userSub}
              </span>
            )}
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Changer de rôle"
          className="inline-flex p-1"
          style={{
            background: "var(--paper-2)",
            border: "1px solid var(--border)",
            borderRadius: 2,
          }}
        >
          {ROLES.map(r => {
            const active = r.value === role;
            return (
              <button
                key={r.value}
                role="tab"
                aria-selected={active}
                onClick={() => setRole(r.value)}
                className="px-3.5 py-1.5 font-mont text-tiny uppercase tracking-widest transition-all duration-200"
                style={{
                  background: active ? "var(--saffron)" : "transparent",
                  color: active ? "var(--forest)" : "var(--ink-soft)",
                  fontWeight: active ? 700 : 600,
                  borderRadius: 1,
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
