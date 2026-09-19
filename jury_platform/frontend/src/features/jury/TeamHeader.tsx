import { ROLE_PALETTE } from "@/features/shared/widgets";
import type { Team } from "@/types";

// Header of a grading card: the team's role in the passage and its name.
export function TeamHeader({ role, team }: { role: "defender" | "opponent" | "reporter"; team: Team | undefined }) {
  const meta = ROLE_PALETTE[role];
  return (
    <>
      <span className="font-mont text-micro uppercase tracking-widest px-2 py-0.5" style={{ background: meta.bg, color: meta.fg, fontWeight: 800 }}>
        {meta.label}
      </span>
      <div className="font-mont mt-2" style={{ color: "var(--forest)", fontWeight: 900, fontSize: "1.3rem", letterSpacing: "0.06em" }}>
        {team?.quadrigram ?? "—"}
      </div>
      <div className="font-open text-xs truncate" style={{ color: "var(--ink-soft)" }}>{team?.name ?? ""}</div>
    </>
  );
}
