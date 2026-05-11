import type { JuryAssignment, JuryMember, JuryPassageAssignment, Passage, ReportType, Team } from "@/types";
import { getAll, setAll } from "../storage";
import { getPassageById } from "./poolRepository";
import { getTeamById } from "./teamRepository";

export function getJuryMembers(): JuryMember[] {
  return getAll("juryMembers") as JuryMember[];
}

export function getJuryMemberById(id: string): JuryMember | undefined {
  return getJuryMembers().find(j => j.id === id);
}

export function upsertJuryMember(member: JuryMember): void {
  const all = getJuryMembers();
  const idx = all.findIndex(j => j.id === member.id);
  if (idx === -1) {
    setAll("juryMembers", [...all, member]);
  } else {
    const updated = [...all];
    updated[idx] = member;
    setAll("juryMembers", updated);
  }
}

export function deleteJuryMember(id: string): void {
  setAll("juryMembers", getJuryMembers().filter(j => j.id !== id));
}

export function getJuryAssignments(): JuryAssignment[] {
  return getAll("juryAssignments") as JuryAssignment[];
}

export function getTeamsAssignedToJuror(juryMemberId: string, reportType: ReportType): Team[] {
  const assignments = getJuryAssignments().filter(
    a => a.juryMemberId === juryMemberId && a.reportType === reportType
  );
  return assignments.map(a => getTeamById(a.teamId)).filter(Boolean) as Team[];
}

export function getJuryPassageAssignments(): JuryPassageAssignment[] {
  return getAll("juryPassageAssignments") as JuryPassageAssignment[];
}

export function getPassagesAssignedToJuror(juryMemberId: string): Passage[] {
  const assignments = getJuryPassageAssignments().filter(
    a => a.juryMemberId === juryMemberId
  );
  return assignments.map(a => getPassageById(a.passageId)).filter(Boolean) as Passage[];
}