#!/usr/bin/env node

/**
 * Combined development runner:
 *  - starts the RAG backend (external Python project)
 *  - starts the Next.js UI dev server
 *
 * The RAG backend directory can be overridden via RAG_SERVER_DIR.
 * The startup command can be overridden via RAG_SERVER_CMD (executed via shell).
 */

import { spawn, execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import fs from 'node:fs'
import net from 'node:net'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..')
const uiDir = join(projectRoot, 'ui')

const skipRag = process.env.RAG_AUTODEV_SKIP_RAG === '1'
const skipUi = process.env.RAG_AUTODEV_SKIP_UI === '1'
const skipDb = process.env.RAG_AUTODEV_SKIP_DB === '1'
const reuseExistingRag = process.env.RAG_AUTODEV_REUSE_SERVER === '1'

const ragServerDir = resolve(
  projectRoot,
  process.env.RAG_SERVER_DIR ?? join('..', 'mcp-rag-server')
)

if (!skipRag) {
  if (!fs.existsSync(ragServerDir) || !fs.statSync(ragServerDir).isDirectory()) {
    console.error(`❌ [dev:autodev] RAG server directory not found: ${ragServerDir}`)
    process.exit(1)
  }
}

const ragHost = process.env.RAG_SERVER_HOST ?? '127.0.0.1'
const ragPort = process.env.RAG_SERVER_PORT ?? '3002'
const ragPortNumber = Number(ragPort)
const ragUrl =
  process.env.RAG_SERVER_URL ?? `http://${ragHost}:${ragPort}`

const dbHost = process.env.RAG_DB_HOST ?? '127.0.0.1'
const dbPort = Number(process.env.RAG_DB_PORT ?? '5434')
const dbContainer = process.env.RAG_DB_CONTAINER ?? 'postgres-pgvector'
const dbImage = process.env.RAG_DB_IMAGE ?? 'ankane/pgvector:latest'
const dbUser = process.env.RAG_DB_USER ?? 'rag'
const dbPassword = process.env.RAG_DB_PASSWORD ?? 'ragpass'
const dbName = process.env.RAG_DB_NAME ?? 'ragdb'
const dockerDesktopAppPath = '/Applications/Docker.app'
const dockerDesktopStartCommand =
  process.platform === 'darwin' && fs.existsSync(dockerDesktopAppPath)
    ? 'open -ga Docker'
    : null
const dockerStartCommand = process.env.RAG_AUTODEV_DOCKER_START_CMD
const autoStartColima = process.env.RAG_AUTODEV_AUTO_COLIMA !== '0'
const dockerDaemonWaitAttempts = Number(process.env.RAG_AUTODEV_DOCKER_WAIT_ATTEMPTS ?? '30')
const dockerDaemonWaitDelayMs = Number(process.env.RAG_AUTODEV_DOCKER_WAIT_DELAY_MS ?? '2000')

const sharedChildren = []
let shuttingDown = false

const shutdown = (code = 0) => {
  if (shuttingDown) return
  shuttingDown = true

  for (const { child, name } of sharedChildren) {
    if (!child.killed) {
      try {
        child.kill('SIGINT')
      } catch (err) {
        console.error(`⚠️  [dev:autodev] Failed to signal ${name}: ${err}`)
      }
    }
  }

  // Allow child processes to exit gracefully
  setTimeout(() => process.exit(code), 500).unref()
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms))

const isPortOpen = (host, port, timeoutMs = 1000) =>
  new Promise((resolveCheck) => {
    const socket = net.createConnection({ host, port })
    let resolved = false

    const finish = (value) => {
      if (!resolved) {
        resolved = true
        socket.destroy()
        resolveCheck(value)
      }
    }

    socket.setTimeout(timeoutMs, () => finish(false))
    socket.once('error', () => finish(false))
    socket.once('connect', () => finish(true))
  })

const commandExists = async (cmd) => {
  if (!cmd) return false
  const checker = process.platform === 'win32' ? 'where' : 'which'
  const args = process.platform === 'win32' ? [cmd] : [cmd]
  try {
    await execFileAsync(checker, args)
    return true
  } catch {
    return false
  }
}

