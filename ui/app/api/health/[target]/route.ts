import { NextResponse } from 'next/server'

type ServiceKey = 'rag' | 'mcp' | 'meilisearch' | 'qdrant' | 'reranker'

const DEFAULT_FEATURES: Record<ServiceKey, boolean> = {
  rag: true,
  mcp: true,
  meilisearch: false,
  qdrant: false,
  reranker: false,
}

const SERVICE_ENDPOINTS: Record<
  ServiceKey,
  { defaultUrl: string; path: string; timeout: number }
> = {
  rag: { defaultUrl: '', path: '/api/health', timeout: 5000 },
  mcp: { defaultUrl: '', path: '/api/health', timeout: 5000 },
  meilisearch: { defaultUrl: 'http://localhost:7700', path: '/health', timeout: 5000 },
  qdrant: { defaultUrl: 'http://localhost:6333', path: '/healthz', timeout: 5000 },
  reranker: { defaultUrl: 'http://localhost:8080', path: '/health', timeout: 5000 },
}

function readEnvFlag(name: string, defaultValue: boolean): boolean {
  const envKeys = [
    `FEATURE_${name}`,
    `NEXT_PUBLIC_FEATURE_${name}`,
  ]
  for (const key of envKeys) {
    const raw = process.env[key]
    if (raw !== undefined) {
      if (/^(false|0|off)$/i.test(raw)) return false
      if (/^(true|1|on)$/i.test(raw)) return true
    }
  }
  return defaultValue
}

function getServiceConfig(service: ServiceKey) {
  const enabled = readEnvFlag(service.toUpperCase(), DEFAULT_FEATURES[service])
  const endpoint = SERVICE_ENDPOINTS[service]
  let baseUrl: string | null = null

  switch (service) {
    case 'rag':
    case 'mcp': {
      baseUrl =
        process.env.RAG_SERVER_URL ??
        process.env.RAG_API_BASE ??
        'http://127.0.0.1:3002'
      break
    }
    case 'meilisearch': {
      baseUrl = process.env.MEILI_URL ?? endpoint.defaultUrl
      break
    }
    case 'qdrant': {
      baseUrl = process.env.QDRANT_URL ?? endpoint.defaultUrl
      break
    }
    case 'reranker': {
      baseUrl = process.env.RERANKER_URL ?? endpoint.defaultUrl
      break
    }
    default:
      baseUrl = endpoint.defaultUrl
  }

  return {
    enabled,
    baseUrl,
    endpoint,
  }
}

async function probeRemote(url: string, path: string, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()

  try {
    const res = await fetch(`${url}${path}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
    const elapsed = Date.now() - started
    clearTimeout(timeout)
    return { res, elapsed }
  } catch (error) {
    clearTimeout(timeout)
    throw { error, elapsed: Date.now() - started }
  }
}

function skippedResponse(service: string) {
  return NextResponse.json(
    {
      ok: false,
      status: 'skipped',
      service,
      skipped: true,
    },
    { status: 200 }
  )
}

async function ragLikeHealth(service: ServiceKey) {
  const { baseUrl } = getServiceConfig('rag')
  const target = service === 'mcp' ? 'mcp' : 'rag'

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  const started = Date.now()

  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      cache: 'no-store',
      signal: controller.signal,
    })
    const elapsed = Date.now() - started
    clearTimeout(timeout)

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: 'degraded',
          service: target,
          ms: elapsed,
          error: `HTTP ${res.status}`,
        },
        { status: 200 }
      )
    }

    const json = await res.json().catch(() => ({}))
    return NextResponse.json(
      {
        ok: !!json.ok,
        status: json.status ?? 'healthy',
        service: target,
        ms: elapsed,
        documents: json.documents,
        tenant: json.tenant,
      },
      { status: 200 }
    )
  } catch (err: any) {
    clearTimeout(timeout)
    const elapsed = Date.now() - started
    return NextResponse.json(
      {
        ok: false,
        status: 'down',
        service: target,
        ms: elapsed,
        error: err?.message || 'Connection failed',
      },
      { status: 200 }
    )
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { target: string } }
) {
  const target = (params.target ?? '').toLowerCase() as ServiceKey

  if (!['rag', 'mcp', 'meilisearch', 'qdrant', 'reranker'].includes(target)) {
    return skippedResponse(target)
  }

  const config = getServiceConfig(target)
  if (!config.enabled) {
    return skippedResponse(target)
  }

  if (target === 'rag' || target === 'mcp') {
    return ragLikeHealth(target)
  }

  const { baseUrl, endpoint } = config
  const started = Date.now()

  try {
    const { res, elapsed } = await probeRemote(
      baseUrl!,
      endpoint.path,
      endpoint.timeout
    )

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: 'degraded',
          service: target,
          ms: elapsed,
          error: `HTTP ${res.status}`,
        },
        { status: 200 }
      )
    }

    return NextResponse.json(
      {
        ok: true,
        status: 'healthy',
        service: target,
        ms: elapsed,
      },
      { status: 200 }
    )
  } catch (err: any) {
    const elapsed = Date.now() - started
    const message =
      err?.error?.message || err?.message || 'Connection failed'
    return NextResponse.json(
      {
        ok: false,
        status: 'down',
        service: target,
        ms: elapsed,
        error: message,
      },
      { status: 200 }
    )
  }
}
