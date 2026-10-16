// Thin fetch wrapper. Every API error comes back as { error: { code, message, ... } }
// and becomes an ApiError here, so components can show the server's own message.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', "Couldn't reach JobSignal. Check your connection and try again.");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON (e.g. CSV download) handled by callers that use download()
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } & Record<string, unknown> })?.error;
    const { code, message, ...extra } = err ?? {};
    throw new ApiError(res.status, code ?? 'error', message ?? `Request failed (${res.status}).`, extra);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b: unknown = {}) => request<T>('POST', p, b),
  patch: <T>(p: string, b: unknown) => request<T>('PATCH', p, b),
  put: <T>(p: string, b: unknown) => request<T>('PUT', p, b),
  del: <T>(p: string, b?: unknown) => request<T>('DELETE', p, b),
};

/** Fetch a file from the API and hand it to the browser as a download. */
export async function download(path: string, fallbackName: string): Promise<void> {
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) {
    let msg = `Download failed (${res.status}).`;
    try {
      msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? msg;
    } catch { /* keep default */ }
    throw new ApiError(res.status, 'download_failed', msg);
  }
  const blob = await res.blob();
  const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