const runShellCommand = async (command) => {
  const shell = process.platform === 'win32' ? 'cmd' : process.env.SHELL || 'bash'
  const shellArgs = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command]
  return execFileAsync(shell, shellArgs, { cwd: projectRoot })
}

const isDockerDaemonUnavailable = (err) => {
  const combined = `${err?.stderr ?? ''} ${err?.stdout ?? ''} ${err?.message ?? ''}`.toLowerCase()
  return combined.includes('cannot connect to the docker daemon') || combined.includes('is the docker daemon running')
}

const resolveDockerStartStrategies = async () => {
  const strategies = []

  if (dockerStartCommand) {
    strategies.push({
      label: dockerStartCommand,
      run: () => runShellCommand(dockerStartCommand),
    })
    return strategies
  }

  if (autoStartColima && (await commandExists('colima'))) {
    strategies.push({
      label: 'colima start',
      run: () => execFileAsync('colima', ['start']),
    })
  }

  if (dockerDesktopStartCommand) {
    strategies.push({
      label: dockerDesktopStartCommand,
      run: () => runShellCommand(dockerDesktopStartCommand),
    })
  }

  return strategies
}

const ensureDockerDaemon = async () => {
  const dockerReady = async () => {
    try {
      await execDocker(['info'])
      return true
    } catch (err) {
      if (isDockerDaemonUnavailable(err)) {
        return false
      }
      throw err
    }
  }

  if (await dockerReady()) {
    return
  }

  const strategies = await resolveDockerStartStrategies()
  if (!strategies.length) {
    console.error('❌ [dev:autodev] Docker daemon is not running. Start Docker Desktop/Colima manually or set RAG_AUTODEV_DOCKER_START_CMD.')
    console.error('    → To disable auto-start entirely, export RAG_DB_AUTO_START=0')
    process.exit(1)
  }

  let startLabel = null
  for (const strategy of strategies) {
    try {
      console.log(`🐋 [dev:autodev] Attempting to start Docker daemon via: ${strategy.label}`)
      await strategy.run()
      startLabel = strategy.label
      break
    } catch (err) {
      console.warn(`⚠️  [dev:autodev] Failed to start Docker via ${strategy.label}: ${err?.message ?? err}`)
    }
  }

  if (!startLabel) {
    console.error('❌ [dev:autodev] Unable to automatically start Docker. Start it manually or provide RAG_AUTODEV_DOCKER_START_CMD.')
    console.error('    → If auto-start is not desired, set RAG_DB_AUTO_START=0')
    process.exit(1)
  }

  for (let attempt = 1; attempt <= dockerDaemonWaitAttempts; attempt++) {
    if (await dockerReady()) {
      console.log('✅ [dev:autodev] Docker daemon is ready')
      return
    }
    await wait(dockerDaemonWaitDelayMs)
  }

  console.error(`❌ [dev:autodev] Docker daemon did not become ready after running ${startLabel}.`)
  process.exit(1)
}

const execDocker = async (args) => {
  try {
    return await execFileAsync('docker', args, { cwd: projectRoot })
  } catch (err) {
    err.message = `docker ${args.join(' ')} failed: ${err.message}`
    throw err
  }
}

const ensureDocker = async () => {
  try {
    await execDocker(['--version'])
  } catch (err) {
    console.error('❌ [dev:autodev] Docker is required to manage pgvector:', err.message)
    process.exit(1)
  }

  await ensureDockerDaemon()
}

