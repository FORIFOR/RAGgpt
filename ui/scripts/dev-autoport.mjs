#!/usr/bin/env node

// Auto-detect available port and start Next.js dev server
import getPort from 'get-port';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const base = Number(process.env.DEV_BASE_PORT || 3000);
const ports = Array.from({ length: 100 }, (_, i) => base + i);
const port = await getPort({ port: ports });

console.log(`🚀 [dev:autoport] Starting Next.js dev server...`);
console.log(`📡 Auto-detected port: ${port}`);
console.log(`🌐 UI will be available at: http://localhost:${port}`);
console.log(`🔄 HMR enabled - changes will be reflected automatically`);
console.log('');

const child = spawn('node', [
  join(projectRoot, 'node_modules/next/dist/bin/next'), 
  'dev', 
  '-p', 
  String(port)
], {
  stdio: 'inherit',
  env: { 
    ...process.env, 
    PORT: String(port),
    NEXT_PUBLIC_UI_PORT: String(port)
  },
  cwd: projectRoot
});

// Handle termination signals
process.on('SIGINT', () => {
  console.log('\n⏹️  [dev:autoport] Shutting down...');
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n⏹️  [dev:autoport] Shutting down...');
  child.kill('SIGTERM');
});

child.on('exit', (code) => {
  console.log(`\n🏁 [dev:autoport] Next.js dev server exited with code ${code ?? 0}`);
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(`❌ [dev:autoport] Failed to start Next.js:`, error);
  process.exit(1);
});