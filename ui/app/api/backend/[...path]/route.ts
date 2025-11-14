import type { NextRequest } from 'next/server'
import { UTF8_DEBUG, dumpBytes } from '@/lib/debug'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Proxy base to mcp-rag-server
const API_BASE = (process.env.RAG_SERVER_URL || process.env.RAG_API_BASE || 'http://localhost:3002').replace(/\/$/, '')
// Use only server-side key; never fall back to NEXT_PUBLIC
const API_KEY  = process.env.RAG_API_KEY || process.env.API_KEY || ''

type Scope = {
  tenant: string
  userId: string
  notebookId: string | null
  includeGlobal: boolean
}

const DEFAULT_TENANT =
  (process.env.RAG_TENANT_DEFAULT ||
    process.env.NEXT_PUBLIC_TENANT_ID ||
    process.env.NEXT_PUBLIC_TENANT ||
    '').trim() || 'demo'
const DEFAULT_USER =
  (process.env.RAG_DEFAULT_USER ||
    process.env.NEXT_PUBLIC_USER_ID ||
    process.env.DEFAULT_USER_ID ||
    '').trim() || 'local'

function parseBoolean(value: string | null | undefined, fallback = false) {
  if (value == null) return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 't', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['0', 'false', 'f', 'no', 'n', 'off', ''].includes(normalized)) return false
  return fallback
}

const OPTIONAL_NOTEBOOK_PATHS = new Set(['notebooks', 'health'])
const PROXY_TIMEOUT_MS = Number(process.env.BACKEND_PROXY_TIMEOUT_MS || 60_000)
const HAS_ABORT_TIMEOUT =
  typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function'

type ResolveScopeOptions = {
  requireNotebook?: boolean
}