const ensureDb = async () => {
  if (skipDb) {
    console.log('⚠️  [dev:autodev] Skipping pgvector startup (RAG_AUTODEV_SKIP_DB=1)')
    return
  }

  if (await isPortOpen(dbHost, dbPort)) {
    console.log(`✅ [dev:autodev] pgvector already reachable at ${dbHost}:${dbPort}`)
    return
  }

  await ensureDocker()

  let containerInfo = null
  try {
    const { stdout } = await execDocker(['container', 'inspect', dbContainer])
    const parsed = JSON.parse(stdout)
    if (Array.isArray(parsed) && parsed.length > 0) {
      containerInfo = parsed[0]
    }
  } catch {
    containerInfo = null
  }

  const desiredPort = String(dbPort)

  if (containerInfo) {
    const mapped = containerInfo?.NetworkSettings?.Ports?.['5432/tcp']
    const mappedPort = Array.isArray(mapped) && mapped.length > 0 ? mapped[0]?.HostPort : undefined

    if (!mappedPort || mappedPort !== desiredPort) {
      console.log(
        `♻️  [dev:autodev] Recreating pgvector container '${dbContainer}' to use port ${desiredPort} (was ${mappedPort ?? 'unmapped'})...`
      )
      await execDocker(['container', 'rm', '-f', dbContainer])
      containerInfo = null
    }
  }

  if (!containerInfo) {
    console.log(`🐘 [dev:autodev] Creating pgvector container '${dbContainer}'...`)
    const runArgs = [
      'run',
      '-d',
      '--name',
      dbContainer,
      '-e',
      `POSTGRES_USER=${dbUser}`,
      '-e',
      `POSTGRES_PASSWORD=${dbPassword}`,
      '-e',
      `POSTGRES_DB=${dbName}`,
      '-p',
      `${dbPort}:5432`,
      dbImage,
    ]
    await execDocker(runArgs)
  } else {
    const status = containerInfo?.State?.Status ?? 'unknown'
    if (status === 'running') {
      console.log(`✅ [dev:autodev] pgvector container '${dbContainer}' already running`)
    } else {
      console.log(`🔄 [dev:autodev] Starting pgvector container '${dbContainer}' (status: ${status})...`)
      await execDocker(['container', 'start', dbContainer])
    }
  }

  const maxAttempts = Number(process.env.RAG_DB_WAIT_ATTEMPTS ?? '30')
  const delayMs = Number(process.env.RAG_DB_WAIT_DELAY_MS ?? '1000')

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (await isPortOpen(dbHost, dbPort)) {
      console.log(`✅ [dev:autodev] pgvector ready on ${dbHost}:${dbPort}`)
      const initSql = process.env.RAG_DB_INIT_SQL ?? 'CREATE EXTENSION IF NOT EXISTS vector;'
      if (initSql && initSql.trim()) {
        const initAttempts = Number(process.env.RAG_DB_INIT_ATTEMPTS ?? '5')
        const initDelay = Number(process.env.RAG_DB_INIT_DELAY_MS ?? '1000')
        let ensured = false
        for (let idx = 1; idx <= initAttempts; idx++) {
          try {
            await execDocker([
              'exec',
              dbContainer,
              'psql',
              '-h',
              'localhost',
              '-U',
              dbUser,
              '-d',
              dbName,
              '-c',
              initSql,
            ])
            ensured = true
            break
          } catch (err) {
            if (idx === initAttempts) {
              console.warn(`⚠️  [dev:autodev] Failed to run database init SQL (${initSql}): ${err.message}`)
            } else {
              await wait(initDelay)
            }
          }
        }
        if (ensured) {
          console.log('🧩 [dev:autodev] Ensured pgvector extension is available')
        }
      }
      return
    }
    await wait(delayMs)
  }

  console.error(`❌ [dev:autodev] pgvector did not become ready on ${dbHost}:${dbPort}`)
  process.exit(1)
}

const listPidsOnPort = async (port) => {
  try {
    const { stdout } = await execFileAsync('lsof', ['-ti', `tcp:${port}`])
    return stdout.split('\n').map((p) => p.trim()).filter(Boolean)
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn('⚠️  [dev:autodev] lsof not found; cannot inspect existing processes on port', port)
      return []
    }
    if (typeof err.stdout === 'string') {
      return err.stdout.split('\n').map((p) => p.trim()).filter(Boolean)
    }
    return []
  }
}

