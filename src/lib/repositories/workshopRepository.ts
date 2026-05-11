import type { Workshop, WorkshopAssignment, WorkshopPreference } from "@/types";
import { getAll, setAll } from "../storage";

export function getWorkshops(): Workshop[] {
  return getAll("workshops") as Workshop[];
}

export function upsertWorkshop(workshop: Workshop): void {
  const all = getWorkshops();
  const idx = all.findIndex(w => w.id === workshop.id);
  if (idx === -1) {
    setAll("workshops", [...all, workshop]);
  } else {
    const updated = [...all];
    updated[idx] = workshop;
    setAll("workshops", updated);
  }
}

export function getWorkshopPreference(participantId: string): WorkshopPreference | undefined {
  return (getAll("workshopPreferences") as WorkshopPreference[])
    .find(p => p.participantId === participantId);
}

export function upsertWorkshopPreference(pref: WorkshopPreference): void {
  const all = getAll("workshopPreferences") as WorkshopPreference[];
  const idx = all.findIndex(p => p.participantId === pref.participantId);
  if (idx === -1) {
    setAll("workshopPreferences", [...all, pref]);
  } else {
    const updated = [...all];
    updated[idx] = pref;
    setAll("workshopPreferences", updated);
  }
}

export function getWorkshopAssignment(participantId: string): WorkshopAssignment | undefined {
  return (getAll("workshopAssignments") as WorkshopAssignment[])
    .find(a => a.participantId === participantId);
}

export function upsertWorkshopAssignment(assignment: WorkshopAssignment): void {
  const all = getAll("workshopAssignments") as WorkshopAssignment[];
  const idx = all.findIndex(a => a.participantId === assignment.participantId);
  if (idx === -1) {
    setAll("workshopAssignments", [...all, assignment]);
  } else {
    const updated = [...all];
    updated[idx] = assignment;
    setAll("workshopAssignments", updated);
  }
}

export function deleteWorkshop(id: string): void {
  setAll("workshops", getWorkshops().filter(w => w.id !== id));
}

export function deleteWorkshopPreference(participantId: string): void {
  setAll("workshopPreferences",
    (getAll("workshopPreferences") as WorkshopPreference[])
      .filter(p => p.participantId !== participantId)
  );
}

export function deleteWorkshopAssignment(participantId: string): void {
  setAll("workshopAssignments",
    (getAll("workshopAssignments") as WorkshopAssignment[])
      .filter(a => a.participantId !== participantId)
  );
}