import { getAccessToken, setAccessToken } from './auth-store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

export interface ApiErrorBody {
  code: string;
  params: Record<string, unknown>;
  requestId?: string;
}

export class ApiError extends Error {
  constructor(public readonly body: ApiErrorBody, public readonly status: number) {
    super(body.code);
  }
}

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** No offline write buffering (CLAUDE.md "Pas d'offline-first") — a write attempted while offline fails fast. */
function assertOnlineForWrite(method: string): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine && WRITE_METHODS.has(method.toUpperCase())) {
    throw new ApiError({ code: 'OFFLINE_WRITE_DISABLED', params: {} }, 0);
  }
}

/** `credentials: 'include'` sends the HttpOnly refresh cookie; the access token rides in the header only. */
async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  assertOnlineForWrite(init.method ?? 'GET');
  const token = getAccessToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (response.status === 401 && retry && path !== '/auth/refresh') {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return request<T>(path, init, false);
    }
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({ code: 'INTERNAL_ERROR', params: {} }))) as ApiErrorBody;
    throw new ApiError(body, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const result = await request<{ accessToken: string }>('/auth/refresh', { method: 'POST' }, false);
    setAccessToken(result.accessToken);
    return true;
  } catch {
    setAccessToken(null);
    return false;
  }
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
