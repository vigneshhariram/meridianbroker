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

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function setSession(session: Session | null) {
  csrfToken = session?.csrf_token ?? ''
}

async function request<T>(
  path: string,
  method: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timer = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, 30_000)
  try {
    const response = await fetch(path, {
      method,
      signal: controller.signal,
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
      throw new ApiError(detail, response.status)
    }
    return response.json() as Promise<T>
  } catch (error) {
    if (timedOut)
      throw new Error('The request timed out. Check your connection and try again.', {
        cause: error,
      })
    throw error
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

export const getJson = <T>(path: string, signal?: AbortSignal) =>
  request<T>(path, 'GET', undefined, signal)
export const postJson = <T>(path: string, body: unknown) => request<T>(path, 'POST', body)
export const generateBrief = (accountId: string) =>
  postJson<import('./types').AccountBrief>(
    `/accounts/${encodeURIComponent(accountId)}/brief/generate`,
    {}
  )

export const startBriefGeneration = (accountId: string, force = false) =>
  postJson<import('./types').BriefGenerationJob>(
    `/accounts/${encodeURIComponent(accountId)}/brief/jobs`,
    { force }
  )

export const getBriefGeneration = (accountId: string, jobId: string, signal?: AbortSignal) =>
  getJson<import('./types').BriefGenerationJob>(
    `/accounts/${encodeURIComponent(accountId)}/brief/jobs/${encodeURIComponent(jobId)}`,
    signal
  )
