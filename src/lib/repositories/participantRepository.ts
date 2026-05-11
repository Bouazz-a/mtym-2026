import type { Participant } from "@/types";
import { getAll, setAll } from "../storage";

export function getParticipants(): Participant[] {
  return getAll("participants") as Participant[];
}

export function getParticipantById(id: string): Participant | undefined {
  return getParticipants().find(p => p.id === id);
}

export function getParticipantsByTeam(teamId: string): Participant[] {
  return getParticipants().filter(p => p.teamId === teamId);
}

export function upsertParticipant(participant: Participant): void {
  const all = getParticipants();
  const idx = all.findIndex(p => p.id === participant.id);
  if (idx === -1) {
    setAll("participants", [...all, participant]);
  } else {
    const updated = [...all];
    updated[idx] = participant;
    setAll("participants", updated);
  }
}

export function deleteParticipant(id: string): void {
  setAll("participants", getParticipants().filter(p => p.id !== id));
}