const terminatePids = async (pids) => {
  if (!pids.length) return
  try {
    await execFileAsync('kill', ['-TERM', ...pids])
  } catch (err) {
    console.warn('⚠️  [dev:autodev] Failed to terminate processes gracefully:', err.message)
    try {
      await execFileAsync('kill', ['-KILL', ...pids])
    } catch (err2) {
      console.error('❌ [dev:autodev] Failed to force terminate processes:', err2.message)
    }
  }
}

const ensureRagPortFree = async () => {
  if (!(await isPortOpen(ragHost, ragPortNumber))) {
    return false
  }

  if (reuseExistingRag) {
    console.log(`✅ [dev:autodev] Reusing existing RAG HTTP server on ${ragHost}:${ragPort}`)
    return true
  }

  console.log(`♻️  [dev:autodev] Port ${ragPort} already in use, stopping existing server...`)
  const pids = await listPidsOnPort(ragPort)
  if (pids.length) {
    console.log(`   ⚙️  Terminating PIDs: ${pids.join(', ')}`)
    await terminatePids(pids)
    const waitAttempts = Number(process.env.RAG_AUTODEV_WAIT_PORT_ATTEMPTS ?? '20')
    const waitDelay = Number(process.env.RAG_AUTODEV_WAIT_PORT_DELAY_MS ?? '250')
    for (let attempt = 0; attempt < waitAttempts; attempt++) {
      if (!(await isPortOpen(ragHost, ragPortNumber))) break
      await wait(waitDelay)
    }
  } else {
    console.warn(`⚠️  [dev:autodev] No PIDs found for port ${ragPort}, continuing`)
  }

  if (await isPortOpen(ragHost, ragPortNumber)) {
    console.warn(`⚠️  [dev:autodev] Port ${ragPort} remains busy; new server may fail to start`)
    return true
  }

  return false
}