function resolveScope(req: NextRequest, options: ResolveScopeOptions = {}): Scope {
  const url = new URL(req.url)
  const pick = (key: string, aliases: string[] = []) => {
    for (const name of [key, ...aliases]) {
      if (!name) continue
      const value = url.searchParams.get(name)
      if (value != null) return value
    }
    const headerName = `x-${key.replace(/_/g, '-')}`
    return req.headers.get(headerName)
  }

  const requireNotebook = options.requireNotebook ?? true
  const notebookIdRaw =
    pick('notebook_id', ['notebook']) ??
    req.headers.get('x-active-notebook') ??
    null
  const notebookId = (notebookIdRaw || '').trim()
  if (!notebookId && requireNotebook) {
    throw new Response(JSON.stringify({ error: 'notebook_id is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }

  const tenant = (pick('tenant') || DEFAULT_TENANT).trim() || DEFAULT_TENANT
  const userId = (pick('user_id') || DEFAULT_USER).trim() || DEFAULT_USER
  const includeGlobal = parseBoolean(pick('include_global'), false)

  return {
    tenant,
    userId,
    notebookId: notebookId || null,
    includeGlobal,
  }
}

function mergeScopeIntoPayload(scope: Scope, payload: Record<string, any> | null | undefined) {
  const next = { ...(payload ?? {}) }
  if (next.notebook) delete next.notebook
  if (next.tenant == null) next.tenant = scope.tenant
  if (next.user_id == null) next.user_id = scope.userId
  if (scope.notebookId != null) {
    if (next.notebook_id == null) next.notebook_id = scope.notebookId
  } else if (next.notebook_id === null) {
    delete next.notebook_id
  }
  if (next.include_global == null) next.include_global = scope.includeGlobal
  return next
}

function applyScopeToSearchParams(url: URL, scope: Scope) {
  url.searchParams.set('tenant', scope.tenant)
  url.searchParams.set('user_id', scope.userId)
  if (scope.notebookId) {
    url.searchParams.set('notebook_id', scope.notebookId)
  } else {
    url.searchParams.delete('notebook_id')
  }
  url.searchParams.set('include_global', scope.includeGlobal ? 'true' : 'false')
  url.searchParams.delete('notebook')
}

async function forward(req: NextRequest, params: { path?: string[] }) {
  // 例: /api/backend/ingest -> 'ingest'
  //     /api/backend/documents -> 'documents'
  let forwardedPath = (params.path ?? []).join('/')
  if (forwardedPath.startsWith('backend/')) forwardedPath = forwardedPath.slice(8)

  const pathKey = forwardedPath.split('/')[0] ?? ''
  const isRootPath = forwardedPath.length === 0 || forwardedPath === pathKey
  const isOptionalPath = OPTIONAL_NOTEBOOK_PATHS.has(pathKey) && isRootPath
  const requireNotebook = pathKey.length === 0 ? false : !isOptionalPath

  let scope: Scope
  try {
    scope = resolveScope(req, { requireNotebook })
  } catch (resp) {
    if (resp instanceof Response) {
      return resp
    }
    throw resp
  }

  const urlIn  = new URL(req.url)
  applyScopeToSearchParams(urlIn, scope)
  const target = `${API_BASE}/${forwardedPath}${urlIn.search}`

  // Request-ID 伝播（なければ生成）
  const rid = req.headers.get('x-request-id') ?? crypto.randomUUID()

  // 転送ヘッダ（hop-by-hop headers は除外）
  const headers = new Headers()
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    // Skip hop-by-hop headers
    if (!['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade'].includes(lower)) {
      headers.set(key, value)
    }
  })

  headers.set('x-request-id', rid)
  headers.set('x-forwarded-host', urlIn.host)
  headers.set('x-forwarded-proto', urlIn.protocol.replace(':',''))
  headers.set('x-tenant', scope.tenant)
  headers.set('x-user-id', scope.userId)
  headers.delete('x-notebook-id')
  if (scope.notebookId) {
    headers.set('x-notebook-id', scope.notebookId)
  }
  headers.set('x-include-global', scope.includeGlobal ? 'true' : 'false')
  if (API_KEY) {
    headers.set('authorization', `Bearer ${API_KEY}`)
    headers.set('x-api-key', API_KEY)
  }

  // CRITICAL: Read body only once to avoid "Response body object should not be disturbed or locked"
  const method = req.method
  let body: BodyInit | undefined = undefined

  if (!['GET', 'HEAD'].includes(method)) {
    // Read body as ArrayBuffer exactly once
    const arrayBuffer = await req.arrayBuffer()
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const text = new TextDecoder('utf-8').decode(arrayBuffer)
      let payload: any = {}
      let passthrough = false
      if (text.trim().length > 0) {
        try {
          payload = JSON.parse(text)
        } catch (err) {
          console.warn('[backend proxy] Failed to parse JSON body, passing through. Error:', err)
          passthrough = true
        }
      }
      if (!passthrough) {
        const merged = mergeScopeIntoPayload(scope, payload)
        const bodyText = JSON.stringify(merged)
        body = bodyText
        headers.set('content-type', 'application/json; charset=utf-8')
      } else {
        body = arrayBuffer
        headers.set('content-type', contentType)
      }
      headers.delete('content-length')
    } else {
      body = arrayBuffer
    }
  }

  let timeoutCleanup: (() => void) | null = null
  const timeoutSignal =
    HAS_ABORT_TIMEOUT
      ? (AbortSignal as any).timeout(PROXY_TIMEOUT_MS) as AbortSignal
      : (() => {
          const ctrl = new AbortController()
          const timer = setTimeout(() => ctrl.abort(), PROXY_TIMEOUT_MS)
          timeoutCleanup = () => clearTimeout(timer)
          return ctrl.signal
        })()

  let res: Response
  try {
    const init: RequestInit & { duplex?: 'half' } = {
      method,
      headers,
      body,
      signal: timeoutSignal,
      redirect: 'manual',
      cache: 'no-store',
    }
    if (body !== undefined && typeof init.duplex === 'undefined') {
      init.duplex = 'half'
    }
    res = await fetch(target, init)
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err))
    const isAbort = (error as any)?.name === 'AbortError'
    const maybeCause = (error as any)?.cause
    const causeCode = typeof maybeCause?.code === 'string' ? maybeCause.code : undefined
    const status = 503

    const outHeaders = new Headers()
    outHeaders.set('content-type', 'application/json; charset=utf-8')
    outHeaders.set('x-request-id', rid)
    outHeaders.set('x-proxy-path', forwardedPath)
    outHeaders.set('x-proxy-error', error.name || 'FetchError')

    const payload = {
      ok: false,
      status,
      error: error.message || 'Upstream request failed',
      target,
      forwardedPath,
      cause: causeCode,
    }

    return new Response(JSON.stringify(payload), {
      status,
      headers: outHeaders,
    })
  } finally {
    timeoutCleanup?.()
  }

  // レスポンスをストリームで返す（SSE/大容量対応）
  const outHeaders = new Headers(res.headers)
  outHeaders.set('x-request-id', rid)
  outHeaders.set('x-proxy-path', forwardedPath)
  // JSON系は charset=utf-8 を明示して中間経路の再デコード事故を防止
  const ct = outHeaders.get('content-type') || ''
  if (ct.startsWith('application/json') && !/charset=/i.test(ct)) {
    outHeaders.set('content-type', 'application/json; charset=utf-8')
  }

  // Return response stream directly without re-reading
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: outHeaders,
  })
}

export async function GET(req: NextRequest, { params }: { params: { path?: string[] } }) {
  return forward(req, params)
}
export async function POST(req: NextRequest, { params }: { params: { path?: string[] } }) {
  return forward(req, params)
}
export async function DELETE(req: NextRequest, { params }: { params: { path?: string[] } }) {
  return forward(req, params)
}
