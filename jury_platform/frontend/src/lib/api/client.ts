import {
  ServiceError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  UnauthorizedError,
} from "@/lib/services/errors";

// Thin fetch wrapper around the backend API. Every repository routes
// through this so auth-header injection and error mapping live in one place.
// The API is served on the same origin (/api): Caddy in production, the Vite
// proxy in dev.

const API_URL = "/api";
const TOKEN_KEY = "mtym_jury_token";

// Fired when the backend rejects the stored token (expired, account
// deleted…) so the session can drop back to the login page.
export const UNAUTHORIZED_EVENT = "mtym:unauthorized";

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// Maps a non-2xx backend response to the matching ServiceError subclass.
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
    // Zod failures carry the useful message on the first issue.
    const first = Array.isArray(details) ? (details[0] as { message?: string } | undefined) : undefined;
    return new ValidationError(first?.message ?? message, details);
  }
  return new ServiceError(message);
}

interface ApiFetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | undefined>;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value !== undefined) query.set(key, String(value));
  }
  const url = `${API_URL}${path}${query.size ? `?${query}` : ""}`;

  const token = getAuthToken();
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw await toServiceError(res);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
