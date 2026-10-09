export interface ApiErrorBody {
  error: string | Record<string, string[] | undefined>;
  code?: string;
  limit?: number;
}

/** Thrown by `api.*` calls when the backend responds with a non-2xx status. */
export class ApiError extends Error {
  status: number;
  body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(typeof body.error === "string" ? body.error : "Solicitud inválida");
    this.status = status;
    this.body = body;
  }
}

/** Flattens a backend error (a plain string, or a Zod fieldErrors object) into one display string. */
export function formatApiError(error: ApiErrorBody["error"]): string {
  if (typeof error === "string") return error;
  return Object.values(error)
    .flat()
    .filter((msg): msg is string => Boolean(msg))
    .join(" ");
}

/**
 * True only for a genuinely unauthenticated session (401). Never true for
 * rate limiting (429), server errors, or network failures — callers must
 * not treat those as "logged out" or otherwise conflate a transient failure
 * with the absence of data.
 */
export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

/** The message a form should show for a caught error: the backend's own message for an ApiError, or a generic fallback for anything else (a network failure, for instance). */
export function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? formatApiError(err.body.error) : fallback;
}

/** The machine-readable `code` the backend attached to an error, or null when absent or not an ApiError. */
export function getApiErrorCode(err: unknown): string | null {
  return err instanceof ApiError && typeof err.body.code === "string" ? err.body.code : null;
}

/** The numeric `limit` the backend attached to an error (e.g. the keyword cap), or null when absent or not an ApiError. */
export function getApiErrorLimit(err: unknown): number | null {
  return err instanceof ApiError && typeof err.body.limit === "number" ? err.body.limit : null;
}

const BASE_URL = "/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json();

  if (!res.ok) {
    throw new ApiError(res.status, body as ApiErrorBody);
  }

  return body as T;
}

/** Thin typed wrapper around fetch for the Inntena API, scoped to /api and cookie-authenticated. */
export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, data: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
  delete: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "DELETE", ...(data !== undefined ? { body: JSON.stringify(data) } : {}) }),
};
