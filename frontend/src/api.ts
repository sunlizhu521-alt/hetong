import type {
  Inspection,
  JobInfo,
  MappingPayload,
  SessionInfo,
  UploadInfo,
  ValidationResult,
} from './types'

const API = '/hetong-api/v1'

async function parseError(response: Response): Promise<string> {
  try {
    const body = await response.json()
    const detail = body.detail
    if (typeof detail === 'string') return detail
    if (detail?.message) return detail.message
    if (Array.isArray(detail)) return detail.map((item) => item.msg).join('；')
  } catch {
    // Use the HTTP fallback below.
  }
  return `请求失败（${response.status}）`
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(await parseError(response))
  return response.json() as Promise<T>
}

function authHeaders(session: SessionInfo, json = false): HeadersInit {
  return {
    'X-Session-Token': session.token,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  }
}

export function createSession(): Promise<SessionInfo> {
  return requestJson(`${API}/sessions`, { method: 'POST' })
}

export function uploadFile(session: SessionInfo, kind: 'order' | 'template', file: File): Promise<UploadInfo> {
  const form = new FormData()
  form.append('file', file)
  return requestJson(`${API}/sessions/${session.id}/${kind}`, {
    method: 'PUT',
    headers: authHeaders(session),
    body: form,
  })
}

export function inspectFiles(
  session: SessionInfo,
  orderSheet?: string,
  templateSheet?: string,
): Promise<Inspection> {
  return requestJson(`${API}/sessions/${session.id}/inspect`, {
    method: 'POST',
    headers: authHeaders(session, true),
    body: JSON.stringify({ order_sheet: orderSheet, template_sheet: templateSheet }),
  })
}

export function validateMapping(session: SessionInfo, payload: MappingPayload): Promise<ValidationResult> {
  return requestJson(`${API}/sessions/${session.id}/mapping/validate`, {
    method: 'POST',
    headers: authHeaders(session, true),
    body: JSON.stringify(payload),
  })
}

export function generateContract(
  session: SessionInfo,
  payload: MappingPayload & { output_name: string; warnings_confirmed: boolean },
): Promise<JobInfo> {
  return requestJson(`${API}/sessions/${session.id}/generate`, {
    method: 'POST',
    headers: authHeaders(session, true),
    body: JSON.stringify(payload),
  })
}

export function getJob(session: SessionInfo, jobId: string): Promise<JobInfo> {
  return requestJson(`${API}/jobs/${jobId}`, { headers: authHeaders(session) })
}

export async function fetchProtectedBlob(session: SessionInfo, url: string): Promise<Blob> {
  const response = await fetch(url, { headers: authHeaders(session) })
  if (!response.ok) throw new Error(await parseError(response))
  return response.blob()
}

export async function downloadProtected(session: SessionInfo, url: string): Promise<void> {
  const response = await fetch(url, { headers: authHeaders(session) })
  if (!response.ok) throw new Error(await parseError(response))
  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') ?? ''
  const utf8 = disposition.match(/filename\*=utf-8''([^;]+)/i)
  const simple = disposition.match(/filename="?([^";]+)"?/i)
  const filename = decodeURIComponent(utf8?.[1] ?? simple?.[1] ?? '合同文件')
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}
