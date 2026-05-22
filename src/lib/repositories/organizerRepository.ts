import type { Organizer, OrganizerRole } from "@/types";
import { getAll, setAll } from "../storage";

export function getOrganizers(): Organizer[] {
  return getAll("organizers") as Organizer[];
}

export function getOrganizerById(id: string): Organizer | undefined {
  return getOrganizers().find(o => o.id === id);
}

export function getOrganizersByRole(role: OrganizerRole): Organizer[] {
  return getOrganizers().filter(o => o.role === role);
}

export function upsertOrganizer(organizer: Organizer): void {
  const all = getOrganizers();
  const idx = all.findIndex(o => o.id === organizer.id);
  if (idx === -1) {
    setAll("organizers", [...all, organizer]);
  } else {
    const updated = [...all];
    updated[idx] = organizer;
    setAll("organizers", updated);
  }
}

export function deleteOrganizer(id: string): void {
  setAll("organizers", getOrganizers().filter(o => o.id !== id));
}
