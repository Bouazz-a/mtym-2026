import type { Document } from "@/types";
import { getAll, setAll } from "../storage";

export function getDocuments(): Document[] {
  return getAll("documents") as Document[];
}

export function getDocumentsByTeam(teamId: string): Document[] {
  return getDocuments().filter(d => d.teamId === teamId);
}

export function upsertDocument(doc: Document): void {
  const all = getDocuments();
  const idx = all.findIndex(d => d.id === doc.id);
  if (idx === -1) {
    setAll("documents", [...all, doc]);
  } else {
    const updated = [...all];
    updated[idx] = doc;
    setAll("documents", updated);
  }
}

export function lockDocument(id: string): void {
  const all = getDocuments();
  setAll("documents", all.map(d => d.id === id ? { ...d, isLocked: true } : d));
}

export function deleteDocument(id: string): void {
  setAll("documents", getDocuments().filter(d => d.id !== id));
}