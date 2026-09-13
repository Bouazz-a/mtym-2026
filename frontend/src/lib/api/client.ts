import {
  ServiceError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  UnauthorizedError,
} from "@/lib/services/errors";

// Thin fetch wrapper around the backend API. Every repository routes
// through this so auth-header injection and error mapping live in one
// place instead of being duplicated per repository.

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";
const TOKEN_KEY = "mtym_auth_token";

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Maps a non-2xx backend response to the matching ServiceError subclass, so
// existing `catch` blocks written against errors.ts keep working unchanged.
async function toServiceError(res: Response): Promise<ServiceError> {
  const data = await res.json().catch(() => null);
  const message =
    data && typeof data === "object" && "error" in data
      ? String((data as { error: unknown }).error)
      : `Request failed (${res.status})`;

  if (res.status === 401) return new UnauthorizedError(message);
  if (res.status === 403) return new ForbiddenError(message);
  if (res.status === 404) return new NotFoundError(message);
  if (res.status === 409) return new ConflictError(message);
  if (res.status === 400) {
    const details =
      data && typeof data === "object" && "details" in data
        ? (data as { details: unknown }).details
        : undefined;
    return new ValidationError(message, details);
  }
  return new ServiceError(message);
}

interface ApiFetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | undefined>;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const res = await fetch(url.toString(), {
    method: options.method ?? "GET",
    headers: {
      ...authHeaders(),
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) throw await toServiceError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Like apiFetch, but resolves to undefined on a 404 instead of throwing —
// matches the old repositories' `getXById` semantics so callers that check
// `if (!x)` don't all need a try/catch.
export async function apiFetchOptional<T>(path: string): Promise<T | undefined> {
  try {
    return await apiFetch<T>(path);
  } catch (err) {
    if (err instanceof NotFoundError) return undefined;
    throw err;
  }
}

// Real file upload (multipart) — separate from apiFetch since the body is
// FormData, not JSON.
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });

  if (!res.ok) throw await toServiceError(res);
  return (await res.json()) as T;
}

// Real file download — a plain <a href> can't carry the Authorization
// header, so callers fetch the bytes and build an object URL themselves.
export async function apiDownload(
  path: string,
): Promise<{ blob: Blob; filename: string | null }> {
  const res = await fetch(`${API_URL}${path}`, { headers: authHeaders() });
  if (!res.ok) throw await toServiceError(res);

  const disposition = res.headers.get("content-disposition");
  const filename = disposition?.match(/filename="?([^"]+)"?/)?.[1] ?? null;
  return { blob: await res.blob(), filename };
}
