#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'desktop', 'src-tauri', 'resources', 'next');

execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

cpSync(path.join(rootDir, '.next', 'standalone'), outDir, { recursive: true });
mkdirSync(path.join(outDir, '.next'), { recursive: true });
cpSync(path.join(rootDir, '.next', 'static'), path.join(outDir, '.next', 'static'), { recursive: true });
cpSync(path.join(rootDir, 'public'), path.join(outDir, 'public'), { recursive: true });

console.log(`Prepared standalone Next.js bundle at: ${outDir}`);
