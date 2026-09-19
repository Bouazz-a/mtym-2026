import type { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "../types";

// The journal of admin changes: who did what, when. Pass the route's
// transaction client when there is one, so the entry commits with the
// change it describes.

export interface AuditEntry {
  category: string; // "Tirage", "Duos"… — the journal's filter
  action: string; // machine-readable: "passage.duo"
  summary: string; // in French, e.g. "Duo 2 attribué à CAS-A1P2"
  details?: Prisma.InputJsonValue; // before/after, or what was deleted
}

export async function audit(client: Prisma.TransactionClient, user: AuthenticatedUser, entry: AuditEntry) {
  await client.auditLog.create({
    data: {
      actorId: user.id,
      actorName: `${user.firstName} ${user.lastName}`,
      actorEmail: user.email,
      ...entry,
    },
  });
}

// "Casablanca 2026-10-25" — how the journal names a center day
const CENTER_LABELS: Record<string, string> = {
  casablanca: "Casablanca",
  rabat: "Rabat",
  martil: "Martil",
  benguerir: "Benguerir",
  agadir: "Agadir",
  fez: "Fès",
  oujda: "Oujda",
  online: "En ligne",
};

export function centerName(center: string): string {
  return CENTER_LABELS[center] ?? center;
}

export function dayName(day: { center: string; date: string }): string {
  return `${centerName(day.center)} ${day.date}`;
}
