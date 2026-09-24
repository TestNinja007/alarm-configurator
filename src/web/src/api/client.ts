/**
 * Thin fetch wrapper: same-origin in production, proxied by Vite in
 * development. It reads the CSRF cookie the server set at login and echoes it
 * on every state-changing request, and it turns the error envelope into a
 * typed exception so components can attach server-side field errors to inputs.
 */

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

export interface ErrorEnvelope {
  code: string;
  message: string;
  requestId: string;
  fields?: FieldError[];
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly envelope: ErrorEnvelope;

  constructor(status: number, envelope: ErrorEnvelope) {
    super(envelope.message);
    this.name = 'ApiError';
    this.status = status;
    this.envelope = envelope;
  }

  get fields(): FieldError[] {
    return this.envelope.fields ?? [];
  }

  fieldError(name: string): string | undefined {
    return this.fields.find((field) => field.field === name)?.message;
  }
}

const BASE = '/api/v1';

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrf=([^;]*)/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

export async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};

  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && method !== 'HEAD') headers['X-CSRF-Token'] = csrfToken();

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const envelope = (payload as { error?: ErrorEnvelope } | undefined)?.error ?? {
      code: 'internal',
      message: 'The server returned an unreadable error.',
      requestId: '',
    };
    throw new ApiError(response.status, envelope);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
