import type { Document, DocumentType } from "@/types";
import { apiFetch, apiUpload, apiDownload } from "@/lib/api/client";

export function getDocuments(): Promise<Document[]> {
  return apiFetch<Document[]>("/documents");
}

export function getDocumentsByTeam(teamId: string): Promise<Document[]> {
  return apiFetch<Document[]>("/documents", { params: { teamId } });
}

// Real multipart upload to the backend.
export function uploadDocumentFile(
  file: File,
  docType: DocumentType,
  teamId: string,
): Promise<Document> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("docType", docType);
  formData.append("teamId", teamId);
  return apiUpload<Document>("/documents", formData);
}

// Real download — a plain <a href> can't carry the Authorization header,
// so we fetch the bytes and hand back an object URL + filename to save as.
// Caller is responsible for revoking the URL (URL.revokeObjectURL) once done.
export async function downloadDocument(
  id: string,
  fallbackName: string,
): Promise<{ url: string; filename: string }> {
  const { blob, filename } = await apiDownload(`/documents/${id}/download`);
  return { url: URL.createObjectURL(blob), filename: filename ?? fallbackName };
}

// Admin-only.
export function setDocumentLocked(id: string, locked: boolean): Promise<Document> {
  return apiFetch<Document>(`/documents/${id}/lock`, { method: "PUT", body: { locked } });
}

export function deleteDocument(id: string): Promise<void> {
  return apiFetch<void>(`/documents/${id}`, { method: "DELETE" });
}
