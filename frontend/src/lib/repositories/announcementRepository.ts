import type { Announcement, Deadline } from "@/types";
import { getAll, setAll } from "../storage";

export function getAnnouncements(): Announcement[] {
  return getAll("announcements") as Announcement[];
}

export function upsertAnnouncement(announcement: Announcement): void {
  const all = getAnnouncements();
  const idx = all.findIndex(a => a.id === announcement.id);
  if (idx === -1) {
    setAll("announcements", [...all, announcement]);
  } else {
    const updated = [...all];
    updated[idx] = announcement;
    setAll("announcements", updated);
  }
}

export function deleteAnnouncement(id: string): void {
  setAll("announcements", getAnnouncements().filter(a => a.id !== id));
}

export function getDeadlines(): Deadline[] {
  return getAll("deadlines") as Deadline[];
}

export function upsertDeadline(deadline: Deadline): void {
  const all = getDeadlines();
  const idx = all.findIndex(d => d.id === deadline.id);
  if (idx === -1) {
    setAll("deadlines", [...all, deadline]);
  } else {
    const updated = [...all];
    updated[idx] = deadline;
    setAll("deadlines", updated);
  }
}

export function deleteDeadline(id: string): void {
  setAll("deadlines", getDeadlines().filter(d => d.id !== id));
}