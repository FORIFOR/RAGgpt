#!/usr/bin/env node

// Auto-detect port, restart Docker stack, and start Next.js dev server
import getPort from 'get-port';
import { spawn, exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');
const infrastructureDir = join(projectRoot, 'infrastructure');

console.log(`🚀 [dev:autoport-stack] Starting full development stack...`);
console.log(`📁 Project root: ${projectRoot}`);

// Step 1: Auto-detect available port for UI
const base = Number(process.env.DEV_BASE_PORT || 3000);
const ports = Array.from({ length: 100 }, (_, i) => base + i);
const uiPort = await getPort({ port: ports });
console.log(`📡 Auto-detected UI port: ${uiPort}`);

// Step 2: Restart Docker Compose stack
console.log(`🐳 [docker] Restarting Docker Compose stack...`);
try {
  // Change to infrastructure directory for docker-compose
  process.chdir(infrastructureDir);
  
  console.log(`   📦 Stopping existing containers...`);
  await execAsync('docker compose down', { cwd: infrastructureDir });
  
  console.log(`   🔄 Starting stack with latest configuration...`);
  await execAsync('docker compose up -d', { cwd: infrastructureDir });
  
  console.log(`   ✅ Docker stack started successfully`);
} catch (error) {
  console.error(`   ❌ Docker error:`, error.message);
  console.log(`   ⚠️  Continuing with UI startup...`);
}

// Step 3: Wait for services to be ready
console.log(`⏳ [health] Waiting for services to be ready...`);
await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second wait

// Optional: Health check for rag-api
try {
  console.log(`   🩺 Checking rag-api health...`);
  const { stdout } = await execAsync('curl -s http://localhost:8000/health');
  const health = JSON.parse(stdout);
  console.log(`   ✅ rag-api: ${health.status}, LLM: ${health.llm?.provider}/${health.llm?.model}`);
} catch (error) {
  console.log(`   ⚠️  rag-api health check failed (may still be starting up)`);
}

// Step 4: Start Next.js UI
console.log(`🌐 [ui] Starting Next.js dev server...`);
console.log(`   📡 UI will be available at: http://localhost:${uiPort}`);
console.log(`   🔄 HMR enabled - changes will be reflected automatically`);
console.log(`   🐳 Full stack ready!\n`);

// Change back to UI directory for Next.js
const uiDir = join(projectRoot, 'ui');
process.chdir(uiDir);

const child = spawn('node', [
  join(uiDir, 'node_modules/next/dist/bin/next'), 
  'dev', 
  '-p', 
  String(uiPort)
], {
  stdio: 'inherit',
  env: { 
    ...process.env, 
    PORT: String(uiPort),
    NEXT_PUBLIC_UI_PORT: String(uiPort)
  },
  cwd: uiDir
});

// Handle termination signals
const cleanup = async () => {
  console.log('\\n⏹️  [dev:autoport-stack] Shutting down...');
  
  // Kill Next.js
  child.kill('SIGINT');
  
  // Optionally stop Docker stack (uncomment if you want full cleanup)
  // console.log('🐳 [docker] Stopping Docker stack...');
  // try {
  //   await execAsync('docker compose down', { cwd: infrastructureDir });
  //   console.log('✅ Docker stack stopped');
  // } catch (error) {
  //   console.error('❌ Error stopping Docker:', error.message);
  // }
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

child.on('exit', (code) => {
  console.log(`\\n🏁 [dev:autoport-stack] Next.js dev server exited with code ${code ?? 0}`);
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(`❌ [dev:autoport-stack] Failed to start Next.js:`, error);
  process.exit(1);
});