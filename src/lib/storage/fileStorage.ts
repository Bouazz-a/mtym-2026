// Fake blob storage layer for the demo.


const STORAGE_KEY = "mtym_file_blobs";

type BlobMap = Record<string, string>; // storagePath -> base64

function readMap(): BlobMap {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as BlobMap;
  } catch {
    return {};
  }
}

function writeMap(map: BlobMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

// Store a file's contents under the given storagePath. Replaces any existing
// blob at that path (mirroring the upsert behavior of documents).
export function storeFileBlob(storagePath: string, base64: string): void {
  const map = readMap();
  map[storagePath] = base64;
  writeMap(map);
}

// Return the stored blob for a path, or null if absent.
export function getFileBlob(storagePath: string): string | null {
  return readMap()[storagePath] ?? null;
}

// Delete a stored blob (used when a document is permanently removed).
export function deleteFileBlob(storagePath: string): void {
  const map = readMap();
  delete map[storagePath];
  writeMap(map);
}

// Read a File object to base64 (strips the data URL prefix).
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Lecture du fichier impossible."));
        return;
      }
      // result = "data:application/pdf;base64,JVBERi0xLj..."
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Erreur de lecture."));
    reader.readAsDataURL(file);
  });
}

// Build a browser-downloadable object URL from a stored blob. Caller is
// responsible for revoking the URL after use to free memory.
export function createDownloadUrl(
  storagePath: string,
  mimeType: string,
): string | null {
  const base64 = getFileBlob(storagePath);
  if (!base64) return null;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}
