export type UserProfile = {
  userId: string
  name: string
  email: string
  role: 'Producer' | 'Regional Leader'
  region: string
  title: string
}

export type Session = { user: UserProfile; csrf_token: string }
let csrfToken = ''

export function setSession(session: Session | null) {
  csrfToken = session?.csrf_token ?? ''
}

async function request<T>(
  path: string,
  method: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(path, {
    method,
    signal,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    if (response.status === 401 && path !== '/auth/login' && path !== '/auth/session') {
      window.dispatchEvent(new Event('meridian-session-expired'))
    }
    const detail =
      typeof error?.detail === 'string'
        ? error.detail
        : `Request failed (${response.status}). Please try again.`
    throw new Error(detail)
  }
  return response.json() as Promise<T>
}

export const getJson = <T>(path: string, signal?: AbortSignal) =>
  request<T>(path, 'GET', undefined, signal)
export const postJson = <T>(path: string, body: unknown) => request<T>(path, 'POST', body)
export const generateBrief = (accountId: string) =>
  postJson<import('./types').AccountBrief>(`/accounts/${encodeURIComponent(accountId)}/brief/generate`, {})