const registerChild = (name, child) => {
  sharedChildren.push({ name, child })

  child.on('exit', (code, signal) => {
    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`
    console.log(`\n🏁 [dev:autodev] ${name} exited (${reason}).`)
    shutdown(code ?? (signal ? 1 : 0))
  })

  child.on('error', (err) => {
    console.error(`❌ [dev:autodev] ${name} process error:`, err)
    shutdown(1)
  })
}

const trySpawn = (attempt) =>
  new Promise((resolveSpawn, rejectSpawn) => {
    const envForChild = {
      ...process.env,
      RAG_SERVER_HOST: ragHost,
      RAG_SERVER_PORT: ragPort,
      RAG_SERVER_URL: ragUrl,
      PORT: attempt.providePort ? ragPort : process.env.PORT,
    }
    if (!process.env.POSTGRES_HOST) envForChild.POSTGRES_HOST = dbHost
    if (!process.env.POSTGRES_PORT) envForChild.POSTGRES_PORT = String(dbPort)
    if (!process.env.POSTGRES_USER) envForChild.POSTGRES_USER = dbUser
    if (!process.env.POSTGRES_PASSWORD) envForChild.POSTGRES_PASSWORD = dbPassword
    if (!process.env.POSTGRES_DB) envForChild.POSTGRES_DB = dbName
    delete envForChild.VIRTUAL_ENV
    const ragVenvBin = join(ragServerDir, '.venv', 'bin')
    envForChild.PATH = envForChild.PATH
      ? `${ragVenvBin}:${envForChild.PATH}`
      : ragVenvBin

    const child = spawn(attempt.command, attempt.args ?? [], {
      cwd: ragServerDir,
      stdio: ['pipe', 'inherit', 'inherit'],
      env: envForChild,
      shell: attempt.shell ?? false,
    })

    const cleanup = () => {
      child.removeListener('error', onError)
      child.removeListener('spawn', onSpawn)
    }

    const onError = (err) => {
      cleanup()
      if (err.code === 'ENOENT') {
        resolveSpawn(null)
      } else {
        rejectSpawn(err)
      }
    }

    const onSpawn = () => {
      cleanup()
      resolveSpawn(child)
    }

    child.once('error', onError)
    child.once('spawn', onSpawn)
  })

const startRagServer = async () => {
  const reuse = await ensureRagPortFree()
  if (reuse) return

  const attempts = [
    {
      label: `uv run --active uvicorn src.http_server:app --host ${ragHost} --port ${ragPort} --reload`,
      command: 'uv',
      args: [
        'run',
        '--active',
        'uvicorn',
        'src.http_server:app',
        '--host',
        ragHost,
        '--port',
        String(ragPort),
        '--reload'
      ],
      shell: false,
      providePort: false,
    },
  ]

  if (process.env.RAG_SERVER_CMD) {
    attempts.push({
      label: process.env.RAG_SERVER_CMD,
      command: process.env.RAG_SERVER_CMD,
      shell: true,
      providePort: true,
    })
  } else {
    attempts.push({
      label: 'uv run --active python -m src.main',
      command: 'uv',
      args: ['run', '--active', 'python', '-m', 'src.main'],
      shell: false,
      providePort: true,
    })
    attempts.push({
      label: 'python -m src.main',
      command: 'python',
      args: ['-m', 'src.main'],
      shell: false,
      providePort: true,
    })
  }

  let httpStarted = false

  for (const attempt of attempts) {
    console.log(
      `🚀 [dev:autodev] Starting RAG server (${attempt.label}) in ${ragServerDir}`
    )
    try {
      const child = await trySpawn(attempt)
      if (child) {
        console.log(`✅ [dev:autodev] RAG server running via "${attempt.label}"`)
        registerChild('RAG HTTP server', child)
        httpStarted = true
        break
      }
      console.warn(
        `⚠️  [dev:autodev] Command not found: "${attempt.label}", trying next...`
      )
    } catch (err) {
      console.error(
        `❌ [dev:autodev] Failed to start RAG server with "${attempt.label}":`,
        err
      )
    }
  }

  if (!httpStarted) {
    console.error('❌ [dev:autodev] Unable to start RAG HTTP server.')
    process.exit(1)
  }

  if (process.env.RAG_AUTODEV_START_MCP === '1') {
    const mcpAttempt = {
      label: 'uv run python -m src.main',
      command: 'uv',
      args: ['run', 'python', '-m', 'src.main'],
      shell: false,
      providePort: true,
    }
    console.log(
      `⚙️  [dev:autodev] Starting MCP server (${mcpAttempt.label}) in ${ragServerDir}`
    )
    try {
      const child = await trySpawn(mcpAttempt)
      if (child) {
        console.log('✅ [dev:autodev] MCP server running')
        registerChild('MCP server', child)
      } else {
        console.warn('⚠️  [dev:autodev] MCP server command not found, skipped')
      }
    } catch (err) {
      console.error('❌ [dev:autodev] Failed to start MCP server:', err)
    }
  }
}

const startUi = () => {
  console.log('🌐 [dev:autodev] Starting Next.js dev server...')
  const child = spawn('npm', ['run', 'dev'], {
    cwd: uiDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      RAG_SERVER_URL: ragUrl,
      RAG_API_BASE: ragUrl,
      POSTGRES_HOST: process.env.POSTGRES_HOST ?? dbHost,
      POSTGRES_PORT: process.env.POSTGRES_PORT ?? String(dbPort),
    },
  })
  registerChild('Next.js UI', child)
}

await ensureDb()

if (!skipRag) {
  await startRagServer()
} else {
  console.log('⚠️  [dev:autodev] Skipping RAG server startup (RAG_AUTODEV_SKIP_RAG=1)')
}

if (!skipUi) {
  startUi()
  console.log(
    `\n📡 [dev:autodev] UI proxy configured to target ${ragUrl}\n` +
      '⏹️  Press Ctrl+C to stop both services.'
  )
} else if (skipRag) {
  console.log('ℹ️  [dev:autodev] Nothing to run (both services skipped); exiting.')
  process.exit(0)
} else {
  console.log('⚠️  [dev:autodev] UI startup skipped (RAG_AUTODEV_SKIP_UI=1)')
}